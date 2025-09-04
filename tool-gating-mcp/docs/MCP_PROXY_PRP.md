name: "MCP Proxy Implementation"
description: |

## Goal

Transform Tool Gating MCP into an intelligent proxy/router that enables Claude Desktop and other MCP clients to dynamically discover and use tools from multiple MCP servers while maintaining a single connection point and optimizing context usage.

## Why

- **Claude Desktop Limitation**: MCP clients load all servers at startup and cannot dynamically add servers during conversations, leading to context bloat when using multiple servers
- **Context Optimization**: Loading 100+ tools from multiple servers exhausts the context window - we need intelligent selection
- **Single Connection Point**: Users shouldn't need to configure dozens of MCP servers in Claude Desktop
- **Dynamic Tool Discovery**: AI assistants need to find and use the right tools for each task without manual configuration
- **Existing Solutions Gap**: Neither mcp-proxy-server (aggregates everything) nor LangChain (client library only) provide intelligent tool selection

## What

Tool Gating MCP will act as an intelligent proxy between MCP clients and multiple backend MCP servers:

- **Core Functionality**:
  - Maintain persistent connections to multiple MCP servers via stdio
  - Discover and index all available tools across servers
  - Expose intelligent tool discovery via semantic search
  - Route tool execution requests to appropriate backend servers
  - Manage tool provisioning within token budgets

- **Key Components**:
  - MCP Client Manager: Handles connections to backend servers
  - Proxy Service: Routes tool calls and manages provisioning
  - Enhanced Tool Repository: Stores tools from all connected servers
  - Execute Tool MCP endpoint: Single entry point for all tool execution

- **User Interactions**:
  1. Claude Desktop connects only to Tool Gating MCP
  2. User asks for capabilities (e.g., "I need to search the web")
  3. Tool Gating discovers relevant tools across all servers
  4. User provisions selected tools within token budget
  5. User executes tools seamlessly through Tool Gating proxy

## Endpoints/APIs to Implement

**execute_tool** – MCP Tool (via fastapi-mcp) – Execute a provisioned tool on the appropriate backend server

- Params:
  - `tool_id` (string): ID of the tool to execute (format: "server_toolname")
  - `arguments` (dict): Tool-specific arguments
- Success response: Tool execution result from backend server
- Failure response: Error details with server context

**POST /api/proxy/execute** – HTTP endpoint for direct proxy testing

- Params:
  - `tool_id` (string): ID of the tool to execute
  - `arguments` (dict): Tool-specific arguments
- Success response: `{"result": <tool_output>}`
- Failure response: `{"detail": "error message"}` (400)

## Current Directory Structure

```
src/tool_gating_mcp/
├── __init__.py
├── api/
│   ├── __init__.py
│   ├── mcp.py          # MCP server management endpoints
│   ├── models.py       # API models
│   └── tools.py        # Tool discovery and provisioning
├── config.py           # Configuration settings
├── main.py            # FastAPI app and MCP server setup
├── models/
│   ├── __init__.py
│   ├── mcp_config.py  # MCP configuration models
│   └── tool.py        # Tool model definition
└── services/
    ├── __init__.py
    ├── discovery.py    # Semantic search service
    ├── gating.py      # Token budget management
    ├── mcp_connector.py # Unused legacy connector
    ├── mcp_registry.py  # MCP server registry
    └── repository.py    # In-memory tool storage
```

## Proposed Directory Structure

```
src/tool_gating_mcp/
├── __init__.py
├── api/
│   ├── __init__.py
│   ├── mcp.py          # Existing MCP server management
│   ├── models.py       # Existing API models
│   ├── proxy.py        # NEW: Proxy execution endpoints
│   └── tools.py        # Existing tool discovery
├── config.py           # UPDATE: Add MCP_SERVERS config
├── main.py            # UPDATE: Add proxy initialization
├── models/
│   ├── __init__.py
│   ├── mcp_config.py  # Existing config models
│   └── tool.py        # Existing tool model
└── services/
    ├── __init__.py
    ├── discovery.py    # Existing semantic search
    ├── gating.py      # Existing token management
    ├── mcp_client_manager.py # NEW: Manages MCP connections
    ├── mcp_registry.py  # Existing server registry
    ├── proxy_service.py # NEW: Tool routing logic
    └── repository.py    # Existing tool storage
```

## Files to Reference

- `/Users/andremachon/Projects/tool-gating-mcp/src/tool_gating_mcp/services/repository.py` (read_only) - Pattern for service initialization and tool storage
- `/Users/andremachon/Projects/tool-gating-mcp/src/tool_gating_mcp/models/tool.py` (read_only) - Tool model structure to maintain compatibility
- `/Users/andremachon/Projects/tool-gating-mcp/src/tool_gating_mcp/api/tools.py` (read_only) - Existing tool API patterns and dependency injection
- `https://github.com/modelcontextprotocol/python-sdk` (read_only) - MCP Python SDK documentation for ClientSession and StdioClientTransport
- `https://github.com/langchain-ai/langchain/blob/master/libs/partners/mcp/langchain_mcp/client.py` (read_only) - Reference implementation for MCP client connections

## Files to Implement (concept)

### MCP Client Management

1. `src/tool_gating_mcp/services/mcp_client_manager.py` - Manages connections to backend MCP servers

```python
import asyncio
from typing import Dict, List, Any, Optional
from contextlib import asynccontextmanager
from mcp import ClientSession, StdioClientTransport
from mcp.client.stdio import stdio_client
from ..models.tool import Tool

class MCPClientManager:
    """Manages connections to multiple MCP servers via stdio transport"""
    
    def __init__(self):
        self.sessions: Dict[str, ClientSession] = {}
        self.transports: Dict[str, StdioClientTransport] = {}
        self.server_tools: Dict[str, List[Any]] = {}
        self._active_sessions: Dict[str, Any] = {}
    
    async def connect_server(self, name: str, config: dict) -> None:
        """Connect to an MCP server and discover its tools"""
        try:
            # Create stdio client connection
            client = stdio_client(
                server_command=config["command"],
                server_args=config.get("args", []),
                server_env=config.get("env", {})
            )
            
            # Use context manager for proper lifecycle
            async with client as (read_stream, write_stream):
                # Create and initialize session
                async with ClientSession(read_stream, write_stream) as session:
                    await session.initialize()
                    
                    # Discover tools
                    tools_result = await session.list_tools()
                    self.server_tools[name] = tools_result.tools
                    
                    # Store active session
                    self._active_sessions[name] = {
                        "client": client,
                        "session": session,
                        "read_stream": read_stream,
                        "write_stream": write_stream
                    }
                    
        except Exception as e:
            raise Exception(f"Failed to connect to {name}: {str(e)}")
    
    async def execute_tool(self, server_name: str, tool_name: str, arguments: dict) -> Any:
        """Execute a tool on a specific server"""
        if server_name not in self._active_sessions:
            raise ValueError(f"Server {server_name} not connected")
        
        session = self._active_sessions[server_name]["session"]
        result = await session.call_tool(tool_name, arguments)
        return result
    
    async def disconnect_all(self) -> None:
        """Disconnect all active sessions"""
        for name in list(self._active_sessions.keys()):
            await self.disconnect_server(name)
    
    async def disconnect_server(self, name: str) -> None:
        """Disconnect a specific server"""
        if name in self._active_sessions:
            # Sessions are cleaned up by context managers
            del self._active_sessions[name]
            if name in self.server_tools:
                del self.server_tools[name]
```

2. `src/tool_gating_mcp/services/proxy_service.py` - Handles tool routing and execution

```python
from typing import Dict, Any, Set, Optional
from ..models.tool import Tool
from .mcp_client_manager import MCPClientManager
from .repository import InMemoryToolRepository

class ProxyService:
    """Manages proxy operations for tool execution across MCP servers"""
    
    def __init__(
        self, 
        client_manager: MCPClientManager,
        tool_repository: InMemoryToolRepository
    ):
        self.client_manager = client_manager
        self.tool_repository = tool_repository
        self.provisioned_tools: Set[str] = set()
    
    async def discover_all_tools(self) -> None:
        """Discover and index tools from all connected servers"""
        for server_name, tools in self.client_manager.server_tools.items():
            for tool in tools:
                # Convert MCP tool to our Tool model
                tool_obj = Tool(
                    id=f"{server_name}_{tool.name}",
                    name=tool.name,
                    description=tool.description or "",
                    parameters=tool.inputSchema or {},
                    server=server_name,
                    tags=self._extract_tags(tool.description),
                    estimated_tokens=self._estimate_tokens(tool)
                )
                await self.tool_repository.add_tool(tool_obj)
    
    def provision_tool(self, tool_id: str) -> None:
        """Mark a tool as provisioned for use"""
        self.provisioned_tools.add(tool_id)
    
    def unprovision_tool(self, tool_id: str) -> None:
        """Remove a tool from provisioned set"""
        self.provisioned_tools.discard(tool_id)
    
    def is_provisioned(self, tool_id: str) -> bool:
        """Check if a tool is provisioned"""
        return tool_id in self.provisioned_tools
    
    async def execute_tool(self, tool_id: str, arguments: dict) -> Any:
        """Execute a provisioned tool via proxy"""
        if not self.is_provisioned(tool_id):
            raise ValueError(f"Tool {tool_id} not provisioned. Use provision_tools first.")
        
        # Parse server and tool name from ID
        if '_' not in tool_id:
            raise ValueError(f"Invalid tool ID format: {tool_id}")
        
        server_name, tool_name = tool_id.split('_', 1)
        
        # Execute via client manager
        return await self.client_manager.execute_tool(server_name, tool_name, arguments)
    
    def _extract_tags(self, description: Optional[str]) -> List[str]:
        """Extract tags from tool description"""
        if not description:
            return []
        
        # Simple tag extraction - can be enhanced
        tags = []
        keywords = ["search", "web", "browser", "file", "code", "api", "data"]
        desc_lower = description.lower()
        
        for keyword in keywords:
            if keyword in desc_lower:
                tags.append(keyword)
        
        return tags
    
    def _estimate_tokens(self, tool: Any) -> int:
        """Estimate token count for a tool"""
        # Simple estimation based on description and schema size
        desc_tokens = len(str(tool.description or "").split()) * 1.3
        schema_tokens = len(str(tool.inputSchema or {}).split()) * 1.3
        return int(desc_tokens + schema_tokens + 50)  # Base overhead
```

### API Endpoints

3. `src/tool_gating_mcp/api/proxy.py` - REST API for proxy operations

```python
from fastapi import APIRouter, Depends, HTTPException
from typing import Any, Dict
from pydantic import BaseModel

from ..services.proxy_service import ProxyService

router = APIRouter(prefix="/api/proxy", tags=["proxy"])

class ExecuteToolRequest(BaseModel):
    tool_id: str
    arguments: Dict[str, Any]

# Dependency injection helper
async def get_proxy_service() -> ProxyService:
    """Get proxy service from app state"""
    from ..main import app
    if not hasattr(app.state, "proxy_service"):
        raise HTTPException(status_code=500, detail="Proxy service not initialized")
    return app.state.proxy_service

@router.post("/execute")
async def execute_tool(
    request: ExecuteToolRequest,
    proxy_service: ProxyService = Depends(get_proxy_service)
) -> Dict[str, Any]:
    """Execute a tool through the proxy"""
    try:
        result = await proxy_service.execute_tool(
            request.tool_id,
            request.arguments
        )
        return {"result": result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Tool execution failed: {str(e)}")
```

### Core Updates

4. `src/tool_gating_mcp/config.py` - Add MCP server configurations

```python
# ... existing imports ...

# MCP Server Configurations
MCP_SERVERS = {
    "puppeteer": {
        "command": "mcp-server-puppeteer",
        "args": [],
        "description": "Browser automation and web scraping",
        "env": {}
    },
    "filesystem": {
        "command": "mcp-server-filesystem",
        "args": ["--root", "/tmp/mcp-workspace"],
        "description": "File system operations",
        "env": {}
    },
    # Start with simple servers that don't require auth
    # Additional servers can be added later
}

# ... rest of existing config ...
```

5. `src/tool_gating_mcp/main.py` - Add proxy initialization and MCP tool

```python
# ... existing imports ...
from .services.mcp_client_manager import MCPClientManager
from .services.proxy_service import ProxyService
from .api import proxy
from .config import MCP_SERVERS

# ... existing app setup ...

# Add startup event for proxy initialization
@app.on_event("startup")
async def startup_event():
    """Initialize proxy components on startup"""
    try:
        # Initialize client manager
        client_manager = MCPClientManager()
        
        # Connect to configured servers
        for server_name, config in MCP_SERVERS.items():
            try:
                await client_manager.connect_server(server_name, config)
                logger.info(f"Connected to MCP server: {server_name}")
            except Exception as e:
                logger.error(f"Failed to connect to {server_name}: {e}")
        
        # Get tool repository
        tool_repository = await get_tool_repository()
        
        # Initialize proxy service
        proxy_service = ProxyService(client_manager, tool_repository)
        await proxy_service.discover_all_tools()
        
        # Store in app state for dependency injection
        app.state.client_manager = client_manager
        app.state.proxy_service = proxy_service
        
        logger.info("Proxy initialization complete")
        
    except Exception as e:
        logger.error(f"Startup failed: {e}")
        raise

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    if hasattr(app.state, "client_manager"):
        await app.state.client_manager.disconnect_all()

# Add proxy router
app.include_router(proxy.router)

# ... existing routes ...

# Create MCP server after all routes (including proxy)
mcp_server = FastApiMCP(
    app,
    name="tool-gating",
    description=(
        "Intelligently manage MCP tools to prevent context bloat. "
        "Discover and provision only the most relevant tools for each task."
    )
)

# Add execute_tool as MCP tool before mounting
@mcp_server.tool()
async def execute_tool(tool_id: str, arguments: dict) -> Any:
    """Execute a provisioned tool on the appropriate MCP server.
    
    This is the main entry point for using tools discovered and provisioned
    through Tool Gating. The tool must be provisioned first using provision_tools.
    
    Args:
        tool_id: The tool identifier (format: "servername_toolname")
        arguments: Tool-specific arguments as required by the tool
        
    Returns:
        The result from the tool execution
        
    Raises:
        ValueError: If tool is not provisioned or server is not connected
    """
    if not hasattr(app.state, "proxy_service"):
        raise ValueError("Proxy service not initialized")
    
    return await app.state.proxy_service.execute_tool(tool_id, arguments)

# Mount the MCP server
mcp_server.mount()
```

## Implementation Notes

### MCP Client Connections

- Use the MCP Python SDK's stdio client for server connections
- Maintain persistent connections throughout app lifecycle
- Handle connection failures gracefully with proper error messages
- Use async context managers for proper resource cleanup

### Tool ID Format

- Tool IDs follow the format: `{server_name}_{tool_name}`
- This allows unique identification across servers
- Parse carefully to handle tools with underscores in names

### Provisioning Integration

- Integrate with existing provisioning system in `services/gating.py`
- Only provisioned tools can be executed (security/context management)
- Update provision_tools endpoint to handle proxy tools

### Error Handling

- Provide clear error messages that identify which server failed
- Distinguish between connection errors and execution errors
- Log errors for debugging while returning user-friendly messages

## Validation Gates

- All unit tests pass: `pytest tests/`
- Integration test confirms tool discovery from multiple servers
- Execute tool successfully routes to correct backend server
- Claude Desktop can discover and execute tools via Tool Gating
- Context usage reduced by 90%+ vs loading all servers directly
- Tool execution latency < 100ms overhead
- Type checking passes: `mypy src/`
- Code formatting: `black . && ruff check .`

## Implementation Checkpoints/Testing

### 1. MCP Client Connection

- Implement MCPClientManager with basic stdio connection
- Test connection to single server (puppeteer)
- Verify tool discovery populates server_tools
- Command: `python -c "from src.tool_gating_mcp.services.mcp_client_manager import MCPClientManager; ..."`

### 2. Tool Discovery Integration

- Implement ProxyService.discover_all_tools
- Verify tools appear in repository with correct IDs
- Test semantic search finds proxy tools
- Command: `curl http://localhost:8000/api/tools/discover?query=screenshot`

### 3. Tool Execution

- Implement execute_tool in ProxyService
- Add execute_tool MCP endpoint
- Test execution routes to correct server
- Command: `curl -X POST http://localhost:8000/api/proxy/execute -d '{"tool_id": "puppeteer_screenshot", "arguments": {}}'`

### 4. Claude Desktop Integration

- Configure Claude Desktop with Tool Gating only
- Verify execute_tool appears as available tool
- Test full workflow: discover → provision → execute
- Verify context savings vs direct server loading

## Other Considerations

- **Security**: Tool IDs could be spoofed - validate against known tools
- **Performance**: Connection startup adds latency - mitigate with parallel connections
- **Scalability**: Each server connection uses resources - monitor and set limits
- **Compatibility**: MCP SDK version must match server expectations
- **Error Recovery**: Servers may disconnect - implement reconnection logic
- **Authentication**: Phase 1 focuses on no-auth servers, Phase 2 will add API key support
- **Caching**: Tool discovery results can be cached to improve performance
- **Logging**: Comprehensive logging for debugging proxy operations

---

## Success Metrics

- Single Tool Gating connection replaces 5+ server connections in Claude Desktop
- Tool discovery returns relevant results in <100ms
- Tool execution adds <50ms latency vs direct connection
- 90%+ reduction in context tokens used
- Zero configuration changes needed in Claude Desktop after initial setup