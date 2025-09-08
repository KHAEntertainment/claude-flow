import { MCPTool } from '../../utils/types.js';
import { MCPClientManager } from './mcp-client-manager.js';
import { InMemoryToolRepository } from './tool-repository.js';

export class ProxyService {
  constructor(
    private clientManager: MCPClientManager,
    private toolRepository: InMemoryToolRepository,
  ) {}

  async executeTool(toolName: string, input: any, context?: any): Promise<any> {
    // Get the tool from the repository
    const tool = this.toolRepository.getTool(toolName);
    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    // Get the backend server name from the tool
    const serverName = (tool as any).serverName;
    if (!serverName) {
      throw new Error(`Tool ${toolName} not associated with a backend server`);
    }

    // Route the call to the backend server using the client manager
    const result = await this.clientManager.executeTool(serverName, toolName, input);
    return result;
  }

  getAvailableTools(): MCPTool[] {
    return this.toolRepository.getAllTools();
  }

  addToolToRepository(tool: MCPTool & { serverName: string }): void {
    // Ensure the tool has the serverName
    if (!tool.serverName) {
      throw new Error(`Tool ${tool.name} must have serverName`);
    }
    this.toolRepository.addTool(tool);
  }
}