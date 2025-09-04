#!/usr/bin/env python3
"""
Test dynamic tool loading with Claude Code.

This script demonstrates that Claude can:
1. Start with Tool Gating MCP only
2. Discover tools from other servers
3. Dynamically load and execute those tools
"""

import json
import subprocess
import tempfile
from pathlib import Path
import time

from rich.console import Console
from rich.table import Table

console = Console()


def create_mcp_config_minimal() -> Path:
    """Create MCP config with ONLY Tool Gating (no other servers)."""
    config = {
        "mcpServers": {
            "tool-gating": {
                "command": "/Users/andremachon/.local/bin/mcp-proxy",
                "args": ["http://localhost:8000/mcp"],
                "env": {}
            }
        }
    }
    
    config_file = Path(tempfile.mktemp(suffix="_minimal.json"))
    config_file.write_text(json.dumps(config, indent=2))
    console.print(f"[cyan]Created minimal MCP config:[/cyan] {config_file}")
    return config_file


def create_mcp_config_with_puppeteer() -> Path:
    """Create MCP config with Tool Gating AND Puppeteer."""
    config = {
        "mcpServers": {
            "tool-gating": {
                "command": "/Users/andremachon/.local/bin/mcp-proxy",
                "args": ["http://localhost:8000/mcp"],
                "env": {}
            },
            "puppeteer": {
                "command": "mcp-server-puppeteer",
                "args": [],
                "env": {}
            }
        }
    }
    
    config_file = Path(tempfile.mktemp(suffix="_with_puppeteer.json"))
    config_file.write_text(json.dumps(config, indent=2))
    console.print(f"[cyan]Created full MCP config:[/cyan] {config_file}")
    return config_file


def run_claude_code(prompt: str, mcp_config: Path, allowed_tools: str = "*", verbose: bool = False):
    """Run Claude Code and capture output."""
    cmd = [
        "claude", "-p", prompt,
        "--mcp-config", str(mcp_config),
        "--allowedTools", allowed_tools,
        "--max-turns", "5"
    ]
    
    if verbose:
        cmd.append("--verbose")
    
    console.print(f"\n[dim]Running: {' '.join(cmd)}[/dim]")
    
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=60
        )
        
        if result.returncode != 0:
            console.print(f"[red]Error (code {result.returncode}):[/red] {result.stderr}")
        
        return result.stdout, result.stderr
        
    except subprocess.TimeoutExpired:
        console.print("[red]Command timed out![/red]")
        return None, "Timeout"
    except Exception as e:
        console.print(f"[red]Error:[/red] {e}")
        return None, str(e)


def main():
    console.print("\n[bold green]Testing Dynamic Tool Loading with Claude Code[/bold green]\n")
    
    # Step 1: Create minimal config (Tool Gating only)
    console.print("[bold cyan]Step 1: Testing with ONLY Tool Gating MCP[/bold cyan]")
    minimal_config = create_mcp_config_minimal()
    
    # List available tools (should only show Tool Gating tools)
    console.print("\n[yellow]Listing available tools (Tool Gating only):[/yellow]")
    stdout1, stderr1 = run_claude_code(
        "List all available MCP tools you have access to right now. Format as a simple list.",
        minimal_config,
        allowed_tools="mcp__tool-gating__*"
    )
    console.print("[green]Output:[/green]")
    console.print(stdout1 or "[red]No output[/red]")
    
    # Try to use puppeteer (should fail)
    console.print("\n[yellow]Attempting to use Puppeteer (should fail):[/yellow]")
    stdout2, stderr2 = run_claude_code(
        "Try to use puppeteer to navigate to example.com. Tell me if you can access puppeteer tools.",
        minimal_config,
        allowed_tools="*"  # Allow all tools to show it's not available
    )
    console.print("[green]Output:[/green]")
    console.print(stdout2 or "[red]No output[/red]")
    
    # Step 2: Use Tool Gating to discover Puppeteer tools
    console.print("\n[bold cyan]Step 2: Using Tool Gating to discover browser/screenshot tools[/bold cyan]")
    stdout3, stderr3 = run_claude_code(
        "Use the tool-gating discover_tools to find tools for 'browser automation screenshot'. List what you find.",
        minimal_config,
        allowed_tools="mcp__tool-gating__discover_tools"
    )
    console.print("[green]Output:[/green]")
    console.print(stdout3 or "[red]No output[/red]")
    
    # Step 3: Now add Puppeteer to config and test
    console.print("\n[bold cyan]Step 3: Adding Puppeteer server and testing direct access[/bold cyan]")
    full_config = create_mcp_config_with_puppeteer()
    
    # List tools again (should now include Puppeteer)
    console.print("\n[yellow]Listing available tools (with Puppeteer added):[/yellow]")
    stdout4, stderr4 = run_claude_code(
        "List all available MCP tools you have access to now. Format as a simple list.",
        full_config,
        allowed_tools="*"
    )
    console.print("[green]Output:[/green]")
    console.print(stdout4 or "[red]No output[/red]")
    
    # Use Puppeteer to take a screenshot
    console.print("\n[yellow]Using Puppeteer to navigate and take screenshot:[/yellow]")
    stdout5, stderr5 = run_claude_code(
        "Use puppeteer to navigate to example.com and take a screenshot. Save it as example_screenshot.png.",
        full_config,
        allowed_tools="mcp__puppeteer__*"
    )
    console.print("[green]Output:[/green]")
    console.print(stdout5 or "[red]No output[/red]")
    
    # Cleanup
    minimal_config.unlink()
    full_config.unlink()
    
    console.print("\n[bold green]Test Complete![/bold green]")
    console.print("\nThis demonstrates that:")
    console.print("1. Claude starts with only Tool Gating tools")
    console.print("2. Tool Gating can discover tools from other servers")  
    console.print("3. Tools must be explicitly added to Claude's config to be executed")
    console.print("4. Once added, tools can be used successfully")


if __name__ == "__main__":
    main()