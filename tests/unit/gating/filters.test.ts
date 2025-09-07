import { describe, it, expect, beforeEach } from '../../test.utils';
import { ToolGateController } from '../../../src/gating/toolset-registry.js';
import type { MCPTool } from '../../../src/utils/types.js';

const createTool = (name: string): MCPTool => ({
  name,
  description: name,
  inputSchema: { type: 'object', properties: {} },
  handler: async () => ({ ok: true })
});

const loader = async () => ({
  a_tool: createTool('a_tool'),
  b_tool: createTool('b_tool'),
  c_tool: createTool('c_tool')
});

describe('Tool filters', () => {
  beforeEach(() => {
    // noop
  });

  it('filters by task type', async () => {
    const controller = new ToolGateController({ set: loader }, {
      taskType: { enabled: true, map: { typeA: ['a_tool'] } }
    } as any);
    await controller.enableToolset('set');
    const tools = controller.getAvailableTools({ taskType: 'typeA' });
    expect(Object.keys(tools)).toEqual(['a_tool']);
  });

  it('filters by security blocklist', async () => {
    const controller = new ToolGateController({ set: loader }, {
      security: { enabled: true, blocked: ['b_tool'] }
    } as any);
    await controller.enableToolset('set');
    const tools = controller.getAvailableTools();
    expect(Object.keys(tools)).toEqual(['a_tool', 'c_tool']);
  });

  it('limits number of tools via resource filter', async () => {
    const controller = new ToolGateController({ set: loader }, {
      resource: { enabled: true, maxTools: 2 }
    } as any);
    await controller.enableToolset('set');
    const tools = controller.getAvailableTools();
    expect(Object.keys(tools)).toEqual(['a_tool', 'b_tool']);
  });

  it('applies all filters in chain', async () => {
    const controller = new ToolGateController({ set: loader }, {
      taskType: { enabled: true, map: { typeB: ['b_tool', 'c_tool'] } },
      resource: { enabled: true, maxTools: 2 },
      security: { enabled: true, blocked: ['c_tool'] }
    } as any);
    await controller.enableToolset('set');
    const tools = controller.getAvailableTools({ taskType: 'typeB' });
    expect(Object.keys(tools)).toEqual(['b_tool']);
  });
});
