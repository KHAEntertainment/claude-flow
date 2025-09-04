# AI-Assisted MCP Server Integration

This guide explains how AI assistants can automatically add new MCP servers to the Tool Gating system.

## Overview

The Tool Gating MCP server provides special endpoints that allow AI assistants (like Claude Desktop, Cursor, or via Anthropic API) to automatically:
1. Register new MCP server configurations
2. Discover all available tools
3. Add them with proper metadata for selective provisioning

## For AI Assistants (Claude Desktop, Cursor, etc.)

### Quick Start

When a user provides you with an MCP server configuration, follow these steps:

1. **Register the server and its tools in one call:**

```bash
POST http://localhost:8000/api/mcp/ai/register-server

{
  "server_name": "slack",
  "config": {
    "command": "npx",
    "args": ["@slack/mcp-server"],
    "env": {
      "SLACK_TOKEN": "xoxb-..."
    }
  },
  "tools": [
    {
      "name": "send_message",
      "description": "Send a message to a Slack channel or user",
      "inputSchema": {
        "type": "object",
        "properties": {
          "channel": {"type": "string", "description": "Channel or user ID"},
          "text": {"type": "string", "description": "Message text"}
        },
        "required": ["channel", "text"]
      },
      "tags": ["messaging", "slack", "send"],
      "estimated_tokens": 150
    },
    // ... more tools
  ]
}
```

### Step-by-Step Process

1. **User provides MCP server config:**
   ```json
   {
     "slack": {
       "command": "npx",
       "args": ["@slack/mcp-server"],
       "env": {"SLACK_TOKEN": "xoxb-..."}
     }
   }
   ```

2. **You (AI) connect to the MCP server:**
   - Start the server process
   - Connect via stdio or HTTP
   - Send `tools/list` request

3. **For each tool discovered:**
   - Extract name and description
   - Get the full inputSchema
   - Generate appropriate tags based on functionality
   - Estimate token count (base 50 + description length/4 + schema complexity)

4. **Call the registration endpoint with all data**

5. **Confirm to user:**
   ```
   ✅ Successfully registered Slack MCP server with 12 tools:
   - send_message (150 tokens)
   - list_channels (100 tokens)
   - search_messages (200 tokens)
   ... and 9 more
   
   All tools are now available for selective provisioning!
   ```

## For Users with Anthropic API

### Setup

1. **Add your API key to `.env`:**
   ```bash
   ANTHROPIC_API_KEY=sk-ant-api03-...
   ```

2. **The system will automatically use the API to discover tools**

### How It Works

When you call the discover endpoint, the system:
1. Uses Anthropic's new `mcp_servers` parameter
2. Asks Claude to connect and list all tools
3. Automatically registers everything

```bash
POST http://localhost:8000/api/mcp/discover
{
  "server_name": "github",
  "config": {
    "command": "github-mcp",
    "args": ["--token", "ghp_..."]
  },
  "auto_register": true
}
```

## Tool Metadata Guidelines

### Tags

Generate tags based on the tool's functionality:

**Action tags:**
- `create`, `read`, `update`, `delete`
- `search`, `list`, `get`, `find`
- `send`, `receive`, `upload`, `download`

**Domain tags:**
- `messaging`, `file`, `database`, `api`
- `slack`, `github`, `aws`, etc.

**Type tags:**
- `async`, `batch`, `real-time`
- `authenticated`, `public`

### Token Estimation

```python
def estimate_tokens(tool):
    base = 50  # Base overhead
    desc_tokens = len(tool.description) // 4
    
    # Schema complexity
    schema_str = json.dumps(tool.inputSchema)
    schema_tokens = len(schema_str) // 4
    
    overhead = 20  # Formatting
    
    return base + desc_tokens + schema_tokens + overhead
```

## Example: Complete Slack Integration

**User:** "Add this Slack MCP server to my tool gating"

**AI Assistant Actions:**

1. Parse the config
2. Connect to Slack MCP server
3. Discover tools: `send_message`, `list_channels`, `search_messages`, etc.
4. Call the registration endpoint:

```json
POST /api/mcp/ai/register-server
{
  "server_name": "slack",
  "config": {...},
  "tools": [
    {
      "name": "send_message",
      "description": "Send a message to a Slack channel or direct message",
      "inputSchema": {...},
      "tags": ["messaging", "slack", "send", "communication"],
      "estimated_tokens": 150
    },
    // ... all other tools
  ]
}
```

5. Response to user:
```
I've successfully added the Slack MCP server to your Tool Gating system:

📊 Server: slack
🔧 Tools: 12 registered
💾 Config: Saved to mcp-servers.json

Now when an LLM needs Slack functionality, it will only receive the specific tools needed (e.g., just send_message) instead of all 12 tools, reducing context usage by ~80%.

You can test it:
- Search: POST /api/tools/discover {"query": "send slack message"}
- Provision: POST /api/tools/provision {"tool_ids": ["slack_send_message"]}
```

## Benefits

1. **Zero Manual Work**: AI handles the entire process
2. **Complete Registration**: All tools discovered and added
3. **Proper Metadata**: Tags and tokens for optimal selection
4. **Immediate Use**: Tools ready for selective provisioning
5. **Persistent Config**: Saved to mcp-servers.json

## Troubleshooting

### "Server already exists"
The server is already registered. Use DELETE `/api/mcp/servers/{name}` first.

### "Failed to connect"
Check that the MCP server command and credentials are correct.

### "No tools discovered"
Ensure the MCP server is properly configured and the tools/list method is implemented.