import type { MCPTool } from '../../utils/types.js';
import type { ToolFilter, FilterContext } from './types.js';

interface ResourceFilterConfig {
  enabled: boolean;
  maxTools: number;
}

export class ResourceFilter implements ToolFilter {
  constructor(private config: ResourceFilterConfig) {}

  apply(tools: Record<string, MCPTool>, _context: FilterContext): Record<string, MCPTool> {
    const max = this.config.maxTools;
    const entries = Object.entries(tools);
    if (!max || entries.length <= max) return tools;
    return Object.fromEntries(entries.slice(0, max));
  }
}
