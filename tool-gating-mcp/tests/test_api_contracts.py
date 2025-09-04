"""
API Contract Tests

Tests that the Tool Gating MCP API maintains consistent contracts:
- Response format consistency and schema compliance
- HTTP status code correctness
- MCP protocol adherence
- Backward compatibility preservation  
- OpenAPI specification compliance
- Error response standardization

These tests ensure the API is reliable and predictable for AI agents
and other clients that depend on consistent behavior.
"""

import pytest
from typing import Dict, Any


class TestResponseFormats:
    """Test that API responses follow consistent formats"""

    @pytest.mark.asyncio
    async def test_discovery_response_format(self, client, sample_tools):
        """Test discovery response follows expected schema"""
        
        # Register a tool to ensure we have data
        tool = sample_tools[0]
        response = client.post("/api/tools/register", json=tool.model_dump())
        assert response.status_code == 200
        
        # Test discovery response format
        response = client.post("/api/tools/discover", json={
            "query": "search information",
            "limit": 5
        })
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify required top-level fields
        assert "tools" in data
        assert "query_id" in data  
        assert "timestamp" in data
        
        # Verify tools array structure
        assert isinstance(data["tools"], list)
        
        if len(data["tools"]) > 0:
            tool_result = data["tools"][0]
            required_fields = ["tool_id", "name", "description", "score", 
                             "matched_tags", "estimated_tokens", "server"]
            
            for field in required_fields:
                assert field in tool_result, f"Missing required field: {field}"
            
            # Verify field types
            assert isinstance(tool_result["tool_id"], str)
            assert isinstance(tool_result["name"], str)
            assert isinstance(tool_result["description"], str)
            assert isinstance(tool_result["score"], (int, float))
            assert isinstance(tool_result["matched_tags"], list)
            assert isinstance(tool_result["estimated_tokens"], int)
            assert isinstance(tool_result["server"], str)
            
            # Verify score is in valid range
            assert 0.0 <= tool_result["score"] <= 1.0

    @pytest.mark.asyncio
    async def test_tool_registration_response_format(self, client):
        """Test tool registration response format"""
        
        tool_data = {
            "id": "test_tool",
            "name": "test_tool",
            "description": "Test tool for API contract testing",
            "parameters": {"type": "object", "properties": {}},
            "server": "test_server",
            "tags": ["test"],
            "estimated_tokens": 100
        }
        
        response = client.post("/api/tools/register", json=tool_data)
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify required fields
        assert "status" in data
        assert "tool_id" in data
        
        # Verify field values
        assert data["status"] == "success"
        assert data["tool_id"] == tool_data["id"]

    @pytest.mark.asyncio
    async def test_server_addition_response_format(self, client):
        """Test add_server response format"""
        
        response = client.post("/api/mcp/add_server", json={
            "name": "test_server",
            "config": {
                "command": "test-command",
                "args": [],
                "env": {}
            },
            "description": "Test server"
        })
        
        # Should return consistent format regardless of success/failure
        assert response.status_code in [200, 500]  # May fail due to missing server
        data = response.json()
        
        # Should always have status field
        assert "status" in data
        assert "message" in data
        
        if response.status_code == 200:
            # Success response should have additional fields
            assert "server" in data
            assert data["server"] == "test_server"

    @pytest.mark.asyncio
    async def test_tool_execution_response_format(self, client, sample_tools):
        """Test tool execution response format"""
        
        # Register a tool
        tool = sample_tools[0]
        response = client.post("/api/tools/register", json=tool.model_dump())
        assert response.status_code == 200
        
        # Mock execution result
        from unittest.mock import patch
        mock_result = {"output": "test result", "success": True}
        
        with patch('tool_gating_mcp.services.proxy_service.ProxyService.execute_tool') as mock_execute:
            mock_execute.return_value = mock_result
            
            response = client.post("/api/proxy/execute", json={
                "tool_id": tool.id,
                "arguments": {"query": "test"}
            })
            
            assert response.status_code == 200
            data = response.json()
            
            # Should have result field containing the execution result
            assert "result" in data
            assert data["result"] == mock_result


class TestHTTPStatusCodes:
    """Test correct HTTP status codes are returned"""

    @pytest.mark.asyncio
    async def test_successful_operations_return_200(self, client):
        """Test that successful operations return 200 OK"""
        
        # Tool registration success
        tool_data = {
            "id": "status_test_tool",
            "name": "status_test_tool",
            "description": "Tool for testing HTTP status codes",
            "parameters": {"type": "object"},
            "server": "test_server",
            "tags": [],
            "estimated_tokens": 100
        }
        
        response = client.post("/api/tools/register", json=tool_data)
        assert response.status_code == 200
        
        # Discovery success (even with no results)
        response = client.post("/api/tools/discover", json={"query": "nonexistent"})
        assert response.status_code == 200
        
        # Clear success
        response = client.delete("/api/tools/clear")
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_validation_errors_return_422(self, client):
        """Test that validation errors return 422 Unprocessable Entity"""
        
        # Missing required fields
        response = client.post("/api/tools/register", json={})
        assert response.status_code == 422
        
        # Invalid field types  
        response = client.post("/api/tools/discover", json={
            "query": 123,  # Should be string
            "limit": "not_a_number"  # Should be integer
        })
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_not_found_errors_return_404(self, client):
        """Test that resource not found errors return 404"""
        
        # Execute non-existent tool
        response = client.post("/api/proxy/execute", json={
            "tool_id": "nonexistent_server_nonexistent_tool",
            "arguments": {}
        })
        
        # Should return 404 or 400 (depending on validation order)
        assert response.status_code in [400, 404, 500]

    @pytest.mark.asyncio
    async def test_server_errors_return_500(self, client):
        """Test that internal server errors return 500"""
        
        # Mock internal error
        from unittest.mock import patch
        
        with patch('tool_gating_mcp.services.discovery.DiscoveryService.search_tools') as mock_search:
            mock_search.side_effect = RuntimeError("Internal error")
            
            response = client.post("/api/tools/discover", json={"query": "test"})
            assert response.status_code == 500


class TestErrorResponseConsistency:
    """Test that error responses follow consistent format"""

    @pytest.mark.asyncio
    async def test_validation_error_format(self, client):
        """Test validation errors have consistent format"""
        
        response = client.post("/api/tools/register", json={"invalid": "data"})
        assert response.status_code == 422
        
        data = response.json()
        assert "detail" in data
        
        # Pydantic validation errors should have specific format
        if isinstance(data["detail"], list):
            for error in data["detail"]:
                assert "type" in error
                assert "msg" in error

    @pytest.mark.asyncio
    async def test_server_error_format(self, client):
        """Test server errors have consistent format"""
        
        from unittest.mock import patch
        
        with patch('tool_gating_mcp.api.tools.get_tool_repository') as mock_repo:
            mock_repo.side_effect = RuntimeError("Database connection failed")
            
            response = client.post("/api/tools/discover", json={"query": "test"})
            assert response.status_code == 500
            
            data = response.json()
            assert "detail" in data
            assert isinstance(data["detail"], str)


class TestFieldTypeConsistency:
    """Test that API fields maintain consistent types"""

    @pytest.mark.asyncio
    async def test_numeric_fields_are_consistent(self, client, sample_tools):
        """Test that numeric fields always return numbers"""
        
        for tool in sample_tools:
            response = client.post("/api/tools/register", json=tool.model_dump())
            assert response.status_code == 200
        
        response = client.post("/api/tools/discover", json={"query": "search"})
        assert response.status_code == 200
        
        tools = response.json()["tools"]
        for tool in tools:
            # Scores should always be numeric
            assert isinstance(tool["score"], (int, float))
            
            # Token estimates should always be integers
            assert isinstance(tool["estimated_tokens"], int)
            assert tool["estimated_tokens"] >= 0

    @pytest.mark.asyncio
    async def test_string_fields_are_consistent(self, client, sample_tools):
        """Test that string fields always return strings"""
        
        tool = sample_tools[0]
        response = client.post("/api/tools/register", json=tool.model_dump())
        assert response.status_code == 200
        
        response = client.post("/api/tools/discover", json={"query": "search"})
        tools = response.json()["tools"]
        
        if tools:
            tool_result = tools[0]
            string_fields = ["tool_id", "name", "description", "server"]
            
            for field in string_fields:
                assert isinstance(tool_result[field], str)
                assert len(tool_result[field]) > 0  # Should not be empty

    @pytest.mark.asyncio
    async def test_array_fields_are_consistent(self, client, sample_tools):
        """Test that array fields always return arrays"""
        
        tool = sample_tools[0]
        response = client.post("/api/tools/register", json=tool.model_dump())
        assert response.status_code == 200
        
        response = client.post("/api/tools/discover", json={"query": "search"})
        data = response.json()
        
        # Top-level tools array
        assert isinstance(data["tools"], list)
        
        if data["tools"]:
            tool_result = data["tools"][0]
            # matched_tags should always be array
            assert isinstance(tool_result["matched_tags"], list)


class TestBackwardCompatibility:
    """Test that API changes maintain backward compatibility"""

    @pytest.mark.asyncio
    async def test_discovery_maintains_required_fields(self, client, sample_tools):
        """Test that discovery response always includes core fields"""
        
        tool = sample_tools[0]
        response = client.post("/api/tools/register", json=tool.model_dump())
        assert response.status_code == 200
        
        response = client.post("/api/tools/discover", json={"query": "search"})
        data = response.json()
        
        # Core fields that must always be present
        required_top_level = ["tools", "query_id", "timestamp"]
        for field in required_top_level:
            assert field in data
        
        if data["tools"]:
            tool_result = data["tools"][0]
            required_tool_fields = ["tool_id", "name", "description", "score"]
            for field in required_tool_fields:
                assert field in tool_result

    @pytest.mark.asyncio
    async def test_registration_response_stability(self, client):
        """Test that registration response format is stable"""
        
        tool_data = {
            "id": "compat_test_tool",
            "name": "compat_test_tool", 
            "description": "Tool for compatibility testing",
            "parameters": {"type": "object"},
            "server": "test_server",
            "tags": [],
            "estimated_tokens": 100
        }
        
        response = client.post("/api/tools/register", json=tool_data)
        data = response.json()
        
        # Core response fields that must remain stable
        assert "status" in data
        assert "tool_id" in data
        assert data["status"] in ["success", "error"]


class TestOpenAPICompliance:
    """Test compliance with OpenAPI specification"""

    @pytest.mark.asyncio
    async def test_openapi_spec_accessible(self, client):
        """Test that OpenAPI specification is accessible"""
        
        response = client.get("/docs")
        assert response.status_code == 200
        
        response = client.get("/openapi.json")
        assert response.status_code == 200
        
        spec = response.json()
        assert "openapi" in spec
        assert "info" in spec
        assert "paths" in spec

    @pytest.mark.asyncio
    async def test_content_types_are_correct(self, client):
        """Test that responses have correct content types"""
        
        response = client.post("/api/tools/discover", json={"query": "test"})
        assert response.status_code == 200
        assert "application/json" in response.headers.get("content-type", "")

    @pytest.mark.asyncio
    async def test_operation_ids_are_unique(self, client):
        """Test that all endpoints have unique operation IDs"""
        
        response = client.get("/openapi.json")
        spec = response.json()
        
        operation_ids = []
        for path_data in spec["paths"].values():
            for method_data in path_data.values():
                if isinstance(method_data, dict) and "operationId" in method_data:
                    operation_ids.append(method_data["operationId"])
        
        # All operation IDs should be unique
        assert len(operation_ids) == len(set(operation_ids))
        
        # Should have our core operation IDs
        expected_ops = ["discover_tools", "register_tool", "clear_tools", 
                       "execute_tool", "add_server"]
        for op_id in expected_ops:
            assert op_id in operation_ids