#!/usr/bin/env python3
"""Debug MCP connection and imports"""

import sys
import logging
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

# Setup logging
logging.basicConfig(level=logging.DEBUG, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

# Test MCP imports
print("=== Testing MCP Imports ===")
try:
    import mcp
    print(f"✓ Successfully imported mcp module: {mcp}")
    print(f"  Module location: {mcp.__file__}")
except ImportError as e:
    print(f"✗ Failed to import mcp: {e}")
    sys.exit(1)

try:
    from mcp import ClientSession
    print("✓ Successfully imported ClientSession")
except ImportError as e:
    print(f"✗ Failed to import ClientSession: {e}")

try:
    from mcp.client.stdio import stdio_client
    print("✓ Successfully imported stdio_client")
except ImportError as e:
    print(f"✗ Failed to import stdio_client: {e}")

# Test context7 connection
print("\n=== Testing Context7 Connection ===")
import asyncio

async def test_context7():
    """Test connecting to context7 MCP server"""
    from mcp.client.stdio import stdio_client, StdioServerParameters
    from mcp import ClientSession
    
    try:
        print("Attempting to connect to context7...")
        
        # Create server parameters
        server_params = StdioServerParameters(
            command="npx",
            args=["-y", "@upstash/context7-mcp@latest"]
        )
        
        # Create stdio client connection
        async with stdio_client(server_params) as (read_stream, write_stream):
            print("✓ Successfully created stdio streams")
            
            # Create a ClientSession with the streams
            async with ClientSession(read_stream, write_stream) as session:
                print("✓ Successfully created client session")
                
                # Initialize the connection
                await session.initialize()
                print("✓ Successfully initialized connection")
                
                # List available tools
                tools_response = await session.list_tools()
                tools = tools_response.tools if hasattr(tools_response, 'tools') else []
                
                print(f"✓ Discovered {len(tools)} tools from context7:")
                for tool in tools:
                    print(f"  - {tool.name}: {tool.description[:60]}...")
                
                # Test a simple tool call if available
                if tools and any(t.name == "resolve-library-id" for t in tools):
                    print("\nTesting resolve-library-id tool...")
                    try:
                        result = await session.call_tool(
                            "resolve-library-id",
                            {"libraryName": "react"}
                        )
                        print(f"✓ Tool call successful: {result}")
                    except Exception as e:
                        print(f"✗ Tool call failed: {e}")
            
    except FileNotFoundError:
        print("✗ npx command not found. Please ensure Node.js is installed.")
    except Exception as e:
        print(f"✗ Failed to connect to context7: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    # Run the async test
    asyncio.run(test_context7())