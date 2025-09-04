#!/usr/bin/env python3
"""Simplified integration test for MCP proxy functionality"""

import asyncio
import httpx
import json
import subprocess
import time
import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))


async def test_server_health(base_url: str):
    """Test server health endpoint"""
    print("\n1. Testing server health...")
    
    async with httpx.AsyncClient() as client:
        response = await client.get(f"{base_url}/health")
        
        if response.status_code == 200:
            data = response.json()
            print(f"✓ Server healthy: {data['message']}")
            return True
        else:
            print(f"✗ Health check failed: {response.status_code}")
            return False


async def test_api_docs(base_url: str):
    """Test API documentation endpoint"""
    print("\n2. Testing API documentation...")
    
    async with httpx.AsyncClient() as client:
        response = await client.get(f"{base_url}/docs")
        
        if response.status_code == 200:
            print("✓ API documentation available")
            return True
        else:
            print(f"✗ API docs not available: {response.status_code}")
            return False


async def test_discover_endpoint_exists(base_url: str):
    """Test that discover endpoint exists"""
    print("\n3. Testing discover endpoint exists...")
    
    async with httpx.AsyncClient() as client:
        # Test with empty query to see if endpoint exists
        response = await client.post(
            f"{base_url}/api/tools/discover",
            json={"query": "test"}
        )
        
        print(f"  Response status: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"  Tools found: {len(data.get('tools', []))}")
            print("✓ Discover endpoint working")
            return True
        else:
            print(f"✗ Discover endpoint error: {response.text}")
            return False


async def test_provision_endpoint_exists(base_url: str):
    """Test that provision endpoint exists"""
    print("\n4. Testing provision endpoint exists...")
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{base_url}/api/tools/provision",
            json={"tool_ids": ["test_tool"]}
        )
        
        print(f"  Response status: {response.status_code}")
        if response.status_code in [200, 404]:  # 404 if tool not found is OK
            print("✓ Provision endpoint working")
            return True
        else:
            print(f"✗ Provision endpoint error: {response.text}")
            return False


async def test_proxy_endpoint_exists(base_url: str):
    """Test that proxy endpoint exists"""
    print("\n5. Testing proxy endpoint exists...")
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{base_url}/api/proxy/execute",
            json={
                "tool_id": "test_tool",
                "arguments": {}
            }
        )
        
        print(f"  Response status: {response.status_code}")
        if response.status_code in [200, 400, 500]:  # Any response means endpoint exists
            if response.status_code == 400:
                print("  Expected error: Tool not provisioned")
            print("✓ Proxy endpoint exists")
            return True
        else:
            print(f"✗ Proxy endpoint error: {response.text}")
            return False


async def test_execute_tool_endpoint_exists(base_url: str):
    """Test that execute_tool endpoint exists"""
    print("\n6. Testing execute_tool endpoint exists...")
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{base_url}/execute_tool",
            json={
                "tool_id": "test_tool",
                "arguments": {}
            }
        )
        
        print(f"  Response status: {response.status_code}")
        if response.status_code in [200, 400, 422, 500]:
            print("✓ execute_tool endpoint exists")
            return True
        else:
            print(f"✗ execute_tool endpoint error")
            return False


async def test_list_servers(base_url: str):
    """Test listing MCP servers"""
    print("\n7. Testing list MCP servers...")
    
    async with httpx.AsyncClient() as client:
        response = await client.get(f"{base_url}/api/mcp/servers")
        
        if response.status_code == 200:
            data = response.json()
            # The response is a list, not a dict with 'servers' key
            servers = data if isinstance(data, list) else data.get('servers', [])
            print(f"✓ Found {len(servers)} registered servers")
            for server in servers:
                if isinstance(server, dict):
                    print(f"  - {server['name']}: {server.get('description', 'No description')}")
                else:
                    print(f"  - {server}")
            return True
        else:
            print(f"✗ List servers failed: {response.status_code}")
            return False


async def run_tests(base_url: str):
    """Run all tests"""
    print("=== Running Integration Tests ===")
    
    all_passed = True
    all_passed &= await test_server_health(base_url)
    all_passed &= await test_api_docs(base_url)
    all_passed &= await test_discover_endpoint_exists(base_url)
    all_passed &= await test_provision_endpoint_exists(base_url)
    all_passed &= await test_proxy_endpoint_exists(base_url)
    all_passed &= await test_execute_tool_endpoint_exists(base_url)
    all_passed &= await test_list_servers(base_url)
    
    return all_passed


async def main():
    """Main test runner"""
    # Check if server is already running
    base_url = "http://localhost:8000"
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(f"{base_url}/health", timeout=2.0)
            if response.status_code == 200:
                print("Using existing server at", base_url)
                success = await run_tests(base_url)
            else:
                raise httpx.RequestError("Server not healthy")
        except (httpx.RequestError, httpx.TimeoutException):
            print("No server running. Please start the server with:")
            print("  cd /Users/andremachon/Projects/tool-gating-mcp")
            print("  tool-gating-mcp")
            print("\nThen run this script again.")
            return False
    
    print("\n" + "="*40)
    if success:
        print("✓ All tests passed!")
    else:
        print("✗ Some tests failed")
    
    return success


if __name__ == "__main__":
    success = asyncio.run(main())
    sys.exit(0 if success else 1)