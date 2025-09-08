/**
 * WebSocket Transport Security Tests
 * 
 * This test file provides comprehensive security tests for the WebSocket transport
 * to ensure it handles security-related scenarios properly.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { EventEmitter } from 'node:events';
import type { ITransport } from '../transports/base.js';
import type { MCPRequest, MCPResponse, MCPNotification } from '../../utils/types.js';
import type { ILogger } from '../../core/logger.js';

// Mock WebSocket implementation for security testing
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
    if (typeof message === 'string' || Buffer.isBuffer(message)) {
      this.emit('message', Buffer.isBuffer(message) ? message : Buffer.from(message));
    } else {
      this.emit('message', Buffer.from(JSON.stringify(message)));
    }
  }
  simulateRawMessage(raw: string | Buffer): void {
    this.emit('message', Buffer.isBuffer(raw) ? raw : Buffer.from(raw));
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

describe('WebSocket Transport Security Tests', () => {
  let transport: ITransport;
  let config: any;

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Import the class dynamically to ensure mocking is applied
    WebSocketTransport = (await import('../transports/websocket.js')).WebSocketTransport;
    
    // Setup config
    config = {
      url: 'ws://localhost:8080',
      reconnectAttempts: 3,
      reconnectDelay: 100,
      timeout: 5000,
      maxMessageSize: 1024 * 1024, // 1MB max message size
      allowedOrigins: ['localhost', 'example.com'],
      enableValidation: true
    };
    
    // Create transport instance
    transport = new WebSocketTransport(config, mockLogger);
  });

  afterEach(async () => {
    if (transport) {
      await transport.stop();
    }
  });

  describe('Input Validation', () => {
    it('should reject malformed JSON messages', async () => {
      await transport.start();
      
      // Setup request handler
      const mockRequestHandler = jest.fn();
      transport.onRequest(mockRequestHandler);
      
      // Simulate malformed JSON message
      const malformedJson = '{ invalid json }';
      
      if (mockWebSocketInstance) {
        mockWebSocketInstance.simulateRawMessage(malformedJson);
      }

      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Verify handler was not called
      expect(mockRequestHandler).not.toHaveBeenCalled();
      
      // Verify error was logged
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to parse WebSocket message',
        expect.any(Object)
      );
    });

    it('should reject messages with invalid JSON-RPC version', async () => {
      await transport.start();
      
      // Setup request handler
      const mockRequestHandler = jest.fn();
      transport.onRequest(mockRequestHandler);
      
      // Simulate message with invalid JSON-RPC version
      const invalidVersionMessage = {
        jsonrpc: '1.0',
        id: 'test-id',
        method: 'test/method'
      };

      if (mockWebSocketInstance) {
        mockWebSocketInstance.simulateMessage(invalidVersionMessage);
      }

      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Verify handler was not called
      expect(mockRequestHandler).not.toHaveBeenCalled();
      
      // Verify error was logged
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Invalid JSON-RPC version',
        expect.any(Object)
      );
    });

    it('should reject messages without required fields', async () => {
      await transport.start();
      
      // Setup request handler
      const mockRequestHandler = jest.fn();
      transport.onRequest(mockRequestHandler);
      
      // Simulate message without method field
      const noMethodMessage = {
        jsonrpc: '2.0',
        id: 'test-id'
      };

      if (mockWebSocketInstance) {
        mockWebSocketInstance.simulateMessage(noMethodMessage);
      }

      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Verify handler was not called
      expect(mockRequestHandler).not.toHaveBeenCalled();
      
      // Verify error was logged
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Missing required field in JSON-RPC message',
        expect.any(Object)
      );
    });

    it('should reject oversized messages', async () => {
      await transport.start();
      
      // Setup request handler
      const mockRequestHandler = jest.fn();
      transport.onRequest(mockRequestHandler);
      
      // Simulate oversized message
      const oversizedData = 'x'.repeat(2 * 1024 * 1024); // 2MB, exceeds 1MB limit
      const oversizedMessage = {
        jsonrpc: '2.0',
        id: 'oversized-test',
        method: 'test/method',
        params: { data: oversizedData }
      };

      if (mockWebSocketInstance) {
        mockWebSocketInstance.simulateMessage(oversizedMessage);
      }

      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Verify handler was not called
      expect(mockRequestHandler).not.toHaveBeenCalled();
      
      // Verify error was logged
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Message size exceeds limit',
        expect.any(Object)
      );
    });
  });

  describe('Origin Validation', () => {
    it('should accept connections from allowed origins', async () => {
      const secureConfig = {
        ...config,
        allowedOrigins: ['localhost', 'trusted-domain.com']
      };
      
      const secureTransport = new WebSocketTransport(secureConfig, mockLogger);
      await secureTransport.start();
      
      // Simulate connection from allowed origin
      const request = {
        jsonrpc: '2.0',
        id: 'origin-test',
        method: 'test/method',
        params: { origin: 'localhost' }
      };

      if (mockWebSocketInstance) {
        mockWebSocketInstance.simulateMessage(request);
      }

      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Verify request was processed
      expect(mockLogger.error).not.toHaveBeenCalled();
      
      await secureTransport.stop();
    });

    it('should reject connections from disallowed origins', async () => {
      const secureConfig = {
        ...config,
        allowedOrigins: ['localhost', 'trusted-domain.com']
      };
      
      const secureTransport = new WebSocketTransport(secureConfig, mockLogger);
      await secureTransport.start();
      
      // Simulate connection from disallowed origin
      const request = {
        jsonrpc: '2.0',
        id: 'origin-test',
        method: 'test/method',
        params: { origin: 'malicious-domain.com' }
      };

      if (mockWebSocketInstance) {
        mockWebSocketInstance.simulateMessage(request);
      }

      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Verify error was logged
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Connection from disallowed origin',
        expect.any(Object)
      );
      
      await secureTransport.stop();
    });

    it('should handle origin validation when no origins are specified', async () => {
      const noOriginConfig = {
        ...config,
        allowedOrigins: []
      };
      
      const noOriginTransport = new WebSocketTransport(noOriginConfig, mockLogger);
      await noOriginTransport.start();
      
      // Simulate connection with any origin
      const request = {
        jsonrpc: '2.0',
        id: 'origin-test',
        method: 'test/method',
        params: { origin: 'any-domain.com' }
      };

      if (mockWebSocketInstance) {
        mockWebSocketInstance.simulateMessage(request);
      }

      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Verify request was processed (no origin restriction)
      expect(mockLogger.error).not.toHaveBeenCalled();
      
      await noOriginTransport.stop();
    });
  });

  describe('Message Content Security', () => {
    it('should sanitize message content to prevent injection attacks', async () => {
      await transport.start();
      
      // Setup request handler
      const mockRequestHandler = jest.fn();
      transport.onRequest(mockRequestHandler);
      
      // Simulate message with potential injection
      const injectionMessage = {
        jsonrpc: '2.0',
        id: 'injection-test',
        method: 'test/method',
        params: { 
          data: 'malicious<script>alert("xss")</script>content',
          query: 'SELECT * FROM users WHERE 1=1; --'
        }
      };

      if (mockWebSocketInstance) {
        mockWebSocketInstance.simulateMessage(injectionMessage);
      }

      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Verify handler was called with sanitized data
      expect(mockRequestHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            data: expect.not.stringContaining('<script>'),
            query: expect.not.stringContaining('--')
          })
        })
      );
    });

    it('should reject messages with suspicious patterns', async () => {
      await transport.start();
      
      // Setup request handler
      const mockRequestHandler = jest.fn();
      transport.onRequest(mockRequestHandler);
      
      // Simulate message with suspicious patterns
      const suspiciousMessage = {
        jsonrpc: '2.0',
        id: 'suspicious-test',
        method: 'eval',
        params: { code: 'malicious code' }
      };

      if (mockWebSocketInstance) {
        mockWebSocketInstance.simulateMessage(suspiciousMessage);
      }

      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Verify handler was not called
      expect(mockRequestHandler).not.toHaveBeenCalled();
      
      // Verify error was logged
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Suspicious method detected',
        expect.any(Object)
      );
    });

    it('should validate parameter types', async () => {
      await transport.start();
      
      // Setup request handler
      const mockRequestHandler = jest.fn();
      transport.onRequest(mockRequestHandler);
      
      // Simulate message with invalid parameter types
      const invalidParamsMessage = {
        jsonrpc: '2.0',
        id: 'params-test',
        method: 'test/method',
        params: 'invalid-params-type' // Should be object, not string
      };

      if (mockWebSocketInstance) {
        mockWebSocketInstance.simulateMessage(invalidParamsMessage);
      }

      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Verify handler was not called
      expect(mockRequestHandler).not.toHaveBeenCalled();
      
      // Verify error was logged
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Invalid parameter types',
        expect.any(Object)
      );
    });
  });

  describe('Connection Security', () => {
    it('should enforce secure WebSocket connections when required', async () => {
      const secureConfig = {
        ...config,
        requireSecure: true,
        url: 'ws://localhost:8080' // Non-secure URL
      };
      
      const secureTransport = new WebSocketTransport(secureConfig, mockLogger);
      
      // Expect connection to fail
      await expect(secureTransport.start()).rejects.toThrow('Secure connection required');
      
      // Verify error was logged
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Insecure connection attempted',
        expect.any(Object)
      );
    });

    it('should allow secure WebSocket connections when required', async () => {
      const secureConfig = {
        ...config,
        requireSecure: true,
        url: 'wss://localhost:8080' // Secure URL
      };
      
      const secureTransport = new WebSocketTransport(secureConfig, mockLogger);
      await secureTransport.start();
      
      // Verify connection succeeded
      const health = await secureTransport.getHealthStatus();
      expect(health.healthy).toBe(true);
      
      await secureTransport.stop();
    });

    it('should handle connection timeouts securely', async () => {
      const timeoutConfig = {
        ...config,
        timeout: 10 // Very short timeout
      };
      
      const timeoutTransport = new WebSocketTransport(timeoutConfig, mockLogger);
      
      // Mock WebSocket to not respond
      if (mockWebSocketInstance) {
        mockWebSocketInstance.send = jest.fn();
      }
      
      await timeoutTransport.start();
      
      // Send request that will timeout
      const request = {
        jsonrpc: '2.0',
        id: 'timeout-test',
        method: 'test/method'
      };

      // Expect timeout
      await expect(timeoutTransport.sendRequest(request)).rejects.toThrow('Request timeout');
      
      // Verify error was logged
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Request timeout',
        expect.any(Object)
      );
      
      await timeoutTransport.stop();
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits on incoming messages', async () => {
      const rateLimitConfig = {
        ...config,
        rateLimit: {
          windowMs: 1000, // 1 second window
          max: 10 // 10 messages per window
        }
      };
      
      const rateLimitTransport = new WebSocketTransport(rateLimitConfig, mockLogger);
      await rateLimitTransport.start();
      
      // Setup request handler
      const mockRequestHandler = jest.fn();
      rateLimitTransport.onRequest(mockRequestHandler);
      
      // Send many messages quickly
      const messageCount = 15;
      const messages = Array.from({ length: messageCount }, (_, i) => ({
        jsonrpc: '2.0',
        id: `rate-limit-${i}`,
        method: 'test/method',
        params: { index: i }
      }));

      // Simulate receiving messages
      messages.forEach(message => {
        if (mockWebSocketInstance) {
          mockWebSocketInstance.simulateMessage(message);
        }
      });

      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Verify some messages were rejected due to rate limiting
      const handledCount = mockRequestHandler.mock.calls.length;
      expect(handledCount).toBeLessThan(messageCount);
      expect(handledCount).toBeLessThanOrEqual(10);
      
      // Verify rate limit errors were logged
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Rate limit exceeded',
        expect.any(Object)
      );
      
      await rateLimitTransport.stop();
    });

    it('should reset rate limit after window expires', async () => {
      const rateLimitConfig = {
        ...config,
        rateLimit: {
          windowMs: 100, // Very short window
          max: 5 // 5 messages per window
        }
      };
      
      const rateLimitTransport = new WebSocketTransport(rateLimitConfig, mockLogger);
      await rateLimitTransport.start();
      
      // Setup request handler
      const mockRequestHandler = jest.fn();
      rateLimitTransport.onRequest(mockRequestHandler);
      
      // Send first batch of messages
      const firstBatch = Array.from({ length: 5 }, (_, i) => ({
        jsonrpc: '2.0',
        id: `batch1-${i}`,
        method: 'test/method',
        params: { batch: 1, index: i }
      }));

      firstBatch.forEach(message => {
        if (mockWebSocketInstance) {
          mockWebSocketInstance.simulateMessage(message);
        }
      });

      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Verify all messages were handled
      expect(mockRequestHandler.mock.calls.length).toBe(5);
      
      // Wait for rate limit window to expire
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Send second batch of messages
      const secondBatch = Array.from({ length: 5 }, (_, i) => ({
        jsonrpc: '2.0',
        id: `batch2-${i}`,
        method: 'test/method',
        params: { batch: 2, index: i }
      }));

      secondBatch.forEach(message => {
        if (mockWebSocketInstance) {
          mockWebSocketInstance.simulateMessage(message);
        }
      });

      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Verify second batch was also handled
      expect(mockRequestHandler.mock.calls.length).toBe(10);
      
      await rateLimitTransport.stop();
    });
  });

  describe('Authentication and Authorization', () => {
    it('should reject requests without authentication', async () => {
      const authConfig = {
        ...config,
        requireAuth: true
      };
      
      const authTransport = new WebSocketTransport(authConfig, mockLogger);
      await authTransport.start();
      
      // Setup request handler
      const mockRequestHandler = jest.fn();
      authTransport.onRequest(mockRequestHandler);
      
      // Simulate request without authentication
      const unauthenticatedRequest = {
        jsonrpc: '2.0',
        id: 'auth-test',
        method: 'test/method'
      };

      if (mockWebSocketInstance) {
        mockWebSocketInstance.simulateMessage(unauthenticatedRequest);
      }

      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Verify handler was not called
      expect(mockRequestHandler).not.toHaveBeenCalled();
      
      // Verify error was logged
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Authentication required',
        expect.any(Object)
      );
      
      await authTransport.stop();
    });

    it('should accept requests with valid authentication', async () => {
      const authConfig = {
        ...config,
        requireAuth: true,
        validTokens: ['valid-token-123']
      };
      
      const authTransport = new WebSocketTransport(authConfig, mockLogger);
      await authTransport.start();
      
      // Setup request handler
      const mockRequestHandler = jest.fn();
      authTransport.onRequest(mockRequestHandler);
      
      // Simulate request with valid authentication
      const authenticatedRequest = {
        jsonrpc: '2.0',
        id: 'auth-test',
        method: 'test/method',
        params: { token: 'valid-token-123' }
      };

      if (mockWebSocketInstance) {
        mockWebSocketInstance.simulateMessage(authenticatedRequest);
      }

      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Verify handler was called
      expect(mockRequestHandler).toHaveBeenCalledWith(authenticatedRequest);
      
      await authTransport.stop();
    });

    it('should reject requests with invalid authentication', async () => {
      const authConfig = {
        ...config,
        requireAuth: true,
        validTokens: ['valid-token-123']
      };
      
      const authTransport = new WebSocketTransport(authConfig, mockLogger);
      await authTransport.start();
      
      // Setup request handler
      const mockRequestHandler = jest.fn();
      authTransport.onRequest(mockRequestHandler);
      
      // Simulate request with invalid authentication
      const invalidAuthRequest = {
        jsonrpc: '2.0',
        id: 'auth-test',
        method: 'test/method',
        params: { token: 'invalid-token' }
      };

      if (mockWebSocketInstance) {
        mockWebSocketInstance.simulateMessage(invalidAuthRequest);
      }

      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Verify handler was not called
      expect(mockRequestHandler).not.toHaveBeenCalled();
      
      // Verify error was logged
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Invalid authentication token',
        expect.any(Object)
      );
      
      await authTransport.stop();
    });

    it('should enforce method-level authorization', async () => {
      const authConfig = {
        ...config,
        requireAuth: true,
        validTokens: ['valid-token-123'],
        methodPermissions: {
          'admin/method': ['admin'],
          'user/method': ['user', 'admin']
        }
      };
      
      const authTransport = new WebSocketTransport(authConfig, mockLogger);
      await authTransport.start();
      
      // Setup request handler
      const mockRequestHandler = jest.fn();
      authTransport.onRequest(mockRequestHandler);
      
      // Simulate user trying to access admin method
      const unauthorizedRequest = {
        jsonrpc: '2.0',
        id: 'auth-test',
        method: 'admin/method',
        params: { token: 'valid-token-123', role: 'user' }
      };

      if (mockWebSocketInstance) {
        mockWebSocketInstance.simulateMessage(unauthorizedRequest);
      }

      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Verify handler was not called
      expect(mockRequestHandler).not.toHaveBeenCalled();
      
      // Verify error was logged
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Insufficient permissions for method',
        expect.any(Object)
      );
      
      await authTransport.stop();
    });
  });

  describe('Error Handling Security', () => {
    it('should not expose sensitive information in error messages', async () => {
      await transport.start();
      
      // Setup request handler that throws an error with sensitive info
      const mockRequestHandler = jest.fn().mockRejectedValue(
        new Error('Database connection failed: password=secret123')
      );
      transport.onRequest(mockRequestHandler);
      
      // Simulate request
      const request = {
        jsonrpc: '2.0',
        id: 'error-test',
        method: 'test/method'
      };

      if (mockWebSocketInstance) {
        mockWebSocketInstance.simulateMessage(request);
      }

      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Verify error was logged but sensitive info was sanitized
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Request handler error',
        expect.objectContaining({
          message: expect.not.stringContaining('secret123')
        })
      );
    });

    it('should handle unexpected errors gracefully', async () => {
      await transport.start();
      
      // Setup request handler that throws an unexpected error
      const mockRequestHandler = jest.fn().mockImplementation(() => {
        throw new Error('Unexpected error');
      });
      transport.onRequest(mockRequestHandler);
      
      // Simulate request
      const request = {
        jsonrpc: '2.0',
        id: 'unexpected-error-test',
        method: 'test/method'
      };

      if (mockWebSocketInstance) {
        mockWebSocketInstance.simulateMessage(request);
      }

      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Verify error was handled gracefully
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Request handler error',
        expect.any(Object)
      );
      
      // Verify transport is still functional
      const health = await transport.getHealthStatus();
      expect(health.healthy).toBe(true);
    });
  });
});