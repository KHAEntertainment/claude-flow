# Tool Discovery: Query and Tag System

This document explains how the tool discovery system uses semantic search and optional tag filtering to find the most relevant tools from multiple MCP servers.

## Overview

The discovery system combines two complementary approaches:
1. **Semantic Search (Required)**: Natural language queries matched by meaning
2. **Tag Filtering (Optional)**: Category-based filtering with relevance boosting

## How It Works

### Query-Only Search (Most Common)

The simplest and most flexible approach uses just a natural language query:

```python
# Find tools by semantic meaning
results = await discovery.search_tools("analyze code quality")
# Might find: linter, code analyzer, test runner, static analyzer, etc.
```

The system:
1. Embeds your query using sentence transformers
2. Compares it against embeddings of all tool names, descriptions, and tags
3. Returns tools ranked by semantic similarity

### Query + Tags (Refined Search)

When you need more control, add optional tags to filter and boost specific categories:

```python
# Semantic search with category preference
results = await discovery.search_tools(
    "analyze code",
    tags=["testing"]  # Optional refinement
)
# Prioritizes testing tools that analyze code
```

With tags, the system:
1. **Filters first**: Only considers tools that have at least one matching tag
2. **Searches semantically**: Ranks filtered tools by query relevance
3. **Boosts matches**: Adds +0.2 to the score for each matching tag

## Scoring Formula

```
final_score = semantic_similarity + (0.2 × number_of_matching_tags)
```

- Semantic similarity: 0.0 to 1.0 (cosine similarity)
- Tag boost: 0.2 per matching tag
- Scores are clamped to [0, 1] range

## Real-World Examples

### Scenario 1: General Tool Discovery
```python
# User needs: "I want to search for research papers"
results = await discovery.search_tools("search for research papers")

# Finds (ranked by relevance):
# 1. research_paper_search (Exa) - 0.92 score
# 2. web_search_exa (Exa) - 0.65 score  
# 3. get-library-docs (Context7) - 0.45 score
```

### Scenario 2: Cross-Server Task
```python
# User needs: "Search papers and save results"
results = await discovery.search_tools(
    "search academic papers and save to file"
)

# Finds tools from multiple servers:
# 1. research_paper_search (Exa) - 0.88 score
# 2. file_write (Desktop Commander) - 0.82 score
# 3. store_memory (Basic Memory) - 0.61 score
```

### Scenario 3: Targeted Category Search
```python
# User needs: "Store data" but specifically in memory/storage systems
results = await discovery.search_tools(
    "store data",
    tags=["storage", "memory"]
)

# Prioritizes storage-specific tools:
# 1. store_memory (Basic Memory) - 0.95 score (semantic + tag boost)
# 2. file_write (Desktop Commander) - 0.72 score
# Note: Web search tools excluded by tag filter
```

## Advantages

1. **Flexibility**: Query-only searches work great for most use cases
2. **Precision**: Tags help when you know the specific category
3. **Cross-Server Intelligence**: Finds relevant tools regardless of server
4. **Natural Fallback**: Even with tags, semantic search ensures good results
5. **Context Efficiency**: Helps select 2-3 relevant tools instead of 40+

## Best Practices

### When to Use Query-Only
- General exploration ("what tools can help with X?")
- Cross-functional tasks requiring multiple tool types
- When you're not sure about tool categories
- Most common use case (90% of searches)

### When to Add Tags
- You know the specific domain (e.g., only want "search" tools)
- Filtering out noise from large tool sets
- Enforcing tool selection from specific categories
- Fine-tuning results when query alone is too broad

## Implementation Details

The discovery service:
1. Embeds all tools on startup using their name + description + tags
2. Caches embeddings for performance
3. Uses `all-MiniLM-L6-v2` model (384-dimensional embeddings)
4. Applies cosine similarity for semantic matching
5. Adds tag bonuses after similarity calculation

## API Reference

```python
async def search_tools(
    query: str,                    # Required: Natural language search
    tags: list[str] | None = None, # Optional: Filter and boost by tags
    top_k: int = 10,              # Optional: Max results to return
) -> list[ToolMatch]:
```

Each `ToolMatch` includes:
- `tool`: The complete tool definition
- `score`: Combined semantic + tag score (0.0 to 1.0)
- `matched_tags`: Which tags matched (if any)

## Why This Matters for MCP

With multiple MCP servers each exposing many tools:
- **Without gating**: LLM receives all 40+ tools, causing context bloat
- **With smart discovery**: LLM gets 2-3 highly relevant tools
- **Result**: Better performance, lower costs, more accurate tool selection