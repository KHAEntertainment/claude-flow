import type { MCPTool } from '../../utils/types.js';
import type { ToolFilter, FilterContext } from './types.js';

interface TaskTypeFilterConfig {
  enabled: boolean;
  map: Record<string, string[]>;
}

export class TaskTypeFilter implements ToolFilter {
  constructor(private config: TaskTypeFilterConfig) {}

  apply(tools: Record<string, MCPTool>, context: FilterContext): Record<string, MCPTool> {
    const type = context.taskType;
    if (!type) return tools;
    const allowed = this.config.map?.[type];
    if (!allowed || allowed.length === 0) return tools;
    const result: Record<string, MCPTool> = {};
    for (const name of allowed) {
      if (tools[name]) {
        result[name] = tools[name];
      }
    }
    return result;
  }
}
