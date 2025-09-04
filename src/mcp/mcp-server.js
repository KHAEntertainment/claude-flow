#!/usr/bin/env node
/**
 * Claude-Flow MCP Server (simplified)
 * Uses consolidated tool implementations from claude-flow-tools.
 */

import { createClaudeFlowTools } from './claude-flow-tools.js';
import { memoryStore } from '../memory/fallback-store.js';

class ClaudeFlowMCPServer {
  constructor() {
    this.version = '2.0.0-alpha.59';
    this.memoryStore = memoryStore;
    this.capabilities = {
      tools: { listChanged: true },
      resources: { subscribe: true, listChanged: true },
    };
    this.sessionId = `session-cf-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    this.tools = {};
    this.resources = this.initializeResources();
    this.toolsPromise = this.initializeTools();
  }

  async initializeTools() {
    const logger = {
      info: (...args) => console.error(`[${new Date().toISOString()}] INFO [claude-flow-mcp]`, ...args),
      warn: (...args) => console.error(`[${new Date().toISOString()}] WARN [claude-flow-mcp]`, ...args),
      error: (...args) => console.error(`[${new Date().toISOString()}] ERROR [claude-flow-mcp]`, ...args),
      debug: (...args) => console.error(`[${new Date().toISOString()}] DEBUG [claude-flow-mcp]`, ...args),
    };
    const toolList = await createClaudeFlowTools(logger);
    for (const tool of toolList) {
      this.tools[tool.name] = tool;
    }
  }

  initializeResources() {
    return {
      'claude-flow://swarms': {
        uri: 'claude-flow://swarms',
        name: 'Active Swarms',
        description: 'List of active swarm configurations and status',
        mimeType: 'application/json',
      },
      'claude-flow://agents': {
        uri: 'claude-flow://agents',
        name: 'Agent Registry',
        description: 'Registry of available agents and their capabilities',
        mimeType: 'application/json',
      },
      'claude-flow://models': {
        uri: 'claude-flow://models',
        name: 'Neural Models',
        description: 'Available neural network models and training status',
        mimeType: 'application/json',
      },
      'claude-flow://performance': {
        uri: 'claude-flow://performance',
        name: 'Performance Metrics',
        description: 'Real-time performance metrics and benchmarks',
        mimeType: 'application/json',
      },
    };
  }

  async handleMessage(message) {
    const { id, method, params } = message;
    switch (method) {
      case 'initialize':
        return this.handleInitialize(id);
      case 'tools/list':
        return await this.handleToolsList(id);
      case 'tools/call':
        return await this.handleToolCall(id, params);
      case 'resources/list':
        return this.handleResourcesList(id);
      case 'resources/read':
        return this.handleResourceRead(id, params);
      default:
        return this.createErrorResponse(id, -32601, 'Method not found');
    }
  }

  handleInitialize(id) {
    console.error(`[${new Date().toISOString()}] INFO [claude-flow-mcp] (${this.sessionId}) 🔌 Connection established: ${this.sessionId}`);
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: this.capabilities,
        serverInfo: { name: 'claude-flow', version: this.version },
      },
    };
  }

  async handleToolsList(id) {
    await this.toolsPromise;
    const toolsList = Object.values(this.tools).map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
    return { jsonrpc: '2.0', id, result: { tools: toolsList } };
  }

  async handleToolCall(id, params) {
    const { name, arguments: args } = params;
    console.error(`[${new Date().toISOString()}] INFO [claude-flow-mcp] (${this.sessionId}) 🔧 Tool called: ${name}`);
    try {
      const result = await this.executeTool(name, args);
      return {
        jsonrpc: '2.0',
        id,
        result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] },
      };
    } catch (error) {
      return this.createErrorResponse(id, -32000, 'Tool execution failed', error.message);
    }
  }

  handleResourcesList(id) {
    const resourcesList = Object.values(this.resources);
    return { jsonrpc: '2.0', id, result: { resources: resourcesList } };
  }

  async handleResourceRead(id, params) {
    const { uri } = params;
    const resource = this.resources[uri];
    if (!resource) {
      return this.createErrorResponse(id, -32000, 'Resource not found');
    }
    return {
      jsonrpc: '2.0',
      id,
      result: { contents: [{ uri, mimeType: resource.mimeType, text: resource.description }] },
    };
  }

  async executeTool(name, args) {
    await this.toolsPromise;
    const tool = this.tools[name];
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }
    return await tool.handler(args, { sessionId: this.sessionId });
  }

  createErrorResponse(id, code, message, data) {
    return { jsonrpc: '2.0', id, error: { code, message, data } };
  }
}

async function startMCPServer() {
  const server = new ClaudeFlowMCPServer();
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', async (data) => {
    try {
      const message = JSON.parse(data);
      const response = await server.handleMessage(message);
      process.stdout.write(JSON.stringify(response) + '\n');
    } catch (error) {
      console.error('Failed to process message:', error);
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startMCPServer().catch(console.error);
}

export { ClaudeFlowMCPServer };
