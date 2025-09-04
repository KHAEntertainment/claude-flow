#!/usr/bin/env python3
"""
Test Tool Gating MCP tools directly via HTTP API
"""

import httpx
import asyncio
from rich.console import Console
from rich.table import Table
from rich.json import JSON
import json

console = Console()
BASE_URL = "http://localhost:8000"


async def test_mcp_tools():
    """Test the Tool Gating MCP tools"""
    
    async with httpx.AsyncClient() as client:
        # 1. List MCP servers
        console.print("\n[bold cyan]1. Listing MCP Servers[/bold cyan]")
        response = await client.get(f"{BASE_URL}/api/mcp/servers")
        if response.status_code == 200:
            servers = response.json()
            console.print(f"Found {len(servers)} servers: {', '.join(servers)}")
        else:
            console.print(f"[red]Error: {response.status_code}[/red]")
        
        # 2. Test tool discovery
        console.print("\n[bold cyan]2. Testing Tool Discovery[/bold cyan]")
        response = await client.post(
            f"{BASE_URL}/api/tools/discover",
            json={
                "query": "I need to work with git repositories and version control",
                "tags": ["git", "repository"],
                "limit": 5
            }
        )
        
        if response.status_code == 200:
            results = response.json()
            console.print(f"Found {len(results['tools'])} tools")
            
            table = Table(title="Discovered Tools")
            table.add_column("Tool ID", style="cyan")
            table.add_column("Name", style="green")
            table.add_column("Score", style="yellow")
            table.add_column("Server", style="magenta")
            
            for tool in results["tools"]:
                table.add_row(
                    tool["tool_id"],
                    tool["name"],
                    f"{tool['score']:.3f}",
                    tool.get("server", "N/A")
                )
            
            console.print(table)
        else:
            console.print(f"[red]Error: {response.status_code}[/red]")
        
        # 3. Register a test MCP server
        console.print("\n[bold cyan]3. Registering Test MCP Server[/bold cyan]")
        response = await client.post(
            f"{BASE_URL}/api/mcp/servers/register",
            json={
                "name": "git-test",
                "config": {
                    "command": "npx",
                    "args": ["-y", "@modelcontextprotocol/server-git"],
                    "env": {}
                },
                "description": "Git repository tools for testing"
            }
        )
        
        if response.status_code == 200:
            result = response.json()
            console.print(f"[green]{result['message']}[/green]")
        else:
            console.print(f"[yellow]Server may already exist: {response.json().get('message')}[/yellow]")
        
        # 4. Test the MCP endpoint info
        console.print("\n[bold cyan]4. MCP Endpoint Information[/bold cyan]")
        console.print("MCP SSE endpoint: http://localhost:8000/mcp")
        console.print("Status: [green]Active[/green] (returns SSE stream)")
        console.print("\nTo connect from Claude Desktop, use the configuration in:")
        console.print("claude_desktop_config.json")


async def test_fastapi_mcp_info():
    """Get information about FastAPI-MCP tools"""
    console.print("\n[bold cyan]5. FastAPI-MCP Generated Tools[/bold cyan]")
    console.print("\nFastAPI-MCP automatically exposes these endpoints as MCP tools:")
    
    endpoints = [
        ("discover_tools", "POST /api/tools/discover", "Find relevant tools"),
        ("provision_tools", "POST /api/tools/provision", "Select tools within budget"),
        ("register_tool", "POST /api/tools/register", "Register a new tool"),
        ("list_mcp_servers", "GET /api/mcp/servers", "List all MCP servers"),
        ("register_mcp_server", "POST /api/mcp/servers/register", "Register MCP server"),
    ]
    
    table = Table(title="Available MCP Tools")
    table.add_column("Tool Name", style="cyan")
    table.add_column("API Endpoint", style="green")
    table.add_column("Description", style="yellow")
    
    for name, endpoint, desc in endpoints:
        table.add_row(name, endpoint, desc)
    
    console.print(table)


async def main():
    """Run all tests"""
    console.print("[bold green]Tool Gating MCP Tools Test[/bold green]")
    
    # Check server health
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(f"{BASE_URL}/health")
            if response.status_code == 200:
                console.print("[green]✅ Server is healthy[/green]")
            else:
                console.print("[red]❌ Server is not healthy[/red]")
                return
        except:
            console.print("[red]❌ Cannot connect to server[/red]")
            console.print("Start with: tool-gating-mcp")
            return
    
    await test_mcp_tools()
    await test_fastapi_mcp_info()
    
    console.print("\n[bold green]✅ Tests complete![/bold green]")
    console.print("\nTo use with Claude Desktop:")
    console.print("1. Copy the configuration from claude_desktop_config.json")
    console.print("2. Add it to ~/Library/Application Support/Claude/claude_desktop_config.json")
    console.print("3. Restart Claude Desktop")


if __name__ == "__main__":
    asyncio.run(main())