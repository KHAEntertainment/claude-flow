// ... existing code ...
import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { ProxyServer } from '../../src/mcp/proxy/proxy-server.js';
import { EventBus } from '../../src/core/event-bus.js';
import { Logger, LogLevel } from '../../src/core/logger.js';
import type { ProxyServerConfig } from '../../src/mcp/proxy/proxy-server.js';

describe('Proxy-Core Architecture End-to-End Tests', () => {
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
    eventBus = EventBus.getInstance(true); // Enable debug mode for testing
    logger = new Logger({
      level: 'debug',
      format: 'text',
      destination: 'console'
    });
  });

  beforeEach(async () => {
    proxyServer = new ProxyServer(testConfig, eventBus, logger);
    await proxyServer.start();
  });

  afterAll(async () => {
    if (proxyServer) {
      await proxyServer.stop();
    }
    await logger.close(); // Properly close the logger
  });

  describe('Complete User Workflow', () => {
    it('should handle complete workflow: discover -> provision -> execute', async () => {
      // Step 1: Discover tools
      const discoveryService = proxyServer.getMcpServer()['discoveryService'];
      const discoveredTools = await discoveryService.discoverTools({
        query: 'file system operations',
        limit: 5,
      });

      expect(Array.isArray(discoveredTools)).toBe(true);
      expect(discoveredTools.length).toBeGreaterThan(0);

      // Step 2: Provision tools within token limit
      const gatingService = proxyServer.getMcpServer()['gatingService'];
      const provisionedTools = await gatingService.provisionTools({
        query: 'file system operations',
        maxTokens: 5000,
      });

      expect(Array.isArray(provisionedTools)).toBe(true);
      expect(provisionedTools.length).toBeGreaterThan(0);

      // Step 3: Execute a tool
      const proxyService = proxyServer.getProxyService();
      const toolName = provisionedTools[0].name;
      
      // Execute the tool based on its name
      if (toolName === 'system/info') {
        const result = await proxyService.executeTool(toolName, {});
        expect(result).toHaveProperty('version');
        expect(result).toHaveProperty('runtime');
      } else if (toolName.includes('file')) {
        // For file operations, we might need specific parameters
        // This is a simplified example
        const result = await proxyService.executeTool(toolName, {
          path: './test-file.txt',
          content: 'Test content'
        });
        expect(result).toBeDefined();
      } else {
        // Generic tool execution
        const result = await proxyService.executeTool(toolName, {});
        expect(result).toBeDefined();
      }
    });

    it('should handle workflow with multiple tool executions', async () => {
      const proxyService = proxyServer.getProxyService();
      const discoveryService = proxyServer.getMcpServer()['discoveryService'];
      const gatingService = proxyServer.getMcpServer()['gatingService'];

      // Discover and provision tools
      const tools = await gatingService.provisionTools({
        query: 'system information',
        maxTokens: 5000,
      });

      expect(tools.length).toBeGreaterThan(0);

      // Execute multiple tools
      const executions = tools.map(tool => 
        proxyService.executeTool(tool.name, {})
      );

      const results = await Promise.all(executions);
      
      // Verify all executions were successful
      results.forEach((result, index) => {
        expect(result).toBeDefined();
        if (tools[index].name === 'system/info') {
          expect(result).toHaveProperty('version');
          expect(result).toHaveProperty('runtime');
        }
      });
    });
  });

  describe('Error Handling Workflow', () => {
    it('should handle workflow with non-existent tool gracefully', async () => {
      const proxyService = proxyServer.getProxyService();
      
      await expect(
        proxyService.executeTool('non-existent-tool', {})
      ).rejects.toThrow('Tool not found');
    });

    it('should handle workflow with invalid parameters gracefully', async () => {
      const discoveryService = proxyServer.getMcpServer()['discoveryService'];
      const tools = await discoveryService.discoverTools({
        query: 'system information',
        limit: 1,
      });

      if (tools.length > 0) {
        const proxyService = proxyServer.getProxyService();
        const toolName = tools[0].name;
        
        // Execute with invalid parameters
        await expect(
          proxyService.executeTool(toolName, { invalid: 'parameter' })
        ).rejects.toThrow();
      }
    });
  });

  describe('Performance Workflow', () => {
    it('should handle concurrent workflows efficiently', async () => {
      const proxyService = proxyServer.getProxyService();
      const gatingService = proxyServer.getMcpServer()['gatingService'];

      // Provision tools
      const tools = await gatingService.provisionTools({
        query: 'system information',
        maxTokens: 5000,
      });

      if (tools.length > 0) {
        const toolName = tools[0].name;
        
        // Execute multiple concurrent workflows
        const concurrentWorkflows = Array.from({ length: 10 }, () =>
          proxyService.executeTool(toolName, {})
        );

        const startTime = Date.now();
        const results = await Promise.all(concurrentWorkflows);
        const endTime = Date.now();

        expect(results.length).toBe(10);
        results.forEach(result => {
          expect(result).toBeDefined();
        });

        // Should complete within reasonable time
        expect(endTime - startTime).toBeLessThan(5000); // 5 seconds
      }
    });
  });
});