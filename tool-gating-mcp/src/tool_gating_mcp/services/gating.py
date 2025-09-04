# Tool gating service
# Implements intelligent tool selection and MCP formatting

from typing import Any

from ..models.tool import MCPTool, Tool


class GatingService:
    """Service for applying gating logic to tool selection."""

    def __init__(self, tool_repo: Any) -> None:
        """Initialize gating service with repository and defaults."""
        self.tool_repo = tool_repo
        self.max_tokens = 2000  # Default max tokens
        self.max_tools = 10  # Default max tools per request

    async def select_tools(
        self,
        tool_ids: list[str] | None = None,
        max_tools: int | None = None,
        user_context: dict[str, Any] | None = None,
    ) -> list[Tool]:
        """Apply gating logic to select appropriate tools within constraints."""
        max_tools = max_tools or self.max_tools

        # Get requested tools
        if tool_ids:
            tools = await self.tool_repo.get_by_ids(tool_ids)
        else:
            # If no specific tools requested, use frequently used ones
            tools = await self.tool_repo.get_popular(limit=max_tools * 2)

        # Apply token budget
        selected_tools: list[Tool] = []
        total_tokens = 0

        for tool in tools:
            if len(selected_tools) >= max_tools:
                break

            if total_tokens + tool.estimated_tokens <= self.max_tokens:
                selected_tools.append(tool)
                total_tokens += tool.estimated_tokens

        return selected_tools

    async def format_for_mcp(self, tools: list[Tool]) -> list[MCPTool]:
        """Convert internal tool format to MCP protocol format."""
        mcp_tools = []
        for tool in tools:
            mcp_tool = MCPTool(
                name=tool.name,
                description=tool.description,
                inputSchema=tool.parameters or {"type": "object"},
            )
            mcp_tools.append(mcp_tool)

        return mcp_tools

    def _format_tools_for_mcp(self, tools: list[Tool]) -> list[MCPTool]:
        """Convert internal tool format to MCP protocol format (sync version)."""
        mcp_tools = []
        for tool in tools:
            mcp_tool = MCPTool(
                name=tool.name,
                description=tool.description,
                inputSchema=tool.parameters or {"type": "object"},
            )
            mcp_tools.append(mcp_tool)
        return mcp_tools
