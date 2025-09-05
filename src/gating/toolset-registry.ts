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

  constructor(
    toolsetLoaders: Record<string, ToolsetLoader> = {},
    filterConfig: typeof filterConfigDefault = filterConfigDefault
  ) {
    this.toolsetLoaders = toolsetLoaders;
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
