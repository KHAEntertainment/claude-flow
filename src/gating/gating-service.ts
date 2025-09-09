import { DiscoveryService } from './discovery-service.js';
import { MCPTool } from '../utils/types.js';

interface ProvisionOptions {
  query: string;
  maxTokens: number;
}

export class GatingService {
  constructor(private discoveryService: DiscoveryService) {}

  async provisionTools(options: ProvisionOptions): Promise<MCPTool[]> {
    const { query, maxTokens } = options;

    // Discover relevant tools
    const discoveredTools = await this.discoveryService.discoverTools({ query });

    // Provision tools based on token limit
    const provisionedTools = await this.discoveryService.provisionTools({
      tools: discoveredTools,
      maxTokens,
    });

    return provisionedTools;
  }
}