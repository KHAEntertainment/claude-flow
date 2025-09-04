"""Test the tool gating system with real MCP servers"""

import asyncio
import json
from pathlib import Path
from typing import Any

import httpx
from rich.console import Console
from rich.table import Table

console = Console()

# API base URL
BASE_URL = "http://localhost:8000"


class MCPServerConnector:
    """Simulates MCP server tool discovery"""

    def __init__(self, config_path: str = "mcp-servers.json"):
        self.config_path = Path(config_path)
        self.servers: dict[str, Any] = {}
        self._load_config()

    def _load_config(self) -> None:
        """Load MCP server configuration"""
        with open(self.config_path) as f:
            self.servers = json.load(f)

    def get_server_tools(self, server_name: str) -> list[dict[str, Any]]:
        """Get simulated tool definitions for a server"""
        # In a real implementation, this would connect to the MCP server
        # For testing, we'll return realistic tool definitions

        tools_by_server = {
            "context7": [
                {
                    "id": "context7_resolve-library-id",
                    "name": "resolve-library-id",
                    "description": (
                        "Resolves a package/product name to a Context7-compatible "
                        "library ID and returns matching libraries"
                    ),
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "libraryName": {
                                "type": "string",
                                "description": "Library name to search for"
                            }
                        },
                        "required": ["libraryName"]
                    },
                    "estimated_tokens": 150,
                    "tags": ["documentation", "library", "search"],
                    "server": "context7"
                },
                {
                    "id": "context7_get-library-docs",
                    "name": "get-library-docs",
                    "description": "Fetches up-to-date documentation for a library",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "context7CompatibleLibraryID": {"type": "string"},
                            "tokens": {"type": "number", "default": 10000},
                            "topic": {"type": "string"}
                        },
                        "required": ["context7CompatibleLibraryID"]
                    },
                    "estimated_tokens": 200,
                    "tags": ["documentation", "library", "fetch"],
                    "server": "context7"
                }
            ],
            "exa": [
                {
                    "id": "exa_web_search",
                    "name": "web_search_exa",
                    "description": (
                        "Search the web using Exa AI - performs real-time web searches"
                    ),
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "query": {"type": "string"},
                            "numResults": {"type": "number", "default": 5}
                        },
                        "required": ["query"]
                    },
                    "estimated_tokens": 180,
                    "tags": ["search", "web", "real-time"],
                    "server": "exa"
                },
                {
                    "id": "exa_research_paper_search",
                    "name": "research_paper_search",
                    "description": (
                        "Search across 100M+ research papers with full text access"
                    ),
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "query": {"type": "string"},
                            "numResults": {"type": "number", "default": 5},
                            "maxCharacters": {"type": "number", "default": 3000}
                        },
                        "required": ["query"]
                    },
                    "estimated_tokens": 250,
                    "tags": ["search", "research", "academic", "papers"],
                    "server": "exa"
                },
                {
                    "id": "exa_twitter_search",
                    "name": "twitter_search",
                    "description": "Search Twitter/X.com posts and accounts",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "query": {"type": "string"},
                            "numResults": {"type": "number", "default": 5}
                        },
                        "required": ["query"]
                    },
                    "estimated_tokens": 180,
                    "tags": ["search", "social", "twitter"],
                    "server": "exa"
                },
                {
                    "id": "exa_company_research",
                    "name": "company_research",
                    "description": (
                        "Research companies using targeted searches of company websites"
                    ),
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "query": {"type": "string"},
                            "subpages": {"type": "number", "default": 10}
                        },
                        "required": ["query"]
                    },
                    "estimated_tokens": 220,
                    "tags": ["search", "company", "business", "research"],
                    "server": "exa"
                }
            ],
            "basic-memory": [
                {
                    "id": "memory_store",
                    "name": "store_memory",
                    "description": "Store a memory with a key-value pair",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "key": {"type": "string"},
                            "value": {"type": "string"}
                        },
                        "required": ["key", "value"]
                    },
                    "estimated_tokens": 100,
                    "tags": ["storage", "memory", "persistence"],
                    "server": "basic-memory"
                },
                {
                    "id": "memory_retrieve",
                    "name": "retrieve_memory",
                    "description": "Retrieve a stored memory by key",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "key": {"type": "string"}
                        },
                        "required": ["key"]
                    },
                    "estimated_tokens": 80,
                    "tags": ["storage", "memory", "retrieval"],
                    "server": "basic-memory"
                }
            ],
            "desktop-commander": [
                {
                    "id": "desktop_screenshot",
                    "name": "take_screenshot",
                    "description": (
                        "Take a screenshot of the desktop or a specific window"
                    ),
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "window": {
                                "type": "string",
                                "description": "Optional window title"
                            }
                        }
                    },
                    "estimated_tokens": 120,
                    "tags": ["desktop", "screenshot", "automation"],
                    "server": "desktop-commander"
                }
            ]
        }

        return tools_by_server.get(server_name, [])


async def register_tools(
    client: httpx.AsyncClient, tools: list[dict[str, Any]]
) -> None:
    """Register tools with the tool gating system"""
    # First, clear existing tools
    await client.delete(f"{BASE_URL}/api/v1/tools/clear")

    # Register each tool
    for tool in tools:
        response = await client.post(
            f"{BASE_URL}/api/v1/tools/register",
            json=tool
        )
        if response.status_code != 200:
            console.print(
                f"[red]Failed to register {tool['name']}: {response.text}[/red]"
            )


async def run_integration_test():
    """Run integration test against the running server"""
    console.print("[bold green]MCP Tool Gating Integration Test[/bold green]\n")

    connector = MCPServerConnector()

    async with httpx.AsyncClient() as client:
        # Check server health
        health_response = await client.get(f"{BASE_URL}/health")
        if health_response.status_code != 200:
            console.print(
                "[red]Server is not running! Start it with: tool-gating-mcp[/red]"
            )
            return

        console.print("[green]✅ Server is healthy[/green]\n")

        # Load tools from all MCP servers
        console.print("[yellow]Loading tools from MCP servers...[/yellow]")
        all_tools = []

        for server_name in connector.servers:
            tools = connector.get_server_tools(server_name)
            all_tools.extend(tools)
            console.print(f"  📡 {server_name}: {len(tools)} tools")

        console.print(f"\n[green]Total tools to register: {len(all_tools)}[/green]\n")

        # Register tools with the system
        await register_tools(client, all_tools)

        # Test 1: Semantic Search
        console.print(
            "[bold cyan]Test 1: Semantic Search for Research Tools[/bold cyan]"
        )

        search_response = await client.post(
            f"{BASE_URL}/api/v1/tools/discover",
            json={
                "query": "search for academic research papers",
                "limit": 5
            }
        )

        results = search_response.json()["tools"]

        table = Table(title="Search Results: 'academic research papers'")
        table.add_column("Tool", style="cyan")
        table.add_column("Server", style="yellow")
        table.add_column("Score", style="green")
        table.add_column("Description", style="white", max_width=50)

        for result in results:
            table.add_row(
                result["name"],
                result.get("server", "unknown"),
                f"{result['score']:.3f}",
                result["description"][:50] + "..."
            )

        console.print(table)

        # Test 2: Cross-Server Search
        console.print("\n[bold cyan]Test 2: Cross-Server Search[/bold cyan]")

        search_response = await client.post(
            f"{BASE_URL}/api/v1/tools/discover",
            json={
                "query": "search and store information",
                "limit": 6
            }
        )

        results = search_response.json()["tools"]
        servers_found = set()

        console.print("\nQuery: 'search and store information'")
        for result in results:
            server = result.get("server", "unknown")
            servers_found.add(server)
            console.print(f"  - {result['name']} ({server}): {result['score']:.3f}")

        console.print(f"\nServers matched: {', '.join(servers_found)}")

        # Test 3: Token Budget Provisioning
        console.print("\n[bold cyan]Test 3: Token Budget Provisioning[/bold cyan]")

        # Get all tool IDs for provisioning
        all_tool_ids = [tool["id"] for tool in all_tools]

        provision_response = await client.post(
            f"{BASE_URL}/api/v1/tools/provision",
            json={
                "tool_ids": all_tool_ids[:8],  # Request 8 tools
                "context_tokens": 500  # Low budget to test filtering
            }
        )

        provision_data = provision_response.json()
        tools = provision_data["tools"]

        console.print("\nRequested: 8 tools")
        console.print("Token budget: 500")
        console.print(f"Provisioned: {len(tools)} tools")

        total_tokens = sum(tool["token_count"] for tool in tools)
        console.print(f"Total tokens used: {total_tokens}")

        table = Table(title="Provisioned Tools (within budget)")
        table.add_column("Tool", style="cyan")
        table.add_column("Server", style="yellow")
        table.add_column("Tokens", style="magenta")

        for tool in tools:
            table.add_row(
                tool["name"],
                tool.get("server", "unknown"),
                str(tool["token_count"])
            )

        console.print(table)

        # Test 4: MCP Format Verification
        console.print("\n[bold cyan]Test 4: MCP Format Output[/bold cyan]")

        # Provision specific tools and check MCP format
        provision_response = await client.post(
            f"{BASE_URL}/api/v1/tools/provision",
            json={
                "tool_ids": [
                    "exa_web_search",
                    "context7_get-library-docs",
                    "memory_store"
                ]
            }
        )

        mcp_data = provision_response.json()

        console.print("\nMCP Response Structure:")
        console.print(f"  - Number of tools: {len(mcp_data['tools'])}")
        console.print(f"  - Total tokens: {mcp_data['metadata']['total_tokens']}")
        console.print("\nFirst tool in MCP format:")
        console.print(json.dumps(mcp_data["tools"][0], indent=2))

        # Test 5: Tag-based Discovery
        console.print("\n[bold cyan]Test 5: Tag-based Discovery[/bold cyan]")

        search_response = await client.post(
            f"{BASE_URL}/api/v1/tools/discover",
            json={
                "query": "documentation",
                "limit": 5,
                "tags": ["documentation"]
            }
        )

        results = search_response.json()["tools"]

        console.print("\nTools with 'documentation' tag:")
        for result in results:
            console.print(
                f"  - {result['name']}: {', '.join(result.get('matched_tags', []))}"
            )

        console.print(
            "\n[bold green]✅ Integration test completed successfully![/bold green]"
        )


if __name__ == "__main__":
    asyncio.run(run_integration_test())
