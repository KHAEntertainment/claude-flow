# Tool Gating MCP Usage Guide

## Overview

Tool Gating MCP is an intelligent proxy that sits between Claude Desktop (or other MCP clients) and multiple MCP servers. It prevents context bloat by dynamically discovering and provisioning only the most relevant tools for each task.

## How It Works

Instead of configuring 10+ MCP servers in Claude Desktop (100+ tools), you configure only Tool Gating:
1. **Single Connection**: Claude connects only to Tool Gating MCP
2. **Backend Management**: Tool Gating connects to all your MCP servers
3. **Smart Discovery**: Find tools across all servers with natural language
4. **Dynamic Provisioning**: Load only relevant tools within token budgets
5. **Transparent Execution**: Use tools as if directly connected to servers

## Key Benefits

- **Context Efficiency**: Use 3-5 relevant tools instead of 100+ 
- **Better Performance**: Reduced token usage = more room for actual work
- **Cross-Server Intelligence**: Seamlessly combines tools from multiple MCP servers
- **Semantic Understanding**: Natural language queries find the right tools

## MCP Tools Available

When using Tool Gating as an MCP server, you have access to:

### 1. `discover_tools` - Find relevant tools
```json
{
    "query": "I need to search the web and take screenshots",
    "tags": ["search", "browser"],  // Optional
    "limit": 10
}
```

### 2. `provision_tools` - Load selected tools
```json
{
    "tool_ids": ["puppeteer_screenshot", "exa_web_search"],
    "context_tokens": 500  // Token budget
}
```

### 3. `execute_tool` - Run any provisioned tool
```json
{
    "tool_id": "puppeteer_screenshot",
    "arguments": {
        "name": "homepage",
        "selector": "body"
    }
}
```

## Real-World Examples

### Example 1: Web Research Task
**Without Tool Gating**: Load 100+ tools (Puppeteer, Exa, GitHub, Slack, etc.)
**With Tool Gating**: Load only 3-4 tools (web_search, navigate, screenshot)

### Example 2: Code Analysis Task  
**Without Tool Gating**: Load all filesystem, GitHub, database tools
**With Tool Gating**: Load only relevant code analysis and file reading tools

### Example 3: Documentation Task
**Without Tool Gating**: Load every available tool
**With Tool Gating**: Load only documentation search and file writing tools

## Best Practices for AI Assistants

1. **Be Specific in Queries**: 
   - ❌ "Give me all tools"
   - ✅ "I need tools to analyze Python code and write tests"

2. **Use Tags for Precision**:
   - Common tags: `search`, `browser`, `file`, `code`, `api`, `database`
   - Combine with queries for better results

3. **Respect Token Budgets**:
   - Small tasks: 200-300 tokens
   - Medium tasks: 500-700 tokens  
   - Complex tasks: 1000+ tokens

4. **Iterate When Needed**:
   - Start with core tools
   - Discover additional tools as the task evolves

## HTTP API Endpoints (Alternative Usage)

If using Tool Gating as an HTTP API instead of MCP:

### Tool Discovery
```
POST /api/tools/discover
{
    "query": "natural language description of what you need",
    "tags": ["optional", "filtering", "tags"],
    "limit": 10
}
```

### Tool Provisioning
```
POST /api/tools/provision
{
    "tool_ids": ["tool1", "tool2", "tool3"],
    "context_tokens": 500
}
```

### MCP Server Management
```
GET /api/mcp/servers          # List all servers
POST /api/mcp/servers/register # Register new server
```

### Proxy Execution (Coming Soon)
```
POST /api/proxy/execute
{
    "tool_id": "server_toolname",
    "arguments": {...}
}
```

## Semantic Search Tips

The system uses advanced semantic search to understand intent:

- **"work with GitHub"** → finds GitHub API tools
- **"automate browser"** → finds Puppeteer tools  
- **"search and analyze"** → finds search + analysis tools
- **"read and modify files"** → finds filesystem tools

## Token Optimization

The system automatically:
- Estimates token usage for each tool
- Prioritizes high-value tools within budget
- Excludes redundant or low-relevance tools
- Maintains diversity across different servers

## Setup for Claude Desktop

1. **Start Tool Gating**:
   ```bash
   tool-gating-mcp
   ```

2. **Configure Claude Desktop** (only once):
   ```json
   {
     "mcpServers": {
       "tool-gating": {
         "command": "/path/to/mcp-proxy",
         "args": ["http://localhost:8000/mcp"]
       }
     }
   }
   ```

3. **Use Natural Language**:
   - "I need to search for research papers" → Finds academic search tools
   - "Help me automate browser tasks" → Discovers Puppeteer tools
   - "I want to work with documentation" → Locates Context7 tools

4. **Execute Seamlessly**:
   - All tool execution routes through Tool Gating automatically
   - No need to know which backend server has which tool
   - Context stays clean with only provisioned tools

This allows you to work with virtually unlimited MCP tools while maintaining peak efficiency!