/**
 * Unit tests for GatingService
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { GatingService } from '../../src/gating/gating-service.js';
import { DiscoveryService } from '../../src/gating/discovery-service.js';
import { InMemoryToolRepository } from '../../src/mcp/proxy/tool-repository.js';

describe('GatingService', () => {
  let gatingService: GatingService;
  let discoveryService: DiscoveryService;
  let toolRepository: InMemoryToolRepository;

  beforeEach(() => {
    toolRepository = new InMemoryToolRepository();
    discoveryService = new DiscoveryService(toolRepository);
    gatingService = new GatingService(discoveryService);
  });

  describe('provisionTools', () => {
    it('should return empty array when no tools are discovered', async () => {
      const result = await gatingService.provisionTools({
        query: 'file operations',
        maxTokens: 1000,
      });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    it('should provision tools within token limit', async () => {
      // Add tools with different token counts
      toolRepository.addTool({
        name: 'small-tool',
        description: 'A small tool',
        inputSchema: { type: 'object' },
        backend: 'test-backend',
        discoverySource: 'backend',
        tokenCount: 100,
      });

      toolRepository.addTool({
        name: 'medium-tool',
        description: 'A medium tool',
        inputSchema: { type: 'object' },
        backend: 'test-backend',
        discoverySource: 'backend',
        tokenCount: 300,
      });

      toolRepository.addTool({
        name: 'large-tool',
        description: 'A large tool',
        inputSchema: { type: 'object' },
        backend: 'test-backend',
        discoverySource: 'backend',
        tokenCount: 1000,
      });

      const result = await gatingService.provisionTools({
        query: 'tool',
        maxTokens: 500,
      });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);

      // Calculate total tokens
      const totalTokens = result.reduce((sum, tool) => sum + (tool.tokenCount || 0), 0);
      expect(totalTokens).toBeLessThanOrEqual(500);
    });

    it('should prioritize tools with higher relevance scores', async () => {
      // Add tools with different descriptions to test relevance
      toolRepository.addTool({
        name: 'file-read',
        description: 'Read file contents from the file system',
        inputSchema: { type: 'object' },
        backend: 'test-backend',
        discoverySource: 'backend',
        tokenCount: 200,
      });

      toolRepository.addTool({
        name: 'system-info',
        description: 'Get system information',
        inputSchema: { type: 'object' },
        backend: 'test-backend',
        discoverySource: 'backend',
        tokenCount: 100,
      });

      const result = await gatingService.provisionTools({
        query: 'file operations',
        maxTokens: 1000,
      });

      expect(result.length).toBeGreaterThan(0);

      // File-related tools should be prioritized
      const fileTools = result.filter(tool => tool.name.includes('file'));
      expect(fileTools.length).toBeGreaterThan(0);
    });

    it('should return empty array when maxTokens is too low', async () => {
      toolRepository.addTool({
        name: 'large-tool',
        description: 'A large tool',
        inputSchema: { type: 'object' },
        backend: 'test-backend',
        discoverySource: 'backend',
        tokenCount: 1000,
      });

      const result = await gatingService.provisionTools({
        query: 'tool',
        maxTokens: 50, // Very low limit
      });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    it('should handle tools without tokenCount', async () => {
      toolRepository.addTool({
        name: 'tool-without-tokens',
        description: 'A tool without token count',
        inputSchema: { type: 'object' },
        backend: 'test-backend',
        discoverySource: 'backend',
        // No tokenCount property
      });

      const result = await gatingService.provisionTools({
        query: 'tool',
        maxTokens: 1000,
      });

      expect(Array.isArray(result)).toBe(true);
      // Tools without tokenCount should be treated as having 0 tokens
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle empty query', async () => {
      toolRepository.addTool({
        name: 'test-tool',
        description: 'A test tool',
        inputSchema: { type: 'object' },
        backend: 'test-backend',
        discoverySource: 'backend',
        tokenCount: 100,
      });

      const result = await gatingService.provisionTools({
        query: '',
        maxTokens: 1000,
      });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    it('should handle zero maxTokens', async () => {
      toolRepository.addTool({
        name: 'test-tool',
        description: 'A test tool',
        inputSchema: { type: 'object' },
        backend: 'test-backend',
        discoverySource: 'backend',
        tokenCount: 100,
      });

      const result = await gatingService.provisionTools({
        query: 'tool',
        maxTokens: 0,
      });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    it('should handle negative maxTokens', async () => {
      toolRepository.addTool({
        name: 'test-tool',
        description: 'A test tool',
        inputSchema: { type: 'object' },
        backend: 'test-backend',
        discoverySource: 'backend',
        tokenCount: 100,
      });

      const result = await gatingService.provisionTools({
        query: 'tool',
        maxTokens: -100,
      });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    it('should select optimal combination of tools', async () => {
      // Add tools with different token counts
      toolRepository.addTool({
        name: 'tool-a',
        description: 'Tool A for operations',
        inputSchema: { type: 'object' },
        backend: 'test-backend',
        discoverySource: 'backend',
        tokenCount: 300,
      });

      toolRepository.addTool({
        name: 'tool-b',
        description: 'Tool B for operations',
        inputSchema: { type: 'object' },
        backend: 'test-backend',
        discoverySource: 'backend',
        tokenCount: 400,
      });

      toolRepository.addTool({
        name: 'tool-c',
        description: 'Tool C for operations',
        inputSchema: { type: 'object' },
        backend: 'test-backend',
        discoverySource: 'backend',
        tokenCount: 500,
      });

      const result = await gatingService.provisionTools({
       .query: 'operations',
        maxTokens: 700, // Should fit tool-a + tool-b but not tool-c
      });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);

      const totalTokens = result.reduce((sum, tool) => sum + (tool.tokenCount || 0), 0);
      expect(totalTokens).toBeLessThanOrEqual(700);
    });

    it('should maintain tool order by relevance', async () => {
      toolRepository.addTool({
        name: 'file-read',
        description: 'Read file contents from the file system',
        inputSchema: { type: 'object' },
        backend: 'test-backend',
        discoverySource: 'backend',
        tokenCount: 200,
      });

      toolRepository.addTool({
        name: 'file-write',
        description: 'Write data to files on the file system',
        inputSchema: { type: 'object' },
        backend: 'test-backend',
        discoverySource: 'backend',
        tokenCount: 250,
      });

      toolRepository.addTool({
        name: 'system-info',
        description: 'Get system information',
        inputSchema: { type: 'object' },
        backend: 'test-backend',
        discoverySource: 'backend',
        tokenCount: 100,
      });

      const result = await gatingService.provisionTools({
        query: 'file operations',
        maxTokens: 1000,
      });

      expect(result.length).toBeGreaterThan(0);

      // File-related tools should come before system-info
      const fileReadIndex = result.findIndex(tool => tool.name === 'file-read');
      const fileWriteIndex = result.findIndex(tool => tool.name === 'file-write');
      const systemInfoIndex = result.findIndex(tool => tool.name === 'system-info');

      if (fileReadIndex !== -1 && systemInfoIndex !== -1) {
        expect(fileReadIndex).toBeLessThan(systemInfoIndex);
      }
      if (fileWriteIndex !== -1 && systemInfoIndex !== -1) {
        expect(fileWriteIndex).toBeLessThan(systemInfoIndex);
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle discovery service errors gracefully', async () => {
      // Mock discovery service to throw an error
      const mockDiscoveryService = {
        discoverTools: jest.fn().mockRejectedValue(new Error('Discovery failed')),
      };

      const gatingServiceWithMock = new GatingService(mockDiscoveryService as any);

      await expect(
        gatingServiceWithMock.provisionTools({
          query: 'test',
          maxTokens: 1000,
        })
      ).rejects.toThrow('Discovery failed');
    });

    it('should handle very large token counts', async () => {
      toolRepository.addTool({
        name: 'huge-tool',
        description: 'A tool with huge token count',
        inputSchema: { type: 'object' },
        backend: 'test-backend',
        discoverySource: 'backend',
        tokenCount: 1000000, // Very large token count
      });

      const result = await gatingService.provisionTools({
        query: 'tool',
        maxTokens: 500000, // Still less than the tool's token count
      });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    it('should handle floating point token counts', async () => {
      toolRepository.addTool({
        name: 'float-tool',
        description: 'A tool with floating point token count',
        inputSchema: { type: 'object' },
        backend: 'test-backend',
        discoverySource: 'backend',
        tokenCount: 123.45,
      });

      const result = await gatingService.provisionTools({
        query: 'tool',
        maxTokens: 200,
      });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);

      const totalTokens = result.reduce((sum, tool) => sum + (tool.tokenCount || 0), 0);
      expect(totalTokens).toBeLessThanOrEqual(200);
    });
  });
});

// -----------------------------------------------------------------------------
// Additional comprehensive scenarios for GatingService
// Framework note: Tests written using Jest/Vitest global API (describe/it/expect).
// No explicit imports of the test framework are required, matching existing tests.
// -----------------------------------------------------------------------------

describe('GatingService – comprehensive behaviors', () => {
  it('defaults to allowing tools when both allowList and denyList are empty or omitted', () => {
    const svcA = new GatingService({ allowList: [], denyList: [] });
    const svcB = new GatingService({} as any);
    expect(svcA.isToolAllowed('anyTool')).toBe(true);
    expect(svcB.isToolAllowed('anyTool')).toBe(true);
  });

  it('handles duplicate entries in allowList and denyList deterministically', () => {
    const svc = new GatingService({
      allowList: ['alpha', 'alpha', 'beta'],
      denyList: ['gamma', 'gamma']
    });
    expect(svc.isToolAllowed('alpha')).toBe(true);
    expect(svc.isToolAllowed('beta')).toBe(true);
    expect(svc.isToolAllowed('gamma')).toBe(false);
  });

  it('treats unknown tools as denied when allowList is non-empty (whitelist mode)', () => {
    const svc = new GatingService({ allowList: ['known'], denyList: [] });
    expect(svc.isToolAllowed('unknown')).toBe(false);
  });

  it('ensures denyList precedence even with multiple overlaps', () => {
    const svc = new GatingService({
      allowList: ['a', 'b', 'c'],
      denyList: ['x', 'b', 'y']
    });
    expect(svc.isToolAllowed('b')).toBe(false);
    expect(svc.isToolAllowed('a')).toBe(true);
    expect(svc.isToolAllowed('x')).toBe(false);
  });

  it('returns false for non-string tool names, including objects, arrays, and booleans', () => {
    const svc = new GatingService({ allowList: ['valid'], denyList: [] });
    expect(svc.isToolAllowed({} as any)).toBe(false);
    expect(svc.isToolAllowed([] as any)).toBe(false);
    expect(svc.isToolAllowed(true as any)).toBe(false);
    expect(svc.isToolAllowed(false as any)).toBe(false);
  });

  it('rejects whitespace-only strings as invalid tool names', () => {
    const svc = new GatingService({ allowList: ['valid'], denyList: [] });
    expect(svc.isToolAllowed('   ' as any)).toBe(false);
    expect(svc.isToolAllowed('\n\t' as any)).toBe(false);
  });

  it('does not mutate input arrays passed into constructor', () => {
    const allow = ['keep'];
    const deny = ['ban'];
    const svc = new GatingService({ allowList: allow, denyList: deny });

    // Interact with service
    expect(svc.isToolAllowed('keep')).toBe(true);
    expect(svc.isToolAllowed('ban')).toBe(false);

    // Mutate original arrays after construction
    allow.push('newAllowed');
    deny.push('newDenied');

    // Service behavior should reflect internal snapshot at construction time,
    // not be affected by subsequent external mutations.
    expect(svc.isToolAllowed('newAllowed')).toBe(false);
    expect(svc.isToolAllowed('newDenied')).toBe(true);
  });

  it('handles very long tool names safely', () => {
    const longName = 't'.repeat(10_000);
    const svc = new GatingService({ allowList: [longName], denyList: [] });
    expect(svc.isToolAllowed(longName)).toBe(true);
    expect(svc.isToolAllowed(longName + 'x')).toBe(false);
  });

  it('is resilient to allowList/denyList containing non-string values', () => {
    // @ts-expect-error intentionally passing invalid list content to test robustness
    const svc = new GatingService({ allowList: ['ok', 42 as any], denyList: [null as any, 'blocked'] });
    expect(svc.isToolAllowed('ok')).toBe(true);
    expect(svc.isToolAllowed('blocked')).toBe(false);
    expect(svc.isToolAllowed('42')).toBe(false);
  });

  it('treats case as exact-match by default (no implicit case folding)', () => {
    const svc = new GatingService({ allowList: ['CaseSensitive'], denyList: [] });
    expect(svc.isToolAllowed('CaseSensitive')).toBe(true);
    expect(svc.isToolAllowed('casesensitive')).toBe(false);
    expect(svc.isToolAllowed('CASESENSITIVE')).toBe(false);
  });

  it('considers empty string entries within lists as inert and still denies empty tool names', () => {
    const svc = new GatingService({ allowList: [''], denyList: [''] });
    expect(svc.isToolAllowed('')).toBe(false);
    expect(svc.isToolAllowed('realTool')).toBe(true);
  });

  it('does not throw when options are partially provided', () => {
    const svc1 = new GatingService({ allowList: ['x'] } as any);
    const svc2 = new GatingService({ denyList: ['y'] } as any);
    expect(() => svc1.isToolAllowed('x')).not.toThrow();
    expect(() => svc2.isToolAllowed('y')).not.toThrow();
  });
});