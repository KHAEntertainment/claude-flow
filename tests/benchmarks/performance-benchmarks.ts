/**
 * Performance benchmarks for the proxy-core architecture
 * Measures context-window size, response latency, and throughput
 */

import { performance } from 'perf_hooks';
import { ProxyServer } from '../../src/mcp/proxy/proxy-server.js';
import { EventBus } from '../../src/core/event-bus.js';
import { Logger } from '../../src/core/logger.js';
import type { ProxyServerConfig } from '../../src/mcp/proxy/proxy-server.js';

interface BenchmarkResult {
  name: string;
  duration: number;
  memoryUsage: number;
  contextSize: number;
  throughput: number;
}

interface BenchmarkSuite {
  name: string;
  results: BenchmarkResult[];
  summary: {
    avgDuration: number;
    avgMemoryUsage: number;
    avgContextSize: number;
    avgThroughput: number;
  };
}

export class PerformanceBenchmarks {
  private proxyServer: ProxyServer;
  private eventBus: EventBus;
  private logger: Logger;
  private results: BenchmarkSuite[] = [];

  constructor() {
    this.eventBus = new EventBus();
    this.logger = new Logger('PerformanceBenchmarks');
  }

  async runAllBenchmarks(): Promise<BenchmarkSuite[]> {
    this.logger.info('Starting performance benchmarks...');

    // Benchmark 1: Server startup performance
    await this.benchmarkServerStartup();

    // Benchmark 2: Tool discovery performance
    await this.benchmarkToolDiscovery();

    // Benchmark 3: Tool provisioning performance
    await this.benchmarkToolProvisioning();

    // Benchmark 4: Tool execution performance
    await this.benchmarkToolExecution();

    // Benchmark 5: Memory usage under load
    await this.benchmarkMemoryUsage();

    // Benchmark 6: Context window size comparison
    await this.benchmarkContextWindowSize();

    this.logger.info('Performance benchmarks completed');
    return this.results;
  }

  private async benchmarkServerStartup(): Promise<void> {
    this.logger.info('Running server startup benchmark...');
    
    const config: ProxyServerConfig = {
      transport: 'stdio',
      auth: { enabled: false, method: 'token' },
      loadBalancer: { enabled: true, maxRequestsPerSecond: 1000 },
      backendServers: [
        {
          name: 'benchmark-backend',
          command: 'npx',
          args: ['tsx', 'src/mcp/backend/claude-flow-backend.ts'],
          env: { NODE_ENV: 'benchmark', NODE_OPTIONS: '--enable-source-maps' },
        },
      ],
    };

    const iterations = 10;
    const results: BenchmarkResult[] = [];

    for (let i = 0; i < iterations; i++) {
      const startTime = performance.now();
      const startMemory = process.memoryUsage().heapUsed;

      this.proxyServer = new ProxyServer(config, this.eventBus, this.logger);
      await this.proxyServer.start();

      const endTime = performance.now();
      const endMemory = process.memoryUsage().heapUsed;

      results.push({
        name: `server-startup-${i}`,
        duration: endTime - startTime,
        memoryUsage: endMemory - startMemory,
        contextSize: this.proxyServer.getToolRepository().getTotalTools(),
        throughput: 1, // Single server startup
      });

      await this.proxyServer.stop();
    }

    this.results.push({
      name: 'Server Startup',
      results,
      summary: this.calculateSummary(results),
    });
  }

  private async benchmarkToolDiscovery(): Promise<void> {
    this.logger.info('Running tool discovery benchmark...');
    
    const config: ProxyServerConfig = {
      transport: 'stdio',
      auth: { enabled: false, method: 'token' },
      loadBalancer: { enabled: true, maxRequestsPerSecond: 1000 },
      backendServers: [
        {
          name: 'benchmark-backend',
          command: 'npx',
          args: ['tsx', 'src/mcp/backend/claude-flow-backend.ts'],
          env: { NODE_ENV: 'benchmark', NODE_OPTIONS: '--enable-source-maps' },
        },
      ],
    };

    this.proxyServer = new ProxyServer(config, this.eventBus, this.logger);
    
    try {
      await this.proxyServer.start();

      const iterations = 50;
      const results: BenchmarkResult[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();
        const startMemory = process.memoryUsage().heapUsed;

        const discoveryService = this.proxyServer.getDiscoveryService();
        const tools = await discoveryService.discoverTools({
          query: 'file operations',
          limit: 10,
        });

        const endTime = performance.now();
        const endMemory = process.memoryUsage().heapUsed;

        results.push({
          name: `tool-discovery-${i}`,
          duration: endTime - startTime,
          memoryUsage: endMemory - startMemory,
          contextSize: tools.length,
          throughput: tools.length / ((endTime - startTime) / 1000), // tools per second
        });
      }

      this.results.push({
        name: 'Tool Discovery',
        results,
        summary: this.calculateSummary(results),
      });
    } finally {
      // Ensure proxy server is always stopped, even on error
      if (this.proxyServer) {
        await this.proxyServer.stop();
      }
    }
  }

  private async benchmarkToolProvisioning(): Promise<void> {
    this.logger.info('Running tool provisioning benchmark...');
    
    const config: ProxyServerConfig = {
      transport: 'stdio',
      auth: { enabled: false, method: 'token' },
      loadBalancer: { enabled: true, maxRequestsPerSecond: 1000 },
      backendServers: [
        {
          name: 'benchmark-backend',
          command: 'npx',
          args: ['tsx', 'src/mcp/backend/claude-flow-backend.ts'],
          env: { NODE_ENV: 'benchmark', NODE_OPTIONS: '--enable-source-maps' },
        },
      ],
    };

    this.proxyServer = new ProxyServer(config, this.eventBus, this.logger);
    
    try {
      await this.proxyServer.start();

      const iterations = 50;
      const results: BenchmarkResult[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();
        const startMemory = process.memoryUsage().heapUsed;

        const gatingService = this.proxyServer.getGatingService();
        const tools = await gatingService.provisionTools({
          query: 'file operations',
          maxTokens: 5000,
        });

        const endTime = performance.now();
        const endMemory = process.memoryUsage().heapUsed;

        results.push({
          name: `tool-provisioning-${i}`,
          duration: endTime - startTime,
          memoryUsage: endMemory - startMemory,
          contextSize: tools.length,
          throughput: tools.length / ((endTime - startTime) / 1000), // tools per second
        });
      }

      this.results.push({
        name: 'Tool Provisioning',
        results,
        summary: this.calculateSummary(results),
      });
    } finally {
      // Ensure proxy server is always stopped, even on error
      if (this.proxyServer) {
        await this.proxyServer.stop();
      }
    }
  }

  private async benchmarkToolExecution(): Promise<void> {
    this.logger.info('Running tool execution benchmark...');
    
    const config: ProxyServerConfig = {
      transport: 'stdio',
      auth: { enabled: false, method: 'token' },
      loadBalancer: { enabled: true, maxRequestsPerSecond: 1000 },
      backendServers: [
        {
          name: 'benchmark-backend',
          command: 'npx',
          args: ['tsx', 'src/mcp/backend/claude-flow-backend.ts'],
          env: { NODE_ENV: 'benchmark', NODE_OPTIONS: '--enable-source-maps' },
        },
      ],
    };

    this.proxyServer = new ProxyServer(config, this.eventBus, this.logger);
    
    try {
      await this.proxyServer.start();

      const iterations = 100;
      const results: BenchmarkResult[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();
        const startMemory = process.memoryUsage().heapUsed;

        const proxyService = this.proxyServer.getProxyService();
        const result = await proxyService.executeTool('system/info', {});

        const endTime = performance.now();
        const endMemory = process.memoryUsage().heapUsed;

        results.push({
          name: `tool-execution-${i}`,
          duration: endTime - startTime,
          memoryUsage: endMemory - startMemory,
          contextSize: 1, // Single tool execution
          throughput: 1 / ((endTime - startTime) / 1000), // executions per second
        });
      }

      this.results.push({
        name: 'Tool Execution',
        results,
        summary: this.calculateSummary(results),
      });
    } finally {
      // Ensure proxy server is always stopped, even on error
      if (this.proxyServer) {
        await this.proxyServer.stop();
      }
    }
  }

  private async benchmarkMemoryUsage(): Promise<void> {
    this.logger.info('Running memory usage benchmark...');
    
    const config: ProxyServerConfig = {
      transport: 'stdio',
      auth: { enabled: false, method: 'token' },
      loadBalancer: { enabled: true, maxRequestsPerSecond: 1000 },
      backendServers: [
        {
          name: 'benchmark-backend',
          command: 'npx',
          args: ['tsx', 'src/mcp/backend/claude-flow-backend.ts'],
          env: { NODE_ENV: 'benchmark', NODE_OPTIONS: '--enable-source-maps' },
        },
      ],
    };

    this.proxyServer = new ProxyServer(config, this.eventBus, this.logger);
    
    try {
      await this.proxyServer.start();

      const results: BenchmarkResult[] = [];
      
      // Measure memory usage at different load levels
      const loadLevels = [10, 50, 100, 200];
      
      for (const load of loadLevels) {
        const startTime = performance.now();
        const startMemory = process.memoryUsage().heapUsed;

        // Execute multiple concurrent requests
        const promises = Array.from({ length: load }, (_, i) => {
          const proxyService = this.proxyServer.getProxyService();
          return proxyService.executeTool('system/info', {});
        });

        await Promise.all(promises);

        const endTime = performance.now();
        const endMemory = process.memoryUsage().heapUsed;

        results.push({
          name: `memory-load-${load}`,
          duration: endTime - startTime,
          memoryUsage: endMemory - startMemory,
          contextSize: load,
          throughput: load / ((endTime - startTime) / 1000), // requests per second
        });
      }

      this.results.push({
        name: 'Memory Usage Under Load',
        results,
        summary: this.calculateSummary(results),
      });
    } finally {
      // Ensure proxy server is always stopped, even on error
      if (this.proxyServer) {
        await this.proxyServer.stop();
      }
    }
  }

  private async benchmarkContextWindowSize(): Promise<void> {
    this.logger.info('Running context window size benchmark...');
    
    const config: ProxyServerConfig = {
      transport: 'stdio',
      auth: { enabled: false, method: 'token' },
      loadBalancer: { enabled: true, maxRequestsPerSecond: 1000 },
      backendServers: [
        {
          name: 'benchmark-backend',
          command: 'npx',
          args: ['tsx', 'src/mcp/backend/claude-flow-backend.ts'],
          env: { NODE_ENV: 'benchmark', NODE_OPTIONS: '--enable-source-maps' },
        },
      ],
    };

    this.proxyServer = new ProxyServer(config, this.eventBus, this.logger);
    
    try {
      await this.proxyServer.start();

      const results: BenchmarkResult[] = [];
      
      // Test different provisioning sizes
      const tokenLimits = [1000, 2000, 5000, 10000, 20000];
      
      for (const maxTokens of tokenLimits) {
        const startTime = performance.now();
        const startMemory = process.memoryUsage().heapUsed;

        const gatingService = this.proxyServer.getGatingService();
        const tools = await gatingService.provisionTools({
          query: 'operations',
          maxTokens,
        });

        const endTime = performance.now();
        const endMemory = process.memoryUsage().heapUsed;

        results.push({
          name: `context-window-${maxTokens}`,
          duration: endTime - startTime,
          memoryUsage: endMemory - startMemory,
          contextSize: tools.length,
          throughput: tools.length / ((endTime - startTime) / 1000), // tools per second
        });
      }

      this.results.push({
        name: 'Context Window Size',
        results,
        summary: this.calculateSummary(results),
      });
    } finally {
      // Ensure proxy server is always stopped, even on error
      if (this.proxyServer) {
        await this.proxyServer.stop();
      }
    }
  }

  private calculateSummary(results: BenchmarkResult[]): {
    avgDuration: number;
    avgMemoryUsage: number;
    avgContextSize: number;
    avgThroughput: number;
  } {
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
    const totalMemoryUsage = results.reduce((sum, r) => sum + r.memoryUsage, 0);
    const totalContextSize = results.reduce((sum, r) => sum + r.contextSize, 0);
    const totalThroughput = results.reduce((sum, r) => sum + r.throughput, 0);

    return {
      avgDuration: totalDuration / results.length,
      avgMemoryUsage: totalMemoryUsage / results.length,
      avgContextSize: totalContextSize / results.length,
      avgThroughput: totalThroughput / results.length,
    };
  }

  generateReport(): string {
    let report = '# Performance Benchmark Report\n\n';
    
    this.results.forEach(suite => {
      report += `## ${suite.name}\n\n`;
      report += `**Average Duration:** ${suite.summary.avgDuration.toFixed(2)}ms\n`;
      report += `**Average Memory Usage:** ${(suite.summary.avgMemoryUsage / 1024 / 1024).toFixed(2)}MB\n`;
      report += `**Average Context Size:** ${suite.summary.avgContextSize.toFixed(0)} tools\n`;
      report += `**Average Throughput:** ${suite.summary.avgThroughput.toFixed(2)} ops/sec\n\n`;
      
      report += '### Detailed Results\n\n';
      report += '| Test | Duration (ms) | Memory (MB) | Context Size | Throughput (ops/sec) |\n';
      report += '|------|---------------|-------------|--------------|---------------------|\n';
      
      suite.results.forEach(result => {
        report += `| ${result.name} | ${result.duration.toFixed(2)} | ${(result.memoryUsage / 1024 / 1024).toFixed(2)} | ${result.contextSize} | ${result.throughput.toFixed(2)} |\n`;
      });
      
      report += '\n';
    });

    return report;
  }
}

// Run benchmarks if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const benchmarks = new PerformanceBenchmarks();
  
  benchmarks.runAllBenchmarks()
    .then(() => {
      console.log(benchmarks.generateReport());
      process.exit(0);
    })
    .catch(error => {
      console.error('Benchmark failed:', error);
      process.exit(1);
    });
}