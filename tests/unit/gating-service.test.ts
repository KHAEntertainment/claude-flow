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
        query: 'operations',
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