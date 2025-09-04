"""MCP Client Manager for managing connections to multiple MCP servers"""

import asyncio
from typing import Dict, List, Any, Optional
from contextlib import asynccontextmanager
import logging

try:
    from mcp import ClientSession
    from mcp.client.stdio import stdio_client, StdioServerParameters
    HAS_MCP_SDK = True
except ImportError:
    # Fallback for testing or when MCP SDK not available
    ClientSession = Any
    stdio_client = None
    StdioServerParameters = Any
    HAS_MCP_SDK = False

logger = logging.getLogger(__name__)


class MCPClientManager:
    """Manages connections to multiple MCP servers via stdio transport"""
    
    def __init__(self):
        self.sessions: Dict[str, ClientSession] = {}
        self.server_tools: Dict[str, List[Any]] = {}
        self._server_info: Dict[str, Dict[str, Any]] = {}
        self._stdio_contexts: Dict[str, Any] = {}  # Store context managers
    
    async def connect_server(self, name: str, config: dict) -> None:
        """Connect to an MCP server and discover its tools
        
        Args:
            name: Unique server name
            config: Server configuration with command, args, env
        """
        if not HAS_MCP_SDK or not stdio_client:
            logger.warning(f"MCP SDK not available, using mock tools for {name}")
            
            # For testing/development, add mock tools
            mock_tools = []
            if name == "context7":
                mock_tools = [
                    type('MockTool', (), {
                        'name': 'resolve-library-id',
                        'description': 'Resolves a package/product name to a Context7-compatible library ID',
                        'inputSchema': {'type': 'object', 'properties': {'libraryName': {'type': 'string'}}}
                    })(),
                    type('MockTool', (), {
                        'name': 'get-library-docs',
                        'description': 'Fetches up-to-date documentation for a library',
                        'inputSchema': {'type': 'object', 'properties': {'context7CompatibleLibraryID': {'type': 'string'}}}
                    })()
                ]
            
            self.server_tools[name] = mock_tools
            self._server_info[name] = {
                "config": config,
                "connected": False,
                "reason": "MCP SDK not available (using mock tools)"
            }
            return
            
        try:
            logger.info(f"Attempting to connect to MCP server: {name}")
            
            # For now, just discover tools without keeping connection open
            # Real implementation would maintain persistent connections
            server_params = StdioServerParameters(
                command=config["command"],
                args=config.get("args", []),
                env=config.get("env", {})
            )
            
            # Create stdio client connection to discover tools
            async with stdio_client(server_params) as (read_stream, write_stream):
                logger.info(f"Created stdio streams for {name}")
                
                # Create a ClientSession with the streams
                async with ClientSession(read_stream, write_stream) as session:
                    # Initialize the connection
                    await session.initialize()
                    logger.info(f"Successfully initialized connection to {name}")
                    
                    # Discover available tools
                    tools_response = await session.list_tools()
                    tools = tools_response.tools if hasattr(tools_response, 'tools') else []
                    
                    self.server_tools[name] = tools
                    logger.info(f"Discovered {len(tools)} tools from {name}")
                    
                    # Log tool names for debugging
                    for tool in tools:
                        logger.debug(f"  - {tool.name}: {tool.description[:50]}...")
                    
                    # Store server info
                    self._server_info[name] = {
                        "config": config,
                        "connected": True,
                        "tools_discovered": len(tools)
                    }
                        
        except FileNotFoundError as e:
            logger.error(f"MCP server command not found for {name}: {config['command']}")
            self._server_info[name] = {
                "config": config,
                "connected": False,
                "error": f"Command not found: {config['command']}"
            }
            self.server_tools[name] = []
        except Exception as e:
            logger.error(f"Failed to connect to {name}: {str(e)}")
            self._server_info[name] = {
                "config": config,
                "connected": False,
                "error": str(e)
            }
            self.server_tools[name] = []
    
    async def execute_tool(self, server_name: str, tool_name: str, arguments: dict) -> Any:
        """Execute a tool on a specific server
        
        Args:
            server_name: Name of the server
            tool_name: Name of the tool
            arguments: Tool arguments
            
        Returns:
            Tool execution result
        """
        if server_name not in self._server_info:
            raise ValueError(f"Server {server_name} not connected")
        
        # For each tool execution, create a new connection
        # This is less efficient but simpler to implement
        server_info = self._server_info[server_name]
        config = server_info["config"]
        
        try:
            server_params = StdioServerParameters(
                command=config["command"],
                args=config.get("args", []),
                env=config.get("env", {})
            )
            
            async with stdio_client(server_params) as (read_stream, write_stream):
                async with ClientSession(read_stream, write_stream) as session:
                    await session.initialize()
                    result = await session.call_tool(tool_name, arguments)
                    return result
                    
        except Exception as e:
            logger.error(f"Failed to execute tool {tool_name} on {server_name}: {e}")
            # For testing, return a mock result
            return {"mock": True, "tool": tool_name, "args": arguments, "error": str(e)}
    
    async def disconnect_all(self) -> None:
        """Disconnect all active sessions"""
        server_names = list(self._server_info.keys())
        for name in server_names:
            await self.disconnect_server(name)
    
    async def disconnect_server(self, name: str) -> None:
        """Disconnect a specific server
        
        Args:
            name: Server name to disconnect
        """
        if name in self._server_info:
            del self._server_info[name]
            if name in self.server_tools:
                del self.server_tools[name]