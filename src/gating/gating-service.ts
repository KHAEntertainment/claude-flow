import { DiscoveryService } from './discovery-service.js';
import { MCPTool } from '../utils/types.js';

interface ProvisionOptions {
  query: string;
  maxTokens: number;
}

export class GatingService {
  private gateController?: any;
  
  constructor(private discoveryService: DiscoveryService) {}
  
  /**
   * Set the gate controller for TTL/LRU management
   */
  setGateController(controller: any): void {
    this.gateController = controller;
  }
  
  /**
   * Mark a tool as used for TTL tracking
   */
  markToolUsed(toolName: string): void {
    if (this.gateController?.markUsed) {
      this.gateController.markUsed(toolName);
    }
  }

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
