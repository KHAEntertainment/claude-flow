#!/usr/bin/env node

/**
 * Example Proxy MCP Server startup script
 * Demonstrates how to start the proxy server with backend connections
 */

import { ProxyServer } from '../mcp/proxy/index.js';
import { EventBus } from '../core/event-bus.js';
import { Logger } from '../core/logger.js';
import type { ProxyServerConfig } from '../mcp/proxy/proxy-server.js';

async function main() {
  // Initialize core services
  const eventBus = new EventBus();
  const logger = new Logger('ProxyServer');

  // Configure the proxy server
  const config: ProxyServerConfig = {
    transport: 'stdio',
    auth: {
      enabled: false,
      method: 'token',
    },
    loadBalancer: {
      enabled: true,
      maxRequestsPerSecond: 100,
      circuitBreakerThreshold: 10,
      circuitBreakerTimeout: 60000,
    },
    // Configure backend servers to connect to
    backendServers: [
      {
        name: 'claude-flow-backend',
        // Run TS directly via tsx (or update to built dist path if you prefer Node)
        command: 'tsx',
        args: ['src/mcp/backend/claude-flow-backend.ts'],
        env: {
          NODE_ENV: 'production',
        },
      },
      // Add more backend servers as needed
      // {
      //   name: 'another-backend',
      //   command: 'python',
      //   args: ['backend.py'],
      //   env: {},
      // },
    ],
  };

  // Create and start the proxy server
  const proxyServer = new ProxyServer(config, eventBus, logger);

  try {
    await proxyServer.start();
    logger.info('Proxy server is running. Press Ctrl+C to stop.');

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, shutting down gracefully...');
      await proxyServer.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, shutting down gracefully...');
      await proxyServer.stop();
      process.exit(0);
    });

  } catch (error) {
    logger.error('Failed to start proxy server', error);
    process.exit(1);
  }
}

// Run the main function
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}