#!/usr/bin/env python3
"""
Quick check of MCP tools exposed by Tool Gating.
"""

import httpx
import asyncio
import json
from mcp import ClientSession
from mcp.client.stdio import stdio_client, StdioServerParameters

async def check_via_mcp_sdk():
    """Connect using MCP SDK to see actual tool names."""
    print("\nChecking via MCP SDK...")
    
    # Use mcp-proxy to connect
    server_params = StdioServerParameters(
        command="/Users/andremachon/.local/bin/mcp-proxy",
        args=["http://localhost:8000/mcp"],
        env={}
    )
    
    try:
        async with stdio_client(server_params) as (read_stream, write_stream):
            async with ClientSession(read_stream, write_stream) as session:
                # Initialize connection
                await session.initialize()
                print("✅ Connected to MCP server")
                
                # List tools
                tools_response = await session.list_tools()
                tools = tools_response.tools if hasattr(tools_response, 'tools') else []
                
                print(f"\n✅ Found {len(tools)} tools")
                
                # Check for long names
                long_names = []
                for tool in tools:
                    tool_name = tool.name
                    full_name = f"mcp__tool-gating__{tool_name}"
                    
                    if len(full_name) > 64:
                        long_names.append({
                            "name": tool_name,
                            "full_name": full_name,
                            "length": len(full_name),
                            "description": tool.description[:50] + "..." if tool.description else ""
                        })
                    
                    # Print first few tools
                    if len(long_names) < 5 or len(full_name) > 64:
                        print(f"  - {tool_name} (length: {len(full_name)})")
                
                if long_names:
                    print(f"\n❌ Found {len(long_names)} tools with names > 64 characters:")
                    for tool in long_names:
                        print(f"  - {tool['name']} ({tool['length']} chars)")
                        print(f"    Full: {tool['full_name']}")
                else:
                    print("\n✅ All tool names are within limits")
                    
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()


async def check_via_http():
    """Check tools via HTTP API."""
    print("Checking via HTTP API...")
    
    async with httpx.AsyncClient() as client:
        # First, discover some tools
        response = await client.post(
            "http://localhost:8000/api/tools/discover",
            json={"query": "search", "limit": 10}
        )
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Discovery response has keys: {list(data.keys())}")
            
            if "tools" in data:
                tools = data["tools"]
                print(f"✅ Found {len(tools)} tools for 'search' query")
                
                for tool in tools[:3]:
                    print(f"  - {tool.get('tool_id')} from {tool.get('server')}")


async def main():
    """Run all checks."""
    print("MCP Tool Name Checker")
    print("=" * 50)
    
    # Check server health
    async with httpx.AsyncClient() as client:
        try:
            health = await client.get("http://localhost:8000/health")
            print(f"✅ Server is {health.json()['status']}")
        except Exception as e:
            print(f"❌ Server not running: {e}")
            return
    
    # Check via HTTP first
    await check_via_http()
    
    # Then check via MCP SDK
    await check_via_mcp_sdk()


if __name__ == "__main__":
    asyncio.run(main())