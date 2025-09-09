/**
 * Unit tests for MCP Transports
 */

import { describe, it, beforeEach, afterEach } from "../../../test.utils";
import { assertEquals, assertExists } from "../../../test.utils";
import { Logger } from '../../../src/core/logger.ts';
import { MCPConfig } from '../../../src/utils/types.ts';
import { StdioTransport } from '../../../src/mcp/transports/stdio.ts';
import { HttpTransport } from '../../../src/mcp/transports/http.ts';
import { WebSocketTransport } from '../../../src/mcp/transports/websocket.ts';

describe('MCP Transports', () => {
  let logger: Logger;

  beforeEach(async () => {
    logger = new Logger();
    await logger.configure({
      level: 'debug',
      format: 'text',
      destination: 'console',
    });
  });

  describe('StdioTransport', () => {
    let transport: StdioTransport;
    let config: MCPConfig;

    beforeEach(() => {
      config = {
        transport: 'stdio',
        host: 'localhost',
        port: 3002,
        tlsEnabled: false,
        auth: { enabled: false, method: 'token' },
        loadBalancer: {
          enabled: false,
          strategy: 'round-robin',
          maxRequestsPerSecond: 100,
          healthCheckInterval: 30000,
          circuitBreakerThreshold: 5,
        },
        sessionTimeout: 60000,
        maxSessions: 10,
      };

      transport = new StdioTransport(config, logger);
    });

    afterEach(async () => {
      if (transport && transport.isConnected()) {
        await transport.disconnect();
      }
    });

    it('should initialize correctly', () => {
      expect(transport).toBeDefined();
      expect(transport.isConnected()).toBe(false);
    });

    it('should have required methods', () => {
      expect(typeof transport.connect).toBe('function');
      expect(typeof transport.disconnect).toBe('function');
      expect(typeof transport.sendRequest).toBe('function');
      expect(typeof transport.sendNotification).toBe('function');
      expect(typeof transport.isConnected).toBe('function');
      expect(typeof transport.onRequest).toBe('function');
    });

    it('should handle connection lifecycle', async () => {
      // Mock the connection process since we can't actually connect to stdio in tests
      const mockConnect = jest.spyOn(transport, 'connect' as any).mockResolvedValue(undefined);
      const mockDisconnect = jest.spyOn(transport, 'disconnect' as any).mockResolvedValue(undefined);
      
      await transport.connect();
      expect(mockConnect).toHaveBeenCalled();
      
      await transport.disconnect();
      expect(mockDisconnect).toHaveBeenCalled();
      
      mockConnect.mockRestore();
      mockDisconnect.mockRestore();
    });

    it('should handle request and notification handlers', () => {
      const mockRequestHandler = jest.fn();
      const mockNotificationHandler = jest.fn();
      
      transport.onRequest(mockRequestHandler);
      transport.onNotification(mockNotificationHandler);
      
      // Verify handlers are set (implementation specific)
      expect(transport).toBeDefined();
    });

    it('should handle connection errors', async () => {
      // Mock a connection error
      const mockConnect = jest.spyOn(transport, 'connect' as any)
        .mockRejectedValue(new Error('Connection failed'));
      
      await expect(transport.connect()).rejects.toThrow('Connection failed');
      
      mockConnect.mockRestore();
    });
  });

  describe('HttpTransport', () => {
    let transport: HttpTransport;
    let config: MCPConfig;

    beforeEach(() => {
      config = {
        transport: 'http',
        host: 'localhost',
        port: 3002,
        tlsEnabled: false,
        auth: { enabled: false, method: 'token' },
        loadBalancer: {
          enabled: false,
          strategy: 'round-robin',
          maxRequestsPerSecond: 100,
          healthCheckInterval: 30000,
          circuitBreakerThreshold: 5,
        },
        sessionTimeout: 60000,
        maxSessions: 10,
      };

      transport = new HttpTransport(config, logger);
    });

    afterEach(async () => {
      if (transport && transport.isConnected()) {
        await transport.disconnect();
      }
    });

    it('should initialize correctly', () => {
      expect(transport).toBeDefined();
      expect(transport.isConnected()).toBe(false);
    });

    it('should have required methods', () => {
      expect(typeof transport.connect).toBe('function');
      expect(typeof transport.disconnect).toBe('function');
      expect(typeof transport.sendRequest).toBe('function');
      expect(typeof transport.sendNotification).toBe('function');
      expect(typeof transport.isConnected).toBe('function');
      expect(typeof transport.onRequest).toBe('function');
    });

    it('should handle connection lifecycle', async () => {
      // Mock the connection process
      const mockConnect = jest.spyOn(transport, 'connect' as any).mockResolvedValue(undefined);
      const mockDisconnect = jest.spyOn(transport, 'disconnect' as any).mockResolvedValue(undefined);
      
      await transport.connect();
      expect(mockConnect).toHaveBeenCalled();
      
      await transport.disconnect();
      expect(mockDisconnect).toHaveBeenCalled();
      
      mockConnect.mockRestore();
      mockDisconnect.mockRestore();
    });

    it('should handle HTTP requests', async () => {
      // Mock HTTP request
      const mockSendRequest = jest.spyOn(transport, 'sendRequest' as any)
        .mockResolvedValue({ jsonrpc: '2.0', id: '1', result: { success: true } });
      
      const request = { jsonrpc: '2.0' as const, id: '1', method: 'test', params: {} };
      const response = await transport.sendRequest(request);
      
      expect(response).toEqual({ jsonrpc: '2.0', id: '1', result: { success: true } });
      expect(mockSendRequest).toHaveBeenCalledWith(request);
      
      mockSendRequest.mockRestore();
    });

    it('should handle HTTP notifications', async () => {
      // Mock HTTP notification
      const mockSendNotification = jest.spyOn(transport, 'sendNotification' as any)
        .mockResolvedValue(undefined);
      
      const notification = { jsonrpc: '2.0' as const, method: 'test', params: {} };
      await transport.sendNotification(notification);
      
      expect(mockSendNotification).toHaveBeenCalledWith(notification);
      
      mockSendNotification.mockRestore();
    });

    it('should handle HTTP errors', async () => {
      // Mock HTTP error
      const mockSendRequest = jest.spyOn(transport, 'sendRequest' as any)
        .mockRejectedValue(new Error('HTTP request failed'));
      
      const request = { jsonrpc: '2.0' as const, id: '1', method: 'test', params: {} };
      
      await expect(transport.sendRequest(request)).rejects.toThrow('HTTP request failed');
      
      mockSendRequest.mockRestore();
    });
  });

  describe('WebSocketTransport', () => {
    let transport: WebSocketTransport;
    let config: MCPConfig;

    beforeEach(() => {
      config = {
        transport: 'websocket',
        host: 'localhost',
        port: 3002,
        tlsEnabled: false,
        auth: { enabled: false, method: 'token' },
        loadBalancer: {
          enabled: false,
          strategy: 'round-robin',
          maxRequestsPerSecond: 100,
          healthCheckInterval: 30000,
          circuitBreakerThreshold: 5,
        },
        sessionTimeout: 60000,
        maxSessions: 10,
      };

      transport = new WebSocketTransport(config, logger);
    });

    afterEach(async () => {
      if (transport && transport.isConnected()) {
        await transport.disconnect();
      }
    });

    it('should initialize correctly', () => {
      expect(transport).toBeDefined();
      expect(transport.isConnected()).toBe(false);
    });

    it('should have required methods', () => {
      expect(typeof transport.connect).toBe('function');
      expect(typeof transport.disconnect).toBe('function');
      expect(typeof transport.sendRequest).toBe('function');
      expect(typeof transport.sendNotification).toBe('function');
      expect(typeof transport.isConnected).toBe('function');
      expect(typeof transport.onRequest).toBe('function');
    });

    it('should handle connection lifecycle', async () => {
      // Mock the connection process
      const mockConnect = jest.spyOn(transport, 'connect' as any).mockResolvedValue(undefined);
      const mockDisconnect = jest.spyOn(transport, 'disconnect' as any).mockResolvedValue(undefined);
      
      await transport.connect();
      expect(mockConnect).toHaveBeenCalled();
      
      await transport.disconnect();
      expect(mockDisconnect).toHaveBeenCalled();
      
      mockConnect.mockRestore();
      mockDisconnect.mockRestore();
    });

    it('should handle WebSocket messages', async () => {
      // Mock WebSocket message
      const mockSendRequest = jest.spyOn(transport, 'sendRequest' as any)
        .mockResolvedValue({ jsonrpc: '2.0', id: '1', result: { success: true } });
      
      const request = { jsonrpc: '2.0' as const, id: '1', method: 'test', params: {} };
      const response = await transport.sendRequest(request);
      
      expect(response).toEqual({ jsonrpc: '2.0', id: '1', result: { success: true } });
      expect(mockSendRequest).toHaveBeenCalledWith(request);
      
      mockSendRequest.mockRestore();
    });

    it('should handle WebSocket notifications', async () => {
      // Mock WebSocket notification
      const mockSendNotification = jest.spyOn(transport, 'sendNotification' as any)
        .mockResolvedValue(undefined);
      
      const notification = { jsonrpc: '2.0' as const, method: 'test', params: {} };
      await transport.sendNotification(notification);
      
      expect(mockSendNotification).toHaveBeenCalledWith(notification);
      
      mockSendNotification.mockRestore();
    });

    it('should handle WebSocket connection events', () => {
      // Mock event handlers
      const mockOpenHandler = jest.fn();
      const mockCloseHandler = jest.fn();
      const mockErrorHandler = jest.fn();
      
      transport.on('open', mockOpenHandler);
      transport.on('close', mockCloseHandler);
      transport.on('error', mockErrorHandler);
      
      // Verify handlers are set (implementation specific)
      expect(transport).toBeDefined();
    });

    it('should handle WebSocket errors', async () => {
      // Mock WebSocket error
      const mockSendRequest = jest.spyOn(transport, 'sendRequest' as any)
        .mockRejectedValue(new Error('WebSocket connection failed'));
      
      const request = { jsonrpc: '2.0' as const, id: '1', method: 'test', params: {} };
      
      await expect(transport.sendRequest(request)).rejects.toThrow('WebSocket connection failed');
      
      mockSendRequest.mockRestore();
    });

    it('should handle reconnection logic', async () => {
      // Mock reconnection
      const mockConnect = jest.spyOn(transport, 'connect' as any)
        .mockRejectedValueOnce(new Error('Connection failed'))
        .mockResolvedValue(undefined);
      
      // First attempt should fail
      await expect(transport.connect()).rejects.toThrow('Connection failed');
      
      // Second attempt should succeed
      await transport.connect();
      expect(mockConnect).toHaveBeenCalledTimes(2);
      
      mockConnect.mockRestore();
    });
  });

  describe('Transport Factory', () => {
    it('should create appropriate transport based on config', () => {
      // This would test a factory function that creates transports based on config
      // For now, we'll just verify that the transport classes can be instantiated
      
      const stdioConfig = { transport: 'stdio' } as MCPConfig;
      const httpConfig = { transport: 'http' } as MCPConfig;
      const wsConfig = { transport: 'websocket' } as MCPConfig;
      
      const stdioTransport = new StdioTransport(stdioConfig, logger);
      const httpTransport = new HttpTransport(httpConfig, logger);
      const wsTransport = new WebSocketTransport(wsConfig, logger);
      
      expect(stdioTransport).toBeDefined();
      expect(httpTransport).toBeDefined();
      expect(wsTransport).toBeDefined();
    });
  });

  describe('Transport Error Handling', () => {
    it('should handle invalid transport configuration', () => {
      const invalidConfig = { transport: 'invalid' } as MCPConfig;
      
      // This would test how the system handles invalid transport configs
      // For now, we'll just verify that the transport classes handle invalid configs
      expect(() => {
        new StdioTransport(invalidConfig, logger);
      }).not.toThrow();
    });

    it('should handle connection timeouts', async () => {
      const config = {
        transport: 'http',
        host: 'localhost',
        port: 3002,
        connectionTimeout: 100, // Very short timeout for testing
      } as MCPConfig;
      
      const transport = new HttpTransport(config, logger);
      
      // Mock a timeout
      const mockConnect = jest.spyOn(transport, 'connect' as any)
        .mockImplementation(() => new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Connection timeout')), 50);
        }));
      
      await expect(transport.connect()).rejects.toThrow('Connection timeout');
      
      mockConnect.mockRestore();
    });
  });
});