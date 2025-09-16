import { MCPTool } from '../../utils/types.js';
import { MCPClientManager } from './mcp-client-manager.js';
import { InMemoryToolRepository } from '../../repository/tool-repository.js';
import { MCPError } from '../../utils/errors.js';
// Type guard to check if tool has serverName property
function hasServerName(tool: MCPTool): tool is MCPTool & { serverName: string } {
  return typeof (tool as any).serverName === 'string' && (tool as any).serverName.length > 0;
}

export class ProxyService {
  constructor(
    private clientManager: MCPClientManager,
    private toolRepository: InMemoryToolRepository,
  ) {}

  async executeTool(toolName: string, input: any, _context?: any): Promise<any> {
    // Get the tool from the repository
    const tool = this.toolRepository.getTool(toolName);
    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    // Validate input against tool schema
    this.validateInput(tool, input);

    // Get the backend server name from the tool using type guard
    if (!hasServerName(tool)) {
      throw new Error(`Tool ${toolName} not associated with a backend server`);
    }
    const { serverName } = tool;

    // Route the call to the backend server using the client manager with error context
    try {
      // Note: _context is marked as unused for now, can be forwarded when MCPClientManager supports it
      const result = await this.clientManager.executeTool(serverName, toolName, input);
      return result;
    } catch (err) {
      const error = err as Error;
      error.message = `[ProxyService] server=${serverName} tool=${toolName}: ${error.message}`;
      throw error;
    }
  }

  getAvailableTools(): MCPTool[] {
    return this.toolRepository.getAllTools();
  }

  addToolToRepository(tool: MCPTool & { serverName: string }): void {
    // Ensure the tool has the serverName
    if (!tool.serverName) {
      throw new Error(`Tool ${tool.name} must have serverName`);
    }
    
    // Guard against duplicate tool registrations
    const existing = this.toolRepository.getTool(tool.name);
    if (existing) {
      throw new Error(`Tool already exists: ${tool.name}. Remove it first or use a different name.`);
    }
    
    this.toolRepository.addTool(tool);
  }

  /**
   * Validates input against tool schema
   */
  private validateInput(tool: MCPTool, input: unknown): void {
    const schema = tool.inputSchema as any;

    if (schema.type === 'object' && schema.properties) {
      if (typeof input !== 'object' || input === null) {
        throw new MCPError('Input must be an object');
      }

      const inputObj = input as Record<string, unknown>;

      // Check for unknown properties (strict validation)
      // Unless explicitly allowed via additionalProperties: true
      if (schema.additionalProperties !== true) {
        const allowedProperties = Object.keys(schema.properties || {});
        const inputProperties = Object.keys(inputObj);
        
        for (const prop of inputProperties) {
          if (!allowedProperties.includes(prop)) {
            throw new MCPError(`Unknown property: ${prop}. Allowed properties are: ${allowedProperties.join(', ') || 'none'}`);
          }
        }
      }

      // Check required properties
      if (schema.required && Array.isArray(schema.required)) {
        for (const prop of schema.required) {
          if (!(prop in inputObj)) {
            throw new MCPError(`Missing required property: ${prop}`);
          }
        }
      }

      // Check property types
      for (const [prop, propSchema] of Object.entries(schema.properties)) {
        if (prop in inputObj) {
          const value = inputObj[prop];
          const expectedType = (propSchema as any).type;

          if (expectedType && !this.checkType(value, expectedType)) {
            throw new MCPError(`Invalid type for property ${prop}: expected ${expectedType}`);
          }
        }
      }
    }
  }

  /**
   * Checks if a value matches a JSON Schema type
   */
  private checkType(value: unknown, type: string): boolean {
    switch (type) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number';
      case 'boolean':
        return typeof value === 'boolean';
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      case 'array':
        return Array.isArray(value);
      case 'null':
        return value === null;
      default:
        return true;
    }
  }
}
