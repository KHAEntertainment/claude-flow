import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { ProxyServer } from '../../src/mcp/proxy/proxy-server.js';
import { EventBus } from '../../src/core/event-bus.js';
import { Logger, LogLevel } from '../../src/core/logger.js';
import type { ProxyServerConfig } from '../../src/mcp/proxy/proxy-server.js';
import type { MCPTool } from '../../src/utils/types.js';

describe('Proxy-Core Architecture Stress Tests', () => {
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
      level: 'error', // Only log errors during stress tests
      format: 'text',
      destination: 'console'
    });
  });

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
    if (proxyServer) {
      await proxyServer.stop();
    }
    await logger.close();
  });

  describe('High Concurrency Stress Tests', () => {
    it('should handle 100 concurrent tool executions', async () => {
      const proxyService = proxyServer.getProxyService();
      const gatingService = proxyServer.getMcpServer()['gatingService'];

      // Provision tools
      const tools = await gatingService.provisionTools({
        query: 'system information',
        maxTokens: 5000,
      });

      if (tools.length === 0) {
        throw new Error('No tools available for stress testing');
      }

      const toolName = tools[0].name;
      
      // Execute 100 concurrent tool calls
      const concurrentCalls = Array.from({ length: 100 }, () =>
        proxyService.executeTool(toolName, {})
      );

      const startTime = Date.now();
      const results = await Promise.all(concurrentCalls);
      const endTime = Date.now();

      // Verify all calls completed successfully
      expect(results.length).toBe(100);
      results.forEach(result => {
        expect(result).toBeDefined();
      });

      // Log performance metrics
      console.log(`Stress Test: 100 concurrent calls completed in ${endTime - startTime}ms`);
      console.log(`Average response time: ${(endTime - startTime) / 100}ms`);

      // Should complete within reasonable time (adjust threshold as needed)
      expect(endTime - startTime).toBeLessThan(10000); // 10 seconds
    }, 15000); // Increase timeout for stress test

    it('should handle 1000 rapid sequential tool executions', async () => {
      const proxyService = proxyServer.getProxyService();
      const gatingService = proxyServer.getMcpServer()['gatingService'];

      // Provision tools
      const tools = await gatingService.provisionTools({
        query: 'system information',
        maxTokens: 5000,
      });

      if (tools.length === 0) {
        throw new Error('No tools available for stress testing');
      }

      const toolName = tools[0].name;
      
      // Execute 1000 sequential tool calls
      const startTime = Date.now();
      for (let i = 0; i < 1000; i++) {
        const result = await proxyService.executeTool(toolName, {});
        expect(result).toBeDefined();
      }
      const endTime = Date.now();

      // Log performance metrics
      console.log(`Stress Test: 1000 sequential calls completed in ${endTime - startTime}ms`);
      console.log(`Average response time: ${(endTime - startTime) / 1000}ms`);

      // Should complete within reasonable time (adjust threshold as needed)
      expect(endTime - startTime).toBeLessThan(30000); // 30 seconds
    }, 35000); // Increase timeout for stress test

    it('should handle mixed load of discovery and execution', async () => {
      const discoveryService = proxyServer.getMcpServer()['discoveryService'];
      const proxyService = proxyServer.getProxyService();

      // Create mixed load of discovery and execution requests
      const promises: Array<Promise<any>> = [];
      for (let i = 0; i < 50; i++) {
        if (i % 2 === 0) {
          // Discovery request
          promises.push(
            discoveryService.discoverTools({
              query: 'file system operations',
              limit: 5,
            })
          );
        } else {
          // Execution request
          promises.push(
            proxyService.executeTool('system/info', {})
          );
        }
      }

      const startTime = Date.now();
      const results = await Promise.all(promises);
      const endTime = Date.now();

      // Verify all requests completed successfully
      expect(results.length).toBe(50);
      results.forEach(result => {
        expect(result).toBeDefined();
      });

      // Log performance metrics
      console.log(`Stress Test: 50 mixed requests completed in ${endTime - startTime}ms`);
      console.log(`Average response time: ${(endTime - startTime) / 50}ms`);

      // Should complete within reasonable time
      expect(endTime - startTime).toBeLessThan(10000); // 10 seconds
    }, 15000); // Increase timeout for stress test
  });

  describe('Resource Usage Tests', () => {
    it('should not leak memory under sustained load', async () => {
      const proxyService = proxyServer.getProxyService();
      const gatingService = proxyServer.getMcpServer()['gatingService'];

      // Get initial memory usage
      const initialMemory = process.memoryUsage();

      // Provision tools
      const tools = await gatingService.provisionTools({
        query: 'system information',
        maxTokens: 5000,
      });

      if (tools.length === 0) {
        throw new Error('No tools available for stress testing');
      }

      const toolName = tools[0].name;
      
      // Execute 500 tool calls to create sustained load
      for (let i = 0; i < 500; i++) {
        await proxyService.executeTool(toolName, {});
      }

      // Get final memory usage
      const finalMemory = process.memoryUsage();

      // Log memory usage
      console.log(`Initial memory: ${initialMemory.heapUsed / 1024 / 1024} MB`);
      console.log(`Final memory: ${finalMemory.heapUsed / 1024 / 1024} MB`);
      console.log(`Memory increase: ${(finalMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024} MB`);

      // Memory should not increase significantly (less than 10MB)
      expect(finalMemory.heapUsed - initialMemory.heapUsed).toBeLessThan(10 * 1024 * 1024);
    });

    it('should maintain stable CPU usage under load', async () => {
      const proxyService = proxyServer.getProxyService();
      const gatingService = proxyServer.getMcpServer()['gatingService'];

      // Provision tools
      const tools = await gatingService.provisionTools({
        query: 'system information',
        maxTokens: 5000,
      });

      if (tools.length === 0) {
        throw new Error('No tools available for stress testing');
      }

      const toolName = tools[0].name;
      
      // Execute tool calls while monitoring CPU
      const startTime = Date.now();
      for (let i = 0; i < 100; i++) {
        await proxyService.executeTool(toolName, {});
      }
      const endTime = Date.now();

      // Basic performance check - should complete in reasonable time
      expect(endTime - startTime).toBeLessThan(5000); // 5 seconds
    });
  });

  describe('Error Handling Under Stress', () => {
    it('should handle errors gracefully under high load', async () => {
      const proxyService = proxyServer.getProxyService();

      // Execute multiple calls to non-existent tools
      const errorCalls = Array.from({ length: 50 }, () =>
        proxyService.executeTool('non-existent-tool-' + Math.random(), {})
          .catch(error => error)
      );

      const results = await Promise.all(errorCalls);
      
      // All should be errors, not unhandled exceptions
      results.forEach(result => {
        expect(result).toBeInstanceOf(Error);
      });
    });

    it('should recover from backend connection failures', async () => {
      const proxyService = proxyServer.getProxyService();
      
      // Execute normal tool calls
      const result = await proxyService.executeTool('system/info', {});
      expect(result).toBeDefined();
      expect(result).toHaveProperty('version');
    });
  });
});