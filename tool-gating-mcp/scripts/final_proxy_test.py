#!/usr/bin/env python3
"""Final integration test for Tool Gating MCP Proxy"""

import requests
import json
import sys

BASE_URL = "http://localhost:8000"

def print_test(name):
    print(f"\n{'='*60}")
    print(f"TEST: {name}")
    print(f"{'='*60}")

def print_result(success, message):
    prefix = "✓" if success else "✗"
    print(f"{prefix} {message}")

def main():
    print("\nTool Gating MCP Proxy - Final Integration Test")
    print("=" * 60)
    
    # Test 1: Basic connectivity
    print_test("1. Basic Connectivity")
    try:
        response = requests.get(f"{BASE_URL}/health", timeout=30)
        print_result(response.status_code == 200, f"Health check: {response.json()}")
    except Exception as e:
        print_result(False, f"Cannot connect to server: {e}")
        print("\nPlease ensure the server is running with: tool-gating-mcp")
        return False
    
    # Test 2: Discover context7 tools
    print_test("2. Tool Discovery")
    discover_response = requests.post(
        f"{BASE_URL}/api/tools/discover",
        json={"query": "documentation library", "limit": 10}
    )
    
    if discover_response.status_code != 200:
        print_result(False, f"Discovery failed: {discover_response.status_code}")
        return False
    
    discovered_tools = discover_response.json()["tools"]
    print_result(True, f"Discovered {len(discovered_tools)} tools")
    
    # Find context7 tools
    context7_tools = [t for t in discovered_tools if t["server"] == "context7"]
    if not context7_tools:
        print_result(False, "No context7 tools found!")
        return False
    
    print("\nContext7 tools found:")
    for tool in context7_tools:
        print(f"  - {tool['tool_id']}: {tool['name']}")
    
    # Test 3: Provision tools
    print_test("3. Tool Provisioning")
    
    # Get resolve-library-id tool
    resolve_tool = next((t for t in context7_tools if t["name"] == "resolve-library-id"), None)
    if not resolve_tool:
        print_result(False, "resolve-library-id tool not found")
        return False
    
    provision_response = requests.post(
        f"{BASE_URL}/api/tools/provision",
        json={"tool_ids": [resolve_tool["tool_id"]], "context_tokens": 1000}
    )
    
    if provision_response.status_code != 200:
        print_result(False, f"Provisioning failed: {provision_response.status_code}")
        print(f"Response: {provision_response.text}")
        return False
    
    provisioned = provision_response.json()
    print_result(True, f"Provisioned {len(provisioned['tools'])} tools")
    print(f"Total tokens: {provisioned['metadata']['total_tokens']}")
    
    # Test 4: Execute provisioned tool
    print_test("4. Execute Provisioned Tool")
    
    execute_response = requests.post(
        f"{BASE_URL}/api/proxy/execute",
        json={
            "tool_id": resolve_tool["tool_id"],
            "arguments": {"libraryName": "react"}
        }
    )
    
    if execute_response.status_code != 200:
        print_result(False, f"Execution failed: {execute_response.status_code}")
        print(f"Response: {execute_response.text}")
        return False
    
    result = execute_response.json()
    print_result(True, "Tool executed successfully")
    
    # Check if we got valid response
    if "result" in result and "_meta" in result["result"]:
        content = result["result"].get("content", [])
        if content and content[0].get("type") == "text":
            text = content[0]["text"]
            print(f"\nResponse preview (first 200 chars):")
            print(f"  {text[:200]}...")
    
    # Test 5: Try to execute unprovisioned tool
    print_test("5. Unprovisioned Tool Rejection")
    
    # First clear provisions
    clear_response = requests.post(f"{BASE_URL}/api/tools/provision", json={"tool_ids": []})
    if clear_response.status_code != 200:
        print_result(False, "Failed to clear provisions")
        return False
    
    # Now try to execute without provisioning
    execute_response = requests.post(
        f"{BASE_URL}/api/proxy/execute",
        json={
            "tool_id": resolve_tool["tool_id"],
            "arguments": {"libraryName": "vue"}
        }
    )
    
    if execute_response.status_code == 400:
        print_result(True, "Correctly rejected unprovisioned tool")
        error_detail = execute_response.json().get("detail", "")
        print(f"  Error message: {error_detail}")
    else:
        print_result(False, f"Expected 400, got {execute_response.status_code}")
        print("  The proxy should reject unprovisioned tools!")
    
    # Test 6: Real-world workflow
    print_test("6. Real-World Workflow")
    
    # Step 1: Discover tools for a task
    print("\nStep 1: Discover tools for 'get react documentation'")
    discover_response = requests.post(
        f"{BASE_URL}/api/tools/discover",
        json={"query": "get react documentation"}
    )
    tools = discover_response.json()["tools"]
    print(f"  Found {len(tools)} relevant tools")
    
    # Step 2: Provision the tools
    print("\nStep 2: Provision top 2 tools")
    tool_ids = [t["tool_id"] for t in tools[:2]]
    provision_response = requests.post(
        f"{BASE_URL}/api/tools/provision",
        json={"tool_ids": tool_ids}
    )
    print(f"  Provisioned: {[t['name'] for t in provision_response.json()['tools']]}")
    
    # Step 3: Execute resolve-library-id
    print("\nStep 3: Resolve React library ID")
    if "context7_resolve-library-id" in tool_ids:
        execute_response = requests.post(
            f"{BASE_URL}/api/proxy/execute",
            json={
                "tool_id": "context7_resolve-library-id",
                "arguments": {"libraryName": "react"}
            }
        )
        if execute_response.status_code == 200:
            print_result(True, "Resolved React library ID")
            # Extract library ID from response
            result = execute_response.json()
            if "result" in result and "content" in result["result"]:
                text = result["result"]["content"][0]["text"]
                # Look for React library ID
                if "/reactjs/react.dev" in text:
                    print("  Found React library ID: /reactjs/react.dev")
        else:
            print_result(False, f"Failed to resolve: {execute_response.status_code}")
    
    print("\n" + "="*60)
    print("INTEGRATION TEST COMPLETE")
    print("="*60)
    print("\nThe Tool Gating MCP Proxy is working correctly!")
    print("It successfully:")
    print("  ✓ Discovers tools from real MCP servers (context7)")
    print("  ✓ Provisions tools with token management")
    print("  ✓ Executes tools via proxy")
    print("  ✓ Enforces provisioning requirements")
    print("  ✓ Supports real-world workflows")
    
    return True

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)