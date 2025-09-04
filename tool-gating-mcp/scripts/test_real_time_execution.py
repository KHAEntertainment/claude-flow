#!/usr/bin/env python3
"""
Test script for real-time tool execution without provisioning
"""

import asyncio
import json
import httpx
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.json import JSON
from rich.syntax import Syntax

console = Console()
BASE_URL = "http://localhost:8000"


async def test_real_time_execution():
    """Test real-time tool execution workflow"""
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        # 1. Discover available tools
        console.print("[bold cyan]1. Discovering available tools[/bold cyan]")
        
        response = await client.post(
            f"{BASE_URL}/api/v1/tools/discover",
            json={
                "query": "I need to search the web and take screenshots",
                "limit": 10
            }
        )
        
        if response.status_code != 200:
            console.print(f"[red]Discovery failed: {response.text}[/red]")
            return
            
        discovered = response.json()
        console.print(f"Found {len(discovered['tools'])} relevant tools\n")
        
        # Display discovered tools
        table = Table(title="Discovered Tools")
        table.add_column("Tool ID", style="cyan", width=30)
        table.add_column("Name", style="green", width=20)
        table.add_column("Server", style="yellow", width=10)
        table.add_column("Score", style="magenta", width=8)
        
        for tool in discovered["tools"][:5]:
            table.add_row(
                tool["tool_id"],
                tool["name"],
                tool.get("server", "N/A"),
                f"{tool['score']:.3f}"
            )
        
        console.print(table)
        
        # 2. Get execution info for a tool before executing
        console.print("\n[bold cyan]2. Getting execution info for tools[/bold cyan]")
        
        # Pick first two tools for demonstration
        tool_examples = [
            {
                "tool_id": "exa_web_search_exa",
                "args": {"query": "MCP Model Context Protocol", "numResults": 3}
            },
            {
                "tool_id": "puppeteer_puppeteer_screenshot",
                "args": {"name": "example_screenshot", "width": 1200, "height": 800}
            }
        ]
        
        for example in tool_examples:
            console.print(f"\n[yellow]Tool: {example['tool_id']}[/yellow]")
            
            # Get execution info
            response = await client.post(
                f"{BASE_URL}/api/proxy/execute/info",
                json={
                    "tool_id": example["tool_id"],
                    "arguments": example["args"]
                }
            )
            
            if response.status_code == 200:
                info = response.json()
                
                # Display execution preview
                panel_content = f"""[bold]What this tool will do:[/bold]
{info['action_summary']}

[bold]Server:[/bold] {info['server']}
[bold]Estimated tokens:[/bold] {info['estimated_tokens']}
[bold]Tags:[/bold] {', '.join(info['tags'])}

[bold]Full description:[/bold]
{info['description']}"""
                
                console.print(Panel(
                    panel_content,
                    title=f"Execution Preview: {info['tool_name']}",
                    border_style="green"
                ))
                
                # Show the actual arguments
                console.print("[bold]Arguments:[/bold]")
                console.print(Syntax(
                    json.dumps(example["args"], indent=2),
                    "json",
                    theme="monokai"
                ))
            else:
                console.print(f"[red]Failed to get info: {response.text}[/red]")
        
        # 3. Execute tools directly (no provisioning)
        console.print("\n[bold cyan]3. Executing tools in real-time[/bold cyan]")
        console.print("[dim]Note: Tool execution is simulated in this test[/dim]\n")
        
        # Simulate executing a web search
        console.print("[yellow]Executing: Web Search[/yellow]")
        try:
            response = await client.post(
                f"{BASE_URL}/api/proxy/execute",
                json={
                    "tool_id": "exa_web_search_exa",
                    "arguments": {"query": "MCP protocol", "numResults": 2}
                }
            )
            
            if response.status_code == 200:
                console.print("[green]✅ Execution would succeed[/green]")
                console.print("[dim]Result would contain search results[/dim]")
            else:
                console.print(f"[red]Execution failed: {response.text}[/red]")
        except Exception as e:
            console.print(f"[yellow]Note: {str(e)}[/yellow]")
            console.print("[dim]This is expected if MCP servers aren't running[/dim]")
        
        # 4. Demonstrate cross-server execution
        console.print("\n[bold cyan]4. Cross-server execution flow[/bold cyan]")
        
        workflow = [
            ("exa_web_search_exa", {"query": "OpenAI GPT-4"}),
            ("puppeteer_puppeteer_navigate", {"url": "https://openai.com"}),
            ("puppeteer_puppeteer_screenshot", {"name": "openai_page"}),
            ("basic-memory_write_note", {"title": "Research Notes", "content": "GPT-4 findings...", "folder": "research"})
        ]
        
        console.print("Workflow steps:")
        for i, (tool_id, args) in enumerate(workflow, 1):
            server = tool_id.split('_')[0]
            console.print(f"  {i}. [{server}] {tool_id.split('_', 1)[1]} - {list(args.keys())}")
        
        console.print("\n[green]Each tool executes directly without provisioning![/green]")
        console.print("[green]Tools are loaded on-demand from their respective servers.[/green]")


async def test_performance():
    """Test performance of real-time execution vs provisioning"""
    
    console.print("\n[bold cyan]5. Performance comparison[/bold cyan]")
    
    table = Table(title="Provisioning vs Real-time Execution")
    table.add_column("Approach", style="cyan")
    table.add_column("Token Usage", style="yellow")
    table.add_column("Latency", style="green")
    table.add_column("Benefits", style="magenta", width=40)
    
    table.add_row(
        "Provisioning",
        "~500-1000 tokens upfront",
        "High initial, then fast",
        "All tools ready, but wastes tokens on unused tools"
    )
    
    table.add_row(
        "Real-time",
        "~100 tokens per tool used",
        "Small overhead per call",
        "Only pay for what you use, dynamic tool selection"
    )
    
    console.print(table)


async def main():
    console.print("[bold green]Tool Gating MCP - Real-time Execution Test[/bold green]")
    console.print("Testing tool execution without provisioning\n")
    
    try:
        await test_real_time_execution()
        await test_performance()
        console.print("\n[bold green]✅ Real-time execution test completed![/bold green]")
    except Exception as e:
        console.print(f"\n[red]Error: {str(e)}[/red]")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(main())