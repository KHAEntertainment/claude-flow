# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Tool Gating MCP is a native MCP server built with FastAPI that intelligently manages MCP (Model Context Protocol) tools to prevent context window bloat. It enables AI assistants to work efficiently with hundreds of tools by selecting only the most relevant ones for each task.

### Key Features
- **Semantic Tool Discovery**: Natural language queries find the right tools
- **Cross-Server Integration**: Seamlessly combines tools from multiple MCP servers  
- **Token Budget Management**: Stays within context limits while maximizing utility
- **Smart Ranking**: Uses embeddings + tag matching for optimal tool selection

### Why This Matters for Claude
Without tool gating, loading all available MCP tools (100+) quickly exhausts the context window. This system lets you access any tool when needed while keeping only 3-5 relevant tools active at once.

### Native MCP Server ✨
Tool Gating is a native MCP server that exposes all its endpoints as MCP tools:
- Direct integration with Claude Desktop via mcp-proxy
- Clean tool names: `discover_tools`, `provision_tools`, etc.
- Meta-level efficiency: An MCP server that manages other MCP servers
- Simplified API structure: `/api/tools/*` and `/api/mcp/*` (no versioning)

## How to Use This System

### Option 1: As an MCP Server (Recommended for Claude Desktop)
See:
@docs/MCP_NATIVE_USAGE.md

### Option 2: As HTTP API
See:
@docs/USAGE.md

## Development Commands

```bash
# Environment setup
uv venv
source .venv/bin/activate
uv sync
uv pip install -e .

# Run the application
tool-gating-mcp  # Runs on http://localhost:8000

# Run tests
pytest  # All tests pass! ✅
pytest tests/test_main.py::test_health_endpoint  # Single test

# Code quality
black .         # Format code
ruff check .    # Lint (all clean! ✅)
mypy .          # Type check
```

## Architecture

The project implements a sophisticated tool management system:

### Core Components
- **`services/discovery.py`**: Semantic search using sentence-transformers
- **`services/gating.py`**: Token budget enforcement and tool selection
- **`services/mcp_registry.py`**: MCP server configuration management
- **`models/tool.py`**: Tool definitions with MCP protocol support

### API Structure
- **`/api/tools/`**: Tool discovery and provisioning endpoints
- **`/api/mcp/`**: MCP server registration and management
- **`/mcp`**: Native MCP server endpoint (SSE transport)
- **`/health`**: Service health check

### Key Patterns
- Async/await throughout for high performance
- Pydantic models for strict validation
- Dependency injection for services
- Comprehensive error handling
- Type hints with mypy enforcement

## API Documentation

- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## Registered MCP Servers

The system comes pre-configured with several MCP servers:
- **context7**: Documentation and library search
- **exa**: Web search, research papers, social media
- **puppeteer**: Browser automation and screenshots
- **basic-memory**: Key-value storage
- **desktop-commander**: Desktop automation

## Testing

Comprehensive test suite with 59 tests covering:
- API endpoints
- Service layer logic
- Cross-server integration
- Token budget scenarios
- Semantic search accuracy

Run integration tests:
```bash
python scripts/test_integration.py
python scripts/final_integration_test.py
```

## Performance

- **Discovery**: <100ms for semantic search across hundreds of tools
- **Memory**: Efficient caching of embeddings
- **Scalability**: Handles unlimited MCP servers and tools

## Configuration

Environment variables in `.env`:
```
# Optional: For Anthropic API-based discovery
ANTHROPIC_API_KEY=your-key-here
```

## Future Enhancements

- WebSocket support for real-time tool updates
- Tool usage analytics and learning
- Custom embedding models
- Tool composition workflows