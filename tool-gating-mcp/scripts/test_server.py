#!/usr/bin/env python3
"""Manual test script to verify the server works."""

import asyncio

import httpx


async def test_server():
    """Test the server manually."""
    async with httpx.AsyncClient(base_url="http://localhost:8000") as client:
        # Test health check
        print("Testing health endpoint...")
        health = await client.get("/health")
        print(f"Health status: {health.status_code}")
        print(f"Health data: {health.json()}\n")

        # Test tool discovery
        print("Testing tool discovery...")
        discover_response = await client.post(
            "/api/v1/tools/discover",
            json={
                "query": "I need to do some math calculations",
                "limit": 5
            }
        )
        print(f"Discovery status: {discover_response.status_code}")
        discover_data = discover_response.json()
        print(f"Found {len(discover_data['tools'])} tools")
        for tool in discover_data['tools'][:3]:
            print(f"  - {tool['name']} (score: {tool['score']:.3f})")

        # Test provisioning
        print("\nTesting tool provisioning...")
        tool_ids = [t["tool_id"] for t in discover_data["tools"][:3]]
        provision_response = await client.post(
            "/api/v1/tools/provision",
            json={
                "tool_ids": tool_ids,
                "max_tools": 3
            }
        )
        print(f"Provision status: {provision_response.status_code}")
        provision_data = provision_response.json()
        print(f"Provisioned {len(provision_data['tools'])} tools")
        print(f"Total tokens: {provision_data['metadata']['total_tokens']}")

        # Note: Tool execution removed
        # The gating system only provides tool definitions
        # LLMs should execute tools directly with MCP servers
        print("\nNote: Tool execution is handled by LLMs directly with MCP servers")


if __name__ == "__main__":
    print("Starting manual test of tool-gating-mcp server...\n")
    print("Make sure the server is running with: tool-gating-mcp\n")

    try:
        asyncio.run(test_server())
    except httpx.ConnectError:
        print("ERROR: Could not connect to server. Is it running?")
        print("Start it with: tool-gating-mcp")
