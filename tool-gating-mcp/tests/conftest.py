"""
Test configuration and shared fixtures for Tool Gating MCP tests.

This module provides reusable test fixtures that represent common patterns
in MCP tool ecosystems without hardcoding specific tools.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock
from typing import Any, Dict, List
from fastapi.testclient import TestClient

from tool_gating_mcp.main import app
from tool_gating_mcp.models.tool import Tool
from tool_gating_mcp.models.mcp_config import MCPServerConfig
from tool_gating_mcp.services.repository import InMemoryToolRepository
from tool_gating_mcp.services.discovery import DiscoveryService
from tool_gating_mcp.services.mcp_client_manager import MCPClientManager
from tool_gating_mcp.services.proxy_service import ProxyService


@pytest.fixture
def client(proxy_service):
    """FastAPI test client with initialized proxy service"""
    # Initialize app state for tests
    app.state.proxy_service = proxy_service
    app.state.client_manager = proxy_service.client_manager
    return TestClient(app)


@pytest.fixture
def tool_repository():
    """Clean tool repository for testing"""
    return InMemoryToolRepository()


@pytest.fixture
def discovery_service(tool_repository):
    """Discovery service with test repository"""
    return DiscoveryService(tool_repo=tool_repository)


@pytest.fixture
def mock_client_manager():
    """Mock MCP client manager"""
    manager = AsyncMock(spec=MCPClientManager)
    manager.sessions = {}
    manager.server_tools = {}
    manager._server_info = {}
    return manager


@pytest.fixture
def proxy_service(mock_client_manager, tool_repository):
    """Proxy service with mocked dependencies"""
    return ProxyService(mock_client_manager, tool_repository)


# Generic test data representing common tool patterns
@pytest.fixture
def sample_tools():
    """Sample tools representing common patterns without specific implementations"""
    return [
        Tool(
            id="test_server_search_tool",
            name="search_tool",
            description="Search and retrieve information from external sources",
            parameters={
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search query"},
                    "limit": {"type": "integer", "default": 10}
                },
                "required": ["query"]
            },
            server="test_server",
            tags=["search", "information"],
            estimated_tokens=150
        ),
        Tool(
            id="test_server_data_tool",
            name="data_tool", 
            description="Process and manipulate data structures",
            parameters={
                "type": "object",
                "properties": {
                    "data": {"type": "object", "description": "Data to process"},
                    "operation": {"type": "string", "enum": ["filter", "transform", "aggregate"]}
                },
                "required": ["data", "operation"]
            },
            server="test_server",
            tags=["data", "processing"],
            estimated_tokens=200
        ),
        Tool(
            id="other_server_action_tool",
            name="action_tool",
            description="Perform actions in external systems",
            parameters={
                "type": "object", 
                "properties": {
                    "action": {"type": "string", "description": "Action to perform"},
                    "target": {"type": "string", "description": "Target system"}
                },
                "required": ["action"]
            },
            server="other_server",
            tags=["action", "automation"],
            estimated_tokens=120
        )
    ]


@pytest.fixture
def sample_server_configs():
    """Sample MCP server configurations for testing"""
    return {
        "test_server": MCPServerConfig(
            command="test-mcp-server",
            args=["--mode", "test"],
            env={"TEST_MODE": "true"}
        ),
        "other_server": MCPServerConfig(
            command="other-mcp-server", 
            args=[],
            env={}
        )
    }


@pytest.fixture
def populated_repository(tool_repository, sample_tools):
    """Tool repository pre-populated with sample tools"""
    async def setup():
        for tool in sample_tools:
            await tool_repository.add_tool(tool)
        return tool_repository
    
    import asyncio
    return asyncio.run(setup())


# Mock tool execution results representing common response patterns
@pytest.fixture
def mock_tool_results():
    """Mock tool execution results for different tool types"""
    return {
        "search_tool": {
            "results": [
                {"title": "Sample Result 1", "content": "Mock search result content"},
                {"title": "Sample Result 2", "content": "Another mock result"}
            ],
            "total": 2,
            "query": "test query"
        },
        "data_tool": {
            "processed_data": {"key": "value", "count": 42},
            "operation_applied": "transform",
            "success": True
        },
        "action_tool": {
            "action_performed": "test_action",
            "target_system": "test_target", 
            "status": "completed",
            "timestamp": "2024-01-01T00:00:00Z"
        }
    }


@pytest.fixture
def constraint_scenarios():
    """Test scenarios for resource constraints and limits"""
    return {
        "token_budget_scenarios": [
            {"budget": 100, "expected_tools": 0},  # Too low
            {"budget": 300, "expected_tools": 2},  # Medium
            {"budget": 1000, "expected_tools": 3}, # High - all tools
        ],
        "tool_limit_scenarios": [
            {"max_tools": 1, "expected_count": 1},
            {"max_tools": 2, "expected_count": 2}, 
            {"max_tools": 10, "expected_count": 3},  # More than available
        ]
    }


@pytest.fixture
def error_scenarios():
    """Common error scenarios for testing error handling"""
    return {
        "server_errors": [
            {"error": "ConnectionError", "message": "Server not responding"},
            {"error": "TimeoutError", "message": "Request timeout"},
            {"error": "AuthenticationError", "message": "Invalid credentials"}
        ],
        "tool_errors": [
            {"error": "ToolNotFound", "tool_id": "nonexistent_tool"},
            {"error": "InvalidArguments", "message": "Missing required parameter"},
            {"error": "ExecutionError", "message": "Tool execution failed"}
        ]
    }


@pytest.fixture(autouse=True)
async def cleanup_after_test():
    """Cleanup fixture that runs after each test"""
    # Clear repository before test
    from tool_gating_mcp.api.tools import _tool_repository
    if _tool_repository:
        _tool_repository._tools.clear()
        _tool_repository._usage_counts.clear()
    
    yield
    
    # Clear repository after test as well
    if _tool_repository:
        _tool_repository._tools.clear()
        _tool_repository._usage_counts.clear()