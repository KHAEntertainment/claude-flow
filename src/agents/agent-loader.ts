/**
 * Dynamic Agent Loader - Reads agent definitions from .claude/agents/ directory
 * This is the single source of truth for all agent types in the system
 */

import { readFileSync, existsSync } from 'node:fs';
import { glob } from 'glob';
import { resolve, dirname } from 'node:path';
import { parse as parseYaml } from 'yaml';

// Legacy agent type mapping for backward compatibility
const LEGACY_AGENT_MAPPING = {
  analyst: 'code-analyzer',
  coordinator: 'task-orchestrator', 
  optimizer: 'perf-analyzer',
  documenter: 'api-docs',
  monitor: 'performance-benchmarker',
  specialist: 'system-architect',
  architect: 'system-architect',
} as const;

/**
 * Resolve legacy agent types to current equivalents
 */
function resolveLegacyAgentType(legacyType: string): string {
  return LEGACY_AGENT_MAPPING[legacyType as keyof typeof LEGACY_AGENT_MAPPING] || legacyType;
}

export interface AgentDefinition {
  name: string;
  type?: string;
  color?: string;
  description: string;
  capabilities?: string[];
  priority?: 'low' | 'medium' | 'high' | 'critical';
  hooks?: {
    pre?: string;
    post?: string;
  };
  content?: string; // The markdown content after frontmatter
}

export interface AgentCategory {
  name: string;
  agents: AgentDefinition[];
}

class AgentLoader {
  private agentCache: Map<string, AgentDefinition> = new Map();
  private agentIndex: Map<string, { path: string; category: string }> = new Map();
  private lastIndexTime = 0;
  private cacheExpiry = 60000; // 1 minute cache

  /**
   * Get the .claude/agents directory path
   */
  private getAgentsDirectory(): string {
    // Start from current working directory and walk up to find .claude/agents
    let currentDir = process.cwd();
    
    while (currentDir !== '/') {
      const claudeAgentsPath = resolve(currentDir, '.claude', 'agents');
      if (existsSync(claudeAgentsPath)) {
        return claudeAgentsPath;
      }
      currentDir = dirname(currentDir);
    }
    
    // Fallback to relative path
    return resolve(process.cwd(), '.claude', 'agents');
  }

  /**
   * Parse agent definition from markdown file
   */
  private parseAgentFile(filePath: string): AgentDefinition | null {
    try {
      const content = readFileSync(filePath, 'utf-8');
      
      // Split frontmatter and content
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
      if (!frontmatterMatch) {
        console.warn(`No frontmatter found in ${filePath}`);
        return null;
      }

      const [, yamlContent, markdownContent] = frontmatterMatch;
      const frontmatter = parseYaml(yamlContent);

      if (!frontmatter.name || !frontmatter.metadata?.description) {
        console.warn(`Missing required fields (name, metadata.description) in ${filePath}`);
        return null;
      }

      return {
        name: frontmatter.name,
        type: frontmatter.type,
        color: frontmatter.color,
        description: frontmatter.metadata.description,
        capabilities: frontmatter.metadata.capabilities || frontmatter.capabilities || [],
        priority: frontmatter.priority || 'medium',
        hooks: frontmatter.hooks,
        content: markdownContent.trim(),
      };
    } catch (error) {
      console.error(`Error parsing agent file ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Build index of available agents without loading definitions
   */
  private async buildAgentIndex(): Promise<void> {
    if (this.agentIndex.size > 0 && Date.now() - this.lastIndexTime < this.cacheExpiry) {
      return;
    }

    const agentsDir = this.getAgentsDirectory();
    if (!existsSync(agentsDir)) {
      console.warn(`Agents directory not found: ${agentsDir}`);
      return;
    }

    const agentFiles = await glob('**/*.md', {
      cwd: agentsDir,
      ignore: ['**/README.md', '**/MIGRATION_SUMMARY.md'],
      absolute: true,
    });

    this.agentIndex.clear();
    this.lastIndexTime = Date.now();

    for (const filePath of agentFiles) {
      const relativePath = filePath.replace(agentsDir + '/', '');
      const parts = relativePath.split('/');
      const category = parts[0] || 'uncategorized';
      const name = parts[parts.length - 1].replace(/\.md$/, '');
      this.agentIndex.set(name, { path: filePath, category });
    }
  }

  /**
   * Get all available agent types
   */
  async getAvailableAgentTypes(): Promise<string[]> {
    await this.buildAgentIndex();
    const currentTypes = Array.from(this.agentIndex.keys());
    const legacyTypes = Object.keys(LEGACY_AGENT_MAPPING);
    // Return both current types and legacy types, removing duplicates
    const combined = [...currentTypes, ...legacyTypes];
    const uniqueTypes = Array.from(new Set(combined));
    return uniqueTypes.sort();
  }

  /**
   * Get agent definition by name
   */
  async getAgent(name: string): Promise<AgentDefinition | null> {
    // Check cache first
    const cached =
      this.agentCache.get(name) || this.agentCache.get(resolveLegacyAgentType(name));
    if (cached) return cached;

    await this.buildAgentIndex();
    const info =
      this.agentIndex.get(name) || this.agentIndex.get(resolveLegacyAgentType(name));
    if (!info) return null;

    const agent = this.parseAgentFile(info.path);
    if (agent) {
      this.agentCache.set(agent.name, agent);
    }
    return agent;
  }

  /**
   * Preload multiple agents at once. If no toolset provided, loads all agents.
   */
  async preloadAgents(toolset?: string[]): Promise<AgentDefinition[]> {
    await this.buildAgentIndex();
    const names =
      toolset && toolset.length > 0
        ? toolset.map(resolveLegacyAgentType)
        : Array.from(this.agentIndex.keys());
    const agents: AgentDefinition[] = [];
    for (const name of names) {
      const agent = await this.getAgent(name);
      if (agent) agents.push(agent);
    }
    return agents;
  }

  /**
   * Get all agent definitions
   */
  async getAllAgents(): Promise<AgentDefinition[]> {
    return (await this.preloadAgents()).sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Get agents organized by category
   */
  async getAgentCategories(): Promise<AgentCategory[]> {
    await this.buildAgentIndex();
    const categoryMap = new Map<string, AgentDefinition[]>();
    for (const [name, info] of this.agentIndex.entries()) {
      const agent = await this.getAgent(name);
      if (!agent) continue;
      if (!categoryMap.has(info.category)) {
        categoryMap.set(info.category, []);
      }
      categoryMap.get(info.category)!.push(agent);
    }

    return Array.from(categoryMap.entries()).map(([name, agents]) => ({
      name,
      agents: agents.sort((a, b) => a.name.localeCompare(b.name)),
    }));
  }

  /**
   * Search agents by capabilities, description, or name
   */
  async searchAgents(query: string): Promise<AgentDefinition[]> {
    const agents = await this.preloadAgents();
    const lowerQuery = query.toLowerCase();

    return agents.filter(agent => {
      return (
        agent.name.toLowerCase().includes(lowerQuery) ||
        agent.description.toLowerCase().includes(lowerQuery) ||
        agent.capabilities?.some(cap => cap.toLowerCase().includes(lowerQuery)) ||
        false
      );
    });
  }

  /**
   * Check if an agent type is valid
   */
  async isValidAgentType(name: string): Promise<boolean> {
    await this.buildAgentIndex();
    // First try the original name, then try the legacy mapping
    return this.agentIndex.has(name) || this.agentIndex.has(resolveLegacyAgentType(name));
  }

  /**
   * Get agents by category name
   */
  async getAgentsByCategory(category: string): Promise<AgentDefinition[]> {
    const categories = await this.getAgentCategories();
    const found = categories.find(cat => cat.name === category);
    return found?.agents || [];
  }

  /**
   * Force refresh the agent cache
   */
  async refresh(): Promise<void> {
    this.agentCache.clear();
    this.agentIndex.clear();
    this.lastIndexTime = 0;
    await this.buildAgentIndex();
  }
}

// Singleton instance
export const agentLoader = new AgentLoader();

// Convenience functions
export const getAvailableAgentTypes = () => agentLoader.getAvailableAgentTypes();
export const getAgent = (name: string) => agentLoader.getAgent(name);
export const preloadAgents = (toolset?: string[]) => agentLoader.preloadAgents(toolset);
export const getAllAgents = () => agentLoader.getAllAgents();
export const getAgentCategories = () => agentLoader.getAgentCategories();
export const searchAgents = (query: string) => agentLoader.searchAgents(query);
export const isValidAgentType = (name: string) => agentLoader.isValidAgentType(name);
export const getAgentsByCategory = (category: string) => agentLoader.getAgentsByCategory(category);
export const refreshAgents = () => agentLoader.refresh();

// Export legacy mapping utilities
export { resolveLegacyAgentType, LEGACY_AGENT_MAPPING };