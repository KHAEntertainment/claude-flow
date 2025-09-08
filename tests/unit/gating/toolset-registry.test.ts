import { describe, it, expect, beforeEach } from '../../test.utils';
import { ToolGateController } from '../../../src/gating/toolset-registry.js';
import type { MCPTool } from '../../../src/utils/types.js';

const createTool = (name: string): MCPTool => ({
  name,
  description: name,
  inputSchema: { type: 'object', properties: {} },
  handler: async () => ({ ok: true })
});

describe('ToolGateController', () => {
  let controller: ToolGateController;

  beforeEach(() => {
    controller = new ToolGateController({
      setA: async () => ({ a_tool: createTool('a_tool') }),
      setB: async () => ({ b_tool: createTool('b_tool') })
    });
  });

  it('activates toolsets on demand', async () => {
    expect(controller.listActiveTools()).toHaveLength(0);
    await controller.enableToolset('setA');
    expect(controller.listActiveTools()).toEqual(['a_tool']);
  });

  it('reduces context size when disabling a toolset', async () => {
    await controller.enableToolset('setA');
    await controller.enableToolset('setB');
    const sizeWithBoth = controller.getContextSize();
    controller.disableToolset('setB');
    const sizeAfter = controller.getContextSize();
    expect(sizeAfter).toBeLessThan(sizeWithBoth);
  });

  it('optimizes tool schemas on registration', async () => {
    const long = 'x'.repeat(60);
    controller = new ToolGateController({
      setC: async () => ({
        tool: {
          name: 'tool',
          description: long,
          inputSchema: {
            type: 'object',
            properties: {
              foo: {
                type: 'string',
                description: long,
                default: 'bar',
                examples: ['baz']
              }
            }
          },
          handler: async () => ({})
        }
      })
    });
    await controller.enableToolset('setC');
    const tool = controller.getAvailableTools()['tool'] as any;
    expect(tool.description.length).toBeLessThanOrEqual(50);
    const foo = tool.inputSchema.properties.foo;
    expect(foo.default).toBeUndefined();
    expect(foo.examples).toBeUndefined();
    expect(foo.description.length).toBeLessThanOrEqual(50);
  });
});
