"""Simplified MCP Server Management - Essential functionality only"""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..models.mcp_config import MCPServerConfig, MCPServerRegistration
from ..services.mcp_registry import MCPDiscoveryService, MCPServerRegistry
from .tools import get_tool_repository

router = APIRouter(prefix="/api/mcp", tags=["mcp"])

# Singleton registry instance
_mcp_registry: MCPServerRegistry | None = None


def get_mcp_registry() -> MCPServerRegistry:
    """Get or create MCP registry instance"""
    global _mcp_registry
    if _mcp_registry is None:
        _mcp_registry = MCPServerRegistry()
    return _mcp_registry


async def get_discovery_service() -> MCPDiscoveryService:
    """Get discovery service instance"""
    repo = await get_tool_repository()
    return MCPDiscoveryService(tool_repo=repo)


class AddServerRequest(BaseModel):
    """Request to add a new MCP server with auto-discovery"""
    name: str
    config: MCPServerConfig
    description: str | None = None


@router.post("/add_server", operation_id="add_server")
async def add_server(
    request: AddServerRequest,
    registry: MCPServerRegistry = Depends(get_mcp_registry),  # noqa: B008
    discovery: MCPDiscoveryService = Depends(get_discovery_service),  # noqa: B008
) -> dict[str, Any]:
    """
    Add a new MCP server with automatic tool discovery.
    
    This is the essential endpoint for AI agents to expand capabilities.
    It combines server registration + tool discovery in one step.
    """
    try:
        # Register the server
        registration = MCPServerRegistration(
            name=request.name,
            config=request.config,
            description=request.description or f"MCP server: {request.name}",
            estimated_tools=10
        )
        
        server_result = await registry.register_server(registration)
        
        if server_result["status"] != "success":
            return server_result
        
        # Auto-discover and register tools
        from ..main import app
        if hasattr(app.state, "client_manager"):
            client_manager = app.state.client_manager
            await client_manager.connect_server(request.name, request.config.model_dump())
            
            # Register tools in repository
            tools = client_manager.server_tools.get(request.name, [])
            registered_tools = []
            
            for tool in tools:
                try:
                    from ..models.tool import Tool
                    tool_model = Tool(
                        id=f"{request.name}_{getattr(tool, 'name', 'unknown')}",
                        name=getattr(tool, 'name', 'unknown'),
                        description=getattr(tool, 'description', 'No description available'),
                        parameters=getattr(tool, 'inputSchema', getattr(tool, 'parameters', {})),
                        server=request.name,
                        tags=[],
                        estimated_tokens=100
                    )
                    await discovery.tool_repo.add_tool(tool_model)
                    registered_tools.append(getattr(tool, 'name', 'unknown'))
                except Exception:
                    # Continue with other tools if one fails
                    pass
            
            return {
                "status": "success",
                "message": f"Added {request.name} with {len(registered_tools)} tools",
                "server": request.name,
                "tools_discovered": registered_tools,
                "total_tools": len(registered_tools)
            }
        else:
            return {
                "status": "success", 
                "message": f"Server {request.name} registered (tool discovery pending initialization)",
                "server": request.name
            }
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to add server: {str(e)}")


# Note: Simplified to essential server management only.
# AI agents use add_server to expand capabilities with automatic tool discovery.
