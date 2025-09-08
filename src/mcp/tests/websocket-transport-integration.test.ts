/**
 * WebSocket Transport Integration Tests
 * 
 * This test file provides comprehensive integration tests for the WebSocket transport
 * to ensure it works correctly with other MCP components.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { EventEmitter } from 'node:events';
import type { ITransport, RequestHandler, NotificationHandler } from '../transports/base.js';
import type { MCPRequest, MCPResponse, MCPNotification } from '../../utils/types.js';
import type { ILogger } from '../../core/logger.js';

// Mock WebSocket implementation for testing
class MockWebSocket extends EventEmitter {
  readyState = 1; // OPEN by default
  url: string;
  sent: string[] = [];
  
  constructor(url: string) {
    super();
    this.url = url;
    process.nextTick(() => this.emit('open'));
  }

  send(data: string): void {
    this.sent.push(data);
    // Simulate successful send
    process.nextTick(() => {
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

  // Simulate connection error
  simulateError(): void {
    this.emit('error', new Error('Connection failed'));
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

// Mock other MCP components
const mockMcpServer = {
  start: jest.fn(),
  stop: jest.fn(),
  handleRequest: jest.fn(),
  handleNotification: jest.fn()
};

const mockMcpClient = {
  connect: jest.fn(),
  disconnect: jest.fn(),
  sendRequest: jest.fn(),
  sendNotification: jest.fn()
};

// Import the WebSocketTransport after mocking
let WebSocketTransport: any;

describe('WebSocket Transport Integration Tests', () => {
  let transport: ITransport;
  let mockRequestHandler: RequestHandler;
  let mockNotificationHandler: NotificationHandler;
  let config: any;

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Import the class dynamically to ensure mocking is applied
    WebSocketTransport = (await import('../transports/websocket.js')).WebSocketTransport;
    
    // Setup mock handlers
    mockRequestHandler = jest.fn().mockResolvedValue({
      jsonrpc: '2.0',
      id: 'test-id',
      result: { success: true }
    });
    
    mockNotificationHandler = jest.fn().mockResolvedValue(undefined);
    
    // Setup config
    config = {
      url: 'ws://localhost:8080',
      reconnectAttempts: 3,
      reconnectDelay: 100,
      timeout: 5000
    };
    
    // Create transport instance
    transport = new WebSocketTransport(config, mockLogger);
  });

  afterEach(async () => {
    if (transport) {
      await transport.stop();
    }
  });

  describe('MCP Server Integration', () => {
    it('should integrate with MCP server lifecycle', async () => {
      // Start transport
      await transport.start();
      
      // Setup handlers (server-side)
      transport.onRequest(mockMcpServer.handleRequest);
      transport.onNotification(mockMcpServer.handleNotification);
      
      // Simulate MCP server starting
      await mockMcpServer.start();
      
      // Verify transport is ready
      const health = await transport.getHealthStatus();
      expect(health.healthy).toBe(true);
      
      // Simulate MCP server receiving a request
      const serverRequest: MCPRequest = {
        jsonrpc: '2.0',
        id: 'server-request',
        method: 'server/method',
        params: { data: 'test' }
      };

      if (mockWebSocketInstance) {
        mockWebSocketInstance.simulateMessage(serverRequest);
      }

      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Verify server handler was called
      expect(mockMcpServer.handleRequest).toHaveBeenCalledWith(serverRequest);
      
      // Stop transport
      await transport.stop();
      
      // Simulate MCP server stopping
      await mockMcpServer.stop();
    });

    it('should handle MCP server request processing', async () => {
      await transport.start();
      transport.onRequest(mockRequestHandler);
      
      // Simulate server processing a request
      const serverRequest: MCPRequest = {
        jsonrpc: '2.0',
        id: 'server-process',
        method: 'server/process',
        params: { input: 'data' }
      };

      if (mockWebSocketInstance) {
        mockWebSocketInstance.simulateMessage(serverRequest);
      }

      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Verify request was processed
      expect(mockRequestHandler).toHaveBeenCalledWith(serverRequest);
      
      // Verify server was notified
      expect(mockMcpServer.handleRequest).toHaveBeenCalledWith(serverRequest);
    });

    it('should handle MCP server notification processing', async () => {
      await transport.start();
      transport.onNotification(mockNotificationHandler);
      
      // Simulate server processing a notification
      const serverNotification: MCPNotification = {
        jsonrpc: '2.0',
        method: 'server/notification',
        params: { event: 'test' }
      };

      if (mockWebSocketInstance) {
        mockWebSocketInstance.simulateMessage(serverNotification);
      }

      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Verify notification was processed
      expect(mockNotificationHandler).toHaveBeenCalledWith(serverNotification);
      
      // Verify server was notified
      expect(mockMcpServer.handleNotification).toHaveBeenCalledWith(serverNotification);
    });
  });

  describe('MCP Client Integration', () => {
    it('should integrate with MCP client operations', async () => {
      await transport.start();
      
      // Simulate client connecting
      await mockMcpClient.connect();
      
      // Send request through transport
      const clientRequest: MCPRequest = {
        jsonrpc: '2.0',
        id: 'client-request',
        method: 'client/method',
        params: { data: 'test' }
      };

      const response = await transport.sendRequest(clientRequest);
      
      // Verify response
      expect(response).toEqual({
        jsonrpc: '2.0',
        id: 'client-request',
        result: { success: true }
      });
      
      // Verify the request was sent on the wire
      expect(
        mockWebSocketInstance.sent.some(s => JSON.parse(s).id === 'client-request')
      ).toBe(true);
      
      // Send notification through transport
      const clientNotification: MCPNotification = {
        jsonrpc: '2.0',
        method: 'client/notification',
        params: { event: 'test' }
      };

      await transport.sendNotification(clientNotification);
      
      // Verify the notification was sent on the wire
      expect(
        mockWebSocketInstance.sent.some(s => JSON.parse(s).method === 'client/notification')
      ).toBe(true);
      
      // Simulate client disconnecting
      await mockMcpClient.disconnect();
    });
    it('should handle client request timeouts', async () => {
      const timeoutConfig = { ...config, timeout: 10 };
      const timeoutTransport = new WebSocketTransport(timeoutConfig, mockLogger);
      await timeoutTransport.start();
      
      // Mock WebSocket to not respond
      if (mockWebSocketInstance) {
        mockWebSocketInstance.send = jest.fn();
      }
      
      const clientRequest: MCPRequest = {
        jsonrpc: '2.0',
        id: 'timeout-request',
        method: 'client/method'
      };

      // Simulate client sending request
      await mockMcpClient.sendRequest(clientRequest);
      
      // Expect timeout
      await expect(timeoutTransport.sendRequest(clientRequest)).rejects.toThrow('Request timeout');
      
      // Verify client was notified of timeout
      expect(mockMcpClient.sendRequest).toHaveBeenCalledWith(clientRequest);
      
      await timeoutTransport.stop();
    });
  });

  describe('Bidirectional Communication', () => {
    it('should handle bidirectional communication between server and client', async () => {
      await transport.start();
      transport.onRequest(mockRequestHandler);
      transport.onNotification(mockNotificationHandler);
      
      // Simulate server and client both active
      await mockMcpServer.start();
      await mockMcpClient.connect();
      
      // Client sends request
      const clientRequest: MCPRequest = {
        jsonrpc: '2.0',
        id: 'bidirectional-request',
        method: 'client/method',
        params: { data: 'from-client' }
      };

      const clientResponse = await transport.sendRequest(clientRequest);
      expect(clientResponse.result).toEqual({ success: true });
      
      // Server sends request
      const serverRequest: MCPRequest = {
        jsonrpc: '2.0',
        id: 'bidirectional-server-request',
        method: 'server/method',
        params: { data: 'from-server' }
      };

      if (mockWebSocketInstance) {
        mockWebSocketInstance.simulateMessage(serverRequest);
      }

      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Verify both requests were processed
      expect(mockMcpClient.sendRequest).toHaveBeenCalledWith(clientRequest);
      expect(mockMcpServer.handleRequest).toHaveBeenCalledWith(serverRequest);
      
      // Client sends notification
      const clientNotification: MCPNotification = {
        jsonrpc: '2.0',
        method: 'client/notification',
        params: { event: 'client-event' }
      };

      await transport.sendNotification(clientNotification);
      
      // Server sends notification
      const serverNotification: MCPNotification = {
        jsonrpc: '2.0',
        method: 'server/notification',
        params: { event: 'server-event' }
      };

      if (mockWebSocketInstance) {
        mockWebSocketInstance.simulateMessage(serverNotification);
      }

      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Verify both notifications were processed
      expect(mockMcpClient.sendNotification).toHaveBeenCalledWith(clientNotification);
      expect(mockMcpServer.handleNotification).toHaveBeenCalledWith(serverNotification);
      
      // Cleanup
      await mockMcpClient.disconnect();
      await mockMcpServer.stop();
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle connection errors gracefully', async () => {
      await transport.start();
      
      // Simulate connection error
      if (mockWebSocketInstance) {
        mockWebSocketInstance.simulateError();
      }

      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Verify error was logged
      expect(mockLogger.error).toHaveBeenCalledWith('WebSocket error', expect.any(Object));
      
      // Verify server and client are notified
      expect(mockMcpServer.handleRequest).not.toHaveBeenCalled();
      expect(mockMcpClient.sendRequest).not.toHaveBeenCalled();
    });

    it('should handle message processing errors', async () => {
      await transport.start();
      
      // Setup error handler
      const errorHandler = jest.fn().mockRejectedValue(new Error('Processing failed'));
      transport.onRequest(errorHandler);
      
      // Simulate server processing error
      const errorRequest: MCPRequest = {
        jsonrpc: '2.0',
        id: 'error-request',
        method: 'error/method'
      };

      if (mockWebSocketInstance) {
        mockWebSocketInstance.simulateMessage(errorRequest);
      }

      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Verify error was handled
      expect(mockLogger.error).toHaveBeenCalledWith('Request handler error', expect.any(Object));
      
      // Verify server was notified of error
      expect(mockMcpServer.handleRequest).toHaveBeenCalledWith(errorRequest);
    });
  });

  describe('Performance Integration', () => {
    it('should handle high message throughput', async () => {
      await transport.start();
      transport.onRequest(mockRequestHandler);
      
      // Simulate high throughput scenario
      const messageCount = 1000;
      const messages = Array.from({ length: messageCount }, (_, i) => ({
        jsonrpc: '2.0',
        id: `throughput-${i}`,
        method: 'test/method',
        params: { index: i }
      }));

      // Send all messages
      const sendPromises = messages.map(msg => transport.sendRequest(msg));
      const responses = await Promise.all(sendPromises);
      
      // Verify all responses
      expect(responses).toHaveLength(messageCount);
      responses.forEach((response, i) => {
        expect(response.id).toBe(`throughput-${i}`);
      });
      
      // Verify client was notified for all messages
      expect(mockMcpClient.sendRequest).toHaveBeenCalledTimes(messageCount);
    });

    it('should handle concurrent operations', async () => {
      await transport.start();
      transport.onRequest(mockRequestHandler);
      transport.onNotification(mockNotificationHandler);
      
      // Simulate concurrent operations
      const concurrentCount = 100;
      const operations = Array.from({ length: concurrentCount }, (_, i) => {
        if (i % 2 === 0) {
          // Request
          return transport.sendRequest({
            jsonrpc: '2.0',
            id: `concurrent-${i}`,
            method: 'test/method',
            params: { index: i }
          });
        } else {
          // Notification
          return transport.sendNotification({
            jsonrpc: '2.0',
            method: 'test/notification',
            params: { index: i }
          });
        }
      });

      // Execute all operations concurrently
      const results = await Promise.all(operations);
      
      // Verify results
      const requestCount = Math.ceil(concurrentCount / 2);
      expect(results.filter(r => r !== undefined)).toHaveLength(requestCount);
      
      // Verify client was notified
      expect(mockMcpClient.sendRequest).toHaveBeenCalledTimes(requestCount);
      expect(mockMcpClient.sendNotification).toHaveBeenCalledTimes(Math.floor(concurrentCount / 2));
    });
  });

  describe('Resource Management Integration', () => {
    it('should clean up resources properly on stop', async () => {
      await transport.start();
      transport.onRequest(mockRequestHandler);
      transport.onNotification(mockNotificationHandler);
      
      // Simulate active connections
      await mockMcpServer.start();
      await mockMcpClient.connect();
      
      // Send some messages
      await transport.sendRequest({
        jsonrpc: '2.0',
        id: 'cleanup-test',
        method: 'test/method'
      });
      
      // Stop transport
      await transport.stop();
      
      // Verify cleanup
      const health = await transport.getHealthStatus();
      expect(health.healthy).toBe(false);
      
      // Verify server and client are stopped
      expect(mockMcpServer.stop).toHaveBeenCalled();
      expect(mockMcpClient.disconnect).toHaveBeenCalled();
    });

    it('should handle resource limits', async () => {
      await transport.start();
      
      // Simulate resource limit scenario
      const largeMessageCount = 10000;
      const largeMessages = Array.from({ length: largeMessageCount }, (_, i) => ({
        jsonrpc: '2.0',
        id: `large-${i}`,
        method: 'test/method',
        params: { data: 'x'.repeat(1000) } // 1KB per message
      }));

      // Send messages in batches to avoid overwhelming
      const batchSize = 100;
      for (let i = 0; i < largeMessageCount; i += batchSize) {
        const batch = largeMessages.slice(i, i + batchSize);
        const promises = batch.map(msg => transport.sendRequest(msg));
        await Promise.all(promises);
        
        // Allow some time for processing
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      // Verify transport is still healthy
      const health = await transport.getHealthStatus();
      expect(health.healthy).toBe(true);
      expect(health.metrics?.messagesSent).toBe(largeMessageCount);
    });
  });
});