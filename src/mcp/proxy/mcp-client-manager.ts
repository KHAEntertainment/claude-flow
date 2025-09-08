import { EventEmitter } from 'events';
import { MCPClient } from '../client.js';
import { MCPTool } from '../../utils/types.js';
import { Logger } from '../../../core/logger.js';
import { InMemoryToolRepository } from '../../utils/in-memory-tool-repository.js';

interface ServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  transport?: 'stdio' | 'http' | 'websocket';
}

interface ConnectionState {
  name: string;
  connected: boolean;
  tools: MCPTool[];
  lastError?: string;
  connectedAt?: Date;
}

export class MCPClientManager extends EventEmitter {
  private clients: Map<string, MCPClient> = new Map();
  private toolRepository: InMemoryToolRepository;

  constructor(toolRepository: InMemoryToolRepository) {
    super();
    this.toolRepository = toolRepository;
  }

  async executeTool(serverName: string, toolName: string, input: any): Promise<any> {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`No connection to server: ${serverName}`);
    }

    // Use the client's request method to execute the tool
    const result = await client.request('tools/call', {
      tool: toolName,
      input,
    });
    return result.result;
  }