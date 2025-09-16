import { DiscoveryService } from './discovery-service.js';
import { MCPTool } from '../utils/types.js';
import { EventEmitter } from 'events';

interface ProvisionOptions {
  query: string;
  maxTokens: number;
}

interface GatingMetrics {
  toolsDiscovered: number;
  toolsProvisioned: number;
  tokensBudgeted: number;
  tokensUsed: number;
}

export class GatingService extends EventEmitter {
  constructor(private discoveryService: DiscoveryService) {
    super();
=======
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
    
    // Validate inputs and short-circuit on empty budgets/queries
    const normalizedQuery = (query ?? '').trim();
    const safeMaxTokens = Number.isFinite(maxTokens)
      ? Math.max(0, Math.floor(maxTokens))
      : 0;
    
    if (!normalizedQuery || safeMaxTokens === 0) {
      // Emit metrics even for empty results
      this.emitMetrics({
        toolsDiscovered: 0,
        toolsProvisioned: 0,
        tokensBudgeted: safeMaxTokens,
        tokensUsed: 0
      });
      return [];
    }

    // Discover relevant tools
    const discoveredTools = await this.discoveryService.discoverTools({ 
      query: normalizedQuery 
    });

    // Provision tools based on token limit
    const provisionedTools = await this.discoveryService.provisionTools({
      tools: discoveredTools,
      maxTokens: safeMaxTokens,
    });
    
    // Calculate actual tokens used (simplified - you may want to use actual token counting)
    const tokensUsed = provisionedTools.reduce((sum, tool) => {
      const toolTokens = JSON.stringify(tool).length / 4; // Rough approximation
      return sum + toolTokens;
    }, 0);

    // Emit metrics for observability
    this.emitMetrics({
      toolsDiscovered: discoveredTools.length,
      toolsProvisioned: provisionedTools.length,
      tokensBudgeted: safeMaxTokens,
      tokensUsed: Math.floor(tokensUsed)
    });

    return provisionedTools;
  }
  
  private emitMetrics(metrics: GatingMetrics): void {
    // Emit metrics event for monitoring/logging
    this.emit('gating-metrics', metrics);
  }
}
