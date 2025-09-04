# Tool Gating MCP - Efficient Tool Management

## What is Tool Gating MCP?

A local service that helps Claude work efficiently with unlimited MCP tools by intelligently selecting only the most relevant ones for each task. This prevents context window bloat when working with multiple MCP servers.

## Quick Start

If the Tool Gating service is running locally (http://localhost:8000), you can:

### 1. Discover Relevant Tools
Instead of loading all tools, discover what you need:
```json
POST http://localhost:8000/api/v1/tools/discover
{
    "query": "describe what tools you need in natural language",
    "tags": ["optional", "tags"],
    "limit": 10
}
```

### 2. Provision Selected Tools
Get the tools within a token budget:
```json
POST http://localhost:8000/api/v1/tools/provision
{
    "tool_ids": ["tool1", "tool2"],
    "context_tokens": 500
}
```

## Benefits

- **Use 3-5 tools instead of 100+** - Massive context savings
- **Natural language discovery** - Just describe what you need
- **Cross-server intelligence** - Best tools from all MCP servers
- **Token budget aware** - Never exceed context limits

## Example Usage

**Task**: "I need to search documentation and create a summary"
**Without Tool Gating**: Load 100+ tools from all servers
**With Tool Gating**: Load only: doc_search, read_file, write_file (3 tools)

## Common Queries

- "automate web browser" → Puppeteer tools
- "search and analyze code" → Code search + analysis tools  
- "work with GitHub" → GitHub API tools
- "read and write files" → Filesystem tools

## Server Status

Check if available: `GET http://localhost:8000/health`

When Tool Gating is available, prefer using it over manually loading MCP servers to maintain optimal context efficiency.