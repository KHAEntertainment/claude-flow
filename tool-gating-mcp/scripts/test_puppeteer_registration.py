#!/usr/bin/env python3
"""
Test registration of Puppeteer MCP server with real tool definitions
"""

import asyncio
import json
import httpx
from rich.console import Console
from rich.table import Table
from rich.json import JSON
from rich.panel import Panel

console = Console()
BASE_URL = "http://localhost:8000"

# Real Puppeteer MCP tools based on the actual server
PUPPETEER_TOOLS = [
    {
        "name": "puppeteer_navigate",
        "description": "Navigate to a URL",
        "inputSchema": {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "URL to navigate to"
                }
            },
            "required": ["url"]
        },
        "tags": ["browser", "navigation", "puppeteer"],
        "estimated_tokens": 100
    },
    {
        "name": "puppeteer_screenshot", 
        "description": "Take a screenshot of the current page",
        "inputSchema": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "Name for the screenshot"
                },
                "fullPage": {
                    "type": "boolean",
                    "description": "Capture full page",
                    "default": False
                }
            },
            "required": ["name"]
        },
        "tags": ["browser", "screenshot", "puppeteer"],
        "estimated_tokens": 120
    },
    {
        "name": "puppeteer_click",
        "description": "Click an element on the page",
        "inputSchema": {
            "type": "object",
            "properties": {
                "selector": {
                    "type": "string",
                    "description": "CSS selector for element to click"
                }
            },
            "required": ["selector"]
        },
        "tags": ["browser", "interaction", "puppeteer"],
        "estimated_tokens": 80
    },
    {
        "name": "puppeteer_fill",
        "description": "Fill out an input field",
        "inputSchema": {
            "type": "object",
            "properties": {
                "selector": {
                    "type": "string",
                    "description": "CSS selector for input field"
                },
                "value": {
                    "type": "string",
                    "description": "Value to fill"
                }
            },
            "required": ["selector", "value"]
        },
        "tags": ["browser", "form", "input", "puppeteer"],
        "estimated_tokens": 90
    },
    {
        "name": "puppeteer_evaluate",
        "description": "Execute JavaScript in the browser console",
        "inputSchema": {
            "type": "object",
            "properties": {
                "script": {
                    "type": "string",
                    "description": "JavaScript code to execute"
                }
            },
            "required": ["script"]
        },
        "tags": ["browser", "javascript", "puppeteer"],
        "estimated_tokens": 110
    }
]


async def test_puppeteer_registration():
    """Test registering Puppeteer MCP server"""
    
    # 1. Health check
    console.print("[bold cyan]1. Checking server health[/bold cyan]")
    async with httpx.AsyncClient() as client:
        response = await client.get(f"{BASE_URL}/health")
        if response.status_code == 200:
            console.print("[green]✅ Server is healthy[/green]")
        else:
            console.print("[red]❌ Server is not healthy[/red]")
            return
    
    # 2. Register Puppeteer MCP server
    console.print("\n[bold cyan]2. Registering Puppeteer MCP server[/bold cyan]")
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{BASE_URL}/api/v1/mcp/servers/register",
            json={
                "name": "puppeteer",
                "config": {
                    "command": "mcp-server-puppeteer",
                    "args": [],
                    "env": {}
                },
                "description": "Puppeteer browser automation MCP server"
            }
        )
        result = response.json()
        console.print(f"Registration: {result.get('status', 'unknown')}")
        console.print(f"Message: {result.get('message', '')}")
    
    # 3. Register Puppeteer tools
    console.print("\n[bold cyan]3. Registering Puppeteer tools[/bold cyan]")
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{BASE_URL}/api/v1/mcp/ai/register-server?server_name=puppeteer",
            json={
                "config": {
                    "command": "mcp-server-puppeteer",
                    "args": [],
                    "env": {}
                },
                "tools": PUPPETEER_TOOLS
            }
        )
        if response.status_code == 200:
            result = response.json()
            console.print(f"Status: {result.get('status', 'success')}")
            console.print(f"Tools registered: {result.get('total_tools', len(PUPPETEER_TOOLS))}")
            console.print(f"Registered tools: {', '.join(result.get('tools_registered', []))}")
        else:
            console.print(f"[red]Error: {response.status_code}[/red]")
            console.print(response.text)
    
    # 4. Test discovery
    console.print("\n[bold cyan]4. Testing tool discovery[/bold cyan]")
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{BASE_URL}/api/v1/tools/discover",
            json={
                "query": "I need to automate web browser interactions and take screenshots",
                "tags": ["browser", "automation"],
                "limit": 10
            }
        )
        results = response.json()
        
        console.print(f"\nFound {len(results['tools'])} matching tools:")
        
        table = Table(title="Discovered Browser Automation Tools")
        table.add_column("Tool", style="cyan")
        table.add_column("Score", style="green")
        table.add_column("Server", style="yellow")
        table.add_column("Tags", style="magenta")
        
        for tool in results["tools"]:
            table.add_row(
                tool["name"],
                f"{tool['score']:.3f}",
                tool.get("server", "unknown"),
                ", ".join(tool.get("matched_tags", []))
            )
        
        console.print(table)
    
    # 5. Provision tools
    console.print("\n[bold cyan]5. Provisioning browser automation tools[/bold cyan]")
    
    # Select top tools from discovery
    tool_ids = [tool["tool_id"] for tool in results["tools"][:4]]
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{BASE_URL}/api/v1/tools/provision",
            json={
                "tool_ids": tool_ids,
                "context_tokens": 500
            }
        )
        provisioned = response.json()
        
        console.print(f"\nProvisioned {len(provisioned['tools'])} tools")
        console.print(f"Total tokens: {provisioned['metadata']['total_tokens']}")
        
        # Show first tool in detail
        if provisioned["tools"]:
            console.print("\n[bold]First provisioned tool:[/bold]")
            console.print(Panel(JSON(json.dumps(provisioned["tools"][0], indent=2))))
    
    # 6. List all servers
    console.print("\n[bold cyan]6. All registered MCP servers[/bold cyan]")
    async with httpx.AsyncClient() as client:
        response = await client.get(f"{BASE_URL}/api/v1/mcp/servers")
        servers = response.json()
        
        console.print(f"\nTotal servers: {len(servers)}")
        for server in servers:
            console.print(f"  - {server}")
            
        if "puppeteer" in servers:
            console.print("\n[green]✅ Puppeteer server successfully registered![/green]")
        else:
            console.print("\n[red]❌ Puppeteer server not found[/red]")


if __name__ == "__main__":
    console.print("[bold green]Puppeteer MCP Server Registration Test[/bold green]\n")
    asyncio.run(test_puppeteer_registration())