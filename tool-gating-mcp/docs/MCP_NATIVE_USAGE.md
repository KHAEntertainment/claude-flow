# Native MCP Usage Guide

## Overview

Tool Gating MCP is now a native MCP server that exposes all its API endpoints as MCP tools. When you run the server, it automatically provides an MCP endpoint at `/mcp` that works with Claude Desktop and other MCP clients.

## Two Ways to Use Tool Gating as MCP

### Option 1: HTTP/SSE Mode (Built-in)

When you run the Tool Gating server normally, it automatically exposes an MCP endpoint:

```bash
# Start the server
tool-gating-mcp

# MCP endpoint is now available at:
# http://localhost:8000/mcp
```

This can be used with MCP clients that support HTTP/SSE transport.

### Option 2: stdio Mode for Claude Desktop

Claude Desktop requires stdio transport. You have two options:

#### Using mcp-proxy (Recommended)

1. Install mcp-proxy:
```bash
uv tool install mcp-proxy
```

2. Add to Claude Desktop configuration:

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "tool-gating": {
      "command": "/Users/YOUR_USERNAME/.local/bin/mcp-proxy",
      "args": ["http://localhost:8000/mcp"]
    }
  }
}
```

3. Make sure Tool Gating server is running:
```bash
tool-gating-mcp
```

4. Restart Claude Desktop

Note: Replace `YOUR_USERNAME` with your actual username. The full path is required because Claude Desktop may not have access to your shell's PATH.

## Available MCP Tools

When connected as an MCP server, Tool Gating provides these tools:

### Core Tools

#### 1. `discover_tools`
Discover relevant tools based on natural language queries.

**Parameters:**
- `query` (string, required): Natural language description of what you need
- `tags` (array, optional): Filter by specific tags
- `limit` (integer, optional): Maximum results to return (default: 10)

**Example:**
```json
{
  "query": "I need to search the web and take screenshots",
  "tags": ["search", "browser"],
  "limit": 5
}
```

#### 2. `provision_tools`
Select and provision tools within a token budget.

**Parameters:**
- `tool_ids` (array, required): List of tool IDs to provision
- `context_tokens` (integer, optional): Token budget limit
- `max_tools` (integer, optional): Maximum number of tools

**Example:**
```json
{
  "tool_ids": ["puppeteer_screenshot", "exa_web_search"],
  "context_tokens": 500
}
```

### MCP Server Management

#### 3. `register_mcp_server`
Register a new MCP server with the system.

**Parameters:**
- `name` (string, required): Unique server name
- `config` (object, required): Server configuration
  - `command` (string): Command to run the server
  - `args` (array): Command arguments
  - `env` (object): Environment variables
- `description` (string, optional): Server description

**Example:**
```json
{
  "name": "github-tools",
  "config": {
    "command": "mcp-github",
    "args": ["--token", "ghp_xxx"],
    "env": {}
  },
  "description": "GitHub API integration"
}
```

#### 4. `list_mcp_servers`
List all registered MCP servers.

**Parameters:** None

#### 5. `ai_register_mcp_server`
Streamlined endpoint for AI assistants to register an MCP server with all its tools.

**Parameters:**
- `server_name` (string, required): Unique server name
- `config` (object, required): Server configuration
- `tools` (array, required): List of discovered tools

### Tool Management

#### 6. `register_tool`
Register an individual tool.

**Parameters:**
- `id` (string, required): Unique tool ID
- `name` (string, required): Tool name
- `description` (string, required): Tool description
- `parameters` (object, required): Tool parameter schema
- `tags` (array, optional): Tool tags
- `server` (string, optional): Source server name

## Usage Workflow

### Step 1: Start with Tool Gating
When Claude Desktop starts, it automatically connects to Tool Gating MCP.

### Step 2: Discover What You Need
Use `discover_tools` to find relevant tools:
```
"I need to analyze code and create documentation"
```

### Step 3: Provision Optimal Tools
Use `provision_tools` to load only what you need:
```
Provision the top 3 tools within 500 tokens
```

### Step 4: Register Additional Servers
As needed, register new MCP servers:
```
Register the "code-analysis" MCP server
```

## Benefits of Native MCP Integration

1. **Direct Protocol Access**: No HTTP overhead, direct MCP communication
2. **Automatic Tool Discovery**: Claude sees Tool Gating tools immediately
3. **Seamless Integration**: Works like any other MCP server
4. **Meta-Tool Management**: Use MCP tools to manage other MCP tools

## Advanced Configuration

### Testing the Integration

1. **Verify server is running**:
   ```bash
   curl http://localhost:8000/health
   ```

2. **Check MCP endpoint**:
   ```bash
   curl -H "Accept: text/event-stream" http://localhost:8000/mcp
   ```

3. **Test with the provided script**:
   ```bash
   python scripts/test_mcp_tools.py
   ```

## Troubleshooting

### Tools Not Appearing in Claude Desktop

1. **Check mcp-proxy path**: Claude Desktop needs the full path to mcp-proxy
   ```bash
   which mcp-proxy
   # Should show: /Users/YOUR_USERNAME/.local/bin/mcp-proxy
   ```

2. **Verify server is running**:
   ```bash
   curl http://localhost:8000/health
   ```

3. **Check Claude Desktop logs**:
   - Open Claude Desktop DevTools (Cmd+Option+I)
   - Look for MCP connection errors

### Common Issues

1. **"spawn mcp-proxy ENOENT" error**: 
   - Solution: Use full path to mcp-proxy in config
   
2. **"Address already in use" error**:
   - Solution: Kill existing process: `pkill -f tool-gating-mcp`
   
3. **Tools have verbose names**:
   - This has been fixed! Tools now have clean names like `discover_tools`

## Integration with Other MCP Servers

Tool Gating MCP is designed to work alongside other MCP servers:

1. **Initial Setup**: Only Tool Gating is loaded in Claude Desktop
2. **Dynamic Discovery**: Use Tool Gating to find relevant tools across all registered servers
3. **Selective Loading**: Provision only the tools you need for the current task
4. **Context Optimization**: Stay within token budgets while maximizing capability

### Example Workflow

1. User: "I need to search for research papers and save them"
2. Use `discover_tools` → Finds: `exa_research_paper_search`, `file_write`
3. Use `provision_tools` → Loads only these 2 tools (400 tokens vs 8000 for all)
4. Execute tasks with optimal context

This creates a dynamic, efficient tool ecosystem that adapts to your current task!