import { MCPTool } from '../../utils/types.js';

interface ToolSearchOptions {
  name?: string;
  category?: string;
  capability?: string;
  includeDeprecated?: boolean;
}

export class InMemoryToolRepository {
  private tools: Map<string, MCPTool> = new Map();
  private categories: Map<string, string[]> = new Map();
  private capabilities: Map<string, string[]> = new Map();

  addTool(tool: MCPTool): void {
    if (!tool.name) {
      throw new Error('Tool must have a name');
    }

    this.tools.set(tool.name, tool);

    // Update categories
    if (tool.categories && tool.categories.length > 0) {
      for (const category of tool.categories) {
        if (!this.categories.has(category)) {
          this.categories.set(category, []);
        }
        this.categories.get(category)!.push(tool.name);
      }
    }

    // Update capabilities
    if (tool.capabilities && tool.capabilities.length > 0) {
      for (const capability of tool.capabilities) {
        if (!this.capabilities.has(capability)) {
          this.capabilities.set(capability, []);
        }
        this.capabilities.get(capability)!.push(tool.name);
      }
    }
  }

  getTool(name: string): MCPTool | undefined {
    return this.tools.get(name);
  }

  getAllTools(): MCPTool[] {
    return Array.from(this.tools.values());
  }

  searchTools(options: ToolSearchOptions = {}): MCPTool[] {
    let results = this.getAllTools();

    if (options.name) {
      results = results.filter(tool => tool.name.includes(options.name!));
    }

    if (options.category) {
      const categoryTools = this.categories.get(options.category) || [];
      results = results.filter(tool => categoryTools.includes(tool.name));
    }

    if (options.capability) {
      const capabilityTools = this.capabilities.get(options.capability) || [];
      results = results.filter(tool => capabilityTools.includes(tool.name));
    }

    if (!options.includeDeprecated) {
      results = results.filter(tool => !tool.deprecated);
    }

    return results;
  }

  getToolsByCategory(category: string): MCPTool[] {
    const toolNames = Array.from(this.categories.get(category) ?? []);
    return toolNames.map(name => this.getTool(name)).filter(Boolean) as MCPTool[];
  }

  getToolsByCapability(capability: string): MCPTool[] {
    const toolNames = Array.from(this.capabilities.get(capability) ?? []);
    return toolNames.map(name => this.getTool(name)).filter(Boolean) as MCPTool[];
  }

  getTotalTools(): number {
    return this.tools.size;
  }

  removeTool(name: string): boolean {
    const existing = this.tools.get(name);
    if (!existing) return false;

    // Deindex categories
    if (existing.categories?.length) {
      for (const category of existing.categories) {
        const set = this.categories.get(category);
        set?.delete(name);
        if (set && set.size === 0) this.categories.delete(category);
      }
    }
    // Deindex capabilities
    if (existing.capabilities?.length) {
      for (const capability of existing.capabilities) {
        const set = this.capabilities.get(capability);
        set?.delete(name);
        if (set && set.size === 0) this.capabilities.delete(capability);
      }
    }

    this.tools.delete(name);
    return true;
  }

  clearRepository(): void {
    this.tools.clear();
    this.categories.clear();
    this.capabilities.clear();
  }
}