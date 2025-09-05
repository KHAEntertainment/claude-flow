/**
 * MCP (Model Context Protocol) server implementation
 */

import {
  MCPConfig,
  MCPRequest,
  MCPResponse,
  MCPError,
  MCPTool,
  MCPInitializeParams,
  MCPInitializeResult,
  MCPSession,
  MCPMetrics,
  MCPProtocolVersion,
  MCPCapabilities,
  MCPContext,
} from '../utils/types.js';
import type { IEventBus } from '../core/event-bus.js';
import type { ILogger } from '../core/logger.js';
import { MCPError as MCPErrorClass, MCPMethodNotFoundError } from '../utils/errors.js';
import type { ITransport } from './transports/base.js';
import { StdioTransport } from './transports/stdio.js';
import { HttpTransport } from './transports/http.js';
import { ToolRegistry } from './tools.js';
import { RequestRouter } from './router.js';
import { SessionManager, ISessionManager } from './session-manager.js';
import { AuthManager, IAuthManager } from './auth.js';
import { LoadBalancer, ILoadBalancer, RequestQueue } from './load-balancer.js';
import { createClaudeFlowTools, ClaudeFlowToolContext } from './claude-flow-tools.js';
import { platform, arch } from 'node:os';
import { performance } from 'node:perf_hooks';
import * as fs from 'node:fs';
import ToolGateController from '../gating/toolset-registry.js';
import filterConfigDefault from '../gating/filter-config.json' with { type: 'json' };
import { optimizeTool } from '../gating/schema-optimizer.js';
export interface IMCPServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  registerTool(tool: MCPTool): void;
  getHealthStatus(): Promise<{
    healthy: boolean;
    error?: string;
    metrics?: Record<string, number>;
  }>;
  getMetrics(): MCPMetrics;
  getSessions(): MCPSession[];
  getSession(sessionId: string): MCPSession | undefined;
  terminateSession(sessionId: string): void;
}

/**
 * MCP server implementation
 */
export class MCPServer implements IMCPServer {
  private transport: ITransport;
  private toolRegistry: ToolRegistry;
  private router: RequestRouter;
  private sessionManager: ISessionManager;
  private authManager: IAuthManager;
  private loadBalancer?: ILoadBalancer;
  private requestQueue?: RequestQueue;
  private running = false;
  private currentSession?: MCPSession | undefined;
  private gateController: ToolGateController;
  private gateTools = new Set<string>();

  private readonly serverInfo = {
    name: 'Claude-Flow MCP Server',
    version: '1.0.0',
  };

  private readonly supportedProtocolVersion: MCPProtocolVersion = {
    major: 2024,
    minor: 11,
    patch: 5,
  };

  private readonly serverCapabilities: MCPCapabilities = {
    logging: {
      level: 'info',
    },
    tools: {
      listChanged: true,
    },
    resources: {
      listChanged: false,
      subscribe: false,
    },
    prompts: {
      listChanged: false,
    },
  };

  constructor(
    private config: MCPConfig,
    private eventBus: IEventBus,
    private logger: ILogger,
    private orchestrator?: any, // Reference to orchestrator instance
    private swarmCoordinator?: any, // Reference to swarm coordinator instance
    private agentManager?: any, // Reference to agent manager instance
    private resourceManager?: any, // Reference to resource manager instance
    private messagebus?: any, // Reference to message bus instance
    private monitor?: any, // Reference to real-time monitor instance
  ) {
    // Initialize transport
    this.transport = this.createTransport();

    // Initialize tool registry
    this.toolRegistry = new ToolRegistry(logger);

    // Initialize gate controller with runtime filter config
    const filterConfig = this.loadFilterConfig();
    this.gateController = new ToolGateController(
      {
        claude: async () => {
          const tools = await createClaudeFlowTools(this.logger);
          for (const tool of tools) {
            const originalHandler = tool.handler;
            tool.handler = async (input: unknown, context?: MCPContext) => {
              const claudeContext: ClaudeFlowToolContext = {
                ...context,
                orchestrator: this.orchestrator,
              } as ClaudeFlowToolContext;
              return await originalHandler(input, claudeContext);
            };
          }
          return Object.fromEntries(tools.map((t) => [t.name, t]));
        },
      },
      filterConfig
    );

    // Register discovery tools
    for (const tool of this.getDiscoveryTools()) {
      this.registerTool(tool);
    }

    // Initialize session manager
    this.sessionManager = new SessionManager(config, logger);

    // Initialize auth manager
    this.authManager = new AuthManager(config.auth || { enabled: false, method: 'token' }, logger);

    // Initialize load balancer if enabled
    if (config.loadBalancer?.enabled) {
      this.loadBalancer = new LoadBalancer(config.loadBalancer, logger);
      this.requestQueue = new RequestQueue(1000, 30000, logger);
    }

    // Initialize request router
    this.router = new RequestRouter(this.toolRegistry, logger);
  }

  async start(): Promise<void> {
    if (this.running) {
      throw new MCPErrorClass('MCP server already running');
    }

    this.logger.info('Starting MCP server', { transport: this.config.transport });

    try {
      // Set up request handler
      this.transport.onRequest(async (request) => {
        return await this.handleRequest(request);
      });

      // Start transport
      await this.transport.start();

      // Register built-in tools
      await this.registerBuiltInTools();

      this.running = true;
      this.logger.info('MCP server started successfully');
    } catch (error) {
      this.logger.error('Failed to start MCP server', error);
      throw new MCPErrorClass('Failed to start MCP server', { error });
    }
  }

  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    this.logger.info('Stopping MCP server');

    try {
      // Stop transport
      await this.transport.stop();

      // Clean up session manager
      if (this.sessionManager && 'destroy' in this.sessionManager) {
        (this.sessionManager as any).destroy();
      }

      // Clean up all sessions
      for (const session of this.sessionManager.getActiveSessions()) {
        this.sessionManager.removeSession(session.id);
      }

      this.running = false;
      this.currentSession = undefined;
      this.logger.info('MCP server stopped');
    } catch (error) {
      this.logger.error('Error stopping MCP server', error);
      throw error;
    }
  }

  registerTool(tool: MCPTool): void {
    this.toolRegistry.register(tool);
    this.logger.info('Tool registered', { name: tool.name });
  }

  async getHealthStatus(): Promise<{
    healthy: boolean;
    error?: string;
    metrics?: Record<string, number>;
  }> {
    try {
      const transportHealth = await this.transport.getHealthStatus();
      const registeredTools = this.toolRegistry.getToolCount();
      const { totalRequests, successfulRequests, failedRequests } = this.router.getMetrics();
      const sessionMetrics = this.sessionManager.getSessionMetrics();

      const metrics: Record<string, number> = {
        registeredTools,
        totalRequests,
        successfulRequests,
        failedRequests,
        totalSessions: sessionMetrics.total,
        activeSessions: sessionMetrics.active,
        authenticatedSessions: sessionMetrics.authenticated,
        expiredSessions: sessionMetrics.expired,
        ...transportHealth.metrics,
      };

      if (this.loadBalancer) {
        const lbMetrics = this.loadBalancer.getMetrics();
        metrics.rateLimitedRequests = lbMetrics.rateLimitedRequests;
        metrics.averageResponseTime = lbMetrics.averageResponseTime;
        metrics.requestsPerSecond = lbMetrics.requestsPerSecond;
        metrics.circuitBreakerTrips = lbMetrics.circuitBreakerTrips;
      }

      const status: { healthy: boolean; error?: string; metrics?: Record<string, number> } = {
        healthy: this.running && transportHealth.healthy,
        metrics,
      };
      if (transportHealth.error !== undefined) {
        status.error = transportHealth.error;
      }
      return status;
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  getMetrics(): MCPMetrics {
    const routerMetrics = this.router.getMetrics();
    const sessionMetrics = this.sessionManager.getSessionMetrics();
    const lbMetrics = this.loadBalancer?.getMetrics();

    return {
      totalRequests: routerMetrics.totalRequests,
      successfulRequests: routerMetrics.successfulRequests,
      failedRequests: routerMetrics.failedRequests,
      averageResponseTime: lbMetrics?.averageResponseTime || 0,
      activeSessions: sessionMetrics.active,
      toolInvocations: {}, // TODO: Implement tool-specific metrics
      errors: {}, // TODO: Implement error categorization
      lastReset: lbMetrics?.lastReset || new Date(),
    };
  }

  getSessions(): MCPSession[] {
    return this.sessionManager.getActiveSessions();
  }

  getSession(sessionId: string): MCPSession | undefined {
    return this.sessionManager.getSession(sessionId);
  }

  terminateSession(sessionId: string): void {
    this.sessionManager.removeSession(sessionId);
    if (this.currentSession?.id === sessionId) {
      this.currentSession = undefined;
    }
  }

  private async handleRequest(request: MCPRequest): Promise<MCPResponse> {
    this.logger.debug('Handling MCP request', {
      id: request.id,
      method: request.method,
    });

    try {
      // Handle initialization request separately
      if (request.method === 'initialize') {
        return await this.handleInitialize(request);
      }

      // Get or create session
      const session = this.getOrCreateSession();

      // Check if session is initialized for non-initialize requests
      if (!session.isInitialized) {
        return {
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32002,
            message: 'Server not initialized',
          },
        };
      }

      // Update session activity
      this.sessionManager.updateActivity(session.id);

      // Check load balancer constraints
      if (this.loadBalancer) {
        const allowed = await this.loadBalancer.shouldAllowRequest(session, request);
        if (!allowed) {
          return {
            jsonrpc: '2.0',
            id: request.id,
            error: {
              code: -32000,
              message: 'Rate limit exceeded or circuit breaker open',
            },
          };
        }
      }

      // Record request start
      const requestMetrics = this.loadBalancer?.recordRequestStart(session, request);

      try {
        // Process request through router
        const result = await this.router.route(request);

        const response: MCPResponse = {
          jsonrpc: '2.0',
          id: request.id,
          result,
        };

        // Record success
        if (requestMetrics) {
          this.loadBalancer?.recordRequestEnd(requestMetrics, response);
        }

        return response;
      } catch (error) {
        // Record failure
        if (requestMetrics) {
          this.loadBalancer?.recordRequestEnd(requestMetrics, undefined, error as Error);
        }
        throw error;
      }
    } catch (error) {
      this.logger.error('Error handling MCP request', {
        id: request.id,
        method: request.method,
        error,
      });

      return {
        jsonrpc: '2.0',
        id: request.id,
        error: this.errorToMCPError(error),
      };
    }
  }

  private async handleInitialize(request: MCPRequest): Promise<MCPResponse> {
    try {
      const params = request.params as MCPInitializeParams;

      if (!params) {
        return {
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32602,
            message: 'Invalid params',
          },
        };
      }

      // Create session
      const session = this.sessionManager.createSession(this.config.transport);
      this.currentSession = session;

      // Initialize session
      this.sessionManager.initializeSession(session.id, params);

      // Prepare response
      const result: MCPInitializeResult = {
        protocolVersion: this.supportedProtocolVersion,
        capabilities: this.serverCapabilities,
        serverInfo: this.serverInfo,
        instructions: 'Claude-Flow MCP Server ready for tool execution',
      };

      this.logger.info('Session initialized', {
        sessionId: session.id,
        clientInfo: params.clientInfo,
        protocolVersion: params.protocolVersion,
      });

      return {
        jsonrpc: '2.0',
        id: request.id,
        result,
      };
    } catch (error) {
      this.logger.error('Error during initialization', error);
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: this.errorToMCPError(error),
      };
    }
  }

  private getOrCreateSession(): MCPSession {
    if (this.currentSession) {
      return this.currentSession;
    }

    // For stdio transport, create a default session
    const session = this.sessionManager.createSession(this.config.transport);
    this.currentSession = session;
    return session;
  }

  private createTransport(): ITransport {
    switch (this.config.transport) {
      case 'stdio':
        return new StdioTransport(this.logger);

      case 'http':
        return new HttpTransport(
          this.config.host || 'localhost',
          this.config.port || 3000,
          this.config.tlsEnabled || false,
          this.logger,
        );

      default:
        throw new MCPErrorClass(`Unknown transport type: ${this.config.transport}`);
    }
  }

  private async registerBuiltInTools(): Promise<void> {
    // System information tool
    this.registerTool({
      name: 'system/info',
      description: 'Get system information',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      handler: async () => {
        return {
          version: '1.0.0',
          platform: platform(),
          arch: arch(),
          runtime: 'Node.js',
          uptime: performance.now(),
        };
      },
    });

    // Health check tool
    this.registerTool({
      name: 'system/health',
      description: 'Get system health status',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      handler: async () => {
        return await this.getHealthStatus();
      },
    });

    // List tools
    this.registerTool({
      name: 'tools/list',
      description: 'List all available tools',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      handler: async () => {
        const discovery = this.toolRegistry
          .listTools()
          .filter((t) => !this.gateTools.has(t.name))
          .map((t) => ({ name: t.name, description: t.description }));
        const context = this.currentSession ? { sessionId: this.currentSession.id } : {};
        const gated = Object.values(this.gateController.getAvailableTools(context)).map(t => ({
          name: t.name,
          description: t.description,
        }));
        return [...discovery, ...gated];
      },
    });

    // Tool schema
    this.registerTool({
      name: 'tools/schema',
      description: 'Get schema for a specific tool',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        required: ['name'],
      },
      handler: async (input: any) => {
        const tool = this.toolRegistry.getTool(input.name);
        if (!tool) {
          throw new Error(`Tool not found: ${input.name}`);
        }
        return {
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        };
      },
    });
  }

  private loadFilterConfig(): typeof filterConfigDefault {
    const configPath = process.env.TOOL_FILTER_CONFIG;
    if (configPath) {
      try {
        const raw = fs.readFileSync(configPath, 'utf8');
        return JSON.parse(raw);
      } catch (err) {
        this.logger.warn('Failed to load filter config', { error: err });
      }
    }
    return filterConfigDefault;
  }

  private getDiscoveryTools(): MCPTool[] {
    const tools: MCPTool[] = [
      {
        name: 'gate/discover_toolsets',
        description: 'List available toolsets',
        inputSchema: { type: 'object', properties: {} },
        handler: async () => ({
          toolsets: this.gateController.discoverToolsets(),
        }),
      },
      {
        name: 'gate/enable_toolset',
        description: 'Enable a toolset by name',
        inputSchema: {
          type: 'object',
          properties: { name: { type: 'string' } },
          required: ['name'],
        },
        handler: async ({ name }) => {
          await this.gateController.enableToolset(name);
          this.syncGateTools();
          return { tools: this.gateController.listActiveTools() };
        },
      },
      {
        name: 'gate/disable_toolset',
        description: 'Disable a toolset by name',
        inputSchema: {
          type: 'object',
          properties: { name: { type: 'string' } },
          required: ['name'],
        },
        handler: async ({ name }) => {
          this.gateController.disableToolset(name);
          this.syncGateTools();
          return { tools: this.gateController.listActiveTools() };
        },
      },
      {
        name: 'gate/list_active_tools',
        description: 'List currently active tools',
        inputSchema: { type: 'object', properties: {} },
        handler: async () => ({ tools: this.gateController.listActiveTools() }),
      },
    ];
    return tools.map(optimizeTool);
  }

  private syncGateTools(): void {
    const available = this.gateController.getAvailableTools();
    const names = new Set(Object.keys(available));

    for (const name of Array.from(this.gateTools)) {
      if (!names.has(name)) {
        this.toolRegistry.unregister(name);
        this.gateTools.delete(name);
      }
    }

    for (const [name, tool] of Object.entries(available)) {
      if (!name.includes('/')) {
        continue;
      }
      if (!this.gateTools.has(name)) {
        this.toolRegistry.register(tool);
        this.gateTools.add(name);
      }
    }
  }

  private errorToMCPError(error): MCPError {
    if (error instanceof MCPMethodNotFoundError) {
      return {
        code: -32601,
        message: error instanceof Error ? error.message : String(error),
        data: error.details,
      };
    }

    if (error instanceof MCPErrorClass) {
      return {
        code: -32603,
        message: error instanceof Error ? error.message : String(error),
        data: error.details,
      };
    }

    if (error instanceof Error) {
      return {
        code: -32603,
        message: error instanceof Error ? error.message : String(error),
      };
    }

    return {
      code: -32603,
      message: 'Internal error',
      data: error,
    };
  }
}
