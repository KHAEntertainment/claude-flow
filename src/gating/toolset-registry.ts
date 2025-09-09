import type { MCPTool } from '../utils/types.js';
import * as fs from 'fs/promises';
import * as path from 'path';

import { TaskTypeFilter } from './filters/TaskTypeFilter.js';
import { ResourceFilter } from './filters/ResourceFilter.js';
import { SecurityFilter } from './filters/SecurityFilter.js';
import type { ToolFilter, FilterContext } from './filters/types.js';
import { optimizeTool } from './schema-optimizer.js';
import filterConfigDefault from './filter-config.json' assert { type: 'json' };

export type ToolsetLoader = () => Promise<Record<string, MCPTool>>;

interface ToolsetManifest {
  id: string;
  name: string;
  description?: string;
  tools: string[];
}

export class ToolGateController {
  private toolsetLoaders: Record<string, ToolsetLoader>;
  private activeToolsets = new Set<string>();
  private loadedTools: Record<string, MCPTool> = {};
  private toolsetTools: Record<string, string[]> = {};
  private filters: ToolFilter[] = [];
  
  // Auto-enable fields
  private toolNameToToolsetIndex = new Map<string, string[]>();  // Tool name -> [toolset ids] for auto-enable
  private manifestsLoaded = false;
  private inflightEnable = new Map<string, Promise<void>>();
  private filterConfig: typeof filterConfigDefault;
  
  // TTL/LRU tracking fields
  private toolsetLastUsed = new Map<string, number>();
  private toolNameToActiveToolset = new Map<string, string>();  // Tool name -> active toolset for usage tracking
  private pinned = new Set<string>();
  private ttlMs: number = 5 * 60_000; // default 5 minutes
  private maxActiveToolsets: number = 0; // 0 = unlimited

  constructor(
    toolsetLoaders: Record<string, ToolsetLoader> = {},
    filterConfig: typeof filterConfigDefault = filterConfigDefault
  ) {
    this.toolsetLoaders = toolsetLoaders;
    this.filterConfig = filterConfig;
    
    // Initialize TTL/LRU configuration
    this.ttlMs = (filterConfig as any).autoDisableTtlMs ?? this.ttlMs;
    this.maxActiveToolsets = (filterConfig as any).maxActiveToolsets ?? 0;
    
    // Build reverse index cheaply (does NOT load full schemas/handlers)
    void this.buildReverseIndex();
    
    // Initialize filters
    if (filterConfig.taskType?.enabled) {
      this.filters.push(new TaskTypeFilter(filterConfig.taskType));
    }
    if (filterConfig.resource?.enabled) {
      this.filters.push(new ResourceFilter(filterConfig.resource));
    }
    if (filterConfig.security?.enabled) {
      this.filters.push(new SecurityFilter(filterConfig.security));
    }
  }
  
  /**
   * Build reverse index from lightweight manifests without loading heavy modules
   */
  private async buildReverseIndex(): Promise<void> {
    if (this.manifestsLoaded) return;
    
    for (const [setName, loader] of Object.entries(this.toolsetLoaders)) {
      try {
        let toolNames: string[] | undefined;
        
        // Try to load manifest file first (lightest approach)
        const manifestPath = path.join(
          path.dirname(new URL(import.meta.url).pathname),
          '..',
          'mcp',
          `${setName}-tools.manifest.json`
        );
        
        try {
          const manifestContent = await fs.readFile(manifestPath, 'utf-8');
          const manifest: ToolsetManifest = JSON.parse(manifestContent);
          toolNames = manifest.tools;
        } catch {
          // Manifest file not found, try other approaches
          const anyLoader = loader as any;
          
          // Check if loader has exposeNames function
          if (typeof anyLoader.exposeNames === 'function') {
            toolNames = await anyLoader.exposeNames();
          } else if (anyLoader.manifest?.names) {
            toolNames = anyLoader.manifest.names as string[];
          }
        }
        
        if (toolNames?.length) {
          for (const toolName of toolNames) {
            const normalizedName = this.normalizeToolName(toolName);
            if (!this.toolNameToToolsetIndex.has(normalizedName)) {
              this.toolNameToToolsetIndex.set(normalizedName, []);
            }
            this.toolNameToToolsetIndex.get(normalizedName)!.push(setName);
          }
        }
      } catch (error) {
        // Non-fatal: just skip the set
        console.warn(`Failed to build reverse index for toolset ${setName}:`, error);
      }
    }
    
    this.manifestsLoaded = true;
  }
  
  /**
   * Normalize tool name based on configuration
   */
  private normalizeToolName(toolName: string): string {
    if (this.filterConfig.autoEnableCaseInsensitive) {
      return toolName.toLowerCase();
    }
    return toolName;
  }
  
  /**
   * Update reverse index when a toolset is enabled or disabled
   */
  private updateReverseIndexForToolset(setName: string, tools: string[], remove: boolean = false): void {
    for (const toolName of tools) {
      const normalizedName = this.normalizeToolName(toolName);
      
      if (remove) {
        const owners = this.toolNameToToolsetIndex.get(normalizedName);
        if (owners) {
          const index = owners.indexOf(setName);
          if (index > -1) {
            owners.splice(index, 1);
          }
          if (owners.length === 0) {
            this.toolNameToToolsetIndex.delete(normalizedName);
          }
        }
      } else {
        if (!this.toolNameToToolsetIndex.has(normalizedName)) {
          this.toolNameToToolsetIndex.set(normalizedName, []);
        }
        const owners = this.toolNameToToolsetIndex.get(normalizedName)!;
        if (!owners.includes(setName)) {
          owners.push(setName);
        }
      }
    }
  }
  
  /**
   * Ensure a tool is available by auto-enabling its toolset if needed
   */
  async ensureToolAvailable(toolName: string, context: FilterContext = {}): Promise<boolean> {
    const normalizedName = this.normalizeToolName(toolName);
    
    // Check if tool is already loaded
    if (this.loadedTools[toolName] || this.loadedTools[normalizedName]) {
      return true;
    }
    
    // Ensure reverse index is built
    await this.buildReverseIndex();
    
    // Lookup tool in reverse index
    const owners = this.toolNameToToolsetIndex.get(normalizedName);
    if (!owners || owners.length === 0) {
      return false;  // Tool not found in any toolset
    }
    
    // Resolve which toolset to enable based on conflict resolution policy
    let targetToolset: string | undefined;
    const policy = this.filterConfig.autoEnableConflictResolution || 'prefer-enabled';
    
    if (policy === 'prefer-enabled') {
      // Check if any owner is already enabled
      const enabledOwner = owners.find(owner => this.activeToolsets.has(owner));
      targetToolset = enabledOwner || owners[0];
    } else if (policy === 'first-match') {
      targetToolset = owners[0];
    } else if (policy === 'error' && owners.length > 1) {
      throw new Error(
        `Tool "${toolName}" is claimed by multiple toolsets: ${owners.join(', ')}. ` +
        'Please enable the desired toolset explicitly.'
      );
    } else {
      targetToolset = owners[0];
    }
    
    if (!targetToolset) {
      return false;
    }
    
    // Check if toolset is already enabled
    if (this.activeToolsets.has(targetToolset)) {
      return true;
    }
    
    // Check if auto-enable is allowed
    if (!this.filterConfig.autoEnableOnCall) {
      return false;
    }
    
    // Check allowlist/blocklist
    const allowlist = this.filterConfig.autoEnableAllowlist || [];
    const blocklist = this.filterConfig.autoEnableBlocklist || [];
    
    const matchesPattern = (pattern: string): boolean => {
      if (pattern.endsWith('/*')) {
        const prefix = pattern.slice(0, -2);
        return toolName.startsWith(prefix);
      }
      return toolName === pattern;
    };
    
    if (blocklist.some(matchesPattern)) {
      return false;  // Tool is blocklisted
    }
    
    if (allowlist.length > 0 && !allowlist.some(matchesPattern)) {
      return false;  // Tool is not in allowlist
    }
    
    // Use concurrency lock to avoid duplicate enables
    let enablePromise = this.inflightEnable.get(targetToolset);
    if (!enablePromise) {
      enablePromise = this.doEnableToolset(targetToolset);
      this.inflightEnable.set(targetToolset, enablePromise);
    }
    
    try {
      await enablePromise;
      return true;
    } finally {
      this.inflightEnable.delete(targetToolset);
    }
  }
  
  /**
   * Internal method to perform toolset enablement
   */
  private async doEnableToolset(name: string): Promise<void> {
    console.log(`[Auto-Enable] Enabling toolset "${name}" on demand`);
    await this.enableToolset(name);
    console.log(`[Auto-Enable] Successfully enabled toolset "${name}"`);
  }

  discoverToolsets(): string[] {
    return Object.keys(this.toolsetLoaders);
  }

  async enableToolset(name: string): Promise<void> {
    const loader = this.toolsetLoaders[name];
    if (!loader) {
      throw new Error(`Unknown toolset: ${name}`);
    }
    if (this.activeToolsets.has(name)) {
      return;
    }
    const tools = await loader();
    const optimized = Object.fromEntries(
      Object.entries(tools).map(([n, t]) => [n, optimizeTool(t)])
    );
    this.toolsetTools[name] = Object.keys(optimized);
    
    // Track tool-to-toolset mapping for usage tracking
    for (const toolName of Object.keys(optimized)) {
      this.toolNameToActiveToolset.set(toolName, name);
    }
    
    Object.assign(this.loadedTools, optimized);
    this.activeToolsets.add(name);
    
    // Mark as recently used
    this.toolsetLastUsed.set(name, Date.now());
    
    // Enforce LRU cap after enabling
    this.enforceLRUCap();
  }

  disableToolset(name: string): void {
    if (!this.activeToolsets.has(name)) {
      return;
    }
    for (const toolName of this.toolsetTools[name] || []) {
      delete this.loadedTools[toolName];
      this.toolNameToActiveToolset.delete(toolName);
    }
    delete this.toolsetTools[name];
    this.activeToolsets.delete(name);
    this.toolsetLastUsed.delete(name);
  }
  
  /**
   * Mark a tool as recently used (updates toolset timestamp)
   */
  markUsed(toolName: string): void {
    const setName = this.toolNameToActiveToolset.get(toolName);
    if (setName && this.activeToolsets.has(setName)) {
      this.toolsetLastUsed.set(setName, Date.now());
    }
  }
  
  /**
   * Sweep and disable expired toolsets based on TTL
   */
  sweepExpiredToolsets(): string[] {
    const now = Date.now();
    const disabled: string[] = [];
    
    for (const [setName, lastUsed] of this.toolsetLastUsed) {
      if (!this.activeToolsets.has(setName)) continue;
      if (this.pinned.has(setName)) continue;
      
      if (now - lastUsed > this.ttlMs) {
        this.disableToolset(setName);
        disabled.push(setName);
        console.log(`[Auto-Disable] Toolset "${setName}" disabled due to TTL expiry`);
      }
    }
    
    return disabled;
  }
  
  /**
   * Enforce LRU cap by disabling least recently used toolsets
   */
  enforceLRUCap(): string[] {
    if (!this.maxActiveToolsets || this.activeToolsets.size <= this.maxActiveToolsets) {
      return [];
    }
    
    // Get unpinned candidates sorted by last use time (oldest first)
    const candidates = [...this.activeToolsets]
      .filter(s => !this.pinned.has(s))
      .sort((a, b) => (this.toolsetLastUsed.get(a) ?? 0) - (this.toolsetLastUsed.get(b) ?? 0));
    
    const toDisable: string[] = [];
    const excessCount = this.activeToolsets.size - this.maxActiveToolsets;
    
    for (let i = 0; i < excessCount && i < candidates.length; i++) {
      const victim = candidates[i];
      this.disableToolset(victim);
      toDisable.push(victim);
      console.log(`[Auto-Disable] Toolset "${victim}" disabled due to LRU cap`);
    }
    
    return toDisable;
  }
  
  /**
   * Pin a toolset to prevent auto-disable
   */
  pinToolset(name: string): void {
    this.pinned.add(name);
    console.log(`[Pin] Toolset "${name}" pinned`);
  }
  
  /**
   * Unpin a toolset to allow auto-disable
   */
  unpinToolset(name: string): void {
    this.pinned.delete(name);
    console.log(`[Unpin] Toolset "${name}" unpinned`);
  }
  
  /**
   * Get list of pinned toolsets
   */
  getPinnedToolsets(): string[] {
    return Array.from(this.pinned);
  }
  
  /**
   * Get usage statistics for monitoring
   */
  getUsageStats(): Record<string, { lastUsed: number; pinned: boolean }> {
    const stats: Record<string, { lastUsed: number; pinned: boolean }> = {};
    
    for (const setName of this.activeToolsets) {
      stats[setName] = {
        lastUsed: this.toolsetLastUsed.get(setName) ?? 0,
        pinned: this.pinned.has(setName)
      };
    }
    
    return stats;
  }

  listActiveTools(): string[] {
    return Object.keys(this.loadedTools);
  }

  getAvailableTools(context: FilterContext = {}): Record<string, MCPTool> {
    let tools: Record<string, MCPTool> = { ...this.loadedTools };
    for (const filter of this.filters) {
      tools = filter.apply(tools, context);
    }
    return tools;
  }

  getContextSize(): number {
    return JSON.stringify(this.loadedTools).length;
  }
}

export default ToolGateController;
