/**
 * WebSocket Transport Tests
 * 
 * This test file provides comprehensive coverage for the WebSocket transport implementation.
 * It tests both happy path and error scenarios to ensure robust functionality.
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

// Import the WebSocketTransport after mocking
let WebSocketTransport: any;

describe('WebSocket Transport', () => {
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

  describe('Initialization', () => {
    it('should create transport with correct configuration', () => {
      expect(transport).toBeDefined();
      expect(mockLogger.info).toHaveBeenCalledWith('WebSocket transport created', {
        url: config.url,
        reconnectAttempts: config.reconnectAttempts,
        reconnectDelay: config.reconnectDelay,
        timeout: config.timeout
      });
    });

    it('should use default configuration when not provided', async () => {
      const minimalTransport = new WebSocketTransport({ url: 'ws://localhost:8080' }, mockLogger);
      expect(minimalTransport).toBeDefined();
      await minimalTransport.stop();
    });
  });

  describe('Connection Management', () => {
    it('should connect successfully', async () => {
      await transport.connect();
      expect(mockLogger.info).toHaveBeenCalledWith('WebSocket connected', { url: config.url });
    });

    it('should handle connection errors gracefully', async () => {
      // Mock WebSocket to throw on connection
      mockWebSocketConstructor = jest.fn().mockImplementation(() => {
        throw new Error('Connection failed');
      });
      
      const errorTransport = new WebSocketTransport(config, mockLogger);
      await expect(errorTransport.connect()).rejects.toThrow('Connection failed');
      expect(mockLogger.error).toHaveBeenCalledWith('WebSocket connection failed', expect.any(Object));
    });

    it('should disconnect successfully', async () => {
      await transport.connect();
      await transport.disconnect();
      expect(mockLogger.info).toHaveBeenCalledWith('WebSocket disconnected');
    });

    it('should handle disconnect when not connected', async () => {
      await expect(transport.disconnect()).resolves.not.toThrow();
    });

    it('should reconnect automatically on connection loss', async () => {
      await transport.connect();
      
      // Simulate connection loss
      if (mockWebSocketInstance) {
        mockWebSocketInstance.emit('close');
      }
      
      // Wait for reconnection attempt
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(mockLogger.info).toHaveBeenCalledWith('WebSocket connection lost, attempting to reconnect...');
    });

    it('should stop reconnecting after max attempts', async () => {
      const limitedConfig = { ...config, reconnectAttempts: 1, reconnectDelay: 10 };
      const limitedTransport = new WebSocketTransport(limitedConfig, mockLogger);
      
      await limitedTransport.connect();
      
      // Simulate connection loss
      if (mockWebSocketInstance) {
        mockWebSocketInstance.emit('close');
      }
      
      // Wait for reconnection attempts
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(mockLogger.error).toHaveBeenCalledWith('WebSocket reconnection failed after maximum attempts');
      await limitedTransport.stop();
    });
  });

  describe('Message Handling', () => {
    beforeEach(async () => {
      await transport.connect();
      transport.onRequest(mockRequestHandler);
      transport.onNotification(mockNotificationHandler);
    });

    it('should handle incoming requests correctly', async () => {
      const request: MCPRequest = {
        jsonrpc: '2.0',
        id: 'test-request',
        method: 'test/method',
        params: { data: 'test' }
      };

      if (mockWebSocketInstance) {
        mockWebSocketInstance.simulateMessage(request);
      }

      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(mockRequestHandler).toHaveBeenCalledWith(request);
    });

    it('should handle incoming notifications correctly', async () => {
      const notification: MCPNotification = {
        jsonrpc: '2.0',
        method: 'test/notification',
        params: { data: 'test' }
      };

      if (mockWebSocketInstance) {
        mockWebSocketInstance.simulateMessage(notification);
      }

      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(mockNotificationHandler).toHaveBeenCalledWith(notification);
    });

    it('should handle malformed JSON messages', async () => {
      if (mockWebSocketInstance) {
        mockWebSocketInstance.emit('message', Buffer.from('invalid json'));
      }

      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to parse WebSocket message', expect.any(Object));
    });

    it('should handle messages with invalid JSON-RPC format', async () => {
      const invalidMessage = {
        jsonrpc: '1.0',
        id: 'test',
        method: 'test/method'
      };

      if (mockWebSocketInstance) {
        mockWebSocketInstance.simulateMessage(invalidMessage);
      }

      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(mockLogger.error).toHaveBeenCalledWith('Invalid JSON-RPC message received', expect.any(Object));
    });

    it('should handle messages without method', async () => {
      const invalidMessage = {
        jsonrpc: '2.0',
        id: 'test'
      };

      if (mockWebSocketInstance) {
        mockWebSocketInstance.simulateMessage(invalidMessage);
      }

      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(mockLogger.error).toHaveBeenCalledWith('Invalid JSON-RPC message received', expect.any(Object));
    });
  });

  describe('Request Sending', () => {
    beforeEach(async () => {
      await transport.connect();
    });

    it('should send requests correctly', async () => {
      const request: MCPRequest = {
        jsonrpc: '2.0',
        id: 'test-request',
        method: 'test/method',
        params: { data: 'test' }
      };

      const response = await transport.sendRequest(request);
      
      expect(response).toEqual({
        jsonrpc: '2.0',
        id: 'test-request',
        result: { success: true }
      });
      
      if (mockWebSocketInstance) {
        expect(mockWebSocketInstance.sent).toHaveLength(1);
        expect(JSON.parse(mockWebSocketInstance.sent[0])).toEqual(request);
      }
    });

    it('should handle request timeouts', async () => {
      const timeoutConfig = { ...config, timeout: 10 };
      const timeoutTransport = new WebSocketTransport(timeoutConfig, mockLogger);
      await timeoutTransport.connect();
      
      const request: MCPRequest = {
        jsonrpc: '2.0',
        id: 'timeout-request',
        method: 'test/method'
      };

      // Mock WebSocket to not respond
      if (mockWebSocketInstance) {
        mockWebSocketInstance.send = jest.fn();
      }

      await expect(timeoutTransport.sendRequest(request)).rejects.toThrow('Request timeout');
      await timeoutTransport.stop();
    });

    it('should handle request sending errors', async () => {
      const request: MCPRequest = {
        jsonrpc: '2.0',
        id: 'error-request',
        method: 'test/method'
      };

      // Mock WebSocket to throw on send
      if (mockWebSocketInstance) {
        mockWebSocketInstance.send = jest.fn().mockImplementation(() => {
          throw new Error('Send failed');
        });
      }

      await expect(transport.sendRequest(request)).rejects.toThrow('Send failed');
    });
  });

  describe('Notification Sending', () => {
    beforeEach(async () => {
      await transport.connect();
    });

    it('should send notifications correctly', async () => {
      const notification: MCPNotification = {
        jsonrpc: '2.0',
        method: 'test/notification',
        params: { data: 'test' }
      };

      await expect(transport.sendNotification(notification)).resolves.not.toThrow();
      
      if (mockWebSocketInstance) {
        expect(mockWebSocketInstance.sent).toHaveLength(1);
        expect(JSON.parse(mockWebSocketInstance.sent[0])).toEqual(notification);
      }
    });

    it('should handle notification sending errors', async () => {
      const notification: MCPNotification = {
        jsonrpc: '2.0',
        method: 'test/notification'
      };

      // Mock WebSocket to throw on send
      if (mockWebSocketInstance) {
        mockWebSocketInstance.send = jest.fn().mockImplementation(() => {
          throw new Error('Send failed');
        });
      }

      await expect(transport.sendNotification(notification)).rejects.toThrow('Send failed');
    });
  });

  describe('Health Status', () => {
    it('should report healthy status when connected', async () => {
      await transport.connect();
      
      const health = await transport.getHealthStatus();
      
      expect(health.healthy).toBe(true);
      expect(health.metrics).toBeDefined();
      expect(health.metrics?.connected).toBe(1);
    });

    it('should report unhealthy status when disconnected', async () => {
      const health = await transport.getHealthStatus();
      
      expect(health.healthy).toBe(false);
      expect(health.metrics).toBeDefined();
      expect(health.metrics?.connected).toBe(0);
    });

    it('should include connection metrics in health status', async () => {
      await transport.connect();
      
      // Send some messages to populate metrics
      const request: MCPRequest = {
        jsonrpc: '2.0',
        id: 'metrics-test',
        method: 'test/method'
      };
      
      await transport.sendRequest(request);
      
      const health = await transport.getHealthStatus();
      
      expect(health.metrics).toBeDefined();
      expect(health.metrics?.messagesSent).toBeGreaterThan(0);
      expect(health.metrics?.messagesReceived).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Lifecycle Management', () => {
    it('should start and stop transport successfully', async () => {
      await transport.start();
      expect(mockLogger.info).toHaveBeenCalledWith('WebSocket transport started');
      
      await transport.stop();
      expect(mockLogger.info).toHaveBeenCalledWith('WebSocket transport stopped');
    });

    it('should handle start when already started', async () => {
      await transport.start();
      await expect(transport.start()).resolves.not.toThrow();
    });

    it('should handle stop when not started', async () => {
      await expect(transport.stop()).resolves.not.toThrow();
    });

    it('should clean up resources on stop', async () => {
      await transport.start();
      await transport.stop();
      
      const health = await transport.getHealthStatus();
      expect(health.healthy).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle WebSocket errors gracefully', async () => {
      await transport.connect();
      
      if (mockWebSocketInstance) {
        mockWebSocketInstance.simulateError();
      }
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(mockLogger.error).toHaveBeenCalledWith('WebSocket error', expect.any(Object));
    });

    it('should handle request handler errors', async () => {
      await transport.connect();
      
      const errorHandler = jest.fn().mockRejectedValue(new Error('Handler failed'));
      transport.onRequest(errorHandler);
      
      const request: MCPRequest = {
        jsonrpc: '2.0',
        id: 'error-test',
        method: 'test/method'
      };

      if (mockWebSocketInstance) {
        mockWebSocketInstance.simulateMessage(request);
      }

      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(mockLogger.error).toHaveBeenCalledWith('Request handler error', expect.any(Object));
    });

    it('should handle notification handler errors', async () => {
      await transport.connect();
      
      const errorHandler = jest.fn().mockRejectedValue(new Error('Handler failed'));
      transport.onNotification(errorHandler);
      
      const notification: MCPNotification = {
        jsonrpc: '2.0',
        method: 'test/notification'
      };

      if (mockWebSocketInstance) {
        mockWebSocketInstance.simulateMessage(notification);
      }

      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(mockLogger.error).toHaveBeenCalledWith('Notification handler error', expect.any(Object));
    });
  });

  describe('Edge Cases', () => {
    it('should handle large messages', async () => {
      await transport.connect();
      
      const largeData = 'x'.repeat(1024 * 1024); // 1MB
      const request: MCPRequest = {
        jsonrpc: '2.0',
        id: 'large-test',
        method: 'test/method',
        params: { data: largeData }
      };

      if (mockWebSocketInstance) {
        mockWebSocketInstance.simulateMessage(request);
      }

      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(mockLogger.debug).toHaveBeenCalledWith('Received large WebSocket message', expect.any(Object));
    });

    it('should handle rapid message bursts', async () => {
      await transport.connect();
      transport.onRequest(mockRequestHandler);
      
      const messages = Array.from({ length: 100 }, (_, i) => ({
        jsonrpc: '2.0',
        id: `burst-${i}`,
        method: 'test/method',
        params: { index: i }
      }));

      if (mockWebSocketInstance) {
        messages.forEach(msg => mockWebSocketInstance.simulateMessage(msg));
      }

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(mockRequestHandler).toHaveBeenCalledTimes(100);
    });

    it('should handle connection during message processing', async () => {
      // Start processing without connection
      transport.onRequest(mockRequestHandler);
      
      const request: MCPRequest = {
        jsonrpc: '2.0',
        id: 'connect-test',
        method: 'test/method'
      };

      // Connect while processing
      await transport.connect();
      
      if (mockWebSocketInstance) {
        mockWebSocketInstance.simulateMessage(request);
      }

      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(mockRequestHandler).toHaveBeenCalledWith(request);
    });
  });
});