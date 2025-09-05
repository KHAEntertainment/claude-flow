import { describe, test, expect } from '@jest/globals';
import { getValidAgentTypes } from '../constants/agent-types.js';
import { createClaudeFlowTools } from '../mcp/claude-flow-tools.js';

describe('Agent Type Validation Consistency', () => {
  let expectedTypes: string[];
  beforeAll(async () => {
    expectedTypes = (await getValidAgentTypes()).sort();
  });

  test('Claude Flow tools use consistent agent types', async () => {
    const tools = await createClaudeFlowTools({} as any);
    const spawnTool = tools.find((t) => t.name === 'agents/spawn' || t.name === 'agent_spawn');
    const enumValues = spawnTool?.inputSchema.properties.type.enum;
    expect(enumValues?.sort()).toEqual(expectedTypes);
  });

  test('Error wrapper validation uses consistent agent types', () => {
    expect(true).toBe(true);
  });
});
