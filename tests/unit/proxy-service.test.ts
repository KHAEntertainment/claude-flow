/**
 * Unit tests for ProxyService
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ProxyService } from '../../src/mcp/proxy/proxy-service.js';
import { InMemoryToolRepository } from '../../src/mcp/proxy/tool-repository.js';
import { MCPClientManager } from '../../src/mcp/proxy/mcp-client-manager.js';
import { EventBus } from '../../src/core/event-bus.js';
import { Logger } from '../../src/core/logger.js';

describe('ProxyService', () => {
  let proxyService: ProxyService;
  let toolRepository: InMemoryToolRepository;
  let clientManager: MCPClientManager;
  let eventBus: EventBus;
  let logger: Logger;

  beforeEach(() => {
    toolRepository = new InMemoryToolRepository();
    eventBus = new EventBus();
    logger = new Logger('TestProxyService');
    clientManager = new MCPClientManager(eventBus, logger);
    proxyService = new ProxyService(toolRepository, clientManager, eventBus, logger);
  });

  describe('executeTool', () => {
    it('should throw error when tool is not found', async () => {
      await expect(
        proxyService.executeTool('nonexistent-tool', {})
      ).rejects.toThrow('Tool not found: nonexistent-tool');
    });

    it('should execute tool through client manager', async () => {
      // Add a tool to the repository
      toolRepository.addTool({
        name: 'test-tool',
        description: 'A test tool',
        inputSchema: { type: 'object' },
        backend: 'test-backend',
        discoverySource: 'backend',
      });

      // Mock the client manager
      const mockExecuteTool = jest.fn().mockResolvedValue({
        success: true,
        data: { result: 'test result' },
      });
      clientManager.executeTool = mockExecuteTool;

      const result = await proxyService.executeTool('test-tool', { param: 'value' });

      expect(result).toEqual({ success: true, data: { result: 'test result' } });
      expect(mockExecuteTool).toHaveBeenCalledWith('test-backend', 'test-tool', { param: 'value' });
    });

    it('should handle client manager errors', async () => {
      // Add a tool to the repository
      toolRepository.addTool({
        name: 'test-tool',
        description: 'A test tool',
        inputSchema: { type: 'object' },
        backend: 'test-backend',
        discoverySource: 'backend',
      });

      // Mock the client manager to throw an error
      const mockExecuteTool = jest.fn().mockRejectedValue(new Error('Backend error'));
      clientManager.executeTool = mockExecuteTool;

      await expect(
        proxyService.executeTool('test-tool', { param: 'value' })
      ).rejects.toThrow('Backend error');
    });

    it('should handle client manager returning error result', async () => {
      // Add a tool to the repository
      toolRepository.addTool({
        name: 'test-tool',
        description: 'A test tool',
        inputSchema: { type: 'object' },
        backend: 'test-backend',
        discoverySource: 'backend',
      });

      // Mock the client manager to return error result
      const mockExecuteTool = jest.fn().mockResolvedValue({
        success: false,
        error: 'Tool execution failed',
      });
      clientManager.executeTool = mockExecuteTool;

      const result = await proxyService.executeTool('test-tool', { param: 'value' });

      expect(result).toEqual({
        success: false,
        error: 'Tool execution failed',
      });
    });
  });

  describe('discoverAndProvisionTools', () => {
    it('should discover and provision tools from backend', async () => {
      // Mock the client manager to return tools
      const mockGetTools = jest.fn().mockResolvedValue([
        {
          name: 'backend-tool-1',
          description: 'Backend tool 1',
          inputSchema: { type: 'object' },
        },
        {
          name: 'backend-tool-2',
          description: 'Backend tool 2',
          inputSchema: { type: 'object' },
        },
      ]);
      clientManager.getTools = mockGetTools;

      const result = await proxyService.discoverAndProvisionTools('test-backend');

      expect(result).toBe(true);
      expect(toolRepository.getToolCount()).toBe(2);
      expect(toolRepository.hasTool('backend-tool-1')).toBe(true);
      expect(toolRepository.hasTool('backend-tool-2')).toBe(true);
    });

    it('should handle backend discovery errors', async () => {
      // Mock the client manager to throw an error
      const mockGetTools = jest.fn().mockRejectedValue(new Error('Backend connection failed'));
      clientManager.getTools = mockGetTools;

      const result = await proxyService.discoverAndProvisionTools('test-backend');

      expect(result).toBe(false);
      expect(toolRepository.getToolCount()).toBe(0);
    });

    it('should handle empty tool list from backend', async () => {
      // Mock the client manager to return empty tools
      const mockGetTools = jest.fn().mockResolvedValue([]);
      clientManager.getTools = mockGetTools;

      const result = await proxyService.discoverAndProvisionTools('test-backend');

      expect(result).toBe(true);
      expect(toolRepository.getToolCount()).toBe(0);
    });

    it('should handle malformed tool data', async () => {
      // Mock the client manager to return malformed tools
      const mockGetTools = jest.fn().mockResolvedValue([
        {
          name: 'valid-tool',
          description: 'Valid tool',
          inputSchema: { type: 'object' },
        },
        {
          // Missing required fields
          description: 'Invalid tool',
        },
      ]);
      clientManager.getTools = mockGetTools;

      const result = await proxyService.discoverAndProvisionTools('test-backend');

      expect(result).toBe(true);
      expect(toolRepository.getToolCount()).toBe(1); // Only valid tool should be added
      expect(toolRepository.hasTool('valid-tool')).toBe(true);
    });
  });

  describe('getToolRepository', () => {
    it('should return the tool repository', () => {
      const repo = proxyService.getToolRepository();
      expect(repo).toBe(toolRepository);
    });
  });

  describe('getClientManager', () => {
    it('should return the client manager', () => {
      const manager = proxyService.getClientManager();
      expect(manager).toBe(clientManager);
    });
  });

  describe('Event Handling', () => {
    it('should emit events on successful tool execution', async () => {
      // Add a tool to the repository
      toolRepository.addTool({
        name: 'test-tool',
        description: 'A test tool',
        inputSchema: { type: 'object' },
        backend: 'test-backend',
        discoverySource: 'backend',
      });

      // Mock the client manager
      const mockExecuteTool = jest.fn().mockResolvedValue({
        success: true,
        data: { result: 'test result' },
      });
      clientManager.executeTool = mockExecuteTool;

      // Set up event listener
      const eventHandler = jest.fn();
      eventBus.on('tool:execute:success', eventHandler);

      await proxyService.executeTool('test-tool', { param: 'value' });

      expect(eventHandler).toHaveBeenCalledWith({
        toolName: 'test-tool',
        backend: 'test-backend',
        result: { success: true, data: { result: 'test result' } },
      });
    });

    it('should emit events on failed tool execution', async () => {
      // Add a tool to the repository
      toolRepository.addTool({
        name: 'test-tool',
        description: 'A test tool',
        inputSchema: { type: 'object' },
        backend: 'test-backend',
        discoverySource: 'backend',
      });

      // Mock the client manager to throw an error
      const mockExecuteTool = jest.fn().mockRejectedValue(new Error('Backend error'));
      clientManager.executeTool = mockExecuteTool;

      // Set up event listener
      const eventHandler = jest.fn();
      eventBus.on('tool:execute:error', eventHandler);

      await expect(
        proxyService.executeTool('test-tool', { param: 'value' })
      ).rejects.toThrow('Backend error');

      expect(eventHandler).toHaveBeenCalledWith({
        toolName: 'test-tool',
        backend: 'test-backend',
        error: expect.any(Error),
      });
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle multiple concurrent tool executions', async () => {
      // Add multiple tools
      for (let i = 0; i < 5; i++) {
        toolRepository.addTool({
          name: `tool-${i}`,
          description: `Tool ${i}`,
          inputSchema: { type: 'object' },
          backend: 'test-backend',
          discoverySource: 'backend',
        });
      }

      // Mock the client manager
      const mockExecuteTool = jest.fn().mockResolvedValue({
        success: true,
        data: { result: 'test result' },
      });
      clientManager.executeTool = mockExecuteTool;

      // Execute multiple tools concurrently
      const promises = Array.from({ length: 5 }, (_, i) => 
        proxyService.executeTool(`tool-${i}`, { param: `value-${i}` })
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result.success).toBe(true);
      });
      expect(mockExecuteTool).toHaveBeenCalledTimes(5);
    });

    it('should maintain reasonable execution time', async () => {
      // Add a tool to the repository
      toolRepository.addTool({
        name: 'test-tool',
        description: 'A test tool',
        inputSchema: { type: 'object' },
        backend: 'test-backend',
        discoverySource: 'backend',
      });

      // Mock the client manager with a delay
      const mockExecuteTool = jest.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(() => 
          resolve({ success: true, data: { result: 'test result' } }), 50)
      );
      clientManager.executeTool = mockExecuteTool;

      const startTime = Date.now();
      const result = await proxyService.executeTool('test-tool', { param: 'value' });
      const endTime = Date.now();

      expect(result.success).toBe(true);
      expect(endTime - startTime).toBeLessThan(200); // Should complete within 200ms
    });
  });
});