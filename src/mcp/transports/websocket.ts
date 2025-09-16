/**
 * WebSocket transport for MCP
 */

import { EventEmitter } from 'node:events';
import type { ITransport, RequestHandler, NotificationHandler } from './base.js';
import type { MCPRequest, MCPResponse, MCPNotification } from '../../utils/types.js';
import type { ILogger } from '../../core/logger.js';
import { MCPTransportError } from '../../utils/errors.js';

interface WebSocketTransportConfig {
  url?: string;
  reconnectAttempts?: number;
  reconnectDelay?: number;
  timeout?: number;
  queueSize?: number;
}

/**
 * WebSocket transport implementation
 */
export class WebSocketTransport implements ITransport {
  private requestHandler?: RequestHandler;
  private notificationHandler?: NotificationHandler;
  private ws?: any; // WebSocket instance
  private messageCount = 0;
  private notificationCount = 0;
  private requestCount = 0;
  private responseCount = 0;
  private running = false;
  private url: string;
  private config: WebSocketTransportConfig;
  private pendingRequests = new Map<string | number, {
    resolve: (value: MCPResponse) => void;
    reject: (error: Error) => void;
    timer?: NodeJS.Timeout;
  }>();
  constructor(
    private logger: ILogger,
    url?: string,
    config?: WebSocketTransportConfig
  ) {
    this.url = url || config?.url || 'ws://localhost:8080';
    this.config = {
      reconnectAttempts: 3,
      reconnectDelay: 1000,
      timeout: 30000,
      queueSize: 1000,
      ...config
    };
  }

  async start(): Promise<void> {
    if (this.running) {
      throw new MCPTransportError('Transport already running');
    }

    this.logger.info('Starting WebSocket transport');

    try {
      // Dynamic import of ws module
      const { default: WebSocket } = await import('ws');
      this.ws = new WebSocket(this.url);
      this.ws.on('open', () => {
        this.logger.info('WebSocket connected');
        this.running = true;
      });

      this.ws.on('message', (data: Buffer) => {
        this.processMessage(data.toString()).catch((error) => {
          this.logger.error('Error processing message', { error });
        });
      });

      this.ws.on('close', () => {
        this.logger.info('WebSocket closed');
        this.running = false;
      });

      this.ws.on('error', (error: Error) => {
        this.logger.error('WebSocket error', { error });
      });

      // Wait for connection
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new MCPTransportError('WebSocket connection timeout'));
        }, this.config.timeout || 30000);

        this.ws.once('open', () => {
          clearTimeout(timeout);
          resolve();
        });

        this.ws.once('error', (error: Error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });

      this.logger.info('WebSocket transport started');
    } catch (error) {
      throw new MCPTransportError('Failed to start WebSocket transport', { error });
    }
  }

  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    this.logger.info('Stopping WebSocket transport');

    this.running = false;

    // Clear pending requests
    for (const [id, pending] of this.pendingRequests) {
      if (pending.timer) {
        clearTimeout(pending.timer);
      }
      pending.reject(new MCPTransportError('Transport stopped'));
    }
    this.pendingRequests.clear();

    if (this.ws) {
      this.ws.close();
      this.ws = undefined;
    }

    this.logger.info('WebSocket transport stopped');
  }

  onRequest(handler: RequestHandler): void {
    this.requestHandler = handler;
  }

  onNotification(handler: NotificationHandler): void {
    this.notificationHandler = handler;
  }

  async sendRequest(request: MCPRequest): Promise<MCPResponse> {
    if (!this.running || !this.ws) {
      throw new MCPTransportError('Transport not running');
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(request.id);
        reject(new MCPTransportError('Request timeout'));
      }, this.config.timeout || 30000);

      this.pendingRequests.set(request.id, {
        resolve,
        reject,
        timer
      });

      try {
        this.ws.send(JSON.stringify(request));
        this.requestCount++;
      } catch (error) {
        this.pendingRequests.delete(request.id);
        clearTimeout(timer);
        reject(new MCPTransportError('Failed to send request', { error }));
      }
    });
  }

  async sendNotification(notification: MCPNotification): Promise<void> {
    if (!this.running || !this.ws) {
      throw new MCPTransportError('Transport not running');
    }

    try {
      this.ws.send(JSON.stringify(notification));
      this.notificationCount++;
    } catch (error) {
      throw new MCPTransportError('Failed to send notification', { error });
    }
  }

  async getHealthStatus(): Promise<{
    healthy: boolean;
    error?: string;
    metrics?: Record<string, number>;
  }> {
    return {
      healthy: this.running && this.ws?.readyState === 1, // OPEN
      metrics: {
        messagesReceived: this.messageCount,
        notificationsSent: this.notificationCount,
        requestsSent: this.requestCount,
        responsesReceived: this.responseCount,
        pendingRequests: this.pendingRequests.size,
        wsReadyState: this.ws?.readyState || 0,
      },
    };
  }

  private async processMessage(data: string): Promise<void> {
    let message: any;

    try {
      message = JSON.parse(data);

      if (!message.jsonrpc || message.jsonrpc !== '2.0') {
        throw new Error('Invalid JSON-RPC version');
      }
    } catch (error) {
      this.logger.error('Failed to parse message', { data, error });
      return;
    }

    this.messageCount++;

    // Check if this is a response to a pending request
    if (message.id !== undefined && this.pendingRequests.has(message.id)) {
      const pending = this.pendingRequests.get(message.id)!;
      this.pendingRequests.delete(message.id);
      
      if (pending.timer) {
        clearTimeout(pending.timer);
      }

      this.responseCount++;
      pending.resolve(message as MCPResponse);
      return;
    }

    // Check if this is a notification (no id field) or a request
    if (message.id === undefined) {
      // This is a notification
      await this.handleNotification(message as MCPNotification);
    } else {
      // This is a request
      await this.handleRequest(message as MCPRequest);
    }
  }

  private async handleRequest(request: MCPRequest): Promise<void> {
    if (!this.requestHandler) {
      await this.sendResponse({
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32603,
          message: 'No request handler registered',
        },
      });
      return;
    }

    try {
      const response = await this.requestHandler(request);
      await this.sendResponse(response);
    } catch (error) {
      this.logger.error('Request handler error', { request, error });

      await this.sendResponse({
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32603,
          message: 'Internal error',
          data: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  private async handleNotification(notification: MCPNotification): Promise<void> {
    if (!this.notificationHandler) {
      this.logger.warn('Received notification but no handler registered', {
        method: notification.method,
      });
      return;
    }

    try {
      await this.notificationHandler(notification);
    } catch (error) {
      this.logger.error('Notification handler error', { notification, error });
      // Notifications don't send error responses
    }
  }

  private async sendResponse(response: MCPResponse): Promise<void> {
    if (!this.ws) {
      throw new MCPTransportError('WebSocket not connected');
    }

    try {
      this.ws.send(JSON.stringify(response));
    } catch (error) {
      this.logger.error('Failed to send response', { response, error });
      throw new MCPTransportError('Failed to send response', { error });
    }
  }

  getPort(): number {
    // Extract port from URL if available
    try {
      const url = new URL(this.url);
      return parseInt(url.port) || (url.protocol === 'wss:' ? 443 : 80);
    } catch {
      return 0;
    }
  }
}
