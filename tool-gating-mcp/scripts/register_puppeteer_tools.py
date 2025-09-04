#!/usr/bin/env python3
"""
Register Puppeteer tools with Tool Gating MCP.
"""

import asyncio
import httpx
from rich.console import Console

console = Console()

PUPPETEER_TOOLS = [
    {
        "id": "puppeteer_navigate",
        "name": "puppeteer_navigate",
        "description": "Navigate to a URL in the browser",
        "parameters": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "URL to navigate to"}
            },
            "required": ["url"]
        },
        "tags": ["browser", "navigation", "web", "puppeteer"],
        "estimated_tokens": 100,
        "server": "puppeteer"
    },
    {
        "id": "puppeteer_screenshot",
        "name": "puppeteer_screenshot",
        "description": "Take a screenshot of the current page or a specific element",
        "parameters": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Name for the screenshot"},
                "selector": {"type": "string", "description": "CSS selector for element to screenshot"},
                "fullPage": {"type": "boolean", "description": "Capture full page"}
            },
            "required": ["name"]
        },
        "tags": ["browser", "screenshot", "capture", "image", "puppeteer"],
        "estimated_tokens": 150,
        "server": "puppeteer"
    },
    {
        "id": "puppeteer_click",
        "name": "puppeteer_click",
        "description": "Click an element on the page",
        "parameters": {
            "type": "object",
            "properties": {
                "selector": {"type": "string", "description": "CSS selector for element to click"}
            },
            "required": ["selector"]
        },
        "tags": ["browser", "interaction", "click", "puppeteer"],
        "estimated_tokens": 80,
        "server": "puppeteer"
    }
]

CONTEXT7_TOOLS = [
    {
        "id": "context7_resolve_library",
        "name": "resolve-library-id",
        "description": "Resolves a package/product name to a Context7-compatible library ID",
        "parameters": {
            "type": "object",
            "properties": {
                "libraryName": {"type": "string", "description": "Library name to search for"}
            },
            "required": ["libraryName"]
        },
        "tags": ["documentation", "search", "library", "context7"],
        "estimated_tokens": 100,
        "server": "context7"
    },
    {
        "id": "context7_get_docs",
        "name": "get-library-docs",
        "description": "Fetches up-to-date documentation for a library",
        "parameters": {
            "type": "object",
            "properties": {
                "context7CompatibleLibraryID": {"type": "string"},
                "userQuery": {"type": "string"},
                "tokens": {"type": "number", "default": 10000}
            },
            "required": ["context7CompatibleLibraryID", "userQuery"]
        },
        "tags": ["documentation", "api", "reference", "context7"],
        "estimated_tokens": 200,
        "server": "context7"
    }
]


async def register_tools():
    """Register tools with the Tool Gating server."""
    async with httpx.AsyncClient() as client:
        # First, clear any existing tools
        console.print("[yellow]Clearing existing tools...[/yellow]")
        try:
            response = await client.delete("http://localhost:8000/api/tools/clear")
            console.print(f"Clear response: {response.status_code}")
        except Exception as e:
            console.print(f"[red]Error clearing tools:[/red] {e}")
        
        # Register Puppeteer tools
        console.print("\n[cyan]Registering Puppeteer tools:[/cyan]")
        for tool in PUPPETEER_TOOLS:
            try:
                response = await client.post(
                    "http://localhost:8000/api/tools/register",
                    json=tool
                )
                if response.status_code == 200:
                    console.print(f"✅ Registered: {tool['name']}")
                else:
                    console.print(f"❌ Failed to register {tool['name']}: {response.status_code}")
            except Exception as e:
                console.print(f"[red]Error registering {tool['name']}:[/red] {e}")
        
        # Register Context7 tools
        console.print("\n[cyan]Registering Context7 tools:[/cyan]")
        for tool in CONTEXT7_TOOLS:
            try:
                response = await client.post(
                    "http://localhost:8000/api/tools/register",
                    json=tool
                )
                if response.status_code == 200:
                    console.print(f"✅ Registered: {tool['name']}")
                else:
                    console.print(f"❌ Failed to register {tool['name']}: {response.status_code}")
            except Exception as e:
                console.print(f"[red]Error registering {tool['name']}:[/red] {e}")
        
        # Verify tools are registered
        console.print("\n[cyan]Verifying tool registration:[/cyan]")
        response = await client.post(
            "http://localhost:8000/api/tools/discover",
            json={"query": "browser screenshot", "limit": 10}
        )
        
        if response.status_code == 200:
            tools = response.json()["tools"]
            console.print(f"Found {len(tools)} tools for 'browser screenshot'")
            for tool in tools[:3]:
                console.print(f"  - {tool['name']} (score: {tool['score']:.2f})")


if __name__ == "__main__":
    asyncio.run(register_tools())