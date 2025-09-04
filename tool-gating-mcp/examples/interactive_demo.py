#!/usr/bin/env python3
"""
Demo script for the Tool Gating MCP System.

This demonstrates how the system intelligently selects and provides tools
to LLMs based on context, reducing token usage while maintaining functionality.
"""

import asyncio

import httpx
from rich.console import Console
from rich.table import Table

console = Console()


async def run_demo():
    """Run the complete demo."""
    async with httpx.AsyncClient(base_url="http://localhost:8000") as client:
        console.print("\n[bold cyan]Tool Gating MCP System Demo[/bold cyan]\n")

        # Scenario 1: Math Query
        console.print("[bold]Scenario 1:[/bold] User needs math calculations")
        await demo_scenario(
            client,
            query="I need to perform complex mathematical calculations",
            tags=["math", "calculation"],
            expected_tool="calculator"
        )

        # Scenario 2: Web Search
        console.print("\n[bold]Scenario 2:[/bold] User needs to search the internet")
        await demo_scenario(
            client,
            query="Find information about AI trends online",
            tags=["search", "web"],
            expected_tool="web-search"
        )

        # Scenario 3: File Operations
        console.print("\n[bold]Scenario 3:[/bold] User needs to read files")
        await demo_scenario(
            client,
            query="Read CSV data from disk and parse it",
            tags=["file", "io"],
            expected_tool="file-reader"
        )

        # Scenario 4: Token Budget Demo
        console.print("\n[bold]Scenario 4:[/bold] Token budget enforcement")
        await demo_token_budget(client)


async def demo_scenario(client, query, tags, expected_tool):
    """Demo a single scenario."""
    # Discovery phase
    console.print(f"  📍 Query: '{query}'")
    console.print(f"  🏷️  Tags: {tags}")

    discover_response = await client.post(
        "/api/v1/tools/discover",
        json={"query": query, "tags": tags, "limit": 5}
    )
    tools = discover_response.json()["tools"]

    # Show discovery results
    table = Table(title="Discovered Tools")
    table.add_column("Tool", style="cyan")
    table.add_column("Score", style="green")
    table.add_column("Matched Tags", style="yellow")

    for tool in tools[:3]:
        table.add_row(
            tool["name"],
            f"{tool['score']:.3f}",
            ", ".join(tool["matched_tags"])
        )

    console.print(table)

    # Check if expected tool was found
    found_expected = any(t["tool_id"] == expected_tool for t in tools)
    if found_expected:
        console.print(f"  ✅ Found expected tool: {expected_tool}")
    else:
        console.print(f"  ❌ Expected tool not found: {expected_tool}")

    # Provision phase
    tool_ids = [t["tool_id"] for t in tools[:3]]
    provision_response = await client.post(
        "/api/v1/tools/provision",
        json={"tool_ids": tool_ids, "max_tools": 3}
    )
    provision_data = provision_response.json()

    console.print(f"  📦 Provisioned {len(provision_data['tools'])} tools")
    console.print(f"  🪙 Token usage: {provision_data['metadata']['total_tokens']}")


async def demo_token_budget(client):
    """Demo token budget enforcement."""
    # Get all available tools
    discover_response = await client.post(
        "/api/v1/tools/discover",
        json={"query": "all available tools", "limit": 50}
    )
    all_tools = discover_response.json()["tools"]

    console.print(f"  📊 Total tools available: {len(all_tools)}")

    # Try to provision all tools
    all_ids = [t["tool_id"] for t in all_tools]
    provision_response = await client.post(
        "/api/v1/tools/provision",
        json={"tool_ids": all_ids, "max_tools": 50}
    )
    provision_data = provision_response.json()

    # Show results
    table = Table(title="Token Budget Enforcement")
    table.add_column("Metric", style="cyan")
    table.add_column("Value", style="green")

    table.add_row("Tools Requested", str(len(all_tools)))
    table.add_row("Tools Provisioned", str(len(provision_data["tools"])))
    table.add_row("Token Budget", "2000")
    table.add_row("Tokens Used", str(provision_data["metadata"]["total_tokens"]))
    table.add_row("Gating Applied", str(provision_data["metadata"]["gating_applied"]))

    console.print(table)

    # Show which tools made the cut
    console.print("\n  Tools that made the cut:")
    for tool in provision_data["tools"]:
        console.print(f"    • {tool['name']} ({tool['token_count']} tokens)")


if __name__ == "__main__":
    console.print("[bold green]Starting Tool Gating MCP Demo...[/bold green]")
    console.print(
        "\n[yellow]Make sure the server is running with:[/yellow] tool-gating-mcp\n"
    )

    try:
        asyncio.run(run_demo())
    except httpx.ConnectError:
        console.print("[bold red]ERROR:[/bold red] Could not connect to server!")
        console.print("Start the server with: [cyan]tool-gating-mcp[/cyan]")
    except KeyboardInterrupt:
        console.print("\n[yellow]Demo interrupted by user[/yellow]")
    except Exception as e:
        console.print(f"[bold red]ERROR:[/bold red] {e}")
