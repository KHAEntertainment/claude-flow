"""
System Flow Tests

Tests complete workflows in the Tool Gating MCP system:
- Discovery → Registration → Execution flow
- Add Server → Auto-discovery → Usage flow  
- Tool lifecycle management
- End-to-end integration scenarios

These tests focus on the system's ability to handle complete workflows
rather than testing individual components in isolation.
"""

import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient


class TestDiscoveryToExecutionFlow:
    """Test the complete discovery → execution workflow"""

    @pytest.mark.asyncio
    async def test_discover_register_execute_flow(self, client, sample_tools, mock_tool_results):
        """Test complete flow: discover tools → register missing ones → execute"""
        
        # 1. Start with empty repository - discovery returns no results
        response = client.post("/api/tools/discover", json={
            "query": "search for information",
            "limit": 5
        })
        assert response.status_code == 200
        initial_results = response.json()
        assert len(initial_results["tools"]) == 0
        
        # 2. Register a search tool
        search_tool = sample_tools[0]  # search_tool
        response = client.post("/api/tools/register", json=search_tool.model_dump())
        assert response.status_code == 200
        assert response.json()["status"] == "success"
        
        # 3. Now discovery should find the tool
        response = client.post("/api/tools/discover", json={
            "query": "search for information", 
            "limit": 5
        })
        assert response.status_code == 200
        discovery_results = response.json()
        assert len(discovery_results["tools"]) == 1
        found_tool = discovery_results["tools"][0]
        assert found_tool["name"] == "search_tool"
        assert found_tool["score"] > 0.5  # Should be relevant

        # 4. Execute the discovered tool via proxy
        with patch('tool_gating_mcp.services.proxy_service.ProxyService.execute_tool') as mock_execute:
            mock_execute.return_value = mock_tool_results["search_tool"]
            
            response = client.post("/api/proxy/execute", json={
                "tool_id": search_tool.id,
                "arguments": {"query": "test search", "limit": 5}
            })
            
            assert response.status_code == 200
            result = response.json()["result"]
            assert "results" in result
            assert len(result["results"]) == 2
            mock_execute.assert_called_once()

    @pytest.mark.asyncio 
    async def test_multi_tool_discovery_and_selection(self, client, sample_tools):
        """Test discovering and working with multiple related tools"""
        
        # Register multiple tools
        for tool in sample_tools:
            response = client.post("/api/tools/register", json=tool.model_dump())
            assert response.status_code == 200
        
        # Discover tools for data processing task
        response = client.post("/api/tools/discover", json={
            "query": "process and analyze data",
            "limit": 10
        })
        assert response.status_code == 200
        results = response.json()
        
        # Should find relevant tools, with data_tool scoring highest
        tool_names = [tool["name"] for tool in results["tools"]]
        assert "data_tool" in tool_names
        
        # Verify tools are ranked by relevance
        scores = [tool["score"] for tool in results["tools"]]
        assert scores == sorted(scores, reverse=True)


class TestAddServerFlow:
    """Test the add server → auto-discovery → usage workflow"""

    @pytest.mark.asyncio
    async def test_add_server_with_auto_discovery(self, client, sample_server_configs):
        """Test adding a server automatically discovers and registers its tools"""
        
        server_config = sample_server_configs["test_server"]
        
        # Mock the client manager to simulate successful connection and tool discovery
        with patch('tool_gating_mcp.main.app.state.client_manager') as mock_manager:
            mock_manager.connect_server = AsyncMock()
            mock_manager.server_tools = {
                "test_server": [
                    type('MockTool', (), {
                        'name': 'discovered_tool_1',
                        'description': 'Auto-discovered tool from server',
                        'inputSchema': {'type': 'object', 'properties': {}}
                    })(),
                    type('MockTool', (), {
                        'name': 'discovered_tool_2', 
                        'description': 'Another auto-discovered tool',
                        'inputSchema': {'type': 'object', 'properties': {}}
                    })()
                ]
            }
            
            # Add server - should auto-discover tools
            response = client.post("/api/mcp/add_server", json={
                "name": "test_server",
                "config": server_config.model_dump(),
                "description": "Test server for auto-discovery"
            })
            
            assert response.status_code == 200
            result = response.json()
            assert result["status"] == "success"
            assert "test_server" in result["message"]
            assert result["total_tools"] == 2
            assert "discovered_tool_1" in result["tools_discovered"]
            assert "discovered_tool_2" in result["tools_discovered"]
            
            # Verify tools were auto-registered and can be discovered
            discovery_response = client.post("/api/tools/discover", json={
                "query": "discovered tool functionality",
                "limit": 5
            })
            assert discovery_response.status_code == 200
            discovered = discovery_response.json()["tools"]
            discovered_names = [tool["name"] for tool in discovered]
            assert "discovered_tool_1" in discovered_names
            assert "discovered_tool_2" in discovered_names

    @pytest.mark.asyncio
    async def test_add_multiple_servers_cross_discovery(self, client, sample_server_configs):
        """Test that tools from multiple servers can be discovered together"""
        
        # Mock multiple servers with different tools
        mock_servers = {
            "server_a": [
                type('MockTool', (), {
                    'name': 'search_web',
                    'description': 'Search the web for information',
                    'inputSchema': {'type': 'object'}
                })()
            ],
            "server_b": [
                type('MockTool', (), {
                    'name': 'analyze_data',
                    'description': 'Analyze data patterns', 
                    'inputSchema': {'type': 'object'}
                })()
            ]
        }
        
        with patch('tool_gating_mcp.main.app.state.client_manager') as mock_manager:
            mock_manager.connect_server = AsyncMock()
            
            # Add first server
            mock_manager.server_tools = {"server_a": mock_servers["server_a"]}
            response = client.post("/api/mcp/add_server", json={
                "name": "server_a",
                "config": sample_server_configs["test_server"].model_dump()
            })
            assert response.status_code == 200
            
            # Add second server  
            mock_manager.server_tools = {"server_b": mock_servers["server_b"]}
            response = client.post("/api/mcp/add_server", json={
                "name": "server_b", 
                "config": sample_server_configs["other_server"].model_dump()
            })
            assert response.status_code == 200
            
            # Discovery should find tools from both servers
            response = client.post("/api/tools/discover", json={
                "query": "search and analyze information",
                "limit": 10
            })
            assert response.status_code == 200
            results = response.json()["tools"]
            
            tool_names = [tool["name"] for tool in results]
            servers = {tool["server"] for tool in results}
            
            # Should have tools from both servers
            assert len(servers) == 2
            assert "server_a" in servers
            assert "server_b" in servers


class TestToolLifecycleManagement:
    """Test complete tool lifecycle: registration → discovery → usage → cleanup"""

    @pytest.mark.asyncio
    async def test_complete_tool_lifecycle(self, client, sample_tools, mock_tool_results):
        """Test full lifecycle from registration to cleanup"""
        
        # 1. Start with empty state
        response = client.post("/api/tools/discover", json={"query": "any tool"})
        assert len(response.json()["tools"]) == 0
        
        # 2. Register tools  
        for tool in sample_tools:
            response = client.post("/api/tools/register", json=tool.model_dump())
            assert response.status_code == 200
        
        # 3. Verify discovery finds tools
        response = client.post("/api/tools/discover", json={"query": "search"})
        assert len(response.json()["tools"]) > 0
        
        # 4. Use tools via execution
        with patch('tool_gating_mcp.services.proxy_service.ProxyService.execute_tool') as mock_execute:
            mock_execute.return_value = mock_tool_results["search_tool"]
            
            response = client.post("/api/proxy/execute", json={
                "tool_id": "test_server_search_tool",
                "arguments": {"query": "test"}
            })
            assert response.status_code == 200
        
        # 5. Clean up all tools
        response = client.delete("/api/tools/clear")
        assert response.status_code == 200
        assert response.json()["status"] == "success"
        
        # 6. Verify tools are gone
        response = client.post("/api/tools/discover", json={"query": "search"})
        assert len(response.json()["tools"]) == 0

    @pytest.mark.asyncio
    async def test_tool_update_workflow(self, client, sample_tools):
        """Test updating tool capabilities by re-registration"""
        
        # Register initial tool
        original_tool = sample_tools[0]
        response = client.post("/api/tools/register", json=original_tool.model_dump())
        assert response.status_code == 200
        
        # Update tool with enhanced description
        updated_tool_data = original_tool.model_dump()
        updated_tool_data["description"] = "Enhanced search tool with advanced capabilities and filtering"
        updated_tool_data["tags"] = ["search", "information", "advanced", "filtering"]
        
        # Re-register (should update existing)
        response = client.post("/api/tools/register", json=updated_tool_data)
        assert response.status_code == 200
        
        # Verify discovery uses updated information
        response = client.post("/api/tools/discover", json={
            "query": "advanced filtering capabilities"
        })
        assert response.status_code == 200
        results = response.json()["tools"]
        
        # Should find the tool with higher relevance due to updated description
        assert len(results) > 0
        found_tool = results[0]
        assert "advanced" in found_tool["description"].lower()
        assert "filtering" in found_tool["matched_tags"]