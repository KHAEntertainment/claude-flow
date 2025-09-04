#!/usr/bin/env python3
"""
Debug MCP tool names to find which ones exceed Claude's 64-character limit.

This script:
1. Connects to Tool Gating MCP server
2. Lists all available tools
3. Checks for tool names > 64 characters
4. Tests with Claude Code in headless mode
"""

import json
import subprocess
import tempfile
import os
from pathlib import Path
from typing import Dict, List, Any

import httpx
from rich.console import Console
from rich.table import Table
from rich.progress import track

console = Console()


async def get_all_tools() -> List[Dict[str, Any]]:
    """Fetch all tools from Tool Gating server."""
    async with httpx.AsyncClient() as client:
        # Discover all tools (empty query gets everything)
        response = await client.post(
            "http://localhost:8000/api/tools/discover",
            json={"query": "", "limit": 1000}
        )
        data = response.json()
        console.print(f"[dim]Response keys: {list(data.keys())}[/dim]")
        
        # Handle both possible response formats
        if "tools" in data:
            return data["tools"]
        elif "error" in data:
            console.print(f"[red]Error from server: {data['error']}[/red]")
            return []
        else:
            console.print(f"[yellow]Unexpected response format[/yellow]")
            return []


async def check_mcp_endpoint() -> Dict[str, Any]:
    """Check the MCP endpoint directly to see tool formatting."""
    async with httpx.AsyncClient() as client:
        # Connect to MCP endpoint
        response = await client.get(
            "http://localhost:8000/mcp",
            headers={"Accept": "text/event-stream"}
        )
        
        # Read the SSE stream for tool information
        lines = []
        async for line in response.aiter_lines():
            lines.append(line)
            if len(lines) > 100:  # Limit output
                break
        
        return {"lines": lines, "status": response.status_code}


def analyze_tool_names(tools: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    """Analyze tool names for length issues."""
    analysis = {
        "valid": [],
        "too_long": [],
        "warnings": []
    }
    
    for tool in tools:
        tool_id = tool.get("tool_id", "")
        name = tool.get("name", "")
        server = tool.get("server", "unknown")
        
        # Check different name formats
        mcp_tool_name = f"mcp__tool-gating__{name}"
        
        tool_info = {
            "tool_id": tool_id,
            "name": name,
            "server": server,
            "mcp_name": mcp_tool_name,
            "mcp_name_length": len(mcp_tool_name),
            "description": tool.get("description", "")[:50] + "..."
        }
        
        if len(mcp_tool_name) > 64:
            analysis["too_long"].append(tool_info)
        elif len(mcp_tool_name) > 50:
            analysis["warnings"].append(tool_info)
        else:
            analysis["valid"].append(tool_info)
    
    return analysis


def create_test_mcp_config() -> Path:
    """Create a minimal MCP configuration for testing."""
    config = {
        "mcpServers": {
            "tool-gating": {
                "command": "/Users/andremachon/.local/bin/mcp-proxy",
                "args": ["http://localhost:8000/mcp"]
            }
        }
    }
    
    config_file = Path(tempfile.mktemp(suffix=".json"))
    config_file.write_text(json.dumps(config, indent=2))
    return config_file


def test_with_claude_headless(config_path: Path, model: str = "claude-3-5-sonnet-20241022"):
    """Test Tool Gating with Claude in headless mode."""
    # Set environment variables for Claude
    env = os.environ.copy()
    env["ANTHROPIC_MODEL"] = model
    
    # Create a simple test prompt
    test_prompt = "List available MCP tools"
    
    cmd = [
        "npx", "claude-code",
        "--prompt", test_prompt,
        "--mcp-config", str(config_path),
        "--model", model,
        "--max-tokens", "500",
        "--no-interactive"
    ]
    
    console.print(f"\n[cyan]Testing with Claude Code (headless):[/cyan]")
    console.print(f"Command: {' '.join(cmd)}")
    
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            env=env,
            timeout=30
        )
        
        console.print(f"\n[yellow]Exit code:[/yellow] {result.returncode}")
        console.print(f"\n[yellow]Stdout:[/yellow]\n{result.stdout}")
        console.print(f"\n[yellow]Stderr:[/yellow]\n{result.stderr}")
        
        return result
        
    except subprocess.TimeoutExpired:
        console.print("[red]❌ Command timed out[/red]")
        return None
    except Exception as e:
        console.print(f"[red]❌ Error:[/red] {e}")
        return None


async def main():
    """Main debugging function."""
    console.print("[bold green]MCP Tool Name Debugging Script[/bold green]\n")
    
    # 1. Check server health
    try:
        async with httpx.AsyncClient() as client:
            health = await client.get("http://localhost:8000/health")
            console.print(f"✅ Server status: {health.json()['status']}")
    except Exception as e:
        console.print(f"[red]❌ Server not running:[/red] {e}")
        console.print("[yellow]Start server with: tool-gating-mcp[/yellow]")
        return
    
    # 2. Get all tools
    console.print("\n[cyan]Fetching all tools...[/cyan]")
    tools = await get_all_tools()
    console.print(f"✅ Found {len(tools)} tools")
    
    # 3. Analyze tool names
    console.print("\n[cyan]Analyzing tool names...[/cyan]")
    analysis = analyze_tool_names(tools)
    
    # 4. Display results
    if analysis["too_long"]:
        console.print(f"\n[red]❌ Found {len(analysis['too_long'])} tools with names > 64 characters:[/red]")
        
        table = Table(title="Tools with Long Names")
        table.add_column("Server", style="cyan")
        table.add_column("Tool Name", style="yellow")
        table.add_column("MCP Name", style="red")
        table.add_column("Length", style="magenta")
        
        for tool in analysis["too_long"]:
            table.add_row(
                tool["server"],
                tool["name"],
                tool["mcp_name"],
                str(tool["mcp_name_length"])
            )
        
        console.print(table)
    
    if analysis["warnings"]:
        console.print(f"\n[yellow]⚠️  Found {len(analysis['warnings'])} tools with names > 50 characters:[/yellow]")
        
        table = Table(title="Tools with Warning Length")
        table.add_column("Server", style="cyan")
        table.add_column("Tool Name", style="yellow")
        table.add_column("Length", style="magenta")
        
        for tool in analysis["warnings"][:5]:  # Show first 5
            table.add_row(
                tool["server"],
                tool["name"],
                str(tool["mcp_name_length"])
            )
        
        console.print(table)
    
    console.print(f"\n[green]✅ {len(analysis['valid'])} tools have valid name lengths[/green]")
    
    # 5. Check MCP endpoint
    console.print("\n[cyan]Checking MCP endpoint response...[/cyan]")
    mcp_response = await check_mcp_endpoint()
    console.print(f"MCP endpoint status: {mcp_response['status']}")
    
    # 6. Test with Claude if requested
    console.print("\n[cyan]Do you want to test with Claude Code headless? (y/n)[/cyan]")
    if input().lower() == 'y':
        config_path = create_test_mcp_config()
        try:
            test_with_claude_headless(config_path)
        finally:
            config_path.unlink()
    
    # 7. Suggest fixes
    if analysis["too_long"]:
        console.print("\n[bold yellow]Suggested Fixes:[/bold yellow]")
        console.print("1. Shorten tool names in the MCP server implementations")
        console.print("2. Update the tool name format in Tool Gating")
        console.print("3. Use shorter prefixes for MCP tool names")
        
        console.print("\n[cyan]Example fix in api/proxy.py:[/cyan]")
        console.print("""
# Instead of: mcp__tool-gating__very_long_tool_name_from_server
# Use:        mcp__tg__tool_name

# Or modify the tool exposure in main.py to use shorter names
""")


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())