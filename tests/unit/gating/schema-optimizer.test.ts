import { describe, it, expect } from '../../test.utils';
import { optimizeTool } from '../../../src/gating/schema-optimizer.js';
import type { MCPTool } from '../../../src/utils/types.js';

describe('schema optimizer', () => {
  it('truncates descriptions and strips schema extras', () => {
    const long = 'x'.repeat(60);
    const tool: MCPTool = {
      name: 'test/tool',
      description: long,
      inputSchema: {
        type: 'object',
        description: long,
        properties: {
          foo: {
            type: 'string',
            description: long,
            default: 'bar',
            examples: ['baz'],
          },
        },
      },
      handler: async () => ({})
    };

    const optimized = optimizeTool(tool);
    expect(optimized.description.length).toBeLessThanOrEqual(50);
    const schema: any = optimized.inputSchema;
    expect(schema.description.length).toBeLessThanOrEqual(50);
    const foo = schema.properties.foo;
    expect(foo.default).toBeUndefined();
    expect(foo.examples).toBeUndefined();
    expect(foo.description.length).toBeLessThanOrEqual(50);
  });
});
