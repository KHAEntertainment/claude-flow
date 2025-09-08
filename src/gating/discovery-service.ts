import { InMemoryToolRepository } from '../mcp/proxy/tool-repository.js';
import { MCPTool } from '../utils/types.js';

interface DiscoveryOptions {
  query: string;
  limit?: number;
}

interface ProvisionOptions {
  tools: MCPTool[];
  maxTokens: number;
}

export class DiscoveryService {
  constructor(private toolRepository: InMemoryToolRepository) {}

  async discoverTools(options: DiscoveryOptions): Promise<MCPTool[]> {
    const { query, limit = 10 } = options;

    // In a real implementation, this would use a semantic search engine
    // For now, we'll use a simple keyword search
    const allTools = this.toolRepository.getAllTools();
    const filteredTools = allTools.filter(tool =>
      tool.description.toLowerCase().includes(query.toLowerCase())
    );

    return filteredTools.slice(0, limit);
  }

  async provisionTools(options: ProvisionOptions): Promise<MCPTool[]> {
    const { tools, maxTokens } = options;
    let currentTokens = 0;
    const provisionedTools: MCPTool[] = [];

    for (const tool of tools) {
      const toolTokens = this.calculateTokenSize(tool);
      if (currentTokens + toolTokens <= maxTokens) {
        provisionedTools.push(tool);
        currentTokens += toolTokens;
      }
    }

    return provisionedTools;
  }

  private calculateTokenSize(tool: MCPTool): number {
    // Simple token calculation based on JSON string length
    // In a real implementation, use a proper tokenizer
    return JSON.stringify(tool).length / 4;
  }
}