#!/usr/bin/env python3
"""
Example: How to register a new MCP server with the Tool Gating system

This example shows how to add a hypothetical Slack MCP server.
Adapt this pattern for your own MCP servers.
"""

import asyncio
import json
from typing import Any

import httpx
from rich.console import Console
from rich.table import Table

console = Console()

# Configuration
API_BASE_URL = "http://localhost:8000"


def estimate_tool_tokens(tool: dict[str, Any]) -> int:
    """Estimate token count for a tool definition"""

    # Base tokens for tool structure
    base_tokens = 50

    # Description tokens (rough estimate: 1 token per 4 characters)
    description_tokens = len(tool.get("description", "")) // 4

    # Parameter tokens (JSON schema complexity)
    param_json = json.dumps(tool.get("parameters", {}))
    param_tokens = len(param_json) // 4

    # Add overhead for formatting
    overhead = 20

    return base_tokens + description_tokens + param_tokens + overhead


def create_slack_tools() -> list[dict[str, Any]]:
    """Define Slack MCP server tools"""

    return [
        {
            "id": "slack_send_message",
            "name": "send_message",
            "description": (
                "Send a message to a Slack channel or direct message to a user"
            ),
            "tags": ["messaging", "slack", "communication", "send"],
            "server": "slack",
            "parameters": {
                "type": "object",
                "properties": {
                    "channel": {
                        "type": "string",
                        "description": (
                            "Channel ID (C1234567890) or user ID (U1234567890)"
                        )
                    },
                    "text": {
                        "type": "string",
                        "description": "Message text to send"
                    },
                    "thread_ts": {
                        "type": "string",
                        "description": "Optional: Thread timestamp to reply in thread"
                    }
                },
                "required": ["channel", "text"]
            }
        },
        {
            "id": "slack_list_channels",
            "name": "list_channels",
            "description": "List all public channels in the Slack workspace",
            "tags": ["slack", "channels", "list", "discovery"],
            "server": "slack",
            "parameters": {
                "type": "object",
                "properties": {
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of channels to return",
                        "default": 100
                    },
                    "types": {
                        "type": "string",
                        "description": "Channel types: public_channel, private_channel",
                        "default": "public_channel"
                    }
                },
                "required": []
            }
        },
        {
            "id": "slack_search_messages",
            "name": "search_messages",
            "description": "Search for messages across the Slack workspace",
            "tags": ["slack", "search", "messages", "find"],
            "server": "slack",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search query (supports Slack search syntax)"
                    },
                    "sort": {
                        "type": "string",
                        "enum": ["score", "timestamp"],
                        "default": "score"
                    },
                    "count": {
                        "type": "integer",
                        "description": "Number of results to return",
                        "default": 20
                    }
                },
                "required": ["query"]
            }
        },
        {
            "id": "slack_upload_file",
            "name": "upload_file",
            "description": "Upload a file to Slack channel or user",
            "tags": ["slack", "file", "upload", "share"],
            "server": "slack",
            "parameters": {
                "type": "object",
                "properties": {
                    "channels": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Channel IDs to share the file"
                    },
                    "content": {
                        "type": "string",
                        "description": "File content (text files)"
                    },
                    "filename": {
                        "type": "string",
                        "description": "Name of the file"
                    },
                    "title": {
                        "type": "string",
                        "description": "Title of the file"
                    }
                },
                "required": ["channels", "content", "filename"]
            }
        },
        {
            "id": "slack_get_user_info",
            "name": "get_user_info",
            "description": "Get information about a Slack user",
            "tags": ["slack", "user", "profile", "info"],
            "server": "slack",
            "parameters": {
                "type": "object",
                "properties": {
                    "user": {
                        "type": "string",
                        "description": "User ID (U1234567890)"
                    }
                },
                "required": ["user"]
            }
        }
    ]


async def register_tools(tools: list[dict[str, Any]]) -> None:
    """Register tools with the Tool Gating system"""

    console.print("\n[bold blue]Registering Slack MCP Tools[/bold blue]\n")

    # Add estimated tokens to each tool
    for tool in tools:
        tool["estimated_tokens"] = estimate_tool_tokens(tool)

    # Create table for display
    table = Table(title="Tools to Register")
    table.add_column("Tool ID", style="cyan")
    table.add_column("Name", style="green")
    table.add_column("Tokens", style="yellow")
    table.add_column("Tags", style="magenta")

    for tool in tools:
        table.add_row(
            tool["id"],
            tool["name"],
            str(tool["estimated_tokens"]),
            ", ".join(tool["tags"][:2]) + "..."
        )

    console.print(table)

    # Register each tool
    async with httpx.AsyncClient() as client:
        console.print("\n[yellow]Registering tools...[/yellow]\n")

        success_count = 0
        for tool in tools:
            try:
                response = await client.post(
                    f"{API_BASE_URL}/api/v1/tools/register",
                    json=tool
                )
                if response.status_code == 200:
                    console.print(f"✅ Registered: {tool['name']}")
                    success_count += 1
                else:
                    console.print(f"❌ Failed: {tool['name']} - {response.text}")
            except Exception as e:
                console.print(f"❌ Error: {tool['name']} - {str(e)}")

        console.print(
            f"\n[green]Successfully registered {success_count}/{len(tools)} "
            f"tools[/green]"
        )


async def test_discovery() -> None:
    """Test that our tools can be discovered"""

    console.print("\n[bold blue]Testing Tool Discovery[/bold blue]\n")

    test_queries = [
        ("send slack message", "Should find send_message tool"),
        ("search messages in slack", "Should find search_messages tool"),
        ("upload file to communication platform", "Should find Slack upload tool"),
        (
            "list slack channels and send notification",
            "Should find multiple Slack tools"
        )
    ]

    async with httpx.AsyncClient() as client:
        for query, description in test_queries:
            console.print(f"\n[yellow]Query:[/yellow] '{query}'")
            console.print(f"[dim]{description}[/dim]")

            response = await client.post(
                f"{API_BASE_URL}/api/v1/tools/discover",
                json={"query": query, "limit": 3}
            )

            if response.status_code == 200:
                results = response.json()["tools"]
                for i, tool in enumerate(results, 1):
                    console.print(
                        f"  {i}. {tool['name']} "
                        f"([cyan]{tool.get('server', 'unknown')}[/cyan]) "
                        f"- Score: {tool['score']:.3f}"
                    )
            else:
                console.print(f"  [red]Error: {response.status_code}[/red]")


async def test_cross_server() -> None:
    """Test cross-server tool discovery"""

    console.print("\n[bold blue]Testing Cross-Server Discovery[/bold blue]\n")

    query = "search slack messages and save results to file"
    console.print(f"[yellow]Query:[/yellow] '{query}'")
    console.print(
        "[dim]Should find tools from both Slack and file system servers[/dim]\n"
    )

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{API_BASE_URL}/api/v1/tools/discover",
            json={"query": query, "limit": 5}
        )

        if response.status_code == 200:
            results = response.json()["tools"]
            servers_found = set()

            for tool in results:
                server = tool.get("server", "unknown")
                servers_found.add(server)
                console.print(
                    f"  • {tool['name']} ([cyan]{server}[/cyan]) "
                    f"- Score: {tool['score']:.3f}"
                )

            console.print(
                f"\n[green]Servers represented: {', '.join(servers_found)}[/green]"
            )
        else:
            console.print(f"[red]Error: {response.status_code}[/red]")


async def main():
    """Main function to register and test Slack tools"""

    console.print("[bold green]Slack MCP Server Integration Example[/bold green]")
    console.print("This demonstrates how to add a new MCP server to Tool Gating\n")

    # Create Slack tools
    tools = create_slack_tools()

    # Register tools
    await register_tools(tools)

    # Test discovery
    await test_discovery()

    # Test cross-server discovery
    await test_cross_server()

    console.print("\n[bold green]✅ Integration complete![/bold green]")
    console.print("\nYour Slack tools are now available for selective provisioning.")
    console.print("LLMs will only receive the specific Slack tools they need,")
    console.print("not the entire set, reducing context usage.\n")


if __name__ == "__main__":
    # Make sure the Tool Gating server is running
    console.print(
        "[dim]Make sure the Tool Gating server is running: tool-gating-mcp[/dim]\n"
    )
    asyncio.run(main())
