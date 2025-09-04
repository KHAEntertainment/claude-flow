#!/usr/bin/env python3
"""
Full Integration Test for Tool Gating MCP System

This script demonstrates the complete AI-assisted MCP server registration flow:
1. Register a new MCP server with the system
2. Discover tools from that server
3. Search for relevant tools
4. Provision tools with token budget constraints
"""

import asyncio
import json
from typing import Any

import httpx
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.json import JSON

console = Console()

# API base URL
BASE_URL = "http://localhost:8000"


async def health_check() -> bool:
    """Check if the server is running"""
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(f"{BASE_URL}/health")
            return response.status_code == 200
        except:
            return False


async def register_filesystem_mcp_server() -> dict[str, Any]:
    """Register a filesystem MCP server"""
    console.print("\n[bold cyan]1. Registering Filesystem MCP Server[/bold cyan]")
    
    server_config = {
        "name": "filesystem-tools",
        "config": {
            "command": "mcp-filesystem",
            "args": ["--root", "/tmp", "--read-only"],
            "env": {}
        },
        "description": "MCP server for filesystem operations"
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{BASE_URL}/api/v1/mcp/servers/register",
            json=server_config
        )
        
        result = response.json()
        console.print(f"Registration: {result['status']}")
        console.print(f"Message: {result['message']}")
        
        return result


async def simulate_ai_tool_discovery() -> list[dict[str, Any]]:
    """Simulate an AI assistant discovering tools from the filesystem server"""
    console.print("\n[bold cyan]2. AI-Assisted Tool Discovery[/bold cyan]")
    
    # Simulate tools that an AI would discover from a filesystem MCP server
    filesystem_tools = [
        {
            "name": "read_file",
            "description": "Read contents of a file from the filesystem",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Path to the file to read"
                    },
                    "encoding": {
                        "type": "string",
                        "description": "File encoding",
                        "default": "utf-8"
                    }
                },
                "required": ["path"]
            },
            "tags": ["filesystem", "read", "file"],
            "estimated_tokens": 120
        },
        {
            "name": "list_directory",
            "description": "List contents of a directory with filtering options",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Directory path"
                    },
                    "pattern": {
                        "type": "string",
                        "description": "Glob pattern for filtering"
                    }
                },
                "required": ["path"]
            },
            "tags": ["filesystem", "directory", "list"],
            "estimated_tokens": 100
        },
        {
            "name": "file_info",
            "description": "Get metadata about a file (size, modified time, permissions)",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Path to the file"
                    }
                },
                "required": ["path"]
            },
            "tags": ["filesystem", "metadata", "info"],
            "estimated_tokens": 80
        },
        {
            "name": "search_files",
            "description": "Search for files by name or content pattern",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Starting directory"
                    },
                    "pattern": {
                        "type": "string",
                        "description": "Search pattern"
                    },
                    "content": {
                        "type": "boolean",
                        "description": "Search in file contents",
                        "default": False
                    }
                },
                "required": ["path", "pattern"]
            },
            "tags": ["filesystem", "search", "find"],
            "estimated_tokens": 150
        }
    ]
    
    console.print(f"AI discovered {len(filesystem_tools)} tools from filesystem-tools server")
    
    return filesystem_tools


async def register_discovered_tools(tools: list[dict[str, Any]]) -> dict[str, Any]:
    """Register the discovered tools using the AI endpoint"""
    console.print("\n[bold cyan]3. Registering Discovered Tools[/bold cyan]")
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{BASE_URL}/api/v1/mcp/ai/register-server",
            params={"server_name": "filesystem-tools"},
            json={
                "config": {
                    "command": "mcp-filesystem",
                    "args": ["--root", "/tmp", "--read-only"],
                    "env": {}
                },
                "tools": tools
            }
        )
        
        if response.status_code == 200:
            result = response.json()
            console.print(f"Status: {result.get('status', 'success')}")
            console.print(f"Tools registered: {result.get('total_tools', len(tools))}")
        else:
            console.print(f"[red]Error: {response.status_code}[/red]")
            console.print(response.text)
            result = {"status": "error"}
        
        return result


async def test_tool_discovery() -> None:
    """Test discovering tools with semantic search"""
    console.print("\n[bold cyan]4. Testing Tool Discovery[/bold cyan]")
    
    test_queries = [
        {
            "query": "I need to read files and search through directories",
            "tags": ["filesystem"]
        },
        {
            "query": "find information about files and their metadata",
            "limit": 3
        },
        {
            "query": "search and list directory contents",
            "tags": ["search", "list"]
        }
    ]
    
    async with httpx.AsyncClient() as client:
        for test_case in test_queries:
            console.print(f"\n[yellow]Query:[/yellow] {test_case['query']}")
            if 'tags' in test_case:
                console.print(f"[yellow]Tags:[/yellow] {test_case['tags']}")
            
            response = await client.post(
                f"{BASE_URL}/api/v1/tools/discover",
                json=test_case
            )
            
            results = response.json()
            
            # Display results in a table
            table = Table(title="Discovery Results")
            table.add_column("Tool", style="cyan")
            table.add_column("Score", style="green")
            table.add_column("Server", style="yellow")
            table.add_column("Tokens", style="magenta")
            
            for tool in results["tools"][:5]:  # Show top 5
                table.add_row(
                    tool["name"],
                    f"{tool['score']:.3f}",
                    tool.get("server", "unknown"),
                    str(tool["estimated_tokens"])
                )
            
            console.print(table)


async def test_cross_server_provisioning() -> None:
    """Test provisioning tools from multiple servers"""
    console.print("\n[bold cyan]5. Cross-Server Tool Provisioning[/bold cyan]")
    
    # Search for tools that work with documentation and files
    async with httpx.AsyncClient() as client:
        # First discover relevant tools
        discover_response = await client.post(
            f"{BASE_URL}/api/v1/tools/discover",
            json={
                "query": "I need to work with documentation files and search for information",
                "limit": 10
            }
        )
        
        discovered = discover_response.json()
        console.print(f"\nFound {len(discovered['tools'])} relevant tools")
        
        # Count tools by server
        servers = {}
        for tool in discovered["tools"]:
            server = tool.get("server", "unknown")
            servers[server] = servers.get(server, 0) + 1
        
        console.print("\nTools by server:")
        for server, count in servers.items():
            console.print(f"  - {server}: {count} tools")
        
        # Provision with token budget
        tool_ids = [t["tool_id"] for t in discovered["tools"]]
        
        provision_response = await client.post(
            f"{BASE_URL}/api/v1/tools/provision",
            json={
                "tool_ids": tool_ids,
                "context_tokens": 500  # Limited budget
            }
        )
        
        provisioned = provision_response.json()
        
        console.print(f"\n[green]Provisioned {len(provisioned['tools'])} tools[/green]")
        console.print(f"Total tokens: {provisioned['metadata']['total_tokens']}")
        console.print(f"Gating applied: {provisioned['metadata']['gating_applied']}")
        
        # Show provisioned tools by server
        prov_servers = {}
        for tool in provisioned["tools"]:
            server = tool.get("server", "unknown")
            prov_servers[server] = prov_servers.get(server, 0) + 1
        
        console.print("\nProvisioned tools by server:")
        for server, count in prov_servers.items():
            console.print(f"  - {server}: {count} tools")
        
        # Display the MCP-formatted response
        console.print("\n[bold]MCP Response Format:[/bold]")
        console.print(Panel(JSON(json.dumps(provisioned, indent=2)), title="Provisioned Tools"))


async def test_list_all_servers() -> None:
    """List all registered MCP servers"""
    console.print("\n[bold cyan]6. List All MCP Servers[/bold cyan]")
    
    async with httpx.AsyncClient() as client:
        response = await client.get(f"{BASE_URL}/api/v1/mcp/servers")
        servers = response.json()
        
        console.print(f"\nRegistered MCP servers: {len(servers)}")
        for server in servers:
            console.print(f"  - {server}")


async def main():
    """Run the full integration test"""
    console.print("[bold green]Tool Gating MCP - Full Integration Test[/bold green]")
    
    # Check server health
    if not await health_check():
        console.print("[red]Error: Server is not running![/red]")
        console.print("Please start the server with: tool-gating-mcp")
        return
    
    console.print("[green]✅ Server is healthy[/green]")
    
    try:
        # 1. Register MCP server
        await register_filesystem_mcp_server()
        
        # 2. Simulate AI discovering tools
        tools = await simulate_ai_tool_discovery()
        
        # 3. Register discovered tools
        await register_discovered_tools(tools)
        
        # 4. Test tool discovery
        await test_tool_discovery()
        
        # 5. Test cross-server provisioning
        await test_cross_server_provisioning()
        
        # 6. List all servers
        await test_list_all_servers()
        
        console.print("\n[bold green]✅ Integration test completed successfully![/bold green]")
        
    except Exception as e:
        console.print(f"\n[red]Error during test: {str(e)}[/red]")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(main())