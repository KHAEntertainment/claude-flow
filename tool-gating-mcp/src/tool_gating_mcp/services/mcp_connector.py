"""MCP Server Connector - Handles actual connections to MCP servers"""

import json

import httpx

from ..config import settings
from ..models.mcp_config import MCPServerConfig, MCPToolSchema


class MCPConnector:
    """Connects to MCP servers to discover their tools"""

    async def connect_and_discover(
        self, server_name: str, config: MCPServerConfig
    ) -> list[MCPToolSchema]:
        """
        Connect to an MCP server and discover its tools.

        This is where the AI (with MCP client capabilities) would:
        1. Start the MCP server process
        2. Connect via stdio/HTTP
        3. Send tools/list request
        4. Parse the response
        """

        # For AI assistants with MCP support, they can directly call the server
        # and get the actual tool list. The AI would execute something like:

        # Example of what the AI would do:
        # 1. Start server:
        #    subprocess.run([config.command] + config.args, env=config.env)
        # 2. Connect and request: {"jsonrpc": "2.0", "method": "tools/list", "id": 1}
        # 3. Parse response and return tools

        # This is a placeholder that would be replaced by actual MCP connection
        # when called by an AI with MCP capabilities
        return []

    async def discover_via_anthropic_api(
        self, server_name: str, config: MCPServerConfig
    ) -> list[MCPToolSchema]:
        """
        Use Anthropic API to discover tools from an MCP server.

        This leverages the new mcp_servers parameter to have Claude
        connect to the server and report back the available tools.
        """

        if not settings.has_anthropic_key:
            raise ValueError("Anthropic API key not configured")

        # Construct MCP server config for Anthropic API
        mcp_server = {
            "name": server_name,
            "type": "stdio",  # or "url" for HTTP-based servers
            "command": config.command,
            "args": config.args,
            "env": config.env,
        }

        # Use Anthropic API to discover tools
        headers = {
            "x-api-key": settings.anthropic_api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        }

        # Ask Claude to list the tools from the MCP server
        body = {
            "model": settings.anthropic_model,
            "max_tokens": 4000,
            "messages": [
                {
                    "role": "user",
                    "content": (
                        f"Connect to the MCP server '{server_name}' and "
                        "list all available tools.\n\n"
                        "For each tool, provide:\n"
                        "1. Name (exact tool name)\n"
                        "2. Description (what the tool does)\n"
                        "3. Input schema (parameters)\n\n"
                        "Format your response as a JSON array of tools like this:\n"
                        "```json\n"
                        "[\n"
                        "  {\n"
                        '    "name": "tool_name",\n'
                        '    "description": "What this tool does",\n'
                        '    "inputSchema": {\n'
                        '      "type": "object",\n'
                        '      "properties": {...},\n'
                        '      "required": [...]\n'
                        "    }\n"
                        "  }\n"
                        "]\n"
                        "```\n\n"
                        "Only return the JSON array, no other text."
                    ),
                }
            ],
            "mcp_servers": [mcp_server],
        }

        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers=headers,
                json=body,
                timeout=30.0,
            )

            if response.status_code != 200:
                raise Exception(f"Anthropic API error: {response.text}")

            # Extract tools from Claude's response
            result = response.json()
            content = result["content"][0]["text"]

            # Parse JSON from response
            import re

            json_match = re.search(r"```json\s*(.*?)\s*```", content, re.DOTALL)
            if json_match:
                tools_json = json_match.group(1)
            else:
                # Try to parse the whole content as JSON
                tools_json = content

            tools_data = json.loads(tools_json)

            # Convert to MCPToolSchema
            return [
                MCPToolSchema(
                    name=tool["name"],
                    description=tool["description"],
                    inputSchema=tool["inputSchema"],
                )
                for tool in tools_data
            ]


class LocalMCPConnector:
    """
    For AI assistants with local MCP support (Claude Desktop, Cursor).

    This provides instructions for the AI to follow when discovering tools.
    """

    @staticmethod
    def get_discovery_instructions() -> str:
        """Instructions for AI to discover MCP tools"""

        return """
To discover tools from an MCP server:

1. Start the MCP server using the provided configuration
2. Connect to it using your MCP client capabilities
3. Send a 'tools/list' request
4. For each tool returned, create a registration request with:
   - Unique ID: {server_name}_{tool_name}
   - Clear description
   - Appropriate tags based on functionality
   - Estimated tokens based on complexity
   - Original parameter schema

5. Call POST /api/v1/tools/register for each tool

Example for a single tool:
```
POST http://localhost:8000/api/v1/tools/register
{
  "id": "slack_send_message",
  "name": "send_message",
  "description": "Send a message to a Slack channel or user",
  "tags": ["messaging", "slack", "communication"],
  "estimated_tokens": 150,
  "server": "slack",
  "parameters": {
    "type": "object",
    "properties": {
      "channel": {"type": "string"},
      "text": {"type": "string"}
    },
    "required": ["channel", "text"]
  }
}
```
"""
