# MCP Debug Logging Guide

## Overview

The MCP Server Registry now includes comprehensive debug logging to show all data being sent to and received from MCP servers. This is extremely useful for troubleshooting MCP communication issues and understanding what's happening during tool execution.

## Enabling Debug Logging

To see the detailed MCP communication logs, set the `LOG_LLM_MCP` environment variable to `debug`:

```bash
export LOG_LLM_MCP=debug
npm run server
```

Or start the server with the environment variable:

```bash
LOG_LLM_MCP=debug npm run server
```

## Debug Log Categories

### 1. Server Connection Logs
Shows the configuration and transport details when connecting to MCP servers:

```
MCP server connection attempt: {
  "serverName": "example-server",
  "transport": "stdio",
  "connectionConfig": {
    "command": "python",
    "args": ["-m", "example_server"],
    "env": ["PATH", "PYTHONPATH"]
  }
}
```

### 2. Server Registration Logs
Shows the complete server configuration being registered:

```
MCP server registration configuration: {
  "serverId": "a1b2c3d4",
  "serverName": "example-server",
  "worldId": "world123",
  "fullConfig": {
    "name": "example-server",
    "transport": "stdio",
    "command": "python",
    "args": ["-m", "example_server"]
  }
}
```

### 3. Tools List Logs
Shows the request for available tools and the complete response:

```
MCP tools list request starting: {
  "serverName": "example-server",
  "operation": "listTools"
}

MCP server tools list response: {
  "serverName": "example-server",
  "operation": "listTools",
  "toolsCount": 3,
  "toolNames": ["read_file", "write_file", "list_directory"],
  "toolsPayload": "[{\"name\":\"read_file\",\"description\":\"Read file contents\",\"inputSchema\":{...}}]"
}
```

### 4. Tool Execution Request Logs
Shows the exact payload being sent to the MCP server:

```
MCP server request payload: {
  "executionId": "example-server-read_file-1692123456789",
  "serverName": "example-server", 
  "toolName": "read_file",
  "requestPayload": "{\n  \"name\": \"read_file\",\n  \"arguments\": {\n    \"path\": \"/path/to/file.txt\"\n  }\n}"
}
```

### 5. Tool Execution Response Logs
Shows the complete response received from the MCP server:

```
MCP server response payload: {
  "executionId": "example-server-read_file-1692123456789",
  "serverName": "example-server",
  "toolName": "read_file", 
  "responsePayload": "{\n  \"content\": [{\n    \"type\": \"text\",\n    \"text\": \"File contents here...\"\n  }]\n}",
  "responseType": "object",
  "hasContent": true,
  "contentLength": 1
}
```

### 6. Performance and Error Tracking
Standard execution logs with timing and error information:

```
MCP tool execution completed: {
  "executionId": "example-server-read_file-1692123456789",
  "status": "success",
  "duration": 45.67,
  "resultType": "text",
  "resultSize": 1024,
  "resultPreview": "File contents here..."
}
```

## Use Cases for Debug Logging

### 1. Troubleshooting Tool Calls
When a tool call isn't working as expected, you can see:
- Exact arguments being sent
- Complete response structure 
- Any data transformation issues

### 2. Schema Debugging  
When schema validation fails, you can see:
- The original schema from the MCP server
- The simplified schema created for Azure OpenAI
- Any schema transformation issues

### 3. Performance Analysis
Track tool execution times and identify slow tools:
- Connection establishment time
- Tool listing time
- Individual tool execution duration

### 4. Configuration Validation
Verify server configurations are correct:
- Transport settings
- Command line arguments
- Environment variables
- URL and header configurations

## Example Debug Session

```bash
# Enable debug logging
export LOG_LLM_MCP=debug

# Start the server
npm run server

# In another terminal, make a request that uses MCP tools
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"worldId": "test", "message": "Please read the file example.txt"}'
```

You'll see a complete trace of:
1. Server registration and connection
2. Tools list retrieval  
3. Tool execution request/response
4. Performance metrics
5. Any errors or issues

## Log Output Management

The debug logs can be quite verbose. To filter for specific information:

```bash
# Only show request/response payloads
LOG_LLM_MCP=debug npm run server | grep "payload"

# Only show tool execution
LOG_LLM_MCP=debug npm run server | grep "execution"

# Only show connection issues
LOG_LLM_MCP=debug npm run server | grep -E "(connection|error)"
```

## Important Notes

1. **Performance Impact**: Debug logging adds overhead. Only use in development/debugging.

2. **Sensitive Data**: Debug logs may contain sensitive information from tool arguments and responses. Be careful in production.

3. **Log Size**: With debug logging enabled, log files can grow large quickly.

4. **JSON Formatting**: Request/response payloads are formatted with 2-space indentation for readability.

This enhanced logging provides complete visibility into MCP server communication, making it much easier to debug issues and understand what's happening during tool execution.