/**
 * Tool repository for managing and discovering MCP tools
 * This is in a neutral location to avoid circular dependencies between server and proxy layers
 */

import type { MCPTool } from '../utils/types.js';

/**
 * In-memory tool repository for storing and retrieving tools
 */
export class InMemoryToolRepository {
  private tools: Map<string, MCPTool> = new Map();
  private toolsByCategory: Map<string, Set<string>> = new Map();

  /**
   * Add a tool to the repository
   */
  addTool(tool: MCPTool): void {
    this.tools.set(tool.name, tool);
    
    // Index by category if present
    const category = this.extractCategory(tool.name);
    if (category) {
      if (!this.toolsByCategory.has(category)) {
        this.toolsByCategory.set(category, new Set());
      }
      this.toolsByCategory.get(category)!.add(tool.name);
    }
  }

  /**
   * Get a tool by name
   */
  getTool(name: string): MCPTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all tools
   */
  getAllTools(): MCPTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tools by category
   */
  getToolsByCategory(category: string): MCPTool[] {
    const toolNames = this.toolsByCategory.get(category);
    if (!toolNames) return [];
    
    return Array.from(toolNames)
      .map(name => this.tools.get(name))
      .filter((tool): tool is MCPTool => tool !== undefined);
  }

  /**
   * Search for tools matching a query
   */
  searchTools(query: string): MCPTool[] {
    const lowerQuery = query.toLowerCase();
    const results: Array<{ tool: MCPTool; score: number }> = [];

    for (const tool of this.tools.values()) {
      let score = 0;

      // Exact name match
      if (tool.name.toLowerCase() === lowerQuery) {
        score += 100;
      } else if (tool.name.toLowerCase().includes(lowerQuery)) {
        // Partial name match
        score += 50;
      }

      // Description match (guard missing descriptions)
      const desc = (tool.description ?? '').toLowerCase();
      if (desc.includes(lowerQuery)) {
        score += 25;
      }
      // Category match
      const category = this.extractCategory(tool.name);
      if (category && category.toLowerCase().includes(lowerQuery)) {
        score += 10;
      }

      if (score > 0) {
        results.push({ tool, score });
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);
    return results.map(r => r.tool);
  }

  /**
   * Get total number of tools
   */
  getTotalTools(): number {
    return this.tools.size;
  }

  /**
   * Clear all tools
   */
  clear(): void {
    this.tools.clear();
    this.toolsByCategory.clear();
  }

  /**
   * Extract category from tool name (e.g., "file/read" -> "file")
   */
  private extractCategory(toolName: string): string | null {
    const parts = toolName.split('/');
    return parts.length > 1 ? parts[0] : null;
  }
}
