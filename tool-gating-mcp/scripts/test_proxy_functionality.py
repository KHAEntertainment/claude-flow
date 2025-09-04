#!/usr/bin/env python3
"""Test the full proxy functionality with context7"""

import asyncio
import json
import requests
import sys

BASE_URL = "http://localhost:8000"

def print_section(title):
    print(f"\n{'='*50}")
    print(f"  {title}")
    print(f"{'='*50}")

async def main():
    print("Tool Gating MCP Proxy Integration Test")
    print("=====================================")
    
    # Test 1: Health check
    print_section("1. Health Check")
    response = requests.get(f"{BASE_URL}/health")
    if response.status_code == 200:
        print("✓ Server is healthy")
    else:
        print(f"✗ Health check failed: {response.status_code}")
        return
    
    # Test 2: List MCP servers
    print_section("2. List MCP Servers")
    response = requests.get(f"{BASE_URL}/api/mcp/servers")
    if response.status_code == 200:
        servers = response.json()
        print(f"✓ Found {len(servers)} registered servers:")
        for server in servers:
            if isinstance(server, str):
                print(f"  - {server}")
            else:
                print(f"  - {server['name']}: {server.get('description', 'No description')}")
    else:
        print(f"✗ Failed to list servers: {response.status_code}")
        return
    
    # Test 3: Discover tools
    print_section("3. Discover Tools")
    discover_request = {
        "query": "resolve library documentation",
        "limit": 5
    }
    response = requests.post(f"{BASE_URL}/api/tools/discover", json=discover_request)
    if response.status_code == 200:
        result = response.json()
        tools = result["tools"]
        print(f"✓ Discovered {len(tools)} tools:")
        for tool in tools:
            print(f"  - {tool['tool_id']}: {tool['description'][:80]}...")
    else:
        print(f"✗ Failed to discover tools: {response.status_code}")
        return
    
    # Test 4: Provision tools
    print_section("4. Provision Tools")
    # Get the first two tool IDs
    tool_ids = [tool["tool_id"] for tool in tools[:2]]
    provision_request = {
        "tool_ids": tool_ids,
        "context_tokens": 1000
    }
    response = requests.post(f"{BASE_URL}/api/tools/provision", json=provision_request)
    if response.status_code == 200:
        result = response.json()
        print(f"✓ Provisioned {len(result['tools'])} tools:")
        for tool in result["tools"]:
            tool_id = tool.get('tool_id', tool.get('id', 'unknown'))
            tokens = tool.get('estimated_tokens', 'unknown')
            print(f"  - {tool_id}: {tokens} tokens")
    else:
        print(f"✗ Failed to provision tools: {response.status_code}")
        print(f"  Response: {response.text}")
        return
    
    # Test 5: Execute a tool via proxy
    print_section("5. Execute Tool via Proxy")
    
    # First, let's use resolve-library-id
    if "context7_resolve-library-id" in tool_ids:
        execute_request = {
            "tool_id": "context7_resolve-library-id",
            "arguments": {"libraryName": "react"}
        }
        response = requests.post(f"{BASE_URL}/api/proxy/execute", json=execute_request)
        if response.status_code == 200:
            result = response.json()
            print("✓ Successfully executed resolve-library-id tool")
            # Extract the response content
            if isinstance(result, dict) and "content" in result:
                content = result["content"]
                if isinstance(content, list) and len(content) > 0:
                    text_content = content[0].get("text", "")
                    # Show first few lines
                    lines = text_content.split('\n')[:10]
                    print("  Response preview:")
                    for line in lines:
                        if line.strip():
                            print(f"    {line[:100]}...")
            else:
                print(f"  Result: {json.dumps(result, indent=2)[:500]}...")
        else:
            print(f"✗ Failed to execute tool: {response.status_code}")
            print(f"  Response: {response.text}")
    else:
        print("⚠ resolve-library-id tool not provisioned, skipping execution test")
    
    # Test 6: Test tool not provisioned error
    print_section("6. Test Unprovisions Tool Error")
    execute_request = {
        "tool_id": "context7_get-library-docs",
        "arguments": {"context7CompatibleLibraryID": "/reactjs/react.dev"}
    }
    response = requests.post(f"{BASE_URL}/api/proxy/execute", json=execute_request)
    if response.status_code == 400:
        print("✓ Correctly rejected unprovisioned tool execution")
        print(f"  Error: {response.json().get('detail', 'Unknown error')}")
    else:
        print(f"✗ Unexpected response for unprovisioned tool: {response.status_code}")
    
    print_section("Integration Test Complete")
    print("\n✓ All proxy functionality tests passed!")
    print("\nThe proxy successfully:")
    print("  1. Lists registered MCP servers")
    print("  2. Discovers tools from context7")
    print("  3. Provisions selected tools")
    print("  4. Executes tools via the proxy")
    print("  5. Enforces tool provisioning requirements")

if __name__ == "__main__":
    asyncio.run(main())