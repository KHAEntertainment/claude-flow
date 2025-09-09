import { InMemoryToolRepository } from '../repository/tool-repository.js';
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
    // For now, we'll use a simple keyword search with null-safety
    const allTools = this.toolRepository.getAllTools();
    const queryLower = (query ?? '').trim().toLowerCase();
    
    const filteredTools = allTools.filter(tool => {
      // Check multiple fields for the query, with null-safety
      const searchFields = [
        tool.name,
        tool.description,
        ...(tool.categories || []),
        ...(tool.capabilities || [])
      ].filter(Boolean).map(s => s.toLowerCase());
      
      return searchFields.some(field => field.includes(queryLower));
    });

    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 10;
    return filteredTools.slice(0, safeLimit);
  }

  async provisionTools(options: ProvisionOptions): Promise<MCPTool[]> {
    const { tools, maxTokens } = options;
    
    // Validate input
    if (!Number.isFinite(maxTokens) || maxTokens <= 0) {
      return [];
    }
    
    let currentTokens = 0;
    const provisionedTools: MCPTool[] = [];

    for (const tool of tools) {
      // Use integer token counts with minimum of 1
      const toolTokens = Math.max(1, Math.ceil(this.calculateTokenSize(tool)));
      
      // Skip tools that can never fit
      if (toolTokens > maxTokens) {
        continue;
      }
      
      if (currentTokens + toolTokens <= maxTokens) {
        provisionedTools.push(tool);
        currentTokens += toolTokens;
      } else {
        // No more tools can fit, stop early
        break;
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