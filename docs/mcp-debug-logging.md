# MCP Debug Logging Guide

## Overview

The MCP Server Registry now includes comprehensive scenario-based debug logging to show all data being sent to and received from MCP servers. This is extremely useful for troubleshooting MCP communication issues and understanding what's happening during tool execution.

## Enabling Debug Logging

The MCP logging system uses scenario-based categories for granular control:

### Enable All MCP Logs

```bash
LOG_MCP=debug npm run dev:web
```

### Enable Specific MCP Categories

```bash
# Server lifecycle only (start/stop/ready)
LOG_MCP_LIFECYCLE=info npm run dev:web

# Connection details
LOG_MCP_CONNECTION=debug npm run dev:web

# Tool discovery and caching
LOG_MCP_TOOLS=debug npm run dev:web

# Tool execution (request/response payloads)
LOG_MCP_EXECUTION=debug npm run dev:web

# Multiple categories
LOG_MCP_LIFECYCLE=info LOG_MCP_EXECUTION=debug npm run dev:web
```

## Logging Categories

Agent World uses four scenario-based categories for MCP operations:

| Category | Purpose | Log Level | Use When |
|----------|---------|-----------|----------|
| `mcp.lifecycle` | Server start/stop/ready events | `info` | Server not starting |
| `mcp.connection` | Transport connections | `debug` | Connection failures |
| `mcp.tools` | Tool discovery/caching | `debug` | Tools not appearing |
| `mcp.execution` | Tool execution details | `debug` | Tool call failures |

## Debug Log Categories

### 1. Server Lifecycle Logs (`mcp.lifecycle`)
Shows server start/stop and ready status:

```
[INFO] MCP.LIFECYCLE: Starting MCP server {
  serverName: "filesystem",
  transport: "stdio"
}

[INFO] MCP.LIFECYCLE: MCP server ready {
  serverName: "filesystem",
  toolCount: 5
}
```

**Enable with:** `LOG_MCP_LIFECYCLE=info`

### 2. Connection Logs (`mcp.connection`)
Shows transport creation and connection attempts:

```
[DEBUG] MCP.CONNECTION: Creating stdio transport {
  serverName: "filesystem",
  command: "python",
  args: ["-m", "example_server"]
}

[DEBUG] MCP.CONNECTION: Connection established {
  serverName: "filesystem"
}
```

**Enable with:** `LOG_MCP_CONNECTION=debug`

### 3. Tool Discovery Logs (`mcp.tools`)
Shows tool listing and caching operations:

```
[DEBUG] MCP.TOOLS: Fetching tools from server {
  serverName: "filesystem"
}

[DEBUG] MCP.TOOLS: Tools cached {
  serverName: "filesystem",
  toolCount: 5,
  toolNames: ["read_file", "write_file", "list_directory"]
}
```

**Enable with:** `LOG_MCP_TOOLS=debug`

### 4. Tool Execution Logs (`mcp.execution`)
Shows tool call request/response payloads:

```
[DEBUG] MCP.EXECUTION: Executing tool {
  serverName: "filesystem",
  toolName: "read_file",
  args: { path: "/path/to/file.txt" }
}

[DEBUG] MCP.EXECUTION: Tool execution completed {
  serverName: "filesystem",
  toolName: "read_file",
  status: "success",
  duration: 45.67
}
```

**Enable with:** `LOG_MCP_EXECUTION=debug`

## Use Cases for Debug Logging

### 1. Troubleshooting Server Startup
When MCP servers aren't starting:
```bash
LOG_MCP_LIFECYCLE=info LOG_MCP_CONNECTION=debug npm run dev:web
```
You'll see:
- Server initialization attempts
- Transport configuration
- Connection establishment
- Startup errors

### 2. Debugging Tool Discovery
When tools aren't appearing or being cached:
```bash
LOG_MCP_TOOLS=debug npm run dev:web
```
You'll see:
- Tool fetching operations
- Complete tool lists with schemas
- Caching operations
- Schema validation

### 3. Analyzing Tool Execution
When tool calls aren't working as expected:
```bash
LOG_MCP_EXECUTION=debug npm run dev:web
```
You'll see:
- Exact arguments being sent
- Complete response structure
- Execution timing
- Error details

### 4. Full MCP Debugging
For complete visibility into all MCP operations:
```bash
LOG_MCP=debug npm run dev:web
```
This enables all four categories at debug level.

## Example Debug Session

```bash
# Enable all MCP debug logging
export LOG_MCP=debug

# Or enable specific categories
export LOG_MCP_LIFECYCLE=info
export LOG_MCP_EXECUTION=debug

# Start the server
npm run dev:web

# Expected output:
# [INFO] MCP.LIFECYCLE: Starting MCP server { serverName: "filesystem", transport: "stdio" }
# [DEBUG] MCP.CONNECTION: Creating stdio transport { ... }
# [DEBUG] MCP.CONNECTION: Connection established { ... }
# [DEBUG] MCP.TOOLS: Fetching tools from server { ... }
# [DEBUG] MCP.TOOLS: Tools cached { serverName: "filesystem", toolCount: 5 }
# [INFO] MCP.LIFECYCLE: MCP server ready { serverName: "filesystem", toolCount: 5 }

# In another terminal, make a request that uses MCP tools
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"worldId": "test", "message": "Please read the file example.txt"}'

# You'll see:
# [DEBUG] MCP.EXECUTION: Executing tool { serverName: "filesystem", toolName: "read_file", ... }
# [DEBUG] MCP.EXECUTION: Tool execution completed { status: "success", duration: 45.67, ... }
```

## Log Output Management

The debug logs can be quite verbose. To filter for specific information:

```bash
# Only show lifecycle events
LOG_MCP_LIFECYCLE=info npm run dev:web

# Only show tool execution
LOG_MCP_EXECUTION=debug npm run dev:web

# Filter output with grep
LOG_MCP=debug npm run dev:web | grep "MCP.EXECUTION"

# Show only errors
LOG_MCP=debug npm run dev:web | grep "ERROR"

# Combine multiple filters
LOG_MCP=debug npm run dev:web | grep -E "(LIFECYCLE|EXECUTION)"
```

## Hierarchical Control

The MCP logging follows a hierarchical structure:

```
mcp (parent)
├── mcp.lifecycle
├── mcp.connection
├── mcp.tools
└── mcp.execution
```

Setting the parent category enables all children:

```bash
# This enables all four MCP categories at debug level
LOG_MCP=debug npm run dev:web

# Equivalent to:
LOG_MCP_LIFECYCLE=debug LOG_MCP_CONNECTION=debug LOG_MCP_TOOLS=debug LOG_MCP_EXECUTION=debug npm run dev:web
```

You can override specific children:

```bash
# All MCP at debug, but lifecycle at info only
LOG_MCP=debug LOG_MCP_LIFECYCLE=info npm run dev:web
```

## Important Notes

1. **Performance Impact**: Debug logging adds overhead. Only use in development/debugging.

2. **Sensitive Data**: Debug logs may contain sensitive information from tool arguments and responses. Be careful in production.

3. **Log Size**: With debug logging enabled, log files can grow large quickly. Consider using specific categories instead of enabling all MCP logs.

4. **Structured Format**: All logs use structured format with constant message strings and context objects for easy parsing and filtering.

5. **Default Level**: By default, only `error` level logs are shown. You must explicitly enable categories to see debug information.

## Related Documentation

- [Complete Logging Guide](./logging-guide.md) - Full reference for all logging categories
- [README Logging Section](../README.md#logging-and-debugging) - Quick start guide
- [Architecture Plan](../.docs/plans/2025-10-31/plan-scenario-based-logging.md) - Implementation details

This enhanced scenario-based logging provides complete visibility into MCP server communication with granular control over what you see, making it much easier to debug issues and understand what's happening during tool execution.