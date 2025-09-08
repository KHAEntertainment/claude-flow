import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { ProxyServer } from '../../src/mcp/proxy/proxy-server.js';
import { EventBus } from '../../src/core/event-bus.js';
import { Logger, LogLevel } from '../../src/core/logger.js';
import type { ProxyServerConfig } from '../../src/mcp/proxy/proxy-server.js';

describe('Proxy-Core Architecture Regression Tests', () => {
  let proxyServer: ProxyServer;
  let eventBus: EventBus;
  let logger: Logger;

  const testConfig: ProxyServerConfig = {
    transport: 'stdio',
    auth: { enabled: false, method: 'token' },
    loadBalancer: { 
      enabled: true, 
      maxRequestsPerSecond: 1000,
      strategy: 'round-robin',
      healthCheckInterval: 30000,
      circuitBreakerThreshold: 5
    },
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
    eventBus = EventBus.getInstance(true);
    logger = new Logger({
      level: 'info',
      format: 'text',
      destination: 'console'
    });
  });

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';

  beforeEach(async () => {
    proxyServer = new ProxyServer(testConfig, eventBus, logger);
    await proxyServer.start();
  });

  afterEach(async () => {
    if (proxyServer) {
      await proxyServer.stop();
    }
  });

  afterAll(async () => {
    await logger.close();
  });
  describe('Tool Discovery Regression Tests', () => {
    it('should discover tools with semantic search correctly', async () => {
      const discoveryService = proxyServer.getMcpServer()['discoveryService'];
      
      // Test basic discovery functionality
      const tools = await discoveryService.discoverTools({
        query: 'file system operations',
        limit: 10,
      });

      expect(Array.isArray(tools)).toBe(true);
      
      // Verify tools have required properties
      if (tools.length > 0) {
        const firstTool = tools[0];
        expect(firstTool).toHaveProperty('name');
        expect(firstTool).toHaveProperty('description');
        expect(firstTool).toHaveProperty('inputSchema');
      }
    });

    it('should handle empty discovery queries gracefully', async () => {
      const discoveryService = proxyServer.getMcpServer()['discoveryService'];
      
      const tools = await discoveryService.discoverTools({
        query: '',
        limit: 10,
      });

      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBe(0);
    });

    it('should respect discovery limit parameter', async () => {
      const discoveryService = proxyServer.getMcpServer()['discoveryService'];
      
      const tools = await discoveryService.discoverTools({
        query: 'system',
        limit: 3,
      });

      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeLessThanOrEqual(3);
    });
  });

  describe('Tool Provisioning Regression Tests', () => {
    it('should provision tools within token limits', async () => {
      const gatingService = proxyServer.getMcpServer()['gatingService'];
      
      const tools = await gatingService.provisionTools({
        query: 'system information',
        maxTokens: 5000,
      });

      expect(Array.isArray(tools)).toBe(true);
      
      // Verify tools have required properties
      if (tools.length > 0) {
        const firstTool = tools[0];
        expect(firstTool).toHaveProperty('name');
        expect(firstTool).toHaveProperty('description');
        expect(firstTool).toHaveProperty('inputSchema');
      }
    });

    it('should handle zero token limit gracefully', async () => {
      const gatingService = proxyServer.getMcpServer()['gatingService'];
      
      const tools = await gatingService.provisionTools({
        query: 'system information',
        maxTokens: 0,
      });

      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBe(0);
    });

    it('should handle negative token limit gracefully', async () => {
      const gatingService = proxyServer.getMcpServer()['gatingService'];
      
      const tools = await gatingService.provisionTools({
        query: 'system information',
        maxTokens: -100,
      });

      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBe(0);
    });
  });

  describe('Tool Execution Regression Tests', () => {
    it('should execute system/info tool successfully', async () => {
      const proxyService = proxyServer.getProxyService();
      
      const result = await proxyService.executeTool('system/info', {});
      
      expect(result).toBeDefined();
      expect(result).toHaveProperty('version');
      expect(result).toHaveProperty('runtime');
      expect(result.version).toBe('1.0.0');
      expect(result.runtime).toBe('Node.js');
    });

    it('should handle execution of non-existent tools gracefully', async () => {
      const proxyService = proxyServer.getProxyService();
      
      await expect(
        proxyService.executeTool('non-existent-tool', {})
      ).rejects.toThrow('Tool not found');
    });

    it('should handle execution with invalid parameters gracefully', async () => {
      const proxyService = proxyServer.getProxyService();
      
      await expect(
        proxyService.executeTool('system/info', { invalid: 'parameter' })
      ).rejects.toThrow();
    });
  });

  describe('Error Handling Regression Tests', () => {
    it('should provide meaningful error messages for missing tools', async () => {
      const proxyService = proxyServer.getProxyService();
      
      try {
        await proxyService.executeTool('missing-tool', {});
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect(error.message).toContain('Tool not found');
      }
    });

    it('should handle malformed tool schemas gracefully', async () => {
      const proxyService = proxyServer.getProxyService();
      const toolRepository = proxyServer.getToolRepository();
      
      // Add a malformed tool (missing required properties)
      const malformedTool: any = {
        name: 'malformed-tool',
        description: 'A tool with missing schema',
        // Missing inputSchema
      };
      
      toolRepository.addTool(malformedTool);
      
      try {
        await proxyService.executeTool('malformed-tool', {});
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    });
  });

  describe('Performance Regression Tests', () => {
    it('should maintain acceptable response times for tool discovery', async () => {
      const discoveryService = proxyServer.getMcpServer()['discoveryService'];
      
      const startTime = Date.now();
      const tools = await discoveryService.discoverTools({
        query: 'file system operations',
        limit: 5,
      });
      const endTime = Date.now();
      
      expect(Array.isArray(tools)).toBe(true);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should maintain acceptable response times for tool execution', async () => {
      const proxyService = proxyServer.getProxyService();
      
      const startTime = Date.now();
      const result = await proxyService.executeTool('system/info', {});
      const endTime = Date.now();
      
      expect(result).toBeDefined();
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should handle concurrent tool executions efficiently', async () => {
      const proxyService = proxyServer.getProxyService();
      
      // Execute multiple concurrent tool calls
      const concurrentCalls = Array.from({ length: 10 }, () =>
        proxyService.executeTool('system/info', {})
      );
      
      const startTime = Date.now();
      const results = await Promise.all(concurrentCalls);
      const endTime = Date.now();
      
      expect(results.length).toBe(10);
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result).toHaveProperty('version');
        expect(result).toHaveProperty('runtime');
      });
      
      // Should complete within reasonable time (less than 2 seconds for 10 concurrent calls)
      expect(endTime - startTime).toBeLessThan(2000);
    });
  });

  describe('Memory Management Regression Tests', () => {
    it('should not leak memory during repeated tool operations', async () => {
      const proxyService = proxyServer.getProxyService();
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Execute many tool calls
      for (let i = 0; i < 100; i++) {
        await proxyService.executeTool('system/info', {});
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should be reasonable (less than 5MB)
      expect(memoryIncrease).toBeLessThan(5 * 1024 * 1024);
    });

    it('should properly clean up resources after tool execution', async () => {
      const proxyService = proxyServer.getProxyService();
      
      // Execute a tool
      const result = await proxyService.executeTool('system/info', {});
      
      expect(result).toBeDefined();
      expect(result).toHaveProperty('version');
      expect(result).toHaveProperty('runtime');
      
      // Verify the proxy service is still functional
      const result2 = await proxyService.executeTool('system/info', {});
      expect(result2).toBeDefined();
    });
  });

  describe('Integration Regression Tests', () => {
    it('should maintain proper integration between discovery and execution', async () => {
      const discoveryService = proxyServer.getMcpServer()['discoveryService'];
      const proxyService = proxyServer.getProxyService();
      
      // Discover tools
      const tools = await discoveryService.discoverTools({
        query: 'system information',
        limit: 5,
      });
      
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);
      
      // Execute one of the discovered tools
      const toolName = tools[0].name;
      const result = await proxyService.executeTool(toolName, {});
      
      expect(result).toBeDefined();
    });

    it('should maintain proper integration between provisioning and execution', async () => {
      const gatingService = proxyServer.getMcpServer()['gatingService'];
      const proxyService = proxyServer.getProxyService();
      
      // Provision tools
      const tools = await gatingService.provisionTools({
        query: 'system information',
        maxTokens: 5000,
      });
      
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);
      
      // Execute one of the provisioned tools
      const toolName = tools[0].name;
      const result = await proxyService.executeTool(toolName, {});
      
      expect(result).toBeDefined();
    });
  });
});