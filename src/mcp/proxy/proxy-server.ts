/**
 * Proxy MCP Server - Main entry point for the proxy server
 * This server acts as a gateway that discovers and routes tool calls to backend servers
 */

import { MCPServer } from '../server.js';
import { MCPConfig } from '../../utils/types.js';
import type { IEventBus } from '../../core/event-bus.js';
import type { ILogger } from '../../core/logger.js';
import { MCPClientManager } from './mcp-client-manager.js';
import { ProxyService } from './proxy-service.js';
import { InMemoryToolRepository } from '../../repository/tool-repository.js';
import { DiscoveryService } from '../../gating/discovery-service.js';
import { GatingService } from '../../gating/gating-service.js';

export interface ProxyServerConfig extends MCPConfig {
  backendServers?: Array<{
    name: string;
    command: string;
    args?: string[];
    env?: Record<string, string>;
  }>;
  loadBalancer?: {
    enabled: boolean;
    maxRequestsPerSecond: number;
    circuitBreakerThreshold: number;
    circuitBreakerTimeout: number;
  };
  requireTools?: boolean; // Whether to fail if no tools are discovered (default: false)
}

export class ProxyServer {
  private mcpServer: MCPServer;
  private clientManager: MCPClientManager;
  private proxyService: ProxyService;
  private toolRepository: InMemoryToolRepository;
  private discoveryService: DiscoveryService;
  private gatingService: GatingService;
  private backendConnections: Set<string> = new Set();

  constructor(
    private config: ProxyServerConfig,
    private eventBus: IEventBus,
    private logger: ILogger
  ) {
    // Initialize components
    this.toolRepository = new InMemoryToolRepository();
    // Wire up client manager with eventBus and logger
    this.clientManager = new MCPClientManager(this.eventBus, this.logger);

    this.discoveryService = new DiscoveryService(this.toolRepository);
    this.gatingService = new GatingService(this.discoveryService);

    // Pass toolRepository, clientManager, eventBus, and logger in the correct order
    this.proxyService = new ProxyService(
      this.toolRepository,
      this.clientManager,
      this.eventBus,
      this.logger
    );

    // Initialize the MCP server and wire in gating/discovery services
    this.mcpServer = new MCPServer(config, eventBus, logger);
    
    // Wire gating service by registering it with the MCP server
    // This ensures gating is applied to all tool discovery/provisioning
    this.wireGatingServices();
  }

  async start(): Promise<void> {
    this.logger.info('Starting Proxy MCP Server');

    try {
      // Start the MCP server
      await this.mcpServer.start();

      // Connect to backend servers
      await this.connectToBackendServers();

      // Discover tools from backend servers
      await this.discoverBackendTools();
      
      // Check if we have any working backends or tools
      if (this.backendConnections.size === 0 || this.toolRepository.getTotalTools() === 0) {
        this.logger.warn('Proxy started with no active backends or tools discovered');
        // Optionally fail fast if no tools are available
        if (this.config.requireTools !== false) { // Default to not requiring tools
          throw new Error('No tools available - proxy cannot function without backend tools');
        }
      }

      this.logger.info('Proxy MCP Server started successfully', {
        backends: this.backendConnections.size,
        tools: this.toolRepository.getTotalTools()
      });
    } catch (error) {
      this.logger.error('Failed to start Proxy MCP Server', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.logger.info('Stopping Proxy MCP Server');

    try {
      // Disconnect from backend servers
      await this.disconnectFromBackendServers();

      // Stop the MCP server
      await this.mcpServer.stop();

      this.logger.info('Proxy MCP Server stopped');
    } catch (error) {
      this.logger.error('Error stopping Proxy MCP Server', error);
      throw error;
    }
  }

  private async connectToBackendServers(): Promise<void> {
    if (!this.config.backendServers || this.config.backendServers.length === 0) {
      this.logger.warn('No backend servers configured');
      return;
    }

    for (const backendConfig of this.config.backendServers) {
      try {
        this.logger.info(`Connecting to backend server: ${backendConfig.name}`);
        
        const connection = await this.clientManager.connect(
          backendConfig.name,
          backendConfig.command,
          backendConfig.args || [],
          backendConfig.env || {}
        );

        this.backendConnections.add(backendConfig.name);
        this.logger.info(`Successfully connected to backend server: ${backendConfig.name}`);
      } catch (error) {
        this.logger.error(`Failed to connect to backend server: ${backendConfig.name}`, error);
        // Continue with other backends even if one fails
      }
    }
  }

  private async discoverBackendTools(): Promise<void> {
    this.logger.info('Discovering tools from backend servers');

    for (const backendName of this.backendConnections) {
      try {
        // List tools from the backend server
        const toolsResult = await this.clientManager.listTools(backendName);
        
        if (Array.isArray(toolsResult)) {
          for (const tool of toolsResult) {
            if (!tool || typeof tool.name !== 'string' || !tool.inputSchema) {
              this.logger.warn(`Skipping invalid tool from ${backendName}`, { tool });
              continue;
            }
            // Add backend information to the tool metadata
            const toolWithBackend = {
              ...tool,
              backend: backendName,
              discoverySource: 'backend',
            };

            // Add tool to repository
            this.toolRepository.addTool(toolWithBackend);
            
            this.logger.debug(`Discovered tool from ${backendName}: ${tool.name}`);
          }
        }
      } catch (error) {
        this.logger.error(`Failed to discover tools from backend: ${backendName}`, error);
      }
    }

    this.logger.info(`Discovered ${this.toolRepository.getTotalTools()} tools from backend servers`);
  }

  private async disconnectFromBackendServers(): Promise<void> {
    for (const backendName of this.backendConnections) {
      try {
        this.logger.info(`Disconnecting from backend server: ${backendName}`);
        await this.clientManager.disconnect(backendName);
        this.logger.info(`Disconnected from backend server: ${backendName}`);
      } catch (error) {
        this.logger.error(`Error disconnecting from backend: ${backendName}`, error);
      }
    }
    
    this.backendConnections.clear();
  }

  // Get the underlying MCP server for direct access if needed
  getMcpServer(): MCPServer {
    return this.mcpServer;
  }

  // Get the proxy service for direct access if needed
  getProxyService(): ProxyService {
    return this.proxyService;
  }

  // Get the discovery service for direct access if needed
  getDiscoveryService(): DiscoveryService {
    return this.discoveryService;
  }

  // Get the gating service for direct access if needed
  getGatingService(): GatingService {
    return this.gatingService;
  }

  // Get the tool repository for direct access if needed
  getToolRepository(): InMemoryToolRepository {
    return this.toolRepository;
  }
  
  /**
   * Wire gating services into the MCP server
   * This ensures discovery and provisioning go through gating
   */
  private wireGatingServices(): void {
    // Register discovery and provisioning handlers with the MCP server
    // These will be exposed as tools that can be called
    this.mcpServer.registerTool({
      name: 'discover_tools',
      description: 'Discover available tools based on a semantic query',
      inputSchema: {
        type: 'object',
        properties: {
          query: { 
            type: 'string',
            description: 'Semantic query to search for relevant tools'
          },
          limit: { 
            type: 'number', 
            description: 'Maximum number of tools to return (default: 10)',
            minimum: 1,
            maximum: 100
          }
        },
        required: ['query']
      },
      handler: async (input: unknown) => {
        const params = input as { query: string; limit?: number };
        return await this.discoveryService.discoverTools({
          query: params.query,
          limit: params.limit
        });
      }
    });
    
    this.mcpServer.registerTool({
      name: 'provision_tools',
      description: 'Provision tools based on a query and token limit',
      inputSchema: {
        type: 'object',
        properties: {
          query: { 
            type: 'string',
            description: 'Query to discover tools for provisioning'
          },
          maxTokens: { 
            type: 'number', 
            description: 'Maximum token budget for provisioned tools',
            minimum: 100,
            maximum: 100000
          }
        },
        required: ['query', 'maxTokens']
      },
      handler: async (input: unknown) => {
        const params = input as { query: string; maxTokens: number };
        return await this.gatingService.provisionTools({
          query: params.query,
          maxTokens: params.maxTokens
        });
      }
    });
  }
}
