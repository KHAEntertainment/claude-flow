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
    const q = (query ?? '').trim().toLowerCase();
    // Prefer indexed search; default to excluding deprecated tools
    let results = this.toolRepository.searchTools({ includeDeprecated: false });

    if (q) {
      results = results.filter(tool => {
        const haystacks = [
          tool.name,
          tool.description,
          ...(tool.categories ?? []),
          ...(tool.capabilities ?? []),
        ]
          .filter(Boolean)
          .map(s => s.toLowerCase());
        return haystacks.some(h => h.includes(q));
      });
    }

    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 10;
    return results.slice(0, safeLimit);

    return filteredTools.slice(0, limit);
  }

  async provisionTools(options: ProvisionOptions): Promise<MCPTool[]> {
    const { tools, maxTokens } = options;
    if (!Number.isFinite(maxTokens) || maxTokens <= 0) return [];
    let currentTokens = 0;
    const provisionedTools: MCPTool[] = [];

    for (const tool of tools) {
      const toolTokens = Math.max(1, Math.ceil(this.calculateTokenSize(tool)));
      if (toolTokens > maxTokens) {
        // Skip tools that can never fit
        continue;
      }
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