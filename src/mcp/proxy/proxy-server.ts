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
import { InMemoryToolRepository } from './tool-repository.js';
import { DiscoveryService } from '../../gating/discovery-service.js';
import { GatingService } from '../../gating/gating-service.js';

export interface ProxyServerConfig extends MCPConfig {
  backendServers?: Array<{
    name: string;
    command: string;
    args?: string[];
    env?: Record<string, string>;
  }>;
}

export class ProxyServer {
  private mcpServer: MCPServer;
  private clientManager: MCPClientManager;
  private proxyService: ProxyService;
  private toolRepository: InMemoryToolRepository;
  private discoveryService: DiscoveryService;
  private gatingService: GatingService;
  private backendConnections: Map<string, any> = new Map();

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

    // Initialize the MCP server
    this.mcpServer = new MCPServer(config, eventBus, logger);

  async start(): Promise<void> {
    this.logger.info('Starting Proxy MCP Server');

    try {
      // Start the MCP server
      await this.mcpServer.start();

      // Connect to backend servers
      await this.connectToBackendServers();

      // Discover tools from backend servers
      await this.discoverBackendTools();

      this.logger.info('Proxy MCP Server started successfully');
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

        this.backendConnections.set(backendConfig.name, connection);
        this.logger.info(`Successfully connected to backend server: ${backendConfig.name}`);
      } catch (error) {
        this.logger.error(`Failed to connect to backend server: ${backendConfig.name}`, error);
        // Continue with other backends even if one fails
      }
    }
  }

  private async discoverBackendTools(): Promise<void> {
    this.logger.info('Discovering tools from backend servers');

    for (const [backendName, connection] of this.backendConnections) {
      try {
        // List tools from the backend server
        const toolsResult = await this.clientManager.listTools(backendName);
        
        if (toolsResult && Array.isArray(toolsResult)) {
          for (const tool of toolsResult) {
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

    this.logger.info(`Discovered ${this.toolRepository.getToolCount()} tools from backend servers`);
  }

  private async disconnectFromBackendServers(): Promise<void> {
    for (const [backendName, connection] of this.backendConnections) {
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

  // Get the tool repository for direct access if needed
  getToolRepository(): InMemoryToolRepository {
    return this.toolRepository;
  }
}