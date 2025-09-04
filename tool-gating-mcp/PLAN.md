PRP: Tool Gating System for Model Context Protocol (MCP)

  Goal

  Implement a tool gating system that dynamically limits the number of tools exposed to LLMs by creating a centralized MCP server with
  intelligent tool discovery, reducing token usage and improving response quality through context-aware tool selection.

  Why

  - Token Efficiency: LLMs have limited context windows, and including all available tools can consume significant tokens, leaving less room for
   actual conversation and reducing response quality
  - Cost Reduction: Token-based pricing models mean that reducing tool context can cut API costs by 50-90%, especially for applications with
  many tools
  - Performance Improvement: Fewer tools in context leads to faster inference times and more focused model responses
  - Scalability: As tool ecosystems grow, manually selecting relevant tools becomes impractical - automated gating is essential
  - Better User Experience: Models perform better when given only relevant tools, reducing hallucinations and improving task completion rates

  What

  A FastAPI-based MCP server that acts as an intelligent gateway between LLMs and multiple tool providers. The system will:

  - Tool Registry: Maintain a catalog of all available tools with metadata, tags, and usage patterns
  - Dynamic Tool Discovery: Use semantic search and tagging to identify relevant tools based on user queries
  - Context-Aware Gating: Intelligently select which tools to expose based on conversation context and user intent
  - Tool Proxying: Forward tool execution requests to appropriate MCP servers while maintaining security and rate limiting
  - Analytics & Learning: Track tool usage patterns to improve selection algorithms over time

  Key Components:
  - Discovery Endpoint: Semantic search endpoint for finding relevant tools
  - Tool Request Endpoint: Dynamic tool provisioning based on context
  - Execution Proxy: Secure forwarding of tool calls to backend MCP servers
  - Tag Management System: Hierarchical tagging for efficient tool categorization
  - Caching Layer: Reduce latency with intelligent caching of tool definitions

  Endpoints/APIs to Implement

  1. Tool Discovery Endpoint

  POST /api/v1/tools/discover
  - Accepts user query and conversation context
  - Returns ranked list of relevant tools with confidence scores
  - Supports filtering by tags, capabilities, and permissions

  2. Tool Provisioning Endpoint

  POST /api/v1/tools/provision
  - Accepts list of requested tool IDs or discovery criteria
  - Returns MCP-formatted tool definitions ready for LLM consumption
  - Includes rate limiting and access control

  3. Tool Execution Proxy

  POST /api/v1/tools/execute/{tool_id}
  - Forwards tool execution requests to appropriate MCP servers
  - Handles authentication, logging, and error management
  - Returns results in standardized format

  4. Tool Registry Management

  GET /api/v1/tools/registry
  POST /api/v1/tools/registry
  PUT /api/v1/tools/registry/{tool_id}
  DELETE /api/v1/tools/registry/{tool_id}
  - CRUD operations for tool registration
  - Bulk import/export capabilities
  - Version management for tool definitions

  5. Analytics Endpoints

  GET /api/v1/analytics/usage
  GET /api/v1/analytics/performance
  - Tool usage statistics and patterns
  - Performance metrics for tool selection algorithms

  Current Directory Structure

  /Users/andremachon/Projects/tool-gating-mcp/
  ├── CLAUDE.md
  ├── PLAN.md
  ├── README.md
  ├── pyproject.toml
  ├── src/
  │   └── tool_gating_mcp/
  │       ├── __init__.py
  │       └── main.py
  ├── tests/
  │   ├── __init__.py
  │   └── test_main.py
  └── uv.lock

  Proposed Directory Structure

  /Users/andremachon/Projects/tool-gating-mcp/
  ├── CLAUDE.md
  ├── PLAN.md
  ├── README.md
  ├── pyproject.toml
  ├── src/
  │   └── tool_gating_mcp/
  │       ├── __init__.py
  │       ├── main.py
  │       ├── api/
  │       │   ├── __init__.py
  │       │   ├── v1/
  │       │   │   ├── __init__.py
  │       │   │   ├── tools.py          # Tool discovery and provisioning endpoints
  │       │   │   ├── registry.py       # Registry management endpoints
  │       │   │   └── analytics.py      # Analytics endpoints
  │       │   └── models.py             # Pydantic models for API
  │       ├── core/
  │       │   ├── __init__.py
  │       │   ├── config.py             # Configuration management
  │       │   ├── security.py           # Authentication and authorization
  │       │   └── dependencies.py       # FastAPI dependencies
  │       ├── services/
  │       │   ├── __init__.py
  │       │   ├── discovery.py          # Tool discovery logic
  │       │   ├── gating.py             # Tool selection algorithms
  │       │   ├── registry.py           # Tool registry management
  │       │   ├── proxy.py              # MCP server proxy
  │       │   └── cache.py              # Caching service
  │       ├── models/
  │       │   ├── __init__.py
  │       │   ├── tool.py               # Tool domain models
  │       │   ├── tag.py                # Tag system models
  │       │   └── analytics.py          # Analytics models
  │       ├── db/
  │       │   ├── __init__.py
  │       │   ├── base.py               # Database configuration
  │       │   └── repositories/
  │       │       ├── __init__.py
  │       │       ├── tool.py           # Tool repository
  │       │       └── analytics.py      # Analytics repository
  │       └── utils/
  │           ├── __init__.py
  │           ├── mcp.py                # MCP protocol utilities
  │           └── semantic.py           # Semantic search utilities
  ├── tests/
  │   ├── __init__.py
  │   ├── test_main.py
  │   ├── api/
  │   │   └── test_tools.py
  │   ├── services/
  │   │   ├── test_discovery.py
  │   │   └── test_gating.py
  │   └── fixtures/
  │       └── tools.py
  └── uv.lock

  Files to Reference

  1. src/tool_gating_mcp/main.py

  - Current FastAPI application structure
  - Existing endpoint patterns and response models
  - Middleware configuration

  2. pyproject.toml

  - Dependency management, especially fastapi-mcp
  - Python version requirements
  - Development tool configuration

  3. MCP Specification (External)

  - https://spec.modelcontextprotocol.io/specification/
  - Tool definition format
  - Protocol requirements for MCP servers

  4. FastAPI Best Practices

  - https://fastapi.tiangolo.com/tutorial/
  - Dependency injection patterns
  - Response model validation

  Files to Implement (concept)

  1. src/tool_gating_mcp/api/v1/tools.py

  # Tool discovery and provisioning endpoints

  from fastapi import APIRouter, Depends, HTTPException
  from typing import List, Optional
  from ...api.models import (
      ToolDiscoveryRequest, ToolDiscoveryResponse,
      ToolProvisionRequest, ToolProvisionResponse,
      ToolExecutionRequest, ToolExecutionResponse
  )
  from ...services import discovery, gating, proxy
  from ...core.dependencies import get_current_user

  router = APIRouter(prefix="/api/v1/tools", tags=["tools"])

  @router.post("/discover", response_model=ToolDiscoveryResponse)
  async def discover_tools(
      request: ToolDiscoveryRequest,
      discovery_service: discovery.DiscoveryService = Depends()
  ) -> ToolDiscoveryResponse:
      """
      Discover relevant tools based on query and context.
      Uses semantic search and tag matching to find appropriate tools.
      """
      tools = await discovery_service.find_relevant_tools(
          query=request.query,
          context=request.context,
          tags=request.tags,
          limit=request.limit or 10
      )
      return ToolDiscoveryResponse(tools=tools)

  @router.post("/provision", response_model=ToolProvisionResponse)
  async def provision_tools(
      request: ToolProvisionRequest,
      gating_service: gating.GatingService = Depends(),
      user=Depends(get_current_user)
  ) -> ToolProvisionResponse:
      """
      Provision tools for LLM consumption based on selection criteria.
      Returns MCP-formatted tool definitions.
      """
      # Apply gating logic
      selected_tools = await gating_service.select_tools(
          tool_ids=request.tool_ids,
          max_tools=request.max_tools,
          user_context=user
      )

      # Format for MCP
      mcp_tools = await gating_service.format_for_mcp(selected_tools)

      return ToolProvisionResponse(
          tools=mcp_tools,
          metadata={
              "total_tokens": sum(t.token_count for t in mcp_tools),
              "gating_applied": True
          }
      )

  @router.post("/execute/{tool_id}", response_model=ToolExecutionResponse)
  async def execute_tool(
      tool_id: str,
      request: ToolExecutionRequest,
      proxy_service: proxy.ProxyService = Depends(),
      user=Depends(get_current_user)
  ) -> ToolExecutionResponse:
      """
      Execute a tool by proxying to the appropriate MCP server.
      Handles authentication and error management.
      """
      result = await proxy_service.execute_tool(
          tool_id=tool_id,
          params=request.parameters,
          user_context=user
      )
      return ToolExecutionResponse(result=result)

  2. src/tool_gating_mcp/services/discovery.py

  # Tool discovery service with semantic search

  from typing import List, Optional, Dict, Any
  import numpy as np
  from sentence_transformers import SentenceTransformer
  from ..models.tool import Tool, ToolMatch
  from ..db.repositories.tool import ToolRepository

  class DiscoveryService:
      def __init__(self, tool_repo: ToolRepository):
          self.tool_repo = tool_repo
          self.encoder = SentenceTransformer('all-MiniLM-L6-v2')
          self._tool_embeddings_cache = {}

      async def find_relevant_tools(
          self,
          query: str,
          context: Optional[str] = None,
          tags: Optional[List[str]] = None,
          limit: int = 10
      ) -> List[ToolMatch]:
          """
          Find tools relevant to the query using semantic search and tag matching.
          """
          # Get all tools from registry
          all_tools = await self.tool_repo.get_all()

          # Filter by tags if provided
          if tags:
              all_tools = [t for t in all_tools if any(tag in t.tags for tag in tags)]

          # Compute query embedding
          query_text = f"{query} {context or ''}"
          query_embedding = self.encoder.encode(query_text)

          # Score tools by semantic similarity
          tool_scores = []
          for tool in all_tools:
              # Get or compute tool embedding
              if tool.id not in self._tool_embeddings_cache:
                  tool_text = f"{tool.name} {tool.description} {' '.join(tool.tags)}"
                  self._tool_embeddings_cache[tool.id] = self.encoder.encode(tool_text)

              tool_embedding = self._tool_embeddings_cache[tool.id]

              # Compute cosine similarity
              similarity = np.dot(query_embedding, tool_embedding) / (
                  np.linalg.norm(query_embedding) * np.linalg.norm(tool_embedding)
              )

              # Boost score for exact tag matches
              tag_boost = 0.2 * len(set(tags or []) & set(tool.tags))

              tool_scores.append(ToolMatch(
                  tool=tool,
                  score=float(similarity + tag_boost),
                  matched_tags=list(set(tags or []) & set(tool.tags))
              ))

          # Sort by score and return top results
          tool_scores.sort(key=lambda x: x.score, reverse=True)
          return tool_scores[:limit]

  3. src/tool_gating_mcp/services/gating.py

  # Tool gating logic for intelligent selection

  from typing import List, Optional, Dict, Any
  from ..models.tool import Tool, MCPTool
  from ..core.config import settings

  class GatingService:
      def __init__(self):
          self.max_tokens = settings.MAX_TOOL_TOKENS
          self.max_tools = settings.MAX_TOOLS_PER_REQUEST

      async def select_tools(
          self,
          tool_ids: Optional[List[str]] = None,
          max_tools: Optional[int] = None,
          user_context: Optional[Dict[str, Any]] = None
      ) -> List[Tool]:
          """
          Apply gating logic to select appropriate tools within constraints.
          """
          max_tools = max_tools or self.max_tools

          # Get requested tools
          if tool_ids:
              tools = await self.tool_repo.get_by_ids(tool_ids)
          else:
              # If no specific tools requested, use frequently used ones
              tools = await self.tool_repo.get_popular(limit=max_tools * 2)

          # Apply token budget
          selected_tools = []
          total_tokens = 0

          for tool in tools:
              if len(selected_tools) >= max_tools:
                  break

              if total_tokens + tool.estimated_tokens <= self.max_tokens:
                  selected_tools.append(tool)
                  total_tokens += tool.estimated_tokens

          return selected_tools

      async def format_for_mcp(self, tools: List[Tool]) -> List[MCPTool]:
          """
          Convert internal tool format to MCP protocol format.
          """
          mcp_tools = []
          for tool in tools:
              mcp_tool = MCPTool(
                  name=tool.name,
                  description=tool.description,
                  parameters=tool.parameters,
                  token_count=tool.estimated_tokens
              )
              mcp_tools.append(mcp_tool)

          return mcp_tools

  4. src/tool_gating_mcp/api/models.py

  # Pydantic models for API requests/responses

  from pydantic import BaseModel, Field
  from typing import List, Optional, Dict, Any
  from datetime import datetime

  class ToolDiscoveryRequest(BaseModel):
      query: str = Field(..., description="Natural language query for tool discovery")
      context: Optional[str] = Field(None, description="Additional context from conversation")
      tags: Optional[List[str]] = Field(None, description="Filter by specific tags")
      limit: Optional[int] = Field(10, ge=1, le=50, description="Maximum tools to return")

  class ToolMatch(BaseModel):
      tool_id: str
      name: str
      description: str
      score: float = Field(..., ge=0, le=1)
      matched_tags: List[str]
      estimated_tokens: int

  class ToolDiscoveryResponse(BaseModel):
      tools: List[ToolMatch]
      query_id: str
      timestamp: datetime

  class ToolProvisionRequest(BaseModel):
      tool_ids: Optional[List[str]] = Field(None, description="Specific tools to provision")
      max_tools: Optional[int] = Field(None, description="Maximum number of tools")
      context_tokens: Optional[int] = Field(None, description="Available token budget")

  class MCPToolDefinition(BaseModel):
      name: str
      description: str
      parameters: Dict[str, Any]
      token_count: int

  class ToolProvisionResponse(BaseModel):
      tools: List[MCPToolDefinition]
      metadata: Dict[str, Any]
