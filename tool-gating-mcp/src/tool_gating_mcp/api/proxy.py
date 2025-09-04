"""Proxy API endpoints for tool execution"""

from fastapi import APIRouter, Depends, HTTPException
from typing import Any, Dict
from pydantic import BaseModel

from ..services.proxy_service import ProxyService


router = APIRouter(prefix="/api/proxy", tags=["proxy"])


class ExecuteToolRequest(BaseModel):
    """Request model for tool execution"""
    tool_id: str
    arguments: Dict[str, Any]


class ExecuteToolResponse(BaseModel):
    """Response model for tool execution"""
    result: Any


async def get_proxy_service() -> ProxyService:
    """Get proxy service from app state
    
    Returns:
        ProxyService instance
        
    Raises:
        HTTPException: If proxy service not initialized
    """
    from ..main import app
    if not hasattr(app.state, "proxy_service"):
        raise HTTPException(status_code=500, detail="Proxy service not initialized")
    return app.state.proxy_service


# Tool execution info endpoint removed - not essential for AI agents
# The execute endpoint provides all necessary functionality


@router.post("/execute", response_model=ExecuteToolResponse, operation_id="execute_tool")
async def execute_tool(
    request: ExecuteToolRequest,
    proxy_service: ProxyService = Depends(get_proxy_service)
) -> ExecuteToolResponse:
    """Execute a tool through the proxy (no provisioning required)
    
    Args:
        request: Tool execution request with tool_id and arguments
        proxy_service: Injected proxy service
        
    Returns:
        Tool execution result
        
    Raises:
        HTTPException: On execution errors
    """
    try:
        result = await proxy_service.execute_tool(
            request.tool_id,
            request.arguments
        )
        return ExecuteToolResponse(result=result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Tool execution failed: {str(e)}")