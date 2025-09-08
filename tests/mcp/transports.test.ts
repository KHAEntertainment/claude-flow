/**
 * Tests for MCP transport implementations
 */

import { describe, it, expect, beforeEach, afterEach, vi, jest } from 'vitest';
import { EventEmitter } from 'node:events';
import { createServer } from 'node:http';
import { Server as WebSocketServer } from 'ws';
import { StdioTransport } from '../../src/mcp/transports/stdio.js';
import { HttpTransport } from '../../src/mcp/transports/http.js';
import { WebSocketTransport } from '../../src/mcp/transports/websocket.js';
import { MCPTransportError } from '../../src/utils/errors.js';
import type { ILogger, MCPRequest, MCPResponse, MCPNotification } from '../../src/utils/types.js';

// Mock logger implementation
const createMockLogger = (): ILogger => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  configure: vi.fn().mockResolvedValue(undefined),
});

describe('MCP Transports', () => {
  let mockLogger: ILogger;
  
  beforeEach(() => {
    mockLogger = createMockLogger();
    vi.clearAllMocks();
  });

  describe('StdioTransport', () => {
    let transport: StdioTransport;
    let originalStdoutWrite: typeof process.stdout.write;
    let mockStdin: EventEmitter;

    beforeEach(() => {
      transport = new StdioTransport(mockLogger);
      originalStdoutWrite = process.stdout.write;
      mockStdin = new EventEmitter();
      
      // Mock process.stdin
      vi.doMock('node:process', () => ({
        ...vi.importActual('node:process'),
        stdin: mockStdin,
      }));
    });

    afterEach(() => {
      process.stdout.write = originalStdoutWrite;
      vi.doUnmock('node:process');
    });

    it('should start and stop correctly', async () => {
      await transport.start();
      expect(mockLogger.info).toHaveBeenCalledWith('Starting stdio transport');
      expect(mockLogger.info).toHaveBeenCalledWith('Stdio transport started');
      
      await transport.stop();
      expect(mockLogger.info).toHaveBeenCalledWith('Stopping stdio transport');
      expect(mockLogger.info).toHaveBeenCalledWith('Stdio transport stopped');
    });

    it('should handle incoming JSON-RPC requests', async () => {
      const requestHandler = vi.fn().mockResolvedValue({
        jsonrpc: '2.0',
        id: 'test-id',
        result: { success: true }
      });
      
      transport.onRequest(requestHandler);
      await transport.start();
      
      // Simulate incoming message
      const message = JSON.stringify({
        jsonrpc: '2.0',
        id: 'test-id',
        method: 'test.method',
        params: { test: 'value' }
      });
      
      mockStdin.emit('line', message);
      
      // Give time for async processing
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(requestHandler).toHaveBeenCalledWith({
        jsonrpc: '2.0',
        id: 'test-id',
        method: 'test.method',
        params: { test: 'value' }
      });
    });

    it('should handle incoming JSON-RPC notifications', async () => {
      const notificationHandler = vi.fn();
      
      transport.onNotification(notificationHandler);
      await transport.start();
      
      // Simulate incoming notification (no id)
      const message = JSON.stringify({
        jsonrpc: '2.0',
        method: 'test.notification',
        params: { test: 'value' }
      });
      
      mockStdin.emit('line', message);
      
      // Give time for async processing
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(notificationHandler).toHaveBeenCalledWith({
        jsonrpc: '2.0',
        method: 'test.notification',
        params: { test: 'value' }
      });
    });

    it('should handle malformed JSON messages', async () => {
      const requestHandler = vi.fn();
      
      transport.onRequest(requestHandler);
      await transport.start();
      
      // Mock stdout.write to capture error response
      const stdoutWrite = vi.fn();
      process.stdout.write = stdoutWrite as any;
      
      // Simulate malformed JSON
      mockStdin.emit('line', '{ invalid json }');
      
      // Give time for async processing
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to parse message',
        expect.objectContaining({
          line: '{ invalid json }',
          error: expect.any(Error)
        })
      );
      
      // Should send error response
      expect(stdoutWrite).toHaveBeenCalledWith(
        expect.stringContaining('"jsonrpc":"2.0"')
      );
      expect(stdoutWrite).toHaveBeenCalledWith(
        expect.stringContaining('"code":-32700')
      );
      expect(stdoutWrite).toHaveBeenCalledWith(
        expect.stringContaining('"message":"Parse error"')
      );
    });

    it('should handle invalid JSON-RPC messages', async () => {
      const requestHandler = vi.fn();
      
      transport.onRequest(requestHandler);
      await transport.start();
      
      // Mock stdout.write to capture error response
      const stdoutWrite = vi.fn();
      process.stdout.write = stdoutWrite as any;
      
      // Simulate invalid JSON-RPC (missing version)
      const message = JSON.stringify({
        id: 'test-id',
        method: 'test.method'
      });
      
      mockStdin.emit('line', message);
      
      // Give time for async processing
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to parse message',
        expect.objectContaining({
          line: message,
          error: expect.any(Error)
        })
      );
      
      // Should send error response
      expect(stdoutWrite).toHaveBeenCalledWith(
        expect.stringContaining('"jsonrpc":"2.0"')
      );
      expect(stdoutWrite).toHaveBeenCalledWith(
        expect.stringContaining('"code":-32700')
      );
    });

    it('should report health status correctly', async () => {
      await transport.start();
      
      const health = await transport.getHealthStatus();
      
      expect(health).toEqual({
        healthy: true,
        metrics: {
          messagesReceived: 0,
          notificationsSent: 0,
          stdinOpen: 1,
        },
      });
      
      await transport.stop();
      
      const healthStopped = await transport.getHealthStatus();
      
      expect(healthStopped).toEqual({
        healthy: false,
        metrics: {
          messagesReceived: 0,
          notificationsSent: 0,
          stdinOpen: 0,
        },
      });
    });

    it('should throw error when starting already running transport', async () => {
      await transport.start();
      
      await expect(transport.start()).rejects.toThrow(
        MCPTransportError
      );
      
      expect(mockLogger.info).toHaveBeenCalledWith('Starting stdio transport');
    });

    it('should send notifications correctly', async () => {
      await transport.start();
      
      // Mock stdout.write to capture output
      const stdoutWrite = vi.fn();
      process.stdout.write = stdoutWrite as any;
      
      const notification: MCPNotification = {
        jsonrpc: '2.0',
        method: 'test.notification',
        params: { test: 'value' }
      };
      
      await transport.sendNotification(notification);
      
      expect(stdoutWrite).toHaveBeenCalledWith(
        JSON.stringify(notification) + '\n'
      );
      
      const health = await transport.getHealthStatus();
      expect(health.metrics?.notificationsSent).toBe(1);
    });

    it('should throw error when sending request without correlation mechanism', async () => {
      await transport.start();
      
      const request: MCPRequest = {
        jsonrpc: '2.0',
        id: 'test-id',
        method: 'test.method',
        params: { test: 'value' }
      };
      
      await expect(transport.sendRequest(request)).rejects.toThrow(
        'STDIO transport sendRequest requires request/response correlation'
      );
    });
  });

  describe('HttpTransport', () => {
    let transport: HttpTransport;
    let httpServer: any;
    let serverPort: number;
    let requestHandler: any;
    let notificationHandler: any;

    beforeEach(async () => {
      // Create a mock HTTP server for testing
      httpServer = createServer((req, res) => {
        let body = '';
        
        req.on('data', chunk => {
          body += chunk.toString();
        });
        
        req.on('end', () => {
          try {
            const message = JSON.parse(body);
            
            if (message.id === undefined) {
              // Notification
              if (notificationHandler) {
                notificationHandler(message);
              }
              res.writeHead(204).end();
            } else {
              // Request
              if (requestHandler) {
                requestHandler(message)
                  .then(response => {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(response));
                  })
                  .catch(error => {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                      jsonrpc: '2.0',
                      id: message.id,
                      error: {
                        code: -32603,
                        message: 'Internal error',
                        data: error.message
                      }
                    }));
                  });
              }
            }
          } catch (error) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              jsonrpc: '2.0',
              id: 'unknown',
              error: {
                code: -32700,
                message: 'Parse error'
              }
            }));
          }
        });
      });
      
      // Listen on a random available port
      await new Promise<void>(resolve => {
        httpServer.listen(0, () => {
          serverPort = (httpServer.address() as any).port;
          resolve();
        });
      });
      
      transport = new HttpTransport(
        mockLogger,
        `http://localhost:${serverPort}`,
        { timeout: 1000 }
      );
    });

    afterEach(async () => {
      await transport.stop();
      await new Promise<void>(resolve => {
        httpServer.close(() => resolve());
      });
    });

    it('should start and stop correctly', async () => {
      await transport.start();
      expect(mockLogger.info).toHaveBeenCalledWith('Starting HTTP transport');
      expect(mockLogger.info).toHaveBeenCalledWith('HTTP transport started');
      
      await transport.stop();
      expect(mockLogger.info).toHaveBeenCalledWith('Stopping HTTP transport');
      expect(mockLogger.info).toHaveBeenCalledWith('HTTP transport stopped');
    });

    it('should send requests and receive responses', async () => {
      await transport.start();
      
      // Set up mock response handler
      requestHandler = vi.fn().mockResolvedValue({
        jsonrpc: '2.0',
        id: 'test-id',
        result: { success: true }
      });
      
      const request: MCPRequest = {
        jsonrpc: '2.0',
        id: 'test-id',
        method: 'test.method',
        params: { test: 'value' }
      };
      
      const response = await transport.sendRequest(request);
      
      expect(response).toEqual({
        jsonrpc: '2.0',
        id: 'test-id',
        result: { success: true }
      });
      
      expect(requestHandler).toHaveBeenCalledWith(request);
    });

    it('should send notifications correctly', async () => {
      await transport.start();
      
      // Set up mock notification handler
      notificationHandler = vi.fn();
      
      const notification: MCPNotification = {
        jsonrpc: '2.0',
        method: 'test.notification',
        params: { test: 'value' }
      };
      
      await transport.sendNotification(notification);
      
      expect(notificationHandler).toHaveBeenCalledWith(notification);
    });

    it('should handle request timeouts', async () => {
      await transport.start();
      
      // Set up a handler that doesn't respond
      requestHandler = vi.fn().mockImplementation(() => {
        return new Promise(() => {
          // Never resolve
        });
      });
      
      const request: MCPRequest = {
        jsonrpc: '2.0',
        id: 'test-id',
        method: 'test.method',
        params: { test: 'value' }
      };
      
      await expect(transport.sendRequest(request)).rejects.toThrow(
        'Request timeout'
      );
    });

    it('should handle server errors', async () => {
      await transport.start();
      
      // Set up a handler that returns an error
      requestHandler = vi.fn().mockRejectedValue(new Error('Server error'));
      
      const request: MCPRequest = {
        jsonrpc: '2.0',
        id: 'test-id',
        method: 'test.method',
        params: { test: 'value' }
      };
      
      const response = await transport.sendRequest(request);
      
      expect(response).toEqual({
        jsonrpc: '2.0',
        id: 'test-id',
        error: {
          code: -32603,
          message: 'Internal error',
          data: 'Server error'
        }
      });
    });

    it('should report health status correctly', async () => {
      await transport.start();
      
      const health = await transport.getHealthStatus();
      
      expect(health).toEqual({
        healthy: true,
        metrics: {
          activeConnections: 0,
          requestsSent: 0,
          responsesReceived: 0,
          notificationsSent: 0,
        },
      });
    });

    it('should handle incoming requests when server is running', async () => {
      await transport.start();
      
      // Set up request handler on transport
      const transportRequestHandler = vi.fn().mockResolvedValue({
        jsonrpc: '2.0',
        id: 'client-id',
        result: { processed: true }
      });
      
      transport.onRequest(transportRequestHandler);
      
      // Simulate client request to transport's server
      const fetch = (await import('node-fetch')).default;
      const response = await fetch(`http://localhost:${transport.getPort()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'client-id',
          method: 'client.method',
          params: { client: 'data' }
        })
      });
      
      const responseData = await response.json();
      
      expect(responseData).toEqual({
        jsonrpc: '2.0',
        id: 'client-id',
        result: { processed: true }
      });
      
      expect(transportRequestHandler).toHaveBeenCalledWith({
        jsonrpc: '2.0',
        id: 'client-id',
        method: 'client.method',
        params: { client: 'data' }
      });
    });
  });

  describe('WebSocketTransport', () => {
    let transport: WebSocketTransport;
    let wsServer: WebSocketServer;
    let serverPort: number;
    let wsClient: any;
    let requestHandler: any;
    let notificationHandler: any;

    beforeEach(async () => {
      // Create a mock WebSocket server for testing
      const httpServer = createServer();
      wsServer = new WebSocketServer({ server: httpServer });
      
      wsServer.on('connection', ws => {
        wsClient = ws;
        
        ws.on('message', message => {
          try {
            const data = JSON.parse(message.toString());
            
            if (data.id === undefined) {
              // Notification
              if (notificationHandler) {
                notificationHandler(data);
              }
            } else {
              // Request
              if (requestHandler) {
                requestHandler(data)
                  .then(response => {
                    ws.send(JSON.stringify(response));
                  })
                  .catch(error => {
                    ws.send(JSON.stringify({
                      jsonrpc: '2.0',
                      id: data.id,
                      error: {
                        code: -32603,
                        message: 'Internal error',
                        data: error.message
                      }
                    }));
                  });
              }
            }
          } catch (error) {
            ws.send(JSON.stringify({
              jsonrpc: '2.0',
              id: 'unknown',
              error: {
                code: -32700,
                message: 'Parse error'
              }
            }));
          }
        });
        
        // Send initial connected message
        ws.send(JSON.stringify({
          jsonrpc: '2.0',
          method: 'connected'
        }));
      });
      
      // Listen on a random available port
      await new Promise<void>(resolve => {
        httpServer.listen(0, () => {
          serverPort = (httpServer.address() as any).port;
          resolve();
        });
      });
      
      transport = new WebSocketTransport(
        mockLogger,
        `ws://localhost:${serverPort}`,
        { timeout: 1000 }
      );
    });

    afterEach(async () => {
      await transport.stop();
      wsServer.close();
      await new Promise(resolve => setTimeout(resolve, 10));
    });

    it('should start and stop correctly', async () => {
      await transport.start();
      expect(mockLogger.info).toHaveBeenCalledWith('Starting WebSocket transport');
      expect(mockLogger.info).toHaveBeenCalledWith('WebSocket transport started');
      
      await transport.stop();
      expect(mockLogger.info).toHaveBeenCalledWith('Stopping WebSocket transport');
      expect(mockLogger.info).toHaveBeenCalledWith('WebSocket transport stopped');
    });

    it('should send requests and receive responses', async () => {
      await transport.start();
      
      // Set up mock response handler
      requestHandler = vi.fn().mockResolvedValue({
        jsonrpc: '2.0',
        id: 'test-id',
        result: { success: true }
      });
      
      const request: MCPRequest = {
        jsonrpc: '2.0',
        id: 'test-id',
        method: 'test.method',
        params: { test: 'value' }
      };
      
      const response = await transport.sendRequest(request);
      
      expect(response).toEqual({
        jsonrpc: '2.0',
        id: 'test-id',
        result: { success: true }
      });
      
      expect(requestHandler).toHaveBeenCalledWith(request);
    });

    it('should send notifications correctly', async () => {
      await transport.start();
      
      // Set up mock notification handler
      notificationHandler = vi.fn();
      
      const notification: MCPNotification = {
        jsonrpc: '2.0',
        method: 'test.notification',
        params: { test: 'value' }
      };
      
      await transport.sendNotification(notification);
      
      expect(notificationHandler).toHaveBeenCalledWith(notification);
    });

    it('should handle request timeouts', async () => {
      await transport.start();
      
      // Set up a handler that doesn't respond
      requestHandler = vi.fn().mockImplementation(() => {
        return new Promise(() => {
          // Never resolve
        });
      });
      
      const request: MCPRequest = {
        jsonrpc: '2.0',
        id: 'test-id',
        method: 'test.method',
        params: { test: 'value' }
      };
      
      await expect(transport.sendRequest(request)).rejects.toThrow(
        'Request timeout'
      );
    });

    it('should handle server errors', async () => {
      await transport.start();
      
      // Set up a handler that returns an error
      requestHandler = vi.fn().mockRejectedValue(new Error('Server error'));
      
      const request: MCPRequest = {
        jsonrpc: '2.0',
        id: 'test-id',
        method: 'test.method',
        params: { test: 'value' }
      };
      
      const response = await transport.sendRequest(request);
      
      expect(response).toEqual({
        jsonrpc: '2.0',
        id: 'test-id',
        error: {
          code: -32603,
          message: 'Internal error',
          data: 'Server error'
        }
      });
    });

    it('should report health status correctly', async () => {
      await transport.start();
      
      const health = await transport.getHealthStatus();
      
      expect(health).toEqual({
        healthy: true,
        metrics: {
          connected: true,
          requestsSent: 0,
          responsesReceived: 0,
          notificationsSent: 0,
        },
      });
    });

    it('should handle connection errors', async () => {
      // Create transport with invalid URL
      const invalidTransport = new WebSocketTransport(
        mockLogger,
        'ws://localhost:9999', // Non-existent port
        { timeout: 100 }
      );
      
      await expect(invalidTransport.start()).rejects.toThrow();
      expect(mockLogger.error).toHaveBeenCalledWith(
        'WebSocket connection error',
        expect.any(Error)
      );
    });

    it('should handle disconnection and reconnection', async () => {
      await transport.start();
      
      // Initially connected
      let health = await transport.getHealthStatus();
      expect(health.healthy).toBe(true);
      expect(health.metrics?.connected).toBe(true);
      
      // Simulate connection loss
      if (wsClient) {
        wsClient.close();
      }
      
      // Give time for reconnection attempt
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Should still be marked as healthy (reconnecting)
      health = await transport.getHealthStatus();
      expect(health.healthy).toBe(true);
    });

    it('should handle incoming requests when server is running', async () => {
      await transport.start();
      
      // Set up request handler on transport
      const transportRequestHandler = vi.fn().mockResolvedValue({
        jsonrpc: '2.0',
        id: 'client-id',
        result: { processed: true }
      });
      
      transport.onRequest(transportRequestHandler);
      
      // Simulate client request to transport's server
      const WebSocket = (await import('ws')).default;
      const client = new WebSocket(`ws://localhost:${transport.getPort()}`);
      
      await new Promise<void>((resolve, reject) => {
        client.on('open', () => {
          client.send(JSON.stringify({
            jsonrpc: '2.0',
            id: 'client-id',
            method: 'client.method',
            params: { client: 'data' }
          }));
        });
        
        client.on('message', (message: any) => {
          const response = JSON.parse(message.toString());
          
          expect(response).toEqual({
            jsonrpc: '2.0',
            id: 'client-id',
            result: { processed: true }
          });
          
          expect(transportRequestHandler).toHaveBeenCalledWith({
            jsonrpc: '2.0',
            id: 'client-id',
            method: 'client.method',
            params: { client: 'data' }
          });
          
          client.close();
          resolve();
        });
        
        client.on('error', reject);
      });
    });
  });
});