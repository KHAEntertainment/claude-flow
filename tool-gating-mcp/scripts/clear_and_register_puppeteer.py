#!/usr/bin/env python3
"""
Clear existing tools and register Puppeteer tools properly
"""

import asyncio
import json
import httpx
from rich.console import Console
from rich.table import Table

console = Console()
BASE_URL = "http://localhost:8000"


async def clear_and_register():
    """Clear tools and register Puppeteer tools"""
    
    async with httpx.AsyncClient() as client:
        # 1. Clear all tools first
        console.print("[bold cyan]1. Clearing all tools[/bold cyan]")
        response = await client.delete(f"{BASE_URL}/api/v1/tools/clear")
        console.print(f"Clear response: {response.status_code}")
        
        # 2. Register individual Puppeteer tools
        console.print("\n[bold cyan]2. Registering Puppeteer tools individually[/bold cyan]")
        
        puppeteer_tools = [
            {
                "id": "puppeteer_navigate",
                "name": "puppeteer_navigate",
                "description": "Navigate to a URL in the browser",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "url": {
                            "type": "string",
                            "description": "URL to navigate to"
                        },
                        "waitUntil": {
                            "type": "string",
                            "description": "When to consider navigation succeeded",
                            "enum": ["load", "domcontentloaded", "networkidle0", "networkidle2"],
                            "default": "load"
                        }
                    },
                    "required": ["url"]
                },
                "tags": ["browser", "navigation", "puppeteer", "web"],
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
                        "name": {
                            "type": "string",
                            "description": "Name for the screenshot"
                        },
                        "selector": {
                            "type": "string",
                            "description": "CSS selector for element to screenshot (optional)"
                        },
                        "fullPage": {
                            "type": "boolean",
                            "description": "Capture full scrollable page",
                            "default": False
                        },
                        "width": {
                            "type": "number",
                            "description": "Viewport width",
                            "default": 1280
                        },
                        "height": {
                            "type": "number",
                            "description": "Viewport height", 
                            "default": 720
                        }
                    },
                    "required": ["name"]
                },
                "tags": ["browser", "screenshot", "puppeteer", "capture", "image"],
                "estimated_tokens": 120,
                "server": "puppeteer"
            },
            {
                "id": "puppeteer_click",
                "name": "puppeteer_click",
                "description": "Click an element on the page",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "selector": {
                            "type": "string",
                            "description": "CSS selector for element to click"
                        }
                    },
                    "required": ["selector"]
                },
                "tags": ["browser", "interaction", "puppeteer", "click", "automation"],
                "estimated_tokens": 80,
                "server": "puppeteer"
            },
            {
                "id": "puppeteer_fill",
                "name": "puppeteer_fill",
                "description": "Fill out an input field with text",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "selector": {
                            "type": "string",
                            "description": "CSS selector for input field"
                        },
                        "value": {
                            "type": "string",
                            "description": "Value to fill"
                        }
                    },
                    "required": ["selector", "value"]
                },
                "tags": ["browser", "form", "input", "puppeteer", "automation", "fill"],
                "estimated_tokens": 90,
                "server": "puppeteer"
            },
            {
                "id": "puppeteer_evaluate",
                "name": "puppeteer_evaluate",
                "description": "Execute JavaScript code in the browser console",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "script": {
                            "type": "string",
                            "description": "JavaScript code to execute"
                        }
                    },
                    "required": ["script"]
                },
                "tags": ["browser", "javascript", "puppeteer", "execute", "code"],
                "estimated_tokens": 110,
                "server": "puppeteer"
            },
            {
                "id": "puppeteer_wait_for_selector",
                "name": "puppeteer_wait_for_selector",
                "description": "Wait for an element to appear on the page",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "selector": {
                            "type": "string",
                            "description": "CSS selector to wait for"
                        },
                        "timeout": {
                            "type": "number",
                            "description": "Maximum wait time in milliseconds",
                            "default": 30000
                        }
                    },
                    "required": ["selector"]
                },
                "tags": ["browser", "wait", "puppeteer", "automation"],
                "estimated_tokens": 85,
                "server": "puppeteer"
            }
        ]
        
        registered_count = 0
        for tool in puppeteer_tools:
            response = await client.post(
                f"{BASE_URL}/api/v1/tools/register",
                json=tool
            )
            if response.status_code == 200:
                console.print(f"✅ Registered: {tool['name']}")
                registered_count += 1
            else:
                console.print(f"❌ Failed to register {tool['name']}: {response.text}")
        
        console.print(f"\nRegistered {registered_count}/{len(puppeteer_tools)} tools")
        
        # 3. Test discovery for Puppeteer tools
        console.print("\n[bold cyan]3. Testing Puppeteer tool discovery[/bold cyan]")
        
        test_queries = [
            "I need to automate browser interactions and take screenshots",
            "click buttons and fill forms on websites", 
            "navigate to URLs and wait for page elements"
        ]
        
        for query in test_queries:
            response = await client.post(
                f"{BASE_URL}/api/v1/tools/discover",
                json={
                    "query": query,
                    "limit": 5
                }
            )
            
            results = response.json()
            console.print(f"\n[yellow]Query:[/yellow] {query}")
            console.print(f"Found {len(results['tools'])} tools:")
            
            for tool in results["tools"][:3]:
                console.print(
                    f"  - {tool['name']} "
                    f"(score: {tool['score']:.3f}, "
                    f"server: {tool.get('server', 'N/A')})"
                )


if __name__ == "__main__":
    console.print("[bold green]Puppeteer Tool Registration[/bold green]\n")
    asyncio.run(clear_and_register())