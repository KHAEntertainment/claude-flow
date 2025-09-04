import type { MCPTool } from '../../utils/types.js';
import type { ToolFilter, FilterContext } from './types.js';

interface SecurityFilterConfig {
  enabled: boolean;
  blocked: string[];
}

export class SecurityFilter implements ToolFilter {
  constructor(private config: SecurityFilterConfig) {}

  apply(tools: Record<string, MCPTool>, _context: FilterContext): Record<string, MCPTool> {
    if (!this.config.blocked || this.config.blocked.length === 0) return tools;
    const result = { ...tools };
    for (const name of this.config.blocked) {
      delete result[name];
    }
    return result;
  }
}
