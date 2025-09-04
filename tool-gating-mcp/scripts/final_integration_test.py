#!/usr/bin/env python3
"""
Final integration test showing complete workflow with Puppeteer tools
"""

import asyncio
import json
import httpx
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.json import JSON

console = Console()
BASE_URL = "http://localhost:8000"

# Realistic Puppeteer MCP tools
PUPPETEER_TOOLS = [
    {
        "id": "puppeteer_navigate",
        "name": "Navigate to URL",
        "description": "Navigate the browser to a specified URL and wait for page load",
        "parameters": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "URL to navigate to"},
                "waitUntil": {
                    "type": "string",
                    "enum": ["load", "domcontentloaded", "networkidle0", "networkidle2"],
                    "default": "load"
                }
            },
            "required": ["url"]
        },
        "tags": ["browser", "navigation", "puppeteer", "web", "url"],
        "estimated_tokens": 100,
        "server": "puppeteer"
    },
    {
        "id": "puppeteer_screenshot",
        "name": "Take Screenshot", 
        "description": "Capture a screenshot of the current page or specific element",
        "parameters": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Screenshot filename"},
                "selector": {"type": "string", "description": "CSS selector for element"},
                "fullPage": {"type": "boolean", "default": False}
            },
            "required": ["name"]
        },
        "tags": ["browser", "screenshot", "puppeteer", "capture", "image"],
        "estimated_tokens": 120,
        "server": "puppeteer"
    },
    {
        "id": "puppeteer_click",
        "name": "Click Element",
        "description": "Click on a page element specified by CSS selector",
        "parameters": {
            "type": "object",
            "properties": {
                "selector": {"type": "string", "description": "CSS selector"}
            },
            "required": ["selector"]
        },
        "tags": ["browser", "interaction", "puppeteer", "click", "automation"],
        "estimated_tokens": 80,
        "server": "puppeteer"
    },
    {
        "id": "puppeteer_fill",
        "name": "Fill Input Field",
        "description": "Type text into an input field or textarea",
        "parameters": {
            "type": "object",
            "properties": {
                "selector": {"type": "string", "description": "CSS selector for input"},
                "value": {"type": "string", "description": "Text to type"}
            },
            "required": ["selector", "value"]
        },
        "tags": ["browser", "form", "input", "puppeteer", "automation", "type"],
        "estimated_tokens": 90,
        "server": "puppeteer"
    },
    {
        "id": "puppeteer_evaluate",
        "name": "Execute JavaScript",
        "description": "Run JavaScript code in the browser context",
        "parameters": {
            "type": "object",
            "properties": {
                "script": {"type": "string", "description": "JavaScript code"}
            },
            "required": ["script"]
        },
        "tags": ["browser", "javascript", "puppeteer", "execute", "code"],
        "estimated_tokens": 110,
        "server": "puppeteer"
    }
]

# Also add some existing server tools for cross-server testing
EXA_TOOLS = [
    {
        "id": "exa_web_search",
        "name": "Web Search",
        "description": "Search the web using Exa AI for real-time results",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "numResults": {"type": "number", "default": 5}
            },
            "required": ["query"]
        },
        "tags": ["search", "web", "exa", "real-time"],
        "estimated_tokens": 180,
        "server": "exa"
    }
]


async def test_complete_workflow():
    """Run complete integration test"""
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        # 1. Clear existing tools
        console.print("[bold cyan]1. Clearing existing tools[/bold cyan]")
        try:
            response = await client.delete(f"{BASE_URL}/api/v1/tools/clear")
            console.print(f"Clear status: {response.status_code}")
        except Exception as e:
            console.print(f"[yellow]Note: Clear endpoint may need server restart[/yellow]")
        
        # 2. Register all tools
        console.print("\n[bold cyan]2. Registering tools from multiple servers[/bold cyan]")
        
        all_tools = PUPPETEER_TOOLS + EXA_TOOLS
        registered = 0
        
        for tool in all_tools:
            try:
                response = await client.post(
                    f"{BASE_URL}/api/v1/tools/register",
                    json=tool
                )
                if response.status_code == 200:
                    console.print(f"✅ {tool['name']} ({tool['server']})")
                    registered += 1
                else:
                    console.print(f"❌ {tool['name']}: {response.text}")
            except Exception as e:
                console.print(f"❌ {tool['name']}: {str(e)}")
        
        console.print(f"\nRegistered {registered}/{len(all_tools)} tools")
        
        # 3. Test discovery scenarios
        console.print("\n[bold cyan]3. Testing tool discovery scenarios[/bold cyan]")
        
        scenarios = [
            {
                "name": "Browser Automation",
                "query": "I need to automate web browser interactions, fill forms, and take screenshots",
                "tags": ["browser", "automation"]
            },
            {
                "name": "Web Search + Screenshot",
                "query": "Search the web for information and then capture screenshots of the results",
                "tags": ["search", "screenshot"]
            },
            {
                "name": "Form Filling",
                "query": "Fill out forms and click buttons on websites",
                "tags": ["form", "click"]
            }
        ]
        
        for scenario in scenarios:
            console.print(f"\n[yellow]Scenario: {scenario['name']}[/yellow]")
            console.print(f"Query: {scenario['query']}")
            
            response = await client.post(
                f"{BASE_URL}/api/v1/tools/discover",
                json={
                    "query": scenario["query"],
                    "tags": scenario.get("tags", []),
                    "limit": 8
                }
            )
            
            if response.status_code == 200:
                results = response.json()
                
                table = Table(title=f"Results for: {scenario['name']}")
                table.add_column("Tool", style="cyan", width=20)
                table.add_column("Score", style="green", width=8)
                table.add_column("Server", style="yellow", width=10)
                table.add_column("Matched Tags", style="magenta", width=20)
                
                for tool in results["tools"][:5]:
                    table.add_row(
                        tool["name"][:20],
                        f"{tool['score']:.3f}",
                        tool.get("server", "N/A"),
                        ", ".join(tool.get("matched_tags", []))[:20]
                    )
                
                console.print(table)
        
        # 4. Cross-server provisioning
        console.print("\n[bold cyan]4. Cross-server tool provisioning[/bold cyan]")
        
        # Get tools for a complex task
        response = await client.post(
            f"{BASE_URL}/api/v1/tools/discover",
            json={
                "query": "I need to search the web, navigate to results, and take screenshots",
                "limit": 10
            }
        )
        
        if response.status_code == 200:
            discovered = response.json()
            tool_ids = [t["tool_id"] for t in discovered["tools"][:6]]
            
            # Provision with token budget
            response = await client.post(
                f"{BASE_URL}/api/v1/tools/provision",
                json={
                    "tool_ids": tool_ids,
                    "context_tokens": 600
                }
            )
            
            if response.status_code == 200:
                provisioned = response.json()
                
                console.print(f"\nProvisioned {len(provisioned['tools'])} tools")
                console.print(f"Total tokens: {provisioned['metadata']['total_tokens']}")
                
                # Count by server
                servers = {}
                for tool in provisioned["tools"]:
                    server = tool.get("server", "unknown")
                    servers[server] = servers.get(server, 0) + 1
                
                console.print("\nTools by server:")
                for server, count in servers.items():
                    console.print(f"  - {server}: {count} tools")
                
                # Show a Puppeteer tool if present
                puppeteer_tool = next(
                    (t for t in provisioned["tools"] if t.get("server") == "puppeteer"),
                    None
                )
                
                if puppeteer_tool:
                    console.print("\n[bold]Sample Puppeteer tool (MCP format):[/bold]")
                    console.print(Panel(
                        JSON(json.dumps(puppeteer_tool, indent=2)),
                        title=puppeteer_tool["name"]
                    ))
        
        # 5. Verify servers
        console.print("\n[bold cyan]5. Registered MCP servers[/bold cyan]")
        response = await client.get(f"{BASE_URL}/api/v1/mcp/servers")
        if response.status_code == 200:
            servers = response.json()
            console.print(f"\nTotal servers: {len(servers)}")
            for server in servers:
                console.print(f"  - {server}")


async def main():
    console.print("[bold green]Tool Gating MCP - Complete Integration Test[/bold green]")
    console.print("Testing with real Puppeteer MCP server tools\n")
    
    try:
        await test_complete_workflow()
        console.print("\n[bold green]✅ Integration test completed![/bold green]")
    except Exception as e:
        console.print(f"\n[red]Error: {str(e)}[/red]")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(main())