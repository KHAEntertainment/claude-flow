/**
 * Unit tests for DiscoveryService
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { DiscoveryService } from '../../src/gating/discovery-service.js';
import { InMemoryToolRepository } from '../../src/mcp/proxy/tool-repository.js';

describe('DiscoveryService', () => {
  let discoveryService: DiscoveryService;
  let toolRepository: InMemoryToolRepository;

  beforeEach(() => {
    toolRepository = new InMemoryToolRepository();
    discoveryService = new DiscoveryService(toolRepository);
  });

  describe('discoverTools', () => {
    it('should return empty array when no tools are available', async () => {
      const result = await discoveryService.discoverTools({
        query: 'file operations',
        limit: 5,
      });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    it('should discover tools based on semantic similarity', async () => {
      // Add some test tools to the repository
      toolRepository.addTool({
        name: 'file/read',
        description: 'Read file contents from the file system',
        inputSchema: { type: 'object' },
        backend: 'test-backend',
        discoverySource: 'backend',
      });

      toolRepository.addTool({
        name: 'file/write',
        description: 'Write data to files on the file system',
        inputSchema: { type: 'object' },
        backend: 'test-backend',
        discoverySource: 'backend',
      });

      toolRepository.addTool({
        name: 'system/info',
        description: 'Get system information',
        inputSchema: { type: 'object' },
        backend: 'test-backend',
        discoverySource: 'backend',
      });

      const result = await discoveryService.discoverTools({
        query: 'file operations',
        limit: 10,
      });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      
      // Should prioritize file-related tools
      const fileTools = result.filter(tool => tool.name.startsWith('file/'));
      expect(fileTools.length).toBeGreaterThan(0);
    });

    it('should respect the limit parameter', async () => {
      // Add multiple tools
      for (let i = 0; i < 10; i++) {
        toolRepository.addTool({
          name: `tool${i}`,
          description: `Test tool ${i} for file operations`,
          inputSchema: { type: 'object' },
          backend: 'test-backend',
          discoverySource: 'backend',
        });
      }

      const result = await discoveryService.discoverTools({
        query: 'file operations',
        limit: 3,
      });

      expect(result.length).toBeLessThanOrEqual(3);
    });

    it('should handle empty query', async () => {
      const result = await discoveryService.discoverTools({
        query: '',
        limit: 5,
      });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    it('should handle queries with no matching tools', async () => {
      // Add tools with unrelated descriptions
      toolRepository.addTool({
        name: 'system/info',
        description: 'Get system information',
        inputSchema: { type: 'object' },
        backend: 'test-backend',
        discoverySource: 'backend',
      });

      const result = await discoveryService.discoverTools({
        query: 'completely unrelated topic',
        limit: 5,
      });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    it('should calculate similarity scores correctly', async () => {
      toolRepository.addTool({
        name: 'file/read',
        description: 'Read file contents from the file system',
        inputSchema: { type: 'object' },
        backend: 'test-backend',
        discoverySource: 'backend',
      });

      const result = await discoveryService.discoverTools({
        query: 'read files',
        limit: 5,
      });

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('score');
      expect(result[0].score).toBeGreaterThan(0);
      expect(result[0].score).toBeLessThanOrEqual(1);
    });

    it('should handle special characters in queries', async () => {
      toolRepository.addTool({
        name: 'file/read',
        description: 'Read file contents from the file system',
        inputSchema: { type: 'object' },
        backend: 'test-backend',
        discoverySource: 'backend',
      });

      const result = await discoveryService.discoverTools({
        query: 'file & read @ system # test',
        limit: 5,
      });

      expect(Array.isArray(result)).toBe(true);
      // Should not throw an error and should return some results
    });

    it('should be case insensitive', async () => {
      toolRepository.addTool({
        name: 'file/read',
        description: 'Read file contents from the file system',
        inputSchema: { type: 'object' },
        backend: 'test-backend',
        discoverySource: 'backend',
      });

      const resultLower = await discoveryService.discoverTools({
        query: 'file operations',
        limit: 5,
      });

      const resultUpper = await discoveryService.discoverTools({
        query: 'FILE OPERATIONS',
        limit: 5,
      });

      expect(resultLower.length).toBe(resultUpper.length);
    });

    it('should handle very long queries', async () => {
      const longQuery = 'file operations for reading and writing data to disk in a secure and efficient manner with proper error handling and validation';
      
      toolRepository.addTool({
        name: 'file/read',
        description: 'Read file contents from the file system',
        inputSchema: { type: 'object' },
        backend: 'test-backend',
        discoverySource: 'backend',
      });

      const result = await discoveryService.discoverTools({
        query: longQuery,
        limit: 5,
      });

      expect(Array.isArray(result)).toBe(true);
      // Should not throw an error
    });

    it('should handle zero limit', async () => {
      toolRepository.addTool({
        name: 'file/read',
        description: 'Read file contents from the file system',
        inputSchema: { type: 'object' },
        backend: 'test-backend',
        discoverySource: 'backend',
      });

      const result = await discoveryService.discoverTools({
        query: 'file operations',
        limit: 0,
      });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    it('should handle negative limit', async () => {
      toolRepository.addTool({
        name: 'file/read',
        description: 'Read file contents from the file system',
        inputSchema: { type: 'object' },
        backend: 'test-backend',
        discoverySource: 'backend',
      });

      const result = await discoveryService.discoverTools({
        query: 'file operations',
        limit: -5,
      });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });
  });
});