# Migration Guide: Monolithic to Proxy-Core Architecture

## Overview

This guide helps you migrate from the monolithic claude-flow server to the new proxy-core architecture. The new architecture separates tool discovery, provisioning, and execution into distinct components, enabling intelligent tool gating and improved performance.

## Migration Steps

### Step 1: Backup Your Current Setup

Before starting the migration, create a backup of your current configuration:

```bash
# Backup current configuration
cp config/mcp.json config/mcp.json.backup
cp package.json package.json.backup

# Backup any custom tool implementations
cp -r src/tools src/tools.backup
```

### Step 2: Update Dependencies

Update your `package.json` to include the new proxy-core dependencies:

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.4",
    "claude-flow-proxy": "^1.0.0",
    "claude-flow-backend": "^1.0.0"
  },
  "scripts": {
    "start:proxy": "node dist/mcp/proxy/proxy-server.js",
    "start:backend": "node dist/mcp/backend/claude-flow-backend.js",
    "start:monolithic": "node dist/mcp/server.js"
  }
}
```

### Step 3: Create Proxy Configuration

Create a new proxy configuration file:

```typescript
// config/proxy.config.ts
import { ProxyServerConfig } from 'claude-flow-proxy';

export const proxyConfig: ProxyServerConfig = {
  transport: 'stdio',
  auth: {
    enabled: process.env.AUTH_ENABLED === 'true',
    method: 'token',
    token: process.env.AUTH_TOKEN
  },
  loadBalancer: {
    enabled: true,
    maxRequestsPerSecond: 1000
  },
  backendServers: [
    {
      name: 'main-backend',
      command: 'node',
      args: ['dist/mcp/backend/claude-flow-backend.js'],
      env: {
        NODE_ENV: process.env.NODE_ENV || 'production',
        LOG_LEVEL: process.env.LOG_LEVEL || 'info'
      }
    }
  ],
  discovery: {
    enabled: true,
    cacheTimeout: 300000, // 5 minutes
    maxToolsPerQuery: 50
  },
  gating: {
    enabled: true,
    defaultTokenLimit: 5000,
    priorityWeights: {
      relevance: 0.7,
      tokenEfficiency: 0.3
    }
  }
};
```

### Step 4: Update Client Configuration

Update your MCP client configuration to use the proxy server:

**Before (Monolithic)**
```json
{
  "mcpServers": {
    "claude-flow": {
      "command": "node",
      "args": ["dist/mcp/server.js"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

**After (Proxy Architecture)**
```json
{
  "mcpServers": {
    "claude-flow-proxy": {
      "command": "node",
      "args": ["dist/mcp/proxy/proxy-server.js"],
      "env": {
        "NODE_ENV": "production",
        "AUTH_ENABLED": "true",
        "AUTH_TOKEN": "your-secret-token"
      }
    }
  }
}
```

### Step 5: Configure Backend Server

Create backend server configuration:

```typescript
// config/backend.config.ts
import { BackendServerConfig } from 'claude-flow-backend';

export const backendConfig: BackendServerConfig = {
  name: 'main-backend',
  transport: 'stdio',
  tools: [
    // Import your existing tools
    ...require('./tools/file-tools'),
    ...require('./tools/system-tools'),
    ...require('./tools/network-tools'),
    // Add more tool categories as needed
  ],
  discovery: {
    enabled: true,
    autoRegister: true,
    metadata: {
      category: 'general-purpose',
      version: '1.0.0'
    }
  },
  execution: {
    timeout: 30000, // 30 seconds
    maxConcurrent: 10
  }
};
```

### Step 6: Update Environment Variables

Add new environment variables to your `.env` file:

```bash
# Proxy Server Configuration
PROXY_PORT=3000
PROXY_HOST=localhost
AUTH_ENABLED=true
AUTH_TOKEN=your-secret-token
LOG_LEVEL=info

# Backend Server Configuration
BACKEND_PORT=3001
BACKEND_HOST=localhost
MAX_CONCURRENT_TOOLS=10
TOOL_TIMEOUT=30000

# Performance Settings
CACHE_TIMEOUT=300000
MAX_TOOLS_PER_QUERY=50
DEFAULT_TOKEN_LIMIT=5000
```

### Step 7: Update Your Application Code

Update your application code to use the new proxy methods:

**Before (Monolithic)**
```typescript
import { MCPClient } from '@modelcontextprotocol/sdk';

const client = new MCPClient({
  serverCommand: 'node',
  serverArgs: ['dist/mcp/server.js']
});

// List all available tools (87+ tools)
const tools = await client.listTools();

// Execute a tool
const result = await client.executeTool('file/read', {
  path: 'data.txt'
});
```

**After (Proxy Architecture)**
```typescript
import { MCPClient } from '@modelcontextprotocol/sdk';

const client = new MCPClient({
  serverCommand: 'node',
  serverArgs: ['dist/mcp/proxy/proxy-server.js']
});

// 1. Discover relevant tools
const discoveredTools = await client.executeTool('discover_tools', {
  query: 'file operations',
  limit: 10
});

// 2. Provision tools within token budget
const provisionedTools = await client.executeTool('provision_tools', {
  query: 'file operations',
  maxTokens: 5000
});

// 3. Execute a provisioned tool
const result = await client.executeTool('file/read', {
  path: 'data.txt'
});
```

### Step 8: Handle Backward Compatibility

Create a compatibility layer for existing code:

```typescript
// src/compatibility/monolithic-adapter.ts
import { MCPClient } from '@modelcontextprotocol/sdk';

export class MonolithicAdapter {
  private client: MCPClient;
  private provisionedTools: any[] = [];

  constructor(client: MCPClient) {
    this.client = client;
  }

  async listTools(): Promise<any[]> {
    // Use discovery to get relevant tools
    const discovered = await this.client.executeTool('discover_tools', {
      query: 'all tools',
      limit: 100
    });
    
    return discovered.tools || [];
  }

  async executeTool(name: string, args: any): Promise<any> {
    // Check if tool is provisioned, if not provision it
    if (!this.provisionedTools.find(t => t.name === name)) {
      await this.provisionTools([name]);
    }
    
    return this.client.executeTool(name, args);
  }

  private async provisionTools(toolNames: string[]): Promise<void> {
    const provisioned = await this.client.executeTool('provision_tools', {
      query: toolNames.join(' '),
      maxTokens: 10000
    });
    
    this.provisionedTools = provisioned.tools || [];
  }
}
```

### Step 9: Testing Your Migration

Create tests to verify the migration:

```typescript
// tests/migration.test.ts
import { MonolithicAdapter } from '../src/compatibility/monolithic-adapter';
import { MCPClient } from '@modelcontextprotocol/sdk';

describe('Migration Tests', () => {
  let adapter: MonolithicAdapter;
  let client: MCPClient;

  beforeEach(() => {
    client = new MCPClient({
      serverCommand: 'node',
      serverArgs: ['dist/mcp/proxy/proxy-server.js']
    });
    adapter = new MonolithicAdapter(client);
  });

  test('should list tools using discovery', async () => {
    const tools = await adapter.listTools();
    expect(tools.length).toBeGreaterThan(0);
  });

  test('should execute tools through provisioning', async () => {
    const result = await adapter.executeTool('system/info', {});
    expect(result.success).toBe(true);
  });

  test('should handle tool not found', async () => {
    await expect(adapter.executeTool('nonexistent/tool', {}))
      .rejects.toThrow();
  });
});
```

### Step 10: Performance Validation

Run performance benchmarks to validate improvements:

```bash
# Run performance benchmarks
npm run benchmark:performance

# Compare with baseline
npm run benchmark:compare -- --baseline=monolithic --target=proxy
```

Expected improvements:
- **Context Size**: 80-90% reduction
- **Response Time**: 30-50% improvement
- **Memory Usage**: 20-40% reduction
- **Scalability**: 3-5x better throughput

## Rollback Plan

If you need to rollback to the monolithic architecture:

1. **Stop Proxy and Backend Servers**
   ```bash
   pkill -f "proxy-server.js"
   pkill -f "claude-flow-backend.js"
   ```

2. **Restore Original Configuration**
   ```bash
   cp config/mcp.json.backup config/mcp.json
   cp package.json.backup package.json
   ```

3. **Restart Monolithic Server**
   ```bash
   npm run start:monolithic
   ```

4. **Update Client Configuration**
   ```json
   {
     "mcpServers": {
       "claude-flow": {
         "command": "node",
         "args": ["dist/mcp/server.js"]
       }
     }
   }
   ```

## Common Migration Issues

### Issue 1: Backend Server Not Starting
**Solution**: Check that all tool dependencies are properly imported in the backend configuration.

### Issue 2: Proxy Can't Connect to Backend
**Solution**: Verify that the backend server is running and the connection parameters in proxy config are correct.

### Issue 3: Tools Not Discovered
**Solution**: Ensure that tools are properly registered in the backend server and discovery is enabled.

### Issue 4: Token Limit Exceeded
**Solution**: Increase the `maxTokens` parameter or use more specific queries to reduce the number of provisioned tools.

### Issue 5: Performance Degradation
**Solution**: Enable caching, optimize backend server configuration, and consider load balancing for high-traffic scenarios.

## Support and Resources

- **Documentation**: See `docs/TOOL_GATING.md` for detailed architecture information
- **Examples**: Check `examples/migration/` for complete migration examples
- **Community**: Join the claude-flow community for support and best practices
- **Issues**: Report migration issues on the GitHub repository

## Conclusion

The migration to proxy-core architecture provides significant benefits in terms of performance, scalability, and maintainability. While the migration process requires careful planning and testing, the long-term benefits outweigh the initial investment. Follow this guide step by step, test thoroughly, and monitor performance to ensure a successful migration.