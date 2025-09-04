# Essential Tool API - Core functionality for AI agents
# Includes discovery, registration, and management

import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends

from ..api.models import (
    ToolDiscoveryRequest,
    ToolDiscoveryResponse,
    ToolMatchResponse,
)
from ..models.tool import Tool
from ..services.discovery import DiscoveryService

router = APIRouter(prefix="/api/tools", tags=["tools"])


# Singleton repository instance
_tool_repository: Any = None


async def get_tool_repository() -> Any:
    """Get or create tool repository instance."""
    global _tool_repository
    if _tool_repository is None:
        from ..services.repository import InMemoryToolRepository
        from ..services.mcp_registry import MCPServerRegistry

        _tool_repository = InMemoryToolRepository()
        
        # Load tools from registered MCP servers instead of demo tools
        # This allows the system to start empty and tools to be added dynamically
        # via the MCP server registration endpoints
        
        # Optional: Pre-load some default servers
        # registry = MCPServerRegistry()
        # await registry.load_default_servers()
        
    return _tool_repository


# Dependency injection for services
async def get_discovery_service() -> DiscoveryService:
    """Get discovery service instance."""
    repo = await get_tool_repository()
    return DiscoveryService(tool_repo=repo)




@router.post("/discover", response_model=ToolDiscoveryResponse, operation_id="discover_tools")
async def discover_tools(
    request: ToolDiscoveryRequest,
    discovery_service: DiscoveryService = Depends(get_discovery_service),  # noqa: B008
) -> ToolDiscoveryResponse:
    """Discover relevant tools based on query and context."""
    tools = await discovery_service.search_tools(
        query=request.query,
        tags=request.tags,
        top_k=request.limit or 10,
    )

    # Convert to response format
    tool_matches = [
        ToolMatchResponse(
            tool_id=match.tool.id,
            name=match.tool.name,
            description=match.tool.description,
            score=match.score,
            matched_tags=match.matched_tags,
            estimated_tokens=match.tool.estimated_tokens,
            server=match.tool.server,
        )
        for match in tools
    ]

    return ToolDiscoveryResponse(
        tools=tool_matches, query_id=str(uuid.uuid4()), timestamp=datetime.now()
    )


@router.post("/register", operation_id="register_tool")
async def register_tool(
    tool: Tool,
    tool_repo: Any = Depends(get_tool_repository),  # noqa: B008
) -> dict[str, str]:
    """Register a new tool in the system.
    
    Essential for AI agents to add tools discovered from MCP servers
    or custom tools defined by users.
    """
    await tool_repo.add_tool(tool)
    return {"status": "success", "tool_id": tool.id}


@router.delete("/clear", operation_id="clear_tools")
async def clear_tools(
    tool_repo: Any = Depends(get_tool_repository),  # noqa: B008
) -> dict[str, str]:
    """Clear all tools from the repository.
    
    Useful for administrative cleanup and testing scenarios.
    """
    tool_repo._tools.clear()
    return {"status": "success", "message": "All tools cleared"}


# Note: Tool execution happens via the proxy API (/api/proxy/execute).
# Server management happens via the simplified add_server endpoint (/api/mcp/add_server).
