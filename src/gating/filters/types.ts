import type { MCPTool } from '../../utils/types.js';

export interface FilterContext {
  taskType?: string;
  [key: string]: unknown;
}

export interface ToolFilter {
  apply(tools: Record<string, MCPTool>, context: FilterContext): Record<string, MCPTool>;
}
