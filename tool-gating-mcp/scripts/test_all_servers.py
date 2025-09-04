#!/usr/bin/env python3
"""Test all configured MCP servers through Tool Gating"""

import requests
import json
import sys

BASE_URL = "http://localhost:8000"

def print_header(text):
    print(f"\n{'='*60}")
    print(f"{text:^60}")
    print(f"{'='*60}")

def test_server(server_name):
    """Test a specific MCP server by discovering its tools"""
    print(f"\n[{server_name}] Testing...")
    
    # Discover tools from this server
    response = requests.post(
        f"{BASE_URL}/api/tools/discover",
        json={"query": server_name, "limit": 20}
    )
    
    if response.status_code != 200:
        print(f"  ✗ Failed to discover tools: {response.status_code}")
        return False
    
    tools = response.json()["tools"]
    server_tools = [t for t in tools if t.get("server") == server_name]
    
    if not server_tools:
        print(f"  ⚠ No tools found from {server_name}")
        return False
    
    print(f"  ✓ Found {len(server_tools)} tools:")
    for tool in server_tools[:5]:  # Show first 5 tools
        print(f"    - {tool['name']}: {tool['description'][:60]}...")
    
    if len(server_tools) > 5:
        print(f"    ... and {len(server_tools) - 5} more")
    
    return True

def main():
    print_header("Tool Gating MCP - All Servers Test")
    
    # First check health
    try:
        response = requests.get(f"{BASE_URL}/health", timeout=5)
        if response.status_code != 200:
            print("✗ Server not healthy!")
            return 1
        print("✓ Server is healthy")
    except Exception as e:
        print(f"✗ Cannot connect to server: {e}")
        return 1
    
    # List all configured servers
    response = requests.get(f"{BASE_URL}/api/mcp/servers")
    if response.status_code != 200:
        print("✗ Failed to list servers")
        return 1
    
    servers = response.json()
    print(f"\n✓ Found {len(servers)} configured servers:")
    for server in servers:
        print(f"  - {server}")
    
    # Test each server
    print_header("Testing Individual Servers")
    
    results = {}
    for server in servers:
        results[server] = test_server(server)
    
    # Now test combined discovery
    print_header("Testing Combined Discovery")
    
    test_queries = [
        ("documentation search", "Should find context7 tools"),
        ("web search", "Should find exa tools"),
        ("browser automation screenshot", "Should find puppeteer tools"),
        ("memory storage", "Should find basic-memory tools"),
    ]
    
    for query, description in test_queries:
        print(f"\nQuery: '{query}' - {description}")
        response = requests.post(
            f"{BASE_URL}/api/tools/discover",
            json={"query": query, "limit": 10}
        )
        
        if response.status_code == 200:
            tools = response.json()["tools"]
            print(f"  ✓ Found {len(tools)} tools")
            # Show which servers provided tools
            servers_found = set(t.get("server") for t in tools if t.get("server"))
            if servers_found:
                print(f"    From servers: {', '.join(servers_found)}")
        else:
            print(f"  ✗ Failed: {response.status_code}")
    
    # Test provisioning and execution
    print_header("Testing Provisioning and Execution")
    
    # Try to provision and use a tool from context7
    print("\nTesting context7 tool execution:")
    
    # Discover context7 tools
    response = requests.post(
        f"{BASE_URL}/api/tools/discover",
        json={"query": "resolve library id", "limit": 5}
    )
    
    if response.status_code == 200:
        tools = response.json()["tools"]
        context7_tool = next((t for t in tools if "resolve-library-id" in t.get("name", "")), None)
        
        if context7_tool:
            print(f"  ✓ Found tool: {context7_tool['tool_id']}")
            
            # Provision it
            response = requests.post(
                f"{BASE_URL}/api/tools/provision",
                json={"tool_ids": [context7_tool["tool_id"]]}
            )
            
            if response.status_code == 200:
                print("  ✓ Provisioned successfully")
                
                # Execute it
                response = requests.post(
                    f"{BASE_URL}/api/proxy/execute",
                    json={
                        "tool_id": context7_tool["tool_id"],
                        "arguments": {"libraryName": "react"}
                    }
                )
                
                if response.status_code == 200:
                    print("  ✓ Executed successfully!")
                    result = response.json()
                    if "result" in result and "content" in result["result"]:
                        print("  ✓ Got valid response with React library information")
                else:
                    print(f"  ✗ Execution failed: {response.status_code}")
            else:
                print(f"  ✗ Provisioning failed: {response.status_code}")
        else:
            print("  ✗ Could not find resolve-library-id tool")
    
    # Summary
    print_header("Test Summary")
    
    working_servers = [s for s, ok in results.items() if ok]
    failed_servers = [s for s, ok in results.items() if not ok]
    
    print(f"\nWorking servers ({len(working_servers)}):")
    for server in working_servers:
        print(f"  ✓ {server}")
    
    if failed_servers:
        print(f"\nFailed servers ({len(failed_servers)}):")
        for server in failed_servers:
            print(f"  ✗ {server}")
    
    print(f"\nTotal: {len(working_servers)}/{len(servers)} servers operational")
    
    return 0 if len(failed_servers) == 0 else 1

if __name__ == "__main__":
    sys.exit(main())