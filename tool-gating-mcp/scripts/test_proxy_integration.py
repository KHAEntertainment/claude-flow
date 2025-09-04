#!/usr/bin/env python3
"""Integration test for MCP proxy functionality"""

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


async def wait_for_server(url: str, timeout: int = 30):
    """Wait for server to be ready"""
    print(f"Waiting for server at {url}...")
    start_time = time.time()
    
    async with httpx.AsyncClient() as client:
        while time.time() - start_time < timeout:
            try:
                response = await client.get(f"{url}/health")
                if response.status_code == 200:
                    print("✓ Server is ready!")
                    return True
            except httpx.RequestError:
                pass
            await asyncio.sleep(1)
    
    print("✗ Server failed to start")
    return False


async def test_discover_tools(base_url: str):
    """Test tool discovery endpoint"""
    print("\n1. Testing tool discovery...")
    
    async with httpx.AsyncClient() as client:
        # Test discovering browser tools
        response = await client.post(
            f"{base_url}/api/tools/discover",
            json={
                "query": "I need to take screenshots and navigate web pages",
                "limit": 5
            }
        )
        
        if response.status_code == 200:
            data = response.json()
            print(f"✓ Discovered {len(data['tools'])} tools")
            for tool in data['tools']:
                print(f"  - {tool['name']} (score: {tool['score']:.3f})")
            return True
        else:
            print(f"✗ Discovery failed: {response.status_code} - {response.text}")
            return False


async def test_provision_tools(base_url: str):
    """Test tool provisioning"""
    print("\n2. Testing tool provisioning...")
    
    async with httpx.AsyncClient() as client:
        # First discover tools
        discover_response = await client.post(
            f"{base_url}/api/tools/discover",
            json={"query": "screenshot", "limit": 3}
        )
        
        if discover_response.status_code != 200:
            print("✗ Could not discover tools for provisioning")
            return False
        
        tools = discover_response.json()['tools']
        if not tools:
            print("✗ No tools found to provision")
            return False
        
        # Provision the first tool
        tool_ids = [tools[0]['id']]
        provision_response = await client.post(
            f"{base_url}/api/tools/provision",
            json={
                "tool_ids": tool_ids,
                "context_tokens": 500
            }
        )
        
        if provision_response.status_code == 200:
            data = provision_response.json()
            print(f"✓ Provisioned {len(data['tools'])} tools")
            print(f"  Total tokens: {data['metadata']['total_tokens']}")
            return True
        else:
            print(f"✗ Provisioning failed: {provision_response.status_code}")
            return False


async def test_proxy_execution(base_url: str):
    """Test executing tool through proxy"""
    print("\n3. Testing proxy tool execution...")
    
    async with httpx.AsyncClient() as client:
        # Note: This will fail without real MCP servers running
        # but we can test the endpoint exists and returns appropriate error
        response = await client.post(
            f"{base_url}/api/proxy/execute",
            json={
                "tool_id": "puppeteer_screenshot",
                "arguments": {"name": "test", "url": "https://example.com"}
            }
        )
        
        if response.status_code == 400:
            error = response.json()
            if "not provisioned" in error.get('detail', ''):
                print("✓ Proxy endpoint working (tool not provisioned as expected)")
                return True
            else:
                print(f"✗ Unexpected error: {error}")
                return False
        elif response.status_code == 200:
            print("✓ Tool executed successfully!")
            return True
        else:
            print(f"✗ Unexpected status: {response.status_code}")
            return False


async def test_mcp_endpoint(base_url: str):
    """Test MCP SSE endpoint"""
    print("\n4. Testing MCP endpoint...")
    
    async with httpx.AsyncClient() as client:
        # Test that MCP endpoint exists
        response = await client.get(
            f"{base_url}/mcp",
            headers={"Accept": "text/event-stream"}
        )
        
        # The endpoint should exist even if we can't fully test SSE
        if response.status_code in [200, 400, 405]:
            print("✓ MCP endpoint exists")
            return True
        else:
            print(f"✗ MCP endpoint not found: {response.status_code}")
            return False


async def test_execute_tool_endpoint(base_url: str):
    """Test execute_tool MCP endpoint"""
    print("\n5. Testing execute_tool endpoint...")
    
    async with httpx.AsyncClient() as client:
        # Test the POST /execute_tool endpoint
        response = await client.post(
            f"{base_url}/execute_tool",
            json={
                "tool_id": "test_tool",
                "arguments": {}
            }
        )
        
        # Should get an error since proxy service won't be initialized in test
        if response.status_code in [400, 422, 500]:
            print("✓ execute_tool endpoint exists")
            return True
        else:
            print(f"✗ Unexpected response: {response.status_code}")
            return False


async def main():
    """Run integration tests"""
    print("=== MCP Proxy Integration Tests ===")
    
    # Start the server
    print("\nStarting Tool Gating MCP server...")
    server_process = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "tool_gating_mcp.main:app", "--port", "8001"],
        cwd=project_root,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE
    )
    
    try:
        # Wait for server to start
        base_url = "http://localhost:8001"
        if not await wait_for_server(base_url):
            print("\nServer output:")
            stdout, stderr = server_process.communicate(timeout=5)
            print(stdout.decode())
            print(stderr.decode())
            return False
        
        # Run tests
        all_passed = True
        all_passed &= await test_discover_tools(base_url)
        all_passed &= await test_provision_tools(base_url)
        all_passed &= await test_proxy_execution(base_url)
        all_passed &= await test_mcp_endpoint(base_url)
        all_passed &= await test_execute_tool_endpoint(base_url)
        
        print("\n" + "="*40)
        if all_passed:
            print("✓ All integration tests passed!")
        else:
            print("✗ Some tests failed")
        
        return all_passed
        
    finally:
        # Stop the server
        print("\nStopping server...")
        server_process.terminate()
        try:
            server_process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server_process.kill()
            server_process.wait()


if __name__ == "__main__":
    success = asyncio.run(main())
    sys.exit(0 if success else 1)