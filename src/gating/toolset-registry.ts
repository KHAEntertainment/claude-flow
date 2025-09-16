import type { MCPTool } from '../utils/types.js';

import { TaskTypeFilter } from './filters/TaskTypeFilter.js';
import { ResourceFilter } from './filters/ResourceFilter.js';
import { SecurityFilter } from './filters/SecurityFilter.js';
import type { ToolFilter, FilterContext } from './filters/types.js';
import { optimizeTool } from './schema-optimizer.js';
import filterConfigDefault from './filter-config.json' assert { type: 'json' };

export type ToolsetLoader = () => Promise<Record<string, MCPTool>>;

export class ToolGateController {
  private toolsetLoaders: Record<string, ToolsetLoader>;
  private activeToolsets = new Set<string>();
  private loadedTools: Record<string, MCPTool> = {};
  private toolsetTools: Record<string, string[]> = {};
  private filters: ToolFilter[] = [];
  
  // NEW: TTL/LRU tracking
  private toolsetLastUsed = new Map<string, number>();
  private toolNameToToolset = new Map<string, string>();
  private pinned = new Set<string>();
  private ttlMs: number = 5 * 60_000; // default 5 minutes
  private maxActiveToolsets: number = 0; // 0 = unlimited

  constructor(
    toolsetLoaders: Record<string, ToolsetLoader> = {},
    filterConfig: typeof filterConfigDefault = filterConfigDefault
  ) {
    this.toolsetLoaders = toolsetLoaders;
    
    // Initialize TTL/LRU configuration
    this.ttlMs = (filterConfig as any).autoDisableTtlMs ?? this.ttlMs;
    this.maxActiveToolsets = (filterConfig as any).maxActiveToolsets ?? 0;
    
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
    
  const optimized = Object.fromEntries(
    Object.entries(tools).map(([n, t]) => [n, optimizeTool(t)])
  );
  this.toolsetTools[name] = Object.keys(optimized);

  // Guard against name collisions across toolsets
  for (const toolName of Object.keys(optimized)) {
    const existingOwner = this.toolNameToToolset.get(toolName);
    if (existingOwner && existingOwner !== name) {
      throw new Error(
        `Tool name collision: "${toolName}" already provided by toolset "${existingOwner}"`
      );
    }
  }

  // Track tool-to-toolset mapping for usage tracking
  for (const toolName of Object.keys(optimized)) {
    this.toolNameToToolset.set(toolName, name);
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
      this.toolNameToToolset.delete(toolName);
    }
    delete this.toolsetTools[name];
    this.activeToolsets.delete(name);
    this.toolsetLastUsed.delete(name);
  }
  
  /**
   * Mark a tool as recently used (updates toolset timestamp)
   */
  markUsed(toolName: string): void {
    const setName = this.toolNameToToolset.get(toolName);
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
