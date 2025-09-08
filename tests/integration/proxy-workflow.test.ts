/**
 * Integration tests for the proxy server workflow
 * Tests the full discover -> provision -> execute cycle
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { ProxyServer } from '../../src/mcp/proxy/proxy-server.js';
import { EventBus } from '../../src/core/event-bus.js';
import { Logger } from '../../src/core/logger.js';
import type { ProxyServerConfig } from '../../src/mcp/proxy/proxy-server.js';

describe('Proxy Server Integration Tests', () => {
  let proxyServer: ProxyServer;
  let eventBus: EventBus;
  let logger: Logger;

  const testConfig: ProxyServerConfig = {
    transport: 'stdio',
    auth: { enabled: false, method: 'token' },
    loadBalancer: { enabled: true, maxRequestsPerSecond: 100 },
    backendServers: [
      {
        name: 'test-backend',
        command: 'node',
        args: ['src/mcp/backend/claude-flow-backend.js'],
        env: { NODE_ENV: 'test' },
      },
    ],
  };

  beforeAll(async () => {
    eventBus = new EventBus();
    logger = new Logger('TestProxyServer');
  });

  beforeEach(async () => {
    // Create a fresh proxy server for each test
    proxyServer = new ProxyServer(testConfig, eventBus, logger);
  });

  afterAll(async () => {
    if (proxyServer) {
      await proxyServer.stop();
    }
  });

  describe('Server Startup and Discovery', () => {
    it('should start the proxy server successfully', async () => {
      await expect(proxyServer.start()).resolves.not.toThrow();
    });

    it('should discover tools from backend servers', async () => {
      await proxyServer.start();
      
      const toolRepository = proxyServer.getToolRepository();
      const toolCount = toolRepository.getToolCount();
      
      expect(toolCount).toBeGreaterThan(0);
      logger.info(`Discovered ${toolCount} tools from backend servers`);
    });

    it('should handle backend connection failures gracefully', async () => {
      const invalidConfig: ProxyServerConfig = {
        ...testConfig,
        backendServers: [
          {
            name: 'invalid-backend',
            command: 'nonexistent-command',
            args: [],
            env: {},
          },
        ],
      };

      const invalidProxy = new ProxyServer(invalidConfig, eventBus, logger);
      
      // Should start even with invalid backend (logs error but continues)
      await expect(invalidProxy.start()).resolves.not.toThrow();
      
      const toolRepository = invalidProxy.getToolRepository();
      expect(toolRepository.getToolCount()).toBe(0);
      
      await invalidProxy.stop();
    });
  });

  describe('Tool Discovery Workflow', () => {
    it('should discover tools using semantic search', async () => {
      await proxyServer.start();
      
      const discoveryService = proxyServer.getMcpServer()['discoveryService'];
      const tools = await discoveryService.discoverTools({
        query: 'file system operations',
        limit: 5,
      });

      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);
      expect(tools.length).toBeLessThanOrEqual(5);
      
      // Verify tools have required properties
      tools.forEach(tool => {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('score');
        expect(tool.score).toBeGreaterThan(0);
      });
    });

    it('should return empty array for irrelevant queries', async () => {
      await proxyServer.start();
      
      const discoveryService = proxyServer.getMcpServer()['discoveryService'];
      const tools = await discoveryService.discoverTools({
        query: 'completely irrelevant query that should match nothing',
        limit: 10,
      });

      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBe(0);
    });
  });

  describe('Tool Provisioning Workflow', () => {
    it('should provision tools within token limits', async () => {
      await proxyServer.start();
      
      const gatingService = proxyServer.getMcpServer()['gatingService'];
      const tools = await gatingService.provisionTools({
        query: 'file operations',
        maxTokens: 5000,
      });

      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);
      
      // Verify total token count is within limit
      const totalTokens = tools.reduce((sum, tool) => sum + (tool.tokenCount || 0), 0);
      expect(totalTokens).toBeLessThanOrEqual(5000);
    });

    it('should return empty array when token limit is too low', async () => {
      await proxyServer.start();
      
      const gatingService = proxyServer.getMcpServer()['gatingService'];
      const tools = await gatingService.provisionTools({
        query: 'file operations',
        maxTokens: 100, // Very low limit
      });

      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBe(0);
    });
  });

  describe('Tool Execution Workflow', () => {
    it('should execute tools through the proxy service', async () => {
      await proxyServer.start();
      
      const proxyService = proxyServer.getProxyService();
      
      // Test with a simple system info tool
      const result = await proxyService.executeTool('system/info', {});
      
      expect(result).toHaveProperty('version');
      expect(result).toHaveProperty('runtime');
      expect(result.version).toBe('1.0.0');
      expect(result.runtime).toBe('Node.js');
    });

    it('should handle non-existent tool execution', async () => {
      await proxyServer.start();
      
      const proxyService = proxyServer.getProxyService();
      
      await expect(
        proxyService.executeTool('nonexistent-tool', {})
      ).rejects.toThrow('Tool not found: nonexistent-tool');
    });

    it('should route tool execution to correct backend', async () => {
      await proxyServer.start();
      
      const proxyService = proxyServer.getProxyService();
      const toolRepository = proxyServer.getToolRepository();
      
      // Get a tool that should be available from backend
      const tools = toolRepository.searchTools('system');
      expect(tools.length).toBeGreaterThan(0);
      
      const toolName = tools[0].name;
      const result = await proxyService.executeTool(toolName, {});
      
      expect(result).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed discovery queries', async () => {
      await proxyServer.start();
      
      const discoveryService = proxyServer.getMcpServer()['discoveryService'];
      
      await expect(
        discoveryService.discoverTools({
          query: '', // Empty query
          limit: 5,
        })
      ).resolves.toEqual([]);
    });

    it('should handle invalid provisioning parameters', async () => {
      await proxyServer.start();
      
      const gatingService = proxyServer.getMcpServer()['gatingService'];
      
      await expect(
        gatingService.provisionTools({
          query: '', // Empty query
          maxTokens: 1000,
        })
      ).resolves.toEqual([]);
    });

    it('should handle tool execution errors gracefully', async () => {
      await proxyServer.start();
      
      const proxyService = proxyServer.getProxyService();
      
      // Try to execute a tool with invalid parameters
      await expect(
        proxyService.executeTool('tools/schema', { invalid: 'params' })
      ).rejects.toThrow();
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle multiple concurrent discovery requests', async () => {
      await proxyServer.start();
      
      const discoveryService = proxyServer.getMcpServer()['discoveryService'];
      
      // Launch multiple concurrent discovery requests
      const promises = Array.from({ length: 10 }, (_, i) => 
        discoveryService.discoverTools({
          query: `file operations ${i}`,
          limit: 3,
        })
      );

      const results = await Promise.all(promises);
      
      // All requests should complete successfully
      expect(results).toHaveLength(10);
      results.forEach(result => {
        expect(Array.isArray(result)).toBe(true);
      });
    });

    it('should maintain reasonable response times for tool execution', async () => {
      await proxyServer.start();
      
      const proxyService = proxyServer.getProxyService();
      
      const startTime = Date.now();
      const result = await proxyService.executeTool('system/info', {});
      const endTime = Date.now();
      
      expect(result).toBeDefined();
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });
  });
});