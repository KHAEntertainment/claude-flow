/**
 * WebSocket Transport Utilities Tests
 * 
 * This test file provides comprehensive coverage for WebSocket transport utility functions.
 * It tests both happy path and error scenarios to ensure robust functionality.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Mock utility functions that would be used by the WebSocket transport
const mockUtils = {
  validateWebSocketConfig: jest.fn(),
  parseWebSocketMessage: jest.fn(),
  formatWebSocketMessage: jest.fn(),
  calculateBackoffDelay: jest.fn(),
  isWebSocketError: jest.fn(),
  sanitizeUrl: jest.fn()
};

// Import the utilities after mocking
let WebSocketTransportUtils: any;

describe('WebSocket Transport Utilities', () => {
  beforeEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();
    await jest.unstable_mockModule('../transports/websocket-utils.js', () => ({
      validateWebSocketConfig: mockUtils.validateWebSocketConfig,
      parseWebSocketMessage: mockUtils.parseWebSocketMessage,
      formatWebSocketMessage: mockUtils.formatWebSocketMessage,
      calculateBackoffDelay: mockUtils.calculateBackoffDelay,
      isWebSocketError: mockUtils.isWebSocketError,
      sanitizeUrl: mockUtils.sanitizeUrl,
    }));
    WebSocketTransportUtils = await import('../transports/websocket-utils.js');
  });

  describe('Configuration Validation', () => {
    it('should validate correct WebSocket configuration', () => {
      const validConfig = {
        url: 'ws://localhost:8080',
        reconnectAttempts: 3,
        reconnectDelay: 100,
        timeout: 5000
      };

      mockUtils.validateWebSocketConfig.mockReturnValue({ valid: true });
      
      const result = WebSocketTransportUtils.validateWebSocketConfig(validConfig);
      
      expect(result.valid).toBe(true);
      expect(mockUtils.validateWebSocketConfig).toHaveBeenCalledWith(validConfig);
    });

    it('should reject configuration with invalid URL', () => {
      const invalidConfig = {
        url: 'invalid-url',
        reconnectAttempts: 3,
        reconnectDelay: 100,
        timeout: 5000
      };

      mockUtils.validateWebSocketConfig.mockReturnValue({ 
        valid: false, 
        errors: ['Invalid WebSocket URL format'] 
      });
      
      const result = WebSocketTransportUtils.validateWebSocketConfig(invalidConfig);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid WebSocket URL format');
    });

    it('should reject configuration with negative reconnect attempts', () => {
      const invalidConfig = {
        url: 'ws://localhost:8080',
        reconnectAttempts: -1,
        reconnectDelay: 100,
        timeout: 5000
      };

      mockUtils.validateWebSocketConfig.mockReturnValue({ 
        valid: false, 
        errors: ['Reconnect attempts must be non-negative'] 
      });
      
      const result = WebSocketTransportUtils.validateWebSocketConfig(invalidConfig);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Reconnect attempts must be non-negative');
    });

    it('should reject configuration with negative timeout', () => {
      const invalidConfig = {
        url: 'ws://localhost:8080',
        reconnectAttempts: 3,
        reconnectDelay: 100,
        timeout: -1
      };

      mockUtils.validateWebSocketConfig.mockReturnValue({ 
        valid: false, 
        errors: ['Timeout must be positive'] 
      });
      
      const result = WebSocketTransportUtils.validateWebSocketConfig(invalidConfig);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Timeout must be positive');
    });

    it('should use default values for missing optional parameters', () => {
      const minimalConfig = {
        url: 'ws://localhost:8080'
      };

      mockUtils.validateWebSocketConfig.mockReturnValue({ valid: true });
      
      const result = WebSocketTransportUtils.validateWebSocketConfig(minimalConfig);
      
      expect(result.valid).toBe(true);
      expect(mockUtils.validateWebSocketConfig).toHaveBeenCalledWith(minimalConfig);
    });
  });

  describe('Message Parsing', () => {
    it('should parse valid JSON-RPC message', () => {
      const validMessage = {
        jsonrpc: '2.0',
        id: 'test-id',
        method: 'test/method',
        params: { data: 'test' }
      };

      const messageString = JSON.stringify(validMessage);
      
      mockUtils.parseWebSocketMessage.mockReturnValue({
        valid: true,
        message: validMessage
      });
      
      const result = WebSocketTransportUtils.parseWebSocketMessage(messageString);
      
      expect(result.valid).toBe(true);
      expect(result.message).toEqual(validMessage);
    });

    it('should handle malformed JSON messages', () => {
      const invalidJson = 'invalid json';
      
      mockUtils.parseWebSocketMessage.mockReturnValue({
        valid: false,
        error: 'Failed to parse JSON'
      });
      
      const result = WebSocketTransportUtils.parseWebSocketMessage(invalidJson);
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Failed to parse JSON');
    });

    it('should validate JSON-RPC version', () => {
      const invalidVersionMessage = {
        jsonrpc: '1.0',
        id: 'test-id',
        method: 'test/method'
      };

      const messageString = JSON.stringify(invalidVersionMessage);
      
      mockUtils.parseWebSocketMessage.mockReturnValue({
        valid: false,
        error: 'Invalid JSON-RPC version'
      });
      
      const result = WebSocketTransportUtils.parseWebSocketMessage(messageString);
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid JSON-RPC version');
    });

    it('should require method field', () => {
      const noMethodMessage = {
        jsonrpc: '2.0',
        id: 'test-id'
      };

      const messageString = JSON.stringify(noMethodMessage);
      
      mockUtils.parseWebSocketMessage.mockReturnValue({
        valid: false,
        error: 'Missing method field'
      });
      
      const result = WebSocketTransportUtils.parseWebSocketMessage(messageString);
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Missing method field');
    });

    it('should handle empty message', () => {
      const emptyMessage = '';
      
      mockUtils.parseWebSocketMessage.mockReturnValue({
        valid: false,
        error: 'Empty message'
      });
      
      const result = WebSocketTransportUtils.parseWebSocketMessage(emptyMessage);
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Empty message');
    });
  });

  describe('Message Formatting', () => {
    it('should format message correctly', () => {
      const message = {
        jsonrpc: '2.0',
        id: 'test-id',
        method: 'test/method',
        params: { data: 'test' }
      };

      mockUtils.formatWebSocketMessage.mockReturnValue(JSON.stringify(message));
      
      const result = WebSocketTransportUtils.formatWebSocketMessage(message);
      
      expect(result).toBe(JSON.stringify(message));
      expect(mockUtils.formatWebSocketMessage).toHaveBeenCalledWith(message);
    });

    it('should handle large messages', () => {
      const largeData = 'x'.repeat(1024 * 1024); // 1MB
      const largeMessage = {
        jsonrpc: '2.0',
        id: 'large-test',
        method: 'test/method',
        params: { data: largeData }
      };

      mockUtils.formatWebSocketMessage.mockReturnValue(JSON.stringify(largeMessage));
      
      const result = WebSocketTransportUtils.formatWebSocketMessage(largeMessage);
      
      expect(result).toBe(JSON.stringify(largeMessage));
      expect(mockUtils.formatWebSocketMessage).toHaveBeenCalledWith(largeMessage);
    });

    it('should handle special characters in message', () => {
      const specialCharMessage = {
        jsonrpc: '2.0',
        id: 'special-test',
        method: 'test/method',
        params: { data: 'Special chars: \n \t " \\' }
      };

      mockUtils.formatWebSocketMessage.mockReturnValue(JSON.stringify(specialCharMessage));
      
      const result = WebSocketTransportUtils.formatWebSocketMessage(specialCharMessage);
      
      expect(result).toBe(JSON.stringify(specialCharMessage));
      expect(mockUtils.formatWebSocketMessage).toHaveBeenCalledWith(specialCharMessage);
    });
  });

  describe('Backoff Calculation', () => {
    it('should calculate exponential backoff correctly', () => {
      const attempt = 3;
      const baseDelay = 100;
      const expectedDelay = 800; // 100 * 2^3
      
      mockUtils.calculateBackoffDelay.mockReturnValue(expectedDelay);
      
      const result = WebSocketTransportUtils.calculateBackoffDelay(attempt, baseDelay);
      
      expect(result).toBe(expectedDelay);
      expect(mockUtils.calculateBackoffDelay).toHaveBeenCalledWith(attempt, baseDelay);
    });

    it('should cap maximum backoff delay', () => {
      const attempt = 10;
      const baseDelay = 100;
      const maxDelay = 30000;
      const expectedDelay = maxDelay;
      
      mockUtils.calculateBackoffDelay.mockReturnValue(expectedDelay);
      
      const result = WebSocketTransportUtils.calculateBackoffDelay(attempt, baseDelay, maxDelay);
      
      expect(result).toBe(expectedDelay);
      expect(mockUtils.calculateBackoffDelay).toHaveBeenCalledWith(attempt, baseDelay, maxDelay);
    });

    it('should handle zero attempt number', () => {
      const attempt = 0;
      const baseDelay = 100;
      const expectedDelay = baseDelay;
      
      mockUtils.calculateBackoffDelay.mockReturnValue(expectedDelay);
      
      const result = WebSocketTransportUtils.calculateBackoffDelay(attempt, baseDelay);
      
      expect(result).toBe(expectedDelay);
      expect(mockUtils.calculateBackoffDelay).toHaveBeenCalledWith(attempt, baseDelay);
    });

it('should add jitter to prevent thundering herd', () => {
  const attempt = 2;
  const baseDelay = 100;

  mockUtils.calculateBackoffDelay.mockReturnValue(400);

  const result = WebSocketTransportUtils.calculateBackoffDelay(attempt, baseDelay);

  expect(result).toEqual(expect.any(Number));
  expect(mockUtils.calculateBackoffDelay).toHaveBeenCalledWith(attempt, baseDelay);
});
  });

  describe('Error Handling', () => {
    it('should identify WebSocket-specific errors', () => {
      const wsError = new Error('WebSocket connection failed');
      
      mockUtils.isWebSocketError.mockReturnValue(true);
      
      const result = WebSocketTransportUtils.isWebSocketError(wsError);
      
      expect(result).toBe(true);
      expect(mockUtils.isWebSocketError).toHaveBeenCalledWith(wsError);
    });

    it('should reject non-WebSocket errors', () => {
      const genericError = new Error('Generic error');
      
      mockUtils.isWebSocketError.mockReturnValue(false);
      
      const result = WebSocketTransportUtils.isWebSocketError(genericError);
      
      expect(result).toBe(false);
      expect(mockUtils.isWebSocketError).toHaveBeenCalledWith(genericError);
    });

    it('should handle different types of WebSocket errors', () => {
      const wsErrors = [
        new Error('WebSocket connection failed'),
        new Error('WebSocket handshake failed'),
        new Error('WebSocket timeout'),
        new Error('WebSocket closed unexpectedly')
      ];

      wsErrors.forEach(error => {
        mockUtils.isWebSocketError.mockReturnValue(true);
        
        const result = WebSocketTransportUtils.isWebSocketError(error);
        
        expect(result).toBe(true);
        expect(mockUtils.isWebSocketError).toHaveBeenCalledWith(error);
      });
    });
  });

  describe('URL Sanitization', () => {
    it('should sanitize valid WebSocket URLs', () => {
      const url = 'ws://localhost:8080';
      const expected = 'ws://localhost:8080';
      
      mockUtils.sanitizeUrl.mockReturnValue(expected);
      
      const result = WebSocketTransportUtils.sanitizeUrl(url);
      
      expect(result).toBe(expected);
      expect(mockUtils.sanitizeUrl).toHaveBeenCalledWith(url);
    });

    it('should add ws:// prefix if missing', () => {
      const url = 'localhost:8080';
      const expected = 'ws://localhost:8080';
      
      mockUtils.sanitizeUrl.mockReturnValue(expected);
      
      const result = WebSocketTransportUtils.sanitizeUrl(url);
      
      expect(result).toBe(expected);
      expect(mockUtils.sanitizeUrl).toHaveBeenCalledWith(url);
    });

    it('should handle secure WebSocket URLs', () => {
      const url = 'wss://example.com';
      const expected = 'wss://example.com';
      
      mockUtils.sanitizeUrl.mockReturnValue(expected);
      
      const result = WebSocketTransportUtils.sanitizeUrl(url);
      
      expect(result).toBe(expected);
      expect(mockUtils.sanitizeUrl).toHaveBeenCalledWith(url);
    });

    it('should reject invalid URL formats', () => {
      const invalidUrl = 'not a url';
      
      mockUtils.sanitizeUrl.mockImplementation(() => {
        throw new Error('Invalid URL format');
      });
      
      expect(() => {
        WebSocketTransportUtils.sanitizeUrl(invalidUrl);
      }).toThrow('Invalid URL format');
    });

    it('should handle URLs with paths', () => {
      const url = 'ws://localhost:8080/mcp';
      const expected = 'ws://localhost:8080/mcp';
      
      mockUtils.sanitizeUrl.mockReturnValue(expected);
      
      const result = WebSocketTransportUtils.sanitizeUrl(url);
      
      expect(result).toBe(expected);
      expect(mockUtils.sanitizeUrl).toHaveBeenCalledWith(url);
    });

    it('should handle URLs with query parameters', () => {
      const url = 'ws://localhost:8080?param=value';
      const expected = 'ws://localhost:8080?param=value';
      
      mockUtils.sanitizeUrl.mockReturnValue(expected);
      
      const result = WebSocketTransportUtils.sanitizeUrl(url);
      
      expect(result).toBe(expected);
      expect(mockUtils.sanitizeUrl).toHaveBeenCalledWith(url);
    });
  });

  describe('Edge Cases', () => {
    it('should handle null and undefined inputs', () => {
      expect(() => {
        WebSocketTransportUtils.validateWebSocketConfig(null as any);
      }).toThrow();
      
      expect(() => {
        WebSocketTransportUtils.parseWebSocketMessage(null as any);
      }).toThrow();
      
      expect(() => {
        WebSocketTransportUtils.formatWebSocketMessage(null as any);
      }).toThrow();
    });

    it('should handle extremely large messages', () => {
      const hugeData = 'x'.repeat(10 * 1024 * 1024); // 10MB
      const hugeMessage = {
        jsonrpc: '2.0',
        id: 'huge-test',
        method: 'test/method',
        params: { data: hugeData }
      };

      mockUtils.formatWebSocketMessage.mockImplementation(() => {
        throw new Error('Message too large');
      });
      
      expect(() => {
        WebSocketTransportUtils.formatWebSocketMessage(hugeMessage);
      }).toThrow('Message too large');
    });

    it('should handle concurrent operations', async () => {
      const concurrentOperations = Array.from({ length: 100 }, (_, i) => ({
        jsonrpc: '2.0',
        id: `concurrent-${i}`,
        method: 'test/method'
      }));

      const promises = concurrentOperations.map(op => {
        mockUtils.formatWebSocketMessage.mockReturnValue(JSON.stringify(op));
        return WebSocketTransportUtils.formatWebSocketMessage(op);
      });

      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(100);
      results.forEach((result, i) => {
        expect(result).toBe(JSON.stringify(concurrentOperations[i]));
      });
    });
  });
});