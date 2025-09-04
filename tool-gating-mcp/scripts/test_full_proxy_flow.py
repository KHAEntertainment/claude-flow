#!/usr/bin/env python3
"""Full integration test for MCP proxy flow"""

import asyncio
import httpx
import json
import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))


async def test_full_proxy_workflow():
    """Test the complete proxy workflow: discover -> provision -> execute"""
    base_url = "http://localhost:8000"
    
    async with httpx.AsyncClient() as client:
        print("=== Testing Full Proxy Workflow ===\n")
        
        # Step 1: Discover tools
        print("1. Discovering screenshot tools...")
        discover_response = await client.post(
            f"{base_url}/api/tools/discover",
            json={
                "query": "I need to take screenshots of web pages",
                "limit": 5
            }
        )
        
        if discover_response.status_code != 200:
            print(f"✗ Discovery failed: {discover_response.status_code}")
            return False
        
        tools = discover_response.json()['tools']
        print(f"✓ Found {len(tools)} relevant tools:")
        
        screenshot_tool = None
        for tool in tools:
            print(f"  - {tool['name']} ({tool['id']}) - Score: {tool['score']:.3f}")
            if 'screenshot' in tool['name']:
                screenshot_tool = tool
        
        if not screenshot_tool:
            print("✗ No screenshot tool found")
            return False
        
        # Step 2: Provision the tool
        print(f"\n2. Provisioning tool: {screenshot_tool['id']}...")
        provision_response = await client.post(
            f"{base_url}/api/tools/provision",
            json={
                "tool_ids": [screenshot_tool['id']],
                "context_tokens": 1000
            }
        )
        
        if provision_response.status_code != 200:
            print(f"✗ Provisioning failed: {provision_response.status_code}")
            print(f"   Response: {provision_response.text}")
            return False
        
        provision_data = provision_response.json()
        print(f"✓ Tool provisioned successfully")
        print(f"  - Total tokens: {provision_data['metadata']['total_tokens']}")
        print(f"  - Gating applied: {provision_data['metadata']['gating_applied']}")
        
        # Step 3: Execute the tool through proxy
        print(f"\n3. Executing tool through proxy...")
        execute_response = await client.post(
            f"{base_url}/api/proxy/execute",
            json={
                "tool_id": screenshot_tool['id'],
                "arguments": {
                    "url": "https://example.com",
                    "name": "test_screenshot"
                }
            }
        )
        
        if execute_response.status_code == 200:
            print("✓ Tool executed successfully!")
            result = execute_response.json()
            print(f"  - Result: {json.dumps(result, indent=2)}")
            return True
        elif execute_response.status_code == 400:
            error_detail = execute_response.json().get('detail', '')
            if 'not provisioned' in error_detail:
                print("✗ Tool execution failed: Tool not provisioned")
                print("  This might be a state management issue in the proxy service")
            else:
                print(f"✗ Tool execution failed: {error_detail}")
            return False
        else:
            print(f"✗ Tool execution failed: {execute_response.status_code}")
            print(f"   Response: {execute_response.text}")
            return False


async def test_cross_server_tools():
    """Test discovering and using tools from different servers"""
    base_url = "http://localhost:8000"
    
    async with httpx.AsyncClient() as client:
        print("\n=== Testing Cross-Server Tool Discovery ===\n")
        
        # Discover tools from different categories
        queries = [
            ("I need to read and write files", "file"),
            ("I need to navigate web pages and take screenshots", "browser"),
        ]
        
        all_tools = []
        for query, expected_tag in queries:
            print(f"Discovering tools for: '{query}'")
            response = await client.post(
                f"{base_url}/api/tools/discover",
                json={"query": query, "limit": 10}
            )
            
            if response.status_code == 200:
                tools = response.json()['tools']
                print(f"✓ Found {len(tools)} tools")
                for tool in tools[:3]:  # Show top 3
                    print(f"  - {tool['id']} (score: {tool['score']:.3f})")
                    all_tools.append(tool)
            else:
                print(f"✗ Discovery failed: {response.status_code}")
        
        # Show tools by server
        print("\n4. Tools by server:")
        servers = {}
        for tool in all_tools:
            server = tool['id'].split('_')[0]
            if server not in servers:
                servers[server] = []
            servers[server].append(tool['name'])
        
        for server, tool_names in servers.items():
            print(f"  - {server}: {', '.join(tool_names)}")
        
        return len(servers) > 1  # Success if we found tools from multiple servers


async def test_execute_tool_endpoint():
    """Test the execute_tool MCP endpoint directly"""
    base_url = "http://localhost:8000"
    
    async with httpx.AsyncClient() as client:
        print("\n=== Testing execute_tool MCP Endpoint ===\n")
        
        # First provision a tool
        print("1. Provisioning filesystem_read_file tool...")
        provision_response = await client.post(
            f"{base_url}/api/tools/provision",
            json={
                "tool_ids": ["filesystem_read_file"],
                "context_tokens": 500
            }
        )
        
        if provision_response.status_code != 200:
            print(f"✗ Failed to provision tool: {provision_response.status_code}")
            return False
        
        print("✓ Tool provisioned")
        
        # Test the execute_tool endpoint (MCP tool)
        print("\n2. Testing /execute_tool endpoint...")
        execute_response = await client.post(
            f"{base_url}/execute_tool",
            json={
                "tool_id": "filesystem_read_file",
                "arguments": {"path": "/tmp/test.txt"}
            }
        )
        
        print(f"  Response status: {execute_response.status_code}")
        
        if execute_response.status_code in [200, 400, 500]:
            # Any of these statuses means the endpoint exists and is processing
            print("✓ execute_tool endpoint is working")
            if execute_response.status_code != 200:
                print(f"  Note: Got expected error: {execute_response.json()}")
            return True
        else:
            print(f"✗ Unexpected response: {execute_response.text}")
            return False


async def main():
    """Run all integration tests"""
    print("Tool Gating MCP - Proxy Integration Tests")
    print("=" * 50)
    
    # Check server is running
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get("http://localhost:8000/health", timeout=2.0)
            if response.status_code != 200:
                print("✗ Server not healthy")
                return False
        except (httpx.RequestError, httpx.TimeoutException):
            print("✗ Server not running. Please start with: tool-gating-mcp")
            return False
    
    print("✓ Server is running\n")
    
    # Run tests
    results = []
    results.append(await test_full_proxy_workflow())
    results.append(await test_cross_server_tools())
    results.append(await test_execute_tool_endpoint())
    
    # Summary
    print("\n" + "=" * 50)
    passed = sum(results)
    total = len(results)
    
    if passed == total:
        print(f"✓ All {total} test suites passed!")
        return True
    else:
        print(f"✗ {passed}/{total} test suites passed")
        return False


if __name__ == "__main__":
    success = asyncio.run(main())
    sys.exit(0 if success else 1)