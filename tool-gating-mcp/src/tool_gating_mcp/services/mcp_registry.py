"""MCP Server Registry Service"""

import json
from pathlib import Path
from typing import Any

import aiofiles

from ..models.mcp_config import (
    MCPServerConfig,
    MCPServerRegistration,
    MCPToolSchema,
)


class MCPServerRegistry:
    """Manages MCP server configurations"""

    def __init__(self, config_path: str = "mcp-servers.json"):
        self.config_path = Path(config_path)
        self._servers: dict[str, MCPServerConfig] = {}
        self._load_config()

    def _load_config(self) -> None:
        """Load server configurations from JSON file"""
        if self.config_path.exists():
            with open(self.config_path) as f:
                data = json.load(f)
                for name, config in data.items():
                    self._servers[name] = MCPServerConfig(**config)

    async def save_config(self) -> None:
        """Save current configurations to JSON file"""
        data = {
            name: config.model_dump(exclude_none=True)
            for name, config in self._servers.items()
        }

        async with aiofiles.open(self.config_path, "w") as f:
            await f.write(json.dumps(data, indent=2))

    async def register_server(
        self, registration: MCPServerRegistration
    ) -> dict[str, str]:
        """Register a new MCP server"""
        if registration.name in self._servers:
            return {
                "status": "error",
                "message": f"Server '{registration.name}' already exists",
            }

        self._servers[registration.name] = registration.config
        await self.save_config()

        return {
            "status": "success",
            "message": f"Server '{registration.name}' registered successfully",
        }

    async def get_server(self, name: str) -> MCPServerConfig | None:
        """Get a server configuration by name"""
        return self._servers.get(name)

    async def list_servers(self) -> list[str]:
        """List all registered server names"""
        return list(self._servers.keys())

    async def remove_server(self, name: str) -> dict[str, str]:
        """Remove a server from the registry"""
        if name not in self._servers:
            return {"status": "error", "message": f"Server '{name}' not found"}

        del self._servers[name]
        await self.save_config()

        return {"status": "success", "message": f"Server '{name}' removed successfully"}

    async def update_server(self, name: str, config: MCPServerConfig) -> dict[str, str]:
        """Update an existing server configuration"""
        if name not in self._servers:
            return {"status": "error", "message": f"Server '{name}' not found"}

        self._servers[name] = config
        await self.save_config()

        return {"status": "success", "message": f"Server '{name}' updated successfully"}


class MCPDiscoveryService:
    """Service for discovering tools from MCP servers"""

    def __init__(self, tool_repo: Any):
        self.tool_repo = tool_repo

    async def discover_and_register_tools(
        self, server_name: str, tools: list[MCPToolSchema], auto_register: bool = True
    ) -> dict[str, Any]:
        """Discover and optionally register tools from an MCP server"""

        discovered_tools = []

        for mcp_tool in tools:
            tool_data = mcp_tool.to_internal_tool(server_name)
            discovered_tools.append(tool_data)

            if auto_register:
                # Add tool to repository
                from ..models.tool import Tool

                tool = Tool(**tool_data)
                await self.tool_repo.add_tool(tool)

        return {
            "status": "success",
            "server": server_name,
            "tools_discovered": len(discovered_tools),
            "tools": discovered_tools if not auto_register else None,
            "auto_registered": auto_register,
        }

    async def analyze_mcp_config(
        self,
        config: MCPServerConfig,
        sample_tools: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        """Analyze an MCP server configuration to extract metadata"""

        # Extract server type from command
        command = config.command.lower()
        server_type = "unknown"

        if "slack" in command:
            server_type = "slack"
        elif "github" in command:
            server_type = "github"
        elif "database" in command or "postgres" in command or "mysql" in command:
            server_type = "database"
        elif "file" in command or "fs" in command:
            server_type = "filesystem"
        elif "api" in command or "rest" in command:
            server_type = "api"

        # Estimate capabilities from args and env
        capabilities = []
        if any("read" in arg.lower() for arg in config.args):
            capabilities.append("read")
        if any("write" in arg.lower() for arg in config.args):
            capabilities.append("write")
        if any(
            "token" in key.lower() or "key" in key.lower() for key in config.env.keys()
        ):
            capabilities.append("authenticated")

        # If sample tools provided, analyze them
        tool_categories = set()
        if sample_tools:
            for tool in sample_tools:
                desc = tool.get("description", "").lower()
                if "search" in desc:
                    tool_categories.add("search")
                if "create" in desc or "add" in desc:
                    tool_categories.add("create")
                if "update" in desc or "edit" in desc:
                    tool_categories.add("update")
                if "delete" in desc or "remove" in desc:
                    tool_categories.add("delete")
                if "list" in desc or "get" in desc:
                    tool_categories.add("read")

        return {
            "server_type": server_type,
            "capabilities": capabilities,
            "tool_categories": list(tool_categories),
            "has_authentication": any("authenticated" in capabilities),
            "estimated_complexity": len(config.args) + len(config.env),
        }
