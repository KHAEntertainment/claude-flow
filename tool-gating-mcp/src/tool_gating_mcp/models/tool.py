# Tool domain models
# Core models for tool representation and MCP protocol compatibility

from typing import Any

from pydantic import BaseModel, Field, field_validator


class Tool(BaseModel):
    """Internal representation of a tool in the registry."""

    id: str = Field(..., min_length=1, description="Unique identifier for the tool")
    name: str = Field(..., description="Human-readable tool name")
    description: str = Field(
        ..., description="Detailed description of tool functionality"
    )
    tags: list[str] = Field(default_factory=list, description="Categorization tags")
    estimated_tokens: int = Field(
        ..., gt=0, description="Estimated token count for tool definition"
    )
    parameters: dict[str, Any] | None = Field(
        default=None, description="Tool parameter schema"
    )
    server: str | None = Field(
        default=None, description="MCP server that provides this tool"
    )

    @field_validator("id")
    @classmethod
    def validate_id(cls, v: str) -> str:
        """Ensure ID is not empty."""
        if not v.strip():
            raise ValueError("Tool ID cannot be empty")
        return v


class ToolMatch(BaseModel):
    """Result of tool discovery with relevance scoring."""

    tool: Tool
    score: float = Field(
        ..., ge=0.0, le=1.0, description="Relevance score between 0 and 1"
    )
    matched_tags: list[str] = Field(
        default_factory=list, description="Tags that matched the query"
    )


class MCPTool(BaseModel):
    """Tool definition in MCP protocol format."""

    name: str = Field(..., description="Tool name in MCP format")
    description: str = Field(..., description="Tool description for LLM consumption")
    inputSchema: dict[str, Any] = Field(  # noqa: N815
        ..., description="JSON Schema for tool inputs"
    )
