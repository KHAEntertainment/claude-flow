# Tool Gating in Claude-Flow

The MCP server uses a **ToolGateController** to load tools on demand and
apply filters before exposing them to clients. Toolsets remain disabled
until explicitly enabled via discovery tools. This reduces context size and
provides a single source of truth for tool definitions.

## Discovery Tools

The server always exposes a small set of discovery tools:

- `gate/discover_toolsets` – list available toolsets
- `gate/enable_toolset` – enable a named toolset
- `gate/disable_toolset` – disable a named toolset
- `gate/list_active_tools` – list names of currently active tools

Example session enabling the built-in `claude` toolset and inspecting
the active list:

```bash
claude-flow mcp tools --list  # shows only discovery tools
claude-flow mcp call gate/enable_toolset '{"name":"claude"}'
claude-flow mcp tools --list  # now includes Claude Flow tools
claude-flow mcp call gate/disable_toolset '{"name":"claude"}'
```

The resource filter limits the number of tools returned from a toolset.
By default only the first 10 Claude Flow tools are enabled; additional
filters may further narrow the list.

## Filter Configuration

Filters are configured in `src/gating/filter-config.json`. Runtime
configuration can override this file by setting the `TOOL_FILTER_CONFIG`
environment variable to the path of a JSON file with the same structure.

- **Resource filter** – limits total tools returned per toolset. Enabled
  by default with `maxTools: 10`.
- **Task type filter** – whitelists tools based on a `taskType` context
  value.
- **Security filter** – blocks tools by name.

Example custom configuration:

```json
{
  "taskType": {"enabled": true, "map": {"build": ["tasks/create"]}},
  "resource": {"enabled": true, "maxTools": 5},
  "security": {"enabled": true, "blocked": ["tasks/delete"]}
}
```

## Verifying Gating

After enabling a toolset, call `list_active_tools` to confirm that the
number of tools matches expectations. Updating the configuration and
restarting the server will apply new filter settings at runtime.
