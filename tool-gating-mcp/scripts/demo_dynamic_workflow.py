#!/usr/bin/env python3
"""
Demonstrate the Tool Gating workflow:
1. Claude starts with ONLY Tool Gating MCP
2. Claude uses Tool Gating to discover what tools are available
3. Claude gets tool definitions from Tool Gating
4. Claude uses those tool definitions to call the actual MCP servers

This avoids loading all MCP servers and their tools into Claude's context at startup.
"""

import json
import subprocess
import tempfile
from pathlib import Path
import asyncio
import httpx

from rich.console import Console
from rich.table import Table
from rich.panel import Panel

console = Console()


def create_claude_config_with_tool_gating_only() -> Path:
    """Create config with ONLY Tool Gating - no other MCP servers."""
    config = {
        "mcpServers": {
            "tool-gating": {
                "command": "/Users/andremachon/.local/bin/mcp-proxy",
                "args": ["http://localhost:8000/mcp"],
                "env": {}
            }
        }
    }
    
    config_file = Path(tempfile.mktemp(suffix="_tool_gating_only.json"))
    config_file.write_text(json.dumps(config, indent=2))
    return config_file


async def ensure_tools_registered():
    """Make sure we have tools from various MCP servers registered."""
    console.print("\n[cyan]Ensuring tools are registered in Tool Gating...[/cyan]")
    
    # First, let's register more tools from different servers
    tools_to_register = [
        # Exa tools
        {
            "id": "exa_web_search",
            "name": "web_search_exa",
            "description": "Search the web using Exa AI - performs real-time web searches",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search query"},
                    "numResults": {"type": "number", "default": 5}
                },
                "required": ["query"]
            },
            "tags": ["search", "web", "exa", "internet"],
            "estimated_tokens": 150,
            "server": "exa"
        },
        # Atlas tools
        {
            "id": "atlas_create_note",
            "name": "create_note",
            "description": "Create a new note in Atlas knowledge base",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "content": {"type": "string"},
                    "tags": {"type": "array", "items": {"type": "string"}}
                },
                "required": ["title", "content"]
            },
            "tags": ["knowledge", "notes", "atlas", "storage"],
            "estimated_tokens": 100,
            "server": "atlas"
        }
    ]
    
    async with httpx.AsyncClient() as client:
        for tool in tools_to_register:
            try:
                response = await client.post(
                    "http://localhost:8000/api/tools/register",
                    json=tool
                )
                if response.status_code == 200:
                    console.print(f"✅ Registered: {tool['name']} from {tool['server']}")
            except Exception as e:
                console.print(f"[yellow]Note: {tool['name']} may already exist[/yellow]")


def demonstrate_workflow():
    """Show the complete Tool Gating workflow."""
    console.print(Panel.fit(
        "[bold green]Tool Gating Dynamic Workflow Demo[/bold green]\n\n"
        "This demonstrates how Claude can:\n"
        "1. Start with ONLY Tool Gating MCP\n"
        "2. Discover tools dynamically based on needs\n"
        "3. Get tool definitions without loading all MCP servers"
    ))
    
    # Create config with only Tool Gating
    config_file = create_claude_config_with_tool_gating_only()
    console.print(f"\n[cyan]Created Claude config with ONLY Tool Gating:[/cyan]")
    console.print(json.dumps(json.loads(config_file.read_text()), indent=2))
    
    # Test 1: Show available tools at startup
    console.print("\n[bold yellow]Test 1: What tools does Claude have at startup?[/bold yellow]")
    cmd1 = [
        "claude", "-p",
        "List all the MCP tools you currently have access to. Just list their names.",
        "--mcp-config", str(config_file),
        "--allowedTools", "*",
        "--max-turns", "1"
    ]
    
    result1 = subprocess.run(cmd1, capture_output=True, text=True)
    console.print("[green]Claude's response:[/green]")
    console.print(result1.stdout or result1.stderr)
    
    # Test 2: Use Tool Gating to discover tools
    console.print("\n[bold yellow]Test 2: Using Tool Gating to discover web search tools[/bold yellow]")
    cmd2 = [
        "claude", "-p",
        "Use the tool-gating MCP server's discover_tools function to find tools for 'web search internet'. Show me what you find.",
        "--mcp-config", str(config_file),
        "--allowedTools", "mcp__tool-gating__discover_tools",
        "--max-turns", "2"
    ]
    
    result2 = subprocess.run(cmd2, capture_output=True, text=True)
    console.print("[green]Claude's response:[/green]")
    console.print(result2.stdout or result2.stderr)
    
    # Test 3: Provision specific tools
    console.print("\n[bold yellow]Test 3: Provisioning tools for a specific task[/bold yellow]")
    cmd3 = [
        "claude", "-p",
        "Use tool-gating to provision tools for taking a screenshot of a webpage. Use the provision_tools function.",
        "--mcp-config", str(config_file),
        "--allowedTools", "mcp__tool-gating__provision_tools,mcp__tool-gating__discover_tools",
        "--max-turns", "3"
    ]
    
    result3 = subprocess.run(cmd3, capture_output=True, text=True)
    console.print("[green]Claude's response:[/green]")
    console.print(result3.stdout or result3.stderr)
    
    # Show what would happen with all servers loaded
    console.print("\n[bold red]Compare: What if we loaded ALL MCP servers directly?[/bold red]")
    
    table = Table(title="Context Usage Comparison")
    table.add_column("Approach", style="cyan")
    table.add_column("Tools Loaded", style="yellow")
    table.add_column("Context Tokens", style="red")
    
    table.add_row(
        "Tool Gating Only",
        "~6 tools (tool-gating functions)",
        "~500 tokens"
    )
    table.add_row(
        "All MCP Servers",
        "100+ tools (all servers)",
        "~10,000+ tokens"
    )
    
    console.print(table)
    
    # Cleanup
    config_file.unlink()
    
    console.print("\n[bold green]Key Insight:[/bold green]")
    console.print("With Tool Gating, Claude can discover and get definitions for ANY tool")
    console.print("from ANY registered MCP server, but only loads what's needed for the task!")
    console.print("\n[yellow]Note:[/yellow] To actually execute the discovered tools, you would need to:")
    console.print("1. Use the MCP connector in the Messages API (for programmatic use)")
    console.print("2. Or temporarily add the specific MCP server to Claude's config")


async def main():
    # First ensure we have tools registered
    await ensure_tools_registered()
    
    # Then run the demonstration
    demonstrate_workflow()


if __name__ == "__main__":
    asyncio.run(main())