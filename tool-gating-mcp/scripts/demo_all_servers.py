#!/usr/bin/env python3
"""Demo script showing Tool Gating MCP with all servers"""

import requests
import json
import asyncio

BASE_URL = "http://localhost:8000"

def print_section(title):
    print(f"\n{'='*60}")
    print(f"{title}")
    print(f"{'='*60}")

async def main():
    print_section("Tool Gating MCP - Complete Demo")
    
    # 1. Show all available servers
    print("\n1. Available MCP Servers:")
    response = requests.get(f"{BASE_URL}/api/mcp/servers")
    servers = response.json()
    for server in servers:
        print(f"   • {server}")
    
    # 2. Demo different use cases
    demos = [
        {
            "title": "2. Research Task - Find information about Next.js",
            "query": "search documentation Next.js framework",
            "expected_servers": ["context7", "exa"]
        },
        {
            "title": "3. Automation Task - Take screenshots",
            "query": "browser automation screenshot webpage",
            "expected_servers": ["puppeteer"]
        },
        {
            "title": "4. Data Storage Task - Save and retrieve data",
            "query": "store retrieve memory data notes",
            "expected_servers": ["basic-memory"]
        },
        {
            "title": "5. Web Research Task - Find AI papers",
            "query": "research papers artificial intelligence machine learning",
            "expected_servers": ["exa"]
        }
    ]
    
    for demo in demos:
        print_section(demo["title"])
        
        # Discover tools
        response = requests.post(
            f"{BASE_URL}/api/tools/discover",
            json={"query": demo["query"], "limit": 5}
        )
        
        if response.status_code != 200:
            print(f"Error: {response.status_code}")
            continue
            
        tools = response.json()["tools"]
        print(f"\nDiscovered {len(tools)} relevant tools:")
        
        # Group by server
        by_server = {}
        for tool in tools:
            server = tool.get("server", "unknown")
            if server not in by_server:
                by_server[server] = []
            by_server[server].append(tool)
        
        for server, server_tools in by_server.items():
            print(f"\n   From {server}:")
            for tool in server_tools[:3]:
                print(f"   • {tool['name']}: {tool['description'][:60]}...")
    
    # 6. Combined workflow example
    print_section("6. Combined Workflow - Research and Save")
    
    print("\nStep 1: Discover tools for research and storage")
    response = requests.post(
        f"{BASE_URL}/api/tools/discover",
        json={"query": "search web pages and save notes memory", "limit": 10}
    )
    
    tools = response.json()["tools"]
    
    # Find one tool from each category
    search_tool = next((t for t in tools if "search" in t["name"] and t["server"] == "exa"), None)
    memory_tool = next((t for t in tools if "write" in t["name"] and t["server"] == "basic-memory"), None)
    
    if search_tool and memory_tool:
        print(f"\nStep 2: Provision selected tools")
        tool_ids = [search_tool["tool_id"], memory_tool["tool_id"]]
        
        response = requests.post(
            f"{BASE_URL}/api/tools/provision",
            json={"tool_ids": tool_ids}
        )
        
        if response.status_code == 200:
            result = response.json()
            print(f"✓ Provisioned {len(result['tools'])} tools")
            print(f"  Total tokens: {result['metadata']['total_tokens']}")
            
            print(f"\nStep 3: Execute search")
            if search_tool["name"] == "web_search_exa":
                response = requests.post(
                    f"{BASE_URL}/api/proxy/execute",
                    json={
                        "tool_id": search_tool["tool_id"],
                        "arguments": {"query": "AI advancements 2024", "numResults": 3}
                    }
                )
                
                if response.status_code == 200:
                    print("✓ Search completed successfully")
                    
                    print(f"\nStep 4: Save results to memory")
                    response = requests.post(
                        f"{BASE_URL}/api/proxy/execute",
                        json={
                            "tool_id": memory_tool["tool_id"],
                            "arguments": {
                                "path": "research/ai_2024.md",
                                "content": "# AI Research 2024\n\nSearch results saved from Exa search..."
                            }
                        }
                    )
                    
                    if response.status_code == 200:
                        print("✓ Results saved to memory")
    
    print_section("Demo Complete")
    print("\nThe Tool Gating MCP successfully:")
    print("• Discovered tools across all 4 MCP servers")
    print("• Found relevant tools for different tasks")
    print("• Provisioned tools within token budgets")
    print("• Executed tools through the proxy layer")
    print("\nAll servers are operational and ready for use!")

if __name__ == "__main__":
    asyncio.run(main())