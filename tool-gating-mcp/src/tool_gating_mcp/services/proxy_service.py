"""Proxy Service for routing tool execution to backend MCP servers"""

from typing import Dict, Any, Set, Optional, List

from ..models.tool import Tool
from .mcp_client_manager import MCPClientManager
from .repository import InMemoryToolRepository


class ProxyService:
    """Manages proxy operations for tool execution across MCP servers"""
    
    def __init__(
        self, 
        client_manager: MCPClientManager,
        tool_repository: InMemoryToolRepository
    ):
        self.client_manager = client_manager
        self.tool_repository = tool_repository
        self.provisioned_tools: Set[str] = set()
    
    async def discover_all_tools(self) -> None:
        """Discover and index tools from all connected servers"""
        for server_name, tools in self.client_manager.server_tools.items():
            for tool in tools:
                # Convert MCP tool to our Tool model
                tool_obj = Tool(
                    id=f"{server_name}_{tool.name}",
                    name=getattr(tool, 'name', 'unknown'),
                    description=getattr(tool, 'description', '') or "",
                    parameters=getattr(tool, 'inputSchema', getattr(tool, 'parameters', {})) or {},
                    server=server_name,
                    tags=self._extract_tags(getattr(tool, 'description', '')),
                    estimated_tokens=self._estimate_tokens(tool)
                )
                # Use sync version of add_tool
                self.tool_repository.add_tool_sync(tool_obj)
    
    def provision_tool(self, tool_id: str) -> None:
        """Mark a tool as provisioned for use
        
        Args:
            tool_id: Tool identifier to provision
        """
        self.provisioned_tools.add(tool_id)
    
    def unprovision_tool(self, tool_id: str) -> None:
        """Remove a tool from provisioned set
        
        Args:
            tool_id: Tool identifier to unprovision
        """
        self.provisioned_tools.discard(tool_id)
    
    def is_provisioned(self, tool_id: str) -> bool:
        """Check if a tool is provisioned
        
        Args:
            tool_id: Tool identifier to check
            
        Returns:
            True if provisioned, False otherwise
        """
        return tool_id in self.provisioned_tools
    
    async def get_tool_execution_info(self, tool_id: str, arguments: dict) -> Dict[str, Any]:
        """Get detailed information about what a tool execution will do
        
        Args:
            tool_id: Tool identifier
            arguments: Tool arguments
            
        Returns:
            Dictionary with execution details
        """
        tool = self.tool_repository.get_tool(tool_id)
        if not tool:
            raise ValueError(f"Tool {tool_id} not found")
        
        # Build execution info
        info = {
            "tool_name": tool.name,
            "server": tool.server,
            "description": tool.description,
            "action_summary": self._generate_action_summary(tool, arguments),
            "estimated_tokens": tool.estimated_tokens,
            "tags": tool.tags
        }
        
        return info
    
    def _generate_action_summary(self, tool: Tool, arguments: dict) -> str:
        """Generate a human-readable summary of what the tool will do
        
        Args:
            tool: Tool object
            arguments: Tool arguments
            
        Returns:
            Action summary string
        """
        # Generate specific summaries based on tool patterns
        if "search" in tool.name.lower():
            query = arguments.get("query", "")
            return f"Will search for '{query}'"
        elif "screenshot" in tool.name.lower():
            name = arguments.get("name", "screenshot")
            return f"Will capture screenshot '{name}'"
        elif "write" in tool.name.lower():
            title = arguments.get("title", "note")
            return f"Will write note '{title}'"
        elif "research" in tool.name.lower():
            target = arguments.get("query", "target")
            return f"Will research '{target}'"
        else:
            # Generic summary
            return f"Will execute {tool.name} with provided arguments"
    
    async def execute_tool(self, tool_id: str, arguments: dict) -> Any:
        """Execute a tool via proxy with real-time loading
        
        Args:
            tool_id: Tool identifier (format: "servername_toolname")
            arguments: Tool-specific arguments
            
        Returns:
            Result from tool execution
            
        Raises:
            ValueError: If tool not found or invalid format
        """
        # Parse server and tool name from ID
        if '_' not in tool_id:
            raise ValueError(f"Invalid tool ID format: {tool_id}")
        
        # Split only on first underscore to handle tool names with underscores
        server_name, tool_name = tool_id.split('_', 1)
        
        # Verify tool exists in repository (for validation)
        tool = self.tool_repository.get_tool(tool_id)
        if not tool:
            raise ValueError(f"Tool {tool_id} not found in repository")
        
        # Execute via client manager - real-time loading happens here
        return await self.client_manager.execute_tool(server_name, tool_name, arguments)
    
    def _extract_tags(self, description: Optional[str]) -> List[str]:
        """Extract tags from tool description
        
        Args:
            description: Tool description text
            
        Returns:
            List of extracted tags
        """
        if not description:
            return []
        
        # Simple tag extraction based on keywords
        tags = []
        keywords = ["search", "web", "browser", "file", "code", "api", "data"]
        desc_lower = description.lower()
        
        for keyword in keywords:
            if keyword in desc_lower:
                tags.append(keyword)
        
        # Add more specific tags based on common patterns
        if "screenshot" in desc_lower:
            tags.append("screenshot")
        if "navigate" in desc_lower or "navigation" in desc_lower:
            tags.append("navigation")
        if "read" in desc_lower:
            tags.append("read")
        if "write" in desc_lower:
            tags.append("write")
        if "documentation" in desc_lower or "docs" in desc_lower:
            tags.append("documentation")
        
        return list(set(tags))  # Remove duplicates
    
    def _estimate_tokens(self, tool: Any) -> int:
        """Estimate token count for a tool
        
        Args:
            tool: MCP tool object
            
        Returns:
            Estimated token count
        """
        # Simple estimation based on description and schema size
        desc_tokens = len(str(getattr(tool, 'description', '') or "").split()) * 1.3
        schema_tokens = len(str(getattr(tool, 'inputSchema', {}) or {}).split()) * 1.3
        return int(desc_tokens + schema_tokens + 50)  # Base overhead