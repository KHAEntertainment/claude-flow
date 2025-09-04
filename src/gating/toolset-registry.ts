import type { MCPTool } from '../utils/types.ts';

export type ToolsetLoader = () => Promise<Record<string, MCPTool>>;

export class ToolGateController {
  private toolsetLoaders: Record<string, ToolsetLoader>;
  private activeToolsets = new Set<string>();
  private loadedTools: Record<string, MCPTool> = {};
  private toolsetTools: Record<string, string[]> = {};

  constructor(toolsetLoaders: Record<string, ToolsetLoader> = {}) {
    this.toolsetLoaders = toolsetLoaders;
  }

  discoverToolsets(): string[] {
    return Object.keys(this.toolsetLoaders);
  }

  async enableToolset(name: string): Promise<void> {
    const loader = this.toolsetLoaders[name];
    if (!loader) {
      throw new Error(`Unknown toolset: ${name}`);
    }
    if (this.activeToolsets.has(name)) {
      return;
    }
    const tools = await loader();
    this.toolsetTools[name] = Object.keys(tools);
    Object.assign(this.loadedTools, tools);
    this.activeToolsets.add(name);
  }

  disableToolset(name: string): void {
    if (!this.activeToolsets.has(name)) {
      return;
    }
    for (const toolName of this.toolsetTools[name] || []) {
      delete this.loadedTools[toolName];
    }
    delete this.toolsetTools[name];
    this.activeToolsets.delete(name);
  }

  listActiveTools(): string[] {
    return Object.keys(this.loadedTools);
  }

  getAvailableTools(): Record<string, MCPTool> {
    return { ...this.loadedTools };
  }

  getContextSize(): number {
    return JSON.stringify(this.loadedTools).length;
  }
}

export default ToolGateController;
