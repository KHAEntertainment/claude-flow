#!/usr/bin/env python3
"""
Test Tool Gating MCP with Claude Code in headless mode.

This script demonstrates how to use Claude Code programmatically 
to test our Tool Gating MCP server.
"""

import json
import subprocess
import tempfile
from pathlib import Path

import httpx
from rich.console import Console

console = Console()


def create_mcp_config(server_url: str = "http://localhost:8000/mcp") -> Path:
    """Create MCP configuration file for Claude Code."""
    config = {
        "tool-gating": {
            "command": "mcp-proxy",
            "args": [server_url],
            "env": {}
        }
    }
    
    # Write to temporary file
    config_file = Path(tempfile.mktemp(suffix=".json"))
    config_file.write_text(json.dumps(config, indent=2))
    return config_file


def run_claude_code(prompt: str, mcp_config: Path, allowed_tools: str = "mcp__tool-gating__*"):
    """Run Claude Code in non-interactive mode with MCP."""
    cmd = [
        "claude",
        "-p", prompt,
        "--mcp-config", str(mcp_config),
        "--allowedTools", allowed_tools,
        "--output-format", "json",
        "--max-turns", "3"
    ]
    
    console.print(f"[cyan]Running command:[/cyan] {' '.join(cmd)}")
    
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=True
        )
        
        # Parse JSON output
        output = json.loads(result.stdout)
        return output
        
    except subprocess.CalledProcessError as e:
        console.print(f"[red]Error running Claude Code:[/red] {e}")
        console.print(f"[red]Stderr:[/red] {e.stderr}")
        return None
    except json.JSONDecodeError as e:
        console.print(f"[red]Error parsing JSON output:[/red] {e}")
        console.print(f"[yellow]Raw output:[/yellow] {result.stdout}")
        return None


async def test_tool_discovery():
    """Test the complete tool discovery workflow."""
    console.print("\n[bold green]Testing Tool Gating MCP with Claude Code[/bold green]\n")
    
    # 1. Check if server is running
    async with httpx.AsyncClient() as client:
        try:
            health = await client.get("http://localhost:8000/health")
            console.print(f"✅ Tool Gating server is {health.json()['status']}")
        except Exception as e:
            console.print(f"[red]❌ Server not running:[/red] {e}")
            console.print("[yellow]Please start the server with: tool-gating-mcp[/yellow]")
            return
    
    # 2. Create MCP configuration
    mcp_config = create_mcp_config()
    console.print(f"✅ Created MCP config at: {mcp_config}")
    
    # 3. Test 1: Discover tools
    console.print("\n[cyan]Test 1: Discovering tools for web search[/cyan]")
    result1 = run_claude_code(
        prompt="Use the tool-gating MCP server to discover tools for web search. List what you find.",
        mcp_config=mcp_config
    )
    
    if result1:
        console.print("[green]✅ Test 1 passed[/green]")
        console.print(f"Result: {json.dumps(result1, indent=2)}")
    
    # 4. Test 2: Provision tools
    console.print("\n[cyan]Test 2: Provisioning specific tools[/cyan]")
    result2 = run_claude_code(
        prompt="Use tool-gating to provision the puppeteer screenshot tool if available.",
        mcp_config=mcp_config
    )
    
    if result2:
        console.print("[green]✅ Test 2 passed[/green]")
        console.print(f"Result: {json.dumps(result2, indent=2)}")
    
    # 5. Test 3: List MCP servers
    console.print("\n[cyan]Test 3: List registered MCP servers[/cyan]")
    result3 = run_claude_code(
        prompt="Use tool-gating to list all registered MCP servers.",
        mcp_config=mcp_config
    )
    
    if result3:
        console.print("[green]✅ Test 3 passed[/green]")
        console.print(f"Result: {json.dumps(result3, indent=2)}")
    
    # Cleanup
    mcp_config.unlink()
    console.print("\n[green]✅ All tests completed![/green]")


if __name__ == "__main__":
    import asyncio
    asyncio.run(test_tool_discovery())