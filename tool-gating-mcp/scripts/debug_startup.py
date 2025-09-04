#!/usr/bin/env python3
"""Debug script to understand why tools aren't being discovered at startup"""

import asyncio
import subprocess
import shutil
from pathlib import Path

# Check if MCP SDK is installed
try:
    import mcp
    print("✅ MCP SDK is installed")
    print(f"   Version: {mcp.__version__ if hasattr(mcp, '__version__') else 'unknown'}")
except ImportError:
    print("❌ MCP SDK is NOT installed")
    print("   Install with: pip install mcp")

# Check if MCP server commands are available
print("\nChecking MCP server commands:")
commands = ["mcp-server-puppeteer", "mcp-server-filesystem"]
for cmd in commands:
    path = shutil.which(cmd)
    if path:
        print(f"✅ {cmd}: {path}")
    else:
        print(f"❌ {cmd}: NOT FOUND")
        # Try to find it with npm
        try:
            result = subprocess.run(["npm", "list", "-g", cmd], 
                                  capture_output=True, text=True)
            if result.returncode == 0:
                print(f"   Found via npm: {result.stdout.strip()}")
            else:
                print(f"   Not installed via npm either")
                print(f"   Install with: npm install -g {cmd}")
        except:
            pass

# Check if the Tool Gating server is running
print("\nChecking Tool Gating server:")
import httpx

async def check_server():
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get("http://localhost:8000/health")
            if response.status_code == 200:
                print("✅ Tool Gating server is running")
                
                # Check how many tools are discovered
                response = await client.post(
                    "http://localhost:8000/api/tools/discover",
                    json={"query": "all tools", "limit": 100}
                )
                if response.status_code == 200:
                    tools = response.json()["tools"]
                    print(f"   Found {len(tools)} tools in the system")
                    if len(tools) == 0:
                        print("   ⚠️  No tools discovered!")
                        print("   This means either:")
                        print("   1. MCP servers couldn't be connected at startup")
                        print("   2. No tools have been manually registered")
                else:
                    print(f"   Error checking tools: {response.status_code}")
        except Exception as e:
            print(f"❌ Tool Gating server is NOT running")
            print(f"   Error: {e}")
            print(f"   Start with: tool-gating-mcp")

asyncio.run(check_server())

print("\nSuggested next steps:")
print("1. If MCP SDK is missing: pip install mcp")
print("2. If MCP servers are missing: npm install -g mcp-server-puppeteer mcp-server-filesystem")
print("3. If no tools found: Run scripts/register_puppeteer_tools.py to manually register tools")
print("4. Or fix the MCP connection issue in MCPClientManager")