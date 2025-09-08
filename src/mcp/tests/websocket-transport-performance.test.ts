/**
 * WebSocket Transport Performance Tests
 * 
 * This test file provides comprehensive performance tests for the WebSocket transport
 * to ensure it can handle high throughput, large messages, and stress conditions.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { EventEmitter } from 'node:events';
import type { ITransport } from '../transports/base.js';
import type { MCPRequest, MCPResponse, MCPNotification } from '../../utils/types.js';
import type { ILogger } from '../../core/logger.js';

// Mock WebSocket implementation for performance testing
class MockWebSocket extends EventEmitter {
  readyState = 1; // OPEN by default
  url: string;
  sent: string[] = [];
  
  constructor(url: string) {
    super();
    this.url = url;
  }

  send(data: string): void {
    this.sent.push(data);
    // Simulate successful send with minimal delay
    setImmediate(() => {
      this.emit('message', Buffer.from(JSON.stringify({
        jsonrpc: '2.0',
        id: JSON.parse(data).id,
        result: { success: true }
      })));
    });
  }

  close(): void {
    this.readyState = 3; // CLOSED
    this.emit('close');
  }

  // Simulate receiving a message
  simulateMessage(message: any): void {
    this.emit('message', Buffer.from(JSON.stringify(message)));
  }
}

// Mock logger
const mockLogger: ILogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  configure: jest.fn(),
};

// Mock WebSocket constructor
let mockWebSocketConstructor: jest.Mock;
let mockWebSocketInstance: MockWebSocket;

// Mock the WebSocket module
jest.mock('ws', () => {
  return {
    WebSocket: jest.fn().mockImplementation((url: string) => {
      mockWebSocketInstance = new MockWebSocket(url);
      return mockWebSocketInstance;
    })
  };
});

// Import the WebSocketTransport after mocking
let WebSocketTransport: any;

describe('WebSocket Transport Performance Tests', () => {
  let transport: ITransport;
  let config: any;

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Import the class dynamically to ensure mocking is applied
    WebSocketTransport = (await import('../transports/websocket.js')).WebSocketTransport;
    
    // Setup config optimized for performance testing
    config = {
      url: 'ws://localhost:8080',
      reconnectAttempts: 3,
      reconnectDelay: 10, // Short delay for faster testing
      timeout: 1000, // Short timeout for faster testing
      queueSize: 10000 // Large queue size for stress testing
    };
    
    // Create transport instance
    transport = new WebSocketTransport(config, mockLogger);
  });

  afterEach(async () => {
    if (transport) {
      await transport.stop();
    }
  });

  describe('Throughput Tests', () => {
    it('should handle high request throughput', async () => {
      await transport.start();
      
      const messageCount = 1000;
      const messages = Array.from({ length: messageCount }, (_, i) => ({
        jsonrpc: '2.0',
        id: `throughput-${i}`,
        method: 'test/method',
        params: { index: i }
      }));

      const startTime = Date.now();
      
      // Send all messages concurrently
      const sendPromises = messages.map(msg => transport.sendRequest(msg));
      const responses = await Promise.all(sendPromises);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      const throughput = messageCount / (duration / 1000);
      
      // Verify all responses
      expect(responses).toHaveLength(messageCount);
      responses.forEach((response, i) => {
        expect(response.id).toBe(`throughput-${i}`);
        expect(response.result).toEqual({ success: true });
      });
      
      // Performance assertions
      expect(throughput).toBeGreaterThan(100); // At least 100 messages per second
      
      // Log performance metrics
      console.log(`Throughput: ${throughput.toFixed(2)} messages/second`);
      console.log(`Total time: ${duration}ms for ${messageCount} messages`);
    });

    it('should handle high notification throughput', async () => {
      await transport.start();
      
      const notificationCount = 1000;
      const notifications = Array.from({ length: notificationCount }, (_, i) => ({
        jsonrpc: '2.0',
        method: 'test/notification',
        params: { index: i }
      }));

      const startTime = Date.now();
      
      // Send all notifications concurrently
      const sendPromises = notifications.map(notification => 
        transport.sendNotification(notification)
      );
      await Promise.all(sendPromises);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      const throughput = notificationCount / (duration / 1000);
      
      // Performance assertions
      expect(throughput).toBeGreaterThan(500); // Notifications should be faster
      
      // Log performance metrics
      console.log(`Notification throughput: ${throughput.toFixed(2)} notifications/second`);
      console.log(`Total time: ${duration}ms for ${notificationCount} notifications`);
    });

    it('should handle mixed request and notification throughput', async () => {
      await transport.start();
      
      const totalCount = 1000;
      const operations = Array.from({ length: totalCount }, (_, i) => {
        if (i % 3 === 0) {
          // 1/3 requests
          return transport.sendRequest({
            jsonrpc: '2.0',
            id: `mixed-${i}`,
            method: 'test/method',
            params: { index: i }
          });
        } else {
          // 2/3 notifications
          return transport.sendNotification({
            jsonrpc: '2.0',
            method: 'test/notification',
            params: { index: i }
          });
        }
      });

      const startTime = Date.now();
      
      // Execute all operations concurrently
      const results = await Promise.all(operations);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      const throughput = totalCount / (duration / 1000);
      
      // Verify results
      const requestCount = Math.ceil(totalCount / 3);
      const notificationCount = totalCount - requestCount;
      
      expect(results.filter(r => r !== undefined)).toHaveLength(requestCount);
      
      // Performance assertions
      expect(throughput).toBeGreaterThan(200);
      
      // Log performance metrics
      console.log(`Mixed throughput: ${throughput.toFixed(2)} operations/second`);
      console.log(`Total time: ${duration}ms for ${totalCount} operations (${requestCount} requests, ${notificationCount} notifications)`);
    });
  });

  describe('Large Message Tests', () => {
    it('should handle large messages efficiently', async () => {
      await transport.start();
      
      const largeDataSize = 1024 * 1024; // 1MB
      const largeData = 'x'.repeat(largeDataSize);
      
      const largeMessage = {
        jsonrpc: '2.0',
        id: 'large-test',
        method: 'test/method',
        params: { data: largeData }
      };

      const startTime = Date.now();
      
      const response = await transport.sendRequest(largeMessage);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Verify response
      expect(response.id).toBe('large-test');
      expect(response.result).toEqual({ success: true });
      
      // Performance assertions
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
      
      // Log performance metrics
      console.log(`Large message (${largeDataSize} bytes) processed in ${duration}ms`);
      console.log(`Throughput: ${(largeDataSize / (duration / 1000) / 1024).toFixed(2)} KB/s`);
    });

    it('should handle multiple large messages concurrently', async () => {
      await transport.start();
      
      const messageCount = 10;
      const largeDataSize = 100 * 1024; // 100KB per message
      const largeMessages = Array.from({ length: messageCount }, (_, i) => {
        const largeData = 'x'.repeat(largeDataSize);
        return {
          jsonrpc: '2.0',
          id: `concurrent-large-${i}`,
          method: 'test/method',
          params: { data: largeData }
        };
      });

      const startTime = Date.now();
      
      // Send all messages concurrently
      const sendPromises = largeMessages.map(msg => transport.sendRequest(msg));
      const responses = await Promise.all(sendPromises);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      const totalDataSize = messageCount * largeDataSize;
      const throughput = totalDataSize / (duration / 1000);
      
      // Verify all responses
      expect(responses).toHaveLength(messageCount);
      responses.forEach((response, i) => {
        expect(response.id).toBe(`concurrent-large-${i}`);
        expect(response.result).toEqual({ success: true });
      });
      
      // Performance assertions
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
      expect(throughput).toBeGreaterThan(100 * 1024); // At least 100 KB/s
      
      // Log performance metrics
      console.log(`Concurrent large messages: ${messageCount} messages, ${totalDataSize / 1024} KB total`);
      console.log(`Total time: ${duration}ms`);
      console.log(`Throughput: ${(throughput / 1024).toFixed(2)} KB/s`);
    });
  });

  describe('Stress Tests', () => {
    it('should handle sustained high load', async () => {
      await transport.start();
      
      const batchCount = 10;
      const messagesPerBatch = 100;
      const totalMessages = batchCount * messagesPerBatch;
      
      const startTime = Date.now();
      
      // Send messages in batches
      for (let batch = 0; batch < batchCount; batch++) {
        const messages = Array.from({ length: messagesPerBatch }, (_, i) => ({
          jsonrpc: '2.0',
          id: `stress-${batch}-${i}`,
          method: 'test/method',
          params: { batch, index: i }
        }));

        const sendPromises = messages.map(msg => transport.sendRequest(msg));
        await Promise.all(sendPromises);
        
        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      const throughput = totalMessages / (duration / 1000);
      
      // Performance assertions
      expect(throughput).toBeGreaterThan(50); // At least 50 messages per second sustained
      
      // Log performance metrics
      console.log(`Sustained load: ${totalMessages} messages in ${batchCount} batches`);
      console.log(`Total time: ${duration}ms`);
      console.log(`Average throughput: ${throughput.toFixed(2)} messages/second`);
    });

    it('should handle burst traffic', async () => {
      await transport.start();
      
      const burstSize = 500;
      const burstCount = 5;
      const totalMessages = burstSize * burstCount;
      
      const startTime = Date.now();
      
      // Send bursts of traffic
      for (let burst = 0; burst < burstCount; burst++) {
        const messages = Array.from({ length: burstSize }, (_, i) => ({
          jsonrpc: '2.0',
          id: `burst-${burst}-${i}`,
          method: 'test/method',
          params: { burst, index: i }
        }));

        const sendPromises = messages.map(msg => transport.sendRequest(msg));
        await Promise.all(sendPromises);
        
        // Longer delay between bursts
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Performance assertions
      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
      
      // Log performance metrics
      console.log(`Burst traffic: ${totalMessages} messages in ${burstCount} bursts of ${burstSize}`);
      console.log(`Total time: ${duration}ms`);
    });

    it('should handle connection under stress', async () => {
      await transport.start();
      
      // Create a new transport instance for stress testing
      const stressTransport = new WebSocketTransport(config, mockLogger);
      await stressTransport.start();
      
      const messageCount = 1000;
      const messages = Array.from({ length: messageCount }, (_, i) => ({
        jsonrpc: '2.0',
        id: `stress-conn-${i}`,
        method: 'test/method',
        params: { index: i }
      }));

      const startTime = Date.now();
      
      // Send all messages concurrently
      const sendPromises = messages.map(msg => stressTransport.sendRequest(msg));
      const responses = await Promise.all(sendPromises);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      const throughput = messageCount / (duration / 1000);
      
      // Verify all responses
      expect(responses).toHaveLength(messageCount);
      
      // Performance assertions
      expect(throughput).toBeGreaterThan(100);
      
      // Log performance metrics
      console.log(`Connection under stress: ${messageCount} messages`);
      console.log(`Total time: ${duration}ms`);
      console.log(`Throughput: ${throughput.toFixed(2)} messages/second`);
      
      // Cleanup
      await stressTransport.stop();
    });
  });

  describe('Memory Usage Tests', () => {
    it('should not leak memory under high load', async () => {
      await transport.start();
      
      // Get initial memory usage
      const initialMemory = process.memoryUsage();
      
      const iterations = 5;
      const messagesPerIteration = 200;
      
      for (let iteration = 0; iteration < iterations; iteration++) {
        const messages = Array.from({ length: messagesPerIteration }, (_, i) => ({
          jsonrpc: '2.0',
          id: `memory-${iteration}-${i}`,
          method: 'test/method',
          params: { iteration, index: i }
        }));

        // Send messages
        const sendPromises = messages.map(msg => transport.sendRequest(msg));
        await Promise.all(sendPromises);
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
        
        // Small delay
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      // Get final memory usage
      if (global.gc) {
        global.gc();
      }
      const finalMemory = process.memoryUsage();
      
      // Calculate memory growth
      const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
      const memoryGrowthMB = memoryGrowth / (1024 * 1024);
      
      // Log memory metrics
      console.log(`Initial memory: ${(initialMemory.heapUsed / (1024 * 1024)).toFixed(2)} MB`);
      console.log(`Final memory: ${(finalMemory.heapUsed / (1024 * 1024)).toFixed(2)} MB`);
      console.log(`Memory growth: ${memoryGrowthMB.toFixed(2)} MB`);
      
      // Performance assertions
      // Allow some memory growth but it should be reasonable
      expect(memoryGrowthMB).toBeLessThan(10); // Less than 10MB growth
    });

    it('should handle large messages without excessive memory usage', async () => {
      await transport.start();
      
      // Get initial memory usage
      const initialMemory = process.memoryUsage();
      
      const largeMessageCount = 10;
      const largeDataSize = 500 * 1024; // 500KB per message
      
      for (let i = 0; i < largeMessageCount; i++) {
        const largeData = 'x'.repeat(largeDataSize);
        const largeMessage = {
          jsonrpc: '2.0',
          id: `memory-large-${i}`,
          method: 'test/method',
          params: { data: largeData }
        };

        await transport.sendRequest(largeMessage);
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      }
      
      // Get final memory usage
      if (global.gc) {
        global.gc();
      }
      const finalMemory = process.memoryUsage();
      
      // Calculate memory growth
      const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
      const memoryGrowthMB = memoryGrowth / (1024 * 1024);
      
      // Log memory metrics
      console.log(`Initial memory: ${(initialMemory.heapUsed / (1024 * 1024)).toFixed(2)} MB`);
      console.log(`Final memory: ${(finalMemory.heapUsed / (1024 * 1024)).toFixed(2)} MB`);
      console.log(`Memory growth: ${memoryGrowthMB.toFixed(2)} MB for ${largeMessageCount} large messages`);
      
      // Performance assertions
      // Allow some memory growth but it should be reasonable
      expect(memoryGrowthMB).toBeLessThan(20); // Less than 20MB growth for large messages
    });
  });

  describe('Resource Limit Tests', () => {
    it('should handle queue limits gracefully', async () => {
      // Create a transport with small queue size for testing
      const limitedConfig = { ...config, queueSize: 10 };
      const limitedTransport = new WebSocketTransport(limitedConfig, mockLogger);
      await limitedTransport.start();
      
      // Mock WebSocket to simulate slow processing
      if (mockWebSocketInstance) {
        mockWebSocketInstance.send = jest.fn().mockImplementation(() => {
          // Simulate slow processing
          return new Promise(resolve => setTimeout(resolve, 100));
        });
      }
      
      // Send more messages than the queue can hold
      const messageCount = 20;
      const messages = Array.from({ length: messageCount }, (_, i) => ({
        jsonrpc: '2.0',
        id: `queue-limit-${i}`,
        method: 'test/method',
        params: { index: i }
      }));

      // Send messages concurrently
      const sendPromises = messages.map(msg => 
        limitedTransport.sendRequest(msg).catch(error => error)
      );
      const results = await Promise.all(sendPromises);
      
      // Verify some messages failed due to queue limits
      const failures = results.filter(result => result instanceof Error);
      expect(failures.length).toBeGreaterThan(0);
      
      // Verify some messages succeeded
      const successes = results.filter(result => !(result instanceof Error));
      expect(successes.length).toBeGreaterThan(0);
      
      // Log queue limit metrics
      console.log(`Queue limit test: ${successes.length} succeeded, ${failures.length} failed`);
      
      // Cleanup
      await limitedTransport.stop();
    });

    it('should recover from resource exhaustion', async () => {
      await transport.start();
      
      // Simulate resource exhaustion by sending many large messages
      const largeMessageCount = 5;
      const largeDataSize = 1024 * 1024; // 1MB per message
      
      const largeMessages = Array.from({ length: largeMessageCount }, (_, i) => {
        const largeData = 'x'.repeat(largeDataSize);
        return {
          jsonrpc: '2.0',
          id: `exhaustion-${i}`,
          method: 'test/method',
          params: { data: largeData }
        };
      });

      // Send large messages
      const sendPromises = largeMessages.map(msg => transport.sendRequest(msg));
      await Promise.all(sendPromises);
      
      // Allow time for recovery
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Verify transport is still functional
      const testMessage = {
        jsonrpc: '2.0',
        id: 'recovery-test',
        method: 'test/method',
        params: { data: 'test' }
      };

      const response = await transport.sendRequest(testMessage);
      
      // Verify recovery
      expect(response.id).toBe('recovery-test');
      expect(response.result).toEqual({ success: true });
      
      // Log recovery metrics
      console.log('Transport successfully recovered from resource exhaustion');
    });
  });
});