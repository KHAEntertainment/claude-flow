import type { MCPTool } from '../utils/types.js';

const MAX_DESCRIPTION_LENGTH = 50;

export function truncateDescription(description: string = ''): string {
  return description.length > MAX_DESCRIPTION_LENGTH
    ? description.slice(0, MAX_DESCRIPTION_LENGTH)
    : description;
}

function optimizeSchema(schema: any): any {
  if (Array.isArray(schema)) {
    return schema.map(optimizeSchema);
  }
  if (schema && typeof schema === 'object') {
    const optimized: any = {};
    for (const [key, value] of Object.entries(schema)) {
      if (key === 'examples' || key === 'default') {
        continue;
      }
      if (key === 'description' && typeof value === 'string') {
        optimized[key] = truncateDescription(value);
        continue;
      }
      optimized[key] = optimizeSchema(value);
    }
    return optimized;
  }
  return schema;
}

export function optimizeTool(tool: MCPTool): MCPTool {
  return {
    ...tool,
    description: truncateDescription(tool.description),
    inputSchema: optimizeSchema(tool.inputSchema),
  };
}

export default {
  truncateDescription,
  optimizeTool,
};
