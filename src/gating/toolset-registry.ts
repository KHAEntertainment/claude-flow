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
  
  // NEW: Auto-enable fields
  private toolNameToToolset = new Map<string, string[]>();  // Tool name -> [toolset ids]
  private manifestsLoaded = false;
  private inflightEnable = new Map<string, Promise<void>>();
  private filterConfig: typeof filterConfigDefault;

  constructor(
    toolsetLoaders: Record<string, ToolsetLoader> = {},
    filterConfig: typeof filterConfigDefault = filterConfigDefault
  ) {
    this.toolsetLoaders = toolsetLoaders;
    this.filterConfig = filterConfig;
    
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
            if (!this.toolNameToToolset.has(normalizedName)) {
              this.toolNameToToolset.set(normalizedName, []);
            }
            this.toolNameToToolset.get(normalizedName)!.push(setName);
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
        const owners = this.toolNameToToolset.get(normalizedName);
        if (owners) {
          const index = owners.indexOf(setName);
          if (index > -1) {
            owners.splice(index, 1);
          }
          if (owners.length === 0) {
            this.toolNameToToolset.delete(normalizedName);
          }
        }
      } else {
        if (!this.toolNameToToolset.has(normalizedName)) {
          this.toolNameToToolset.set(normalizedName, []);
        }
        const owners = this.toolNameToToolset.get(normalizedName)!;
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
    const owners = this.toolNameToToolset.get(normalizedName);
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
    Object.assign(this.loadedTools, optimized);
    this.activeToolsets.add(name);
  }

  disableToolset(name: string): void {
    if (!this.activeToolsets.has(name)) {
      return;
    }
    for (const toolName of this.toolsetTools[name] || []) {
      delete this.loadedTools[toolName];
    }
    delete this.toolsetTools[name];
    this.activeToolsets.delete(name);
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
