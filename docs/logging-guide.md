# Agent World Logging Guide

**Last Updated**: 2025-10-31  
**Version**: 1.0

## Table of Contents

1. [Introduction](#introduction)
2. [Quick Start](#quick-start)
3. [Available Categories](#available-categories)
4. [Log Levels](#log-levels)
5. [Best Practices](#best-practices)
6. [Environment Variables](#environment-variables)
7. [Troubleshooting Scenarios](#troubleshooting-scenarios)
8. [Advanced Usage](#advanced-usage)

---

## Introduction

Agent World uses **scenario-based logging** to help you debug and monitor your applications effectively. Instead of logging by code structure (like "core.managers" or "lib.utils"), we log by **what you're trying to accomplish** (like "storage.migration" or "mcp.lifecycle").

### Why Scenario-Based Logging?

- **Actionable**: Logs are organized by the tasks you care about
- **Selective**: Enable only the logs you need for your current debugging task
- **Hierarchical**: Parent categories enable all child categories
- **Performance**: Log filtering happens early, no performance impact when disabled

---

## Quick Start

### Common Debugging Scenarios

#### 1. Database Migration Issues

```bash
LOG_STORAGE_MIGRATION=info npm run dev:web
```

**What you'll see:**
- Schema version checks
- Migration start/completion
- Column additions
- Index creation

#### 2. MCP Server Not Starting

```bash
LOG_MCP_LIFECYCLE=info npm run dev:web
```

**What you'll see:**
- Server start/stop events
- Ready status
- Tool counts
- Shutdown sequences

#### 3. Chat Session Problems

```bash
LOG_CHAT_SESSION=info npm run dev:web
```

**What you'll see:**
- Chat creation/deletion
- Session state changes
- Message counts
- Title updates

#### 4. Agent Response Delays

```bash
LOG_LLM=debug npm run dev:web
```

**What you'll see:**
- LLM provider calls
- Response generation
- Token usage
- Timing information

#### 5. Storage Query Errors

```bash
LOG_STORAGE_QUERY=debug npm run dev:web
```

**What you'll see:**
- World/agent data loads
- Chat data operations
- Memory aggregation
- File I/O errors

---

## Available Categories

### Summary Table

| Category | Description | Use When | Enable Command |
|----------|-------------|----------|----------------|
| **Storage** | | | |
| `storage.migration` | Database schema migrations | Migration issues, version checks | `LOG_STORAGE_MIGRATION=info` |
| `storage.query` | World/chat data loading | Data not loading, file errors | `LOG_STORAGE_QUERY=debug` |
| `storage.memory` | In-memory storage operations | Testing, browser issues | `LOG_STORAGE_MEMORY=debug` |
| `storage.init` | Storage backend initialization | Connection issues, config errors | `LOG_STORAGE_INIT=info` |
| **MCP** | | | |
| `mcp.lifecycle` | Server start/stop/ready | Server not starting | `LOG_MCP_LIFECYCLE=info` |
| `mcp.connection` | Transport connections | Connection failures | `LOG_MCP_CONNECTION=debug` |
| `mcp.tools` | Tool discovery/registration | Tools not appearing | `LOG_MCP_TOOLS=info` |
| `mcp.execution` | Tool call execution | Tool call failures | `LOG_MCP_EXECUTION=debug` |
| **LLM** | | | |
| `llm.openai` | OpenAI provider | OpenAI API issues | `LOG_LLM_OPENAI=debug` |
| `llm.anthropic` | Anthropic provider | Claude API issues | `LOG_LLM_ANTHROPIC=debug` |
| `llm.google` | Google provider | Gemini API issues | `LOG_LLM_GOOGLE=debug` |
| `llm.manager` | Provider management | Provider selection issues | `LOG_LLM_MANAGER=debug` |
| `llm.config` | LLM configuration | Config errors | `LOG_LLM_CONFIG=info` |
| **Chat** | | | |
| `chat.session` | Chat session management | Chat not saving | `LOG_CHAT_SESSION=info` |
| `chat.title` | Chat title updates | Title generation issues | `LOG_CHAT_TITLE=debug` |
| `chat.history` | Message history | Missing messages | `LOG_CHAT_HISTORY=debug` |
| **World/Agent** | | | |
| `world.lifecycle` | World start/stop | World not running | `LOG_WORLD_LIFECYCLE=info` |
| `world.state` | State changes | State transitions | `LOG_WORLD_STATE=debug` |
| `world.routing` | Message routing | Message not received | `LOG_WORLD_ROUTING=debug` |
| `agent.init` | Agent registration | Agent not found | `LOG_AGENT_INIT=info` |
| `agent.lifecycle` | Agent enable/disable | Agent state issues | `LOG_AGENT_LIFECYCLE=info` |
| `agent.processing` | Event processing | Agent not responding | `LOG_AGENT_PROCESSING=debug` |
| `agent.tool` | Tool execution | Tool failures | `LOG_AGENT_TOOL=debug` |
| **Events** | | | |
| `events.publish` | Event publishing | Events not firing | `LOG_EVENTS_PUBLISH=debug` |
| `events.agent` | Agent event creation | Agent events missing | `LOG_EVENTS_AGENT=debug` |
| `events.response` | Response generation | No responses | `LOG_EVENTS_RESPONSE=debug` |
| `events.memory` | Memory operations | Context issues | `LOG_EVENTS_MEMORY=debug` |
| `events.message` | Message delivery | Messages lost | `LOG_EVENTS_MESSAGE=debug` |
| `events.error` | Error handling | Error recovery | `LOG_EVENTS_ERROR=info` |
| `events.deletion` | Event deletion | Cleanup issues | `LOG_EVENTS_DELETION=info` |
| **Infrastructure** | | | |
| `infrastructure.server` | HTTP server | Server startup issues | `LOG_INFRASTRUCTURE_SERVER=info` |
| `infrastructure.api` | API endpoints | Endpoint errors | `LOG_INFRASTRUCTURE_API=debug` |
| `infrastructure.middleware` | Middleware processing | Request handling | `LOG_INFRASTRUCTURE_MIDDLEWARE=debug` |

### Hierarchical Control

You can enable entire domains with parent categories:

```bash
# Enable ALL storage logs
LOG_STORAGE=debug npm run dev:web

# Enable ALL MCP logs
LOG_MCP=info npm run dev:web

# Enable ALL event logs
LOG_EVENTS=debug npm run dev:web

# Enable ALL logs (not recommended for production)
LOG_LEVEL=debug npm run dev:web
```

---

## Detailed Categories

### Storage Operations

| Category | Purpose | Key Events | Enable With |
|----------|---------|------------|-------------|
| `storage` | All storage operations | - | `LOG_STORAGE=debug` |
| `storage.migration` | Schema migrations | Version checks, column additions, index creation | `LOG_STORAGE_MIGRATION=info` |
| `storage.query` | Data read/write | World loads, chat operations, memory queries | `LOG_STORAGE_QUERY=debug` |
| `storage.memory` | In-memory storage | Map operations, data cloning, validation | `LOG_STORAGE_MEMORY=debug` |
| `storage.init` | Storage initialization | Path selection, type configuration, module loading | `LOG_STORAGE_INIT=info` |

### MCP Operations

| Category | Purpose | Key Events | Enable With |
|----------|---------|------------|-------------|
| `mcp` | All MCP operations | - | `LOG_MCP=debug` |
| `mcp.lifecycle` | Server lifecycle | Start, stop, ready, shutdown | `LOG_MCP_LIFECYCLE=info` |
| `mcp.connection` | Connection management | Transport creation, connection attempts | `LOG_MCP_CONNECTION=debug` |
| `mcp.tools` | Tool management | Tool discovery, caching, schema validation | `LOG_MCP_TOOLS=debug` |
| `mcp.execution` | Tool execution | Tool calls, results, performance | `LOG_MCP_EXECUTION=debug` |

### LLM Operations

| Category | Purpose | Key Events | Enable With |
|----------|---------|------------|-------------|
| `llm` | All LLM operations | - | `LOG_LLM=debug` |
| `llm.openai` | OpenAI provider | API calls, streaming, errors | `LOG_LLM_OPENAI=debug` |
| `llm.anthropic` | Anthropic provider | Claude API calls, tool use | `LOG_LLM_ANTHROPIC=debug` |
| `llm.google` | Google provider | Gemini API calls, responses | `LOG_LLM_GOOGLE=debug` |

### Chat Operations

| Category | Purpose | Key Events | Enable With |
|----------|---------|------------|-------------|
| `chat` | All chat operations | - | `LOG_CHAT=debug` |
| `chat.session` | Session management | Create, delete, title updates | `LOG_CHAT_SESSION=info` |

### World/Agent Operations

| Category | Purpose | Key Events | Enable With |
|----------|---------|------------|-------------|
| `world` | All world operations | - | `LOG_WORLD=debug` |
| `world.lifecycle` | World management | Create, delete, load | `LOG_WORLD_LIFECYCLE=info` |
| `world.subscription` | Event subscriptions | Subscribe, unsubscribe, streaming | `LOG_WORLD_SUBSCRIPTION=debug` |
| `world.activity` | Activity tracking | Begin, end, idle detection | `LOG_WORLD_ACTIVITY=debug` |
| `agent` | All agent operations | - | `LOG_AGENT=debug` |
| `agent.lifecycle` | Agent management | Create, delete, status changes | `LOG_AGENT_LIFECYCLE=info` |

### Event Operations

| Category | Purpose | Key Events | Enable With |
|----------|---------|------------|-------------|
| `events` | All event operations | - | `LOG_EVENTS=debug` |
| `events.publish` | Message publishing | Publish calls, routing | `LOG_EVENTS_PUBLISH=debug` |
| `events.agent` | Agent processing | Message handling, response triggers | `LOG_EVENTS_AGENT=debug` |
| `events.response` | Response generation | LLM calls, result processing | `LOG_EVENTS_RESPONSE=debug` |
| `events.memory` | Memory operations | Save, load, persistence | `LOG_EVENTS_MEMORY=debug` |

### Infrastructure

| Category | Purpose | Key Events | Enable With |
|----------|---------|------------|-------------|
| `api` | REST API | HTTP requests, responses, errors | `LOG_API=debug` |
| `server` | Express server | Server start, middleware, routing | `LOG_SERVER=info` |
| `cli` | CLI commands | Command execution, arguments | `LOG_CLI=debug` |
| `ws` | WebSocket | Connections, messages, errors | `LOG_WS=debug` |

---

## Log Levels

Agent World uses standard log levels with specific meanings:

### `error` (always enabled)
**When to use:** System failures, data corruption, unrecoverable errors  
**Example:**
```
[ERROR] STORAGE.MIGRATION: Migration failed {
  fromVersion: 3,
  error: "Column already exists"
}
```

### `warn` (always enabled)
**When to use:** Recoverable issues, deprecated usage, configuration problems  
**Example:**
```
[WARN] MCP.LIFECYCLE: MCP registry already initialized
```

### `info`
**When to use:** Operational milestones, state changes, completion events  
**Example:**
```
[INFO] MCP.LIFECYCLE: MCP server ready {
  serverName: "filesystem",
  toolCount: 5
}
```

### `debug`
**When to use:** Implementation details, data flow, diagnostic information  
**Example:**
```
[DEBUG] MCP.TOOLS: Tools cached {
  serverName: "filesystem",
  toolCount: 5,
  cacheKey: "abc123"
}
```

### `trace` (rarely used)
**When to use:** Very detailed execution flow, variable inspection  
**Example:**
```
[TRACE] STORAGE.QUERY: Loading agent data {
  worldId: "my-world",
  agentId: "agent-1",
  filePath: "/path/to/agent.json"
}
```

---

## Best Practices

### 1. Use Appropriate Log Levels

**✅ DO:**
```typescript
// Operational events at info level
logger.info('MCP server ready', { serverName, toolCount });

// Implementation details at debug level
logger.debug('Fetching tools from server', { serverName });

// Errors with context
logger.error('Failed to start MCP server', {
  serverName,
  error: error.message
});
```

**❌ DON'T:**
```typescript
// Don't use info for implementation details
logger.info('Setting variable x to 5');

// Don't use debug for operational milestones
logger.debug('Server started successfully');

// Don't log errors without context
logger.error(error.toString());
```

### 2. Use Structured Logging

**✅ DO:**
```typescript
logger.info('Chat session created', {
  chatId: chat.id,
  worldId: world.id,
  messageCount: 0
});
```

**❌ DON'T:**
```typescript
logger.info(`Chat ${chat.id} created in world ${world.id} with 0 messages`);
```

### 3. Use Constant Message Strings

**✅ DO:**
```typescript
logger.info('Storage initialized', {
  path: config.rootPath,
  type: config.type
});
```

**❌ DON'T:**
```typescript
logger.info(`Storage path: ${config.rootPath} - ${config.type}`);
```

### 4. Handle Errors Properly

**✅ DO:**
```typescript
try {
  // ... operation
} catch (error) {
  logger.error('Operation failed', {
    error: error instanceof Error ? error.message : String(error),
    context: { worldId, agentId }
  });
  throw error;
}
```

**❌ DON'T:**
```typescript
try {
  // ... operation
} catch (error) {
  logger.error(error); // Loses context
}
```

---

## Environment Variables

### Global Configuration

#### `LOG_LEVEL` (default: `error`)
Sets the default log level for all categories.

```bash
# Show all logs at info level or higher
LOG_LEVEL=info npm run dev:web

# Show all logs including debug
LOG_LEVEL=debug npm run dev:web
```

### Category-Specific Configuration

Enable specific categories with their own log levels:

```bash
# Single category
LOG_STORAGE_MIGRATION=info npm run dev:web

# Multiple categories
LOG_STORAGE_MIGRATION=info LOG_MCP_LIFECYCLE=info npm run dev:web

# Parent category enables all children
LOG_MCP=debug npm run dev:web  # Enables mcp.lifecycle, mcp.connection, mcp.tools, mcp.execution
```

### Hierarchical Control

Categories follow a hierarchy using dot notation:

```
mcp                      # Parent category
├── mcp.lifecycle        # Child category
├── mcp.connection       # Child category
├── mcp.tools            # Child category
└── mcp.execution        # Child category
```

**Setting a parent category enables all children:**

```bash
# This enables all MCP subcategories at debug level
LOG_MCP=debug npm run dev:web
```

**You can override specific children:**

```bash
# All MCP at debug, but lifecycle at info
LOG_MCP=debug LOG_MCP_LIFECYCLE=info npm run dev:web
```

### Configuration File

Create a `.env` file in your project root:

```bash
# Global default
LOG_LEVEL=error

# Specific scenarios
LOG_STORAGE_MIGRATION=info
LOG_MCP_LIFECYCLE=info
LOG_CHAT_SESSION=info

# Debug specific issues
LOG_LLM_OPENAI=debug
LOG_EVENTS_AGENT=debug
```

---

## Troubleshooting Scenarios

### Scenario 1: "Database migration stuck"

**Symptoms:** Server hangs on startup, no migration progress  
**Solution:**

```bash
LOG_STORAGE_MIGRATION=info npm run dev:web
```

**Look for:**
- `Starting schema migration` - confirms migration started
- Column addition messages - shows progress
- `Migration completed` - confirms success
- Error messages with specific column/table names

---

### Scenario 2: "MCP tools not available"

**Symptoms:** Agent doesn't have access to MCP tools  
**Solution:**

```bash
LOG_MCP=debug npm run dev:web
```

**Look for:**
- `Starting MCP server` - confirms server initialization
- `MCP server ready` with `toolCount` - shows discovered tools
- `Tools cached` - confirms tools are available
- Connection errors - indicates configuration issues

---

### Scenario 3: "Chat not saving messages"

**Symptoms:** Messages disappear after restart  
**Solution:**

```bash
LOG_CHAT_SESSION=info LOG_STORAGE_QUERY=debug npm run dev:web
```

**Look for:**
- `Chat session created` - confirms chat creation
- Storage write operations - confirms data persistence
- Error messages with file paths - indicates storage issues

---

### Scenario 4: "Agent not responding"

**Symptoms:** Agent receives messages but doesn't reply  
**Solution:**

```bash
LOG_EVENTS_AGENT=debug LOG_LLM=debug npm run dev:web
```

**Look for:**
- `Agent processing message` - confirms agent received message
- `Generating response` - shows LLM call started
- `Response generated` - confirms completion
- Turn limit messages - indicates conversation limit reached
- Mention detection - confirms agent was mentioned/targeted

---

### Scenario 5: "Slow LLM responses"

**Symptoms:** Delays in agent replies  
**Solution:**

```bash
LOG_LLM=debug LOG_MCP_EXECUTION=debug npm run dev:web
```

**Look for:**
- Timing information in LLM logs
- Tool execution durations
- Token usage statistics
- Streaming vs non-streaming behavior

---

### Scenario 6: "Storage initialization errors"

**Symptoms:** "Storage not available" errors  
**Solution:**

```bash
LOG_STORAGE_INIT=info LOG_STORAGE_MIGRATION=info npm run dev:web
```

**Look for:**
- `Storage initialized` with path and type
- Module loading messages
- Directory creation logs
- Permission errors

---

## Advanced Usage

### Filtering Logs in Production

In production, keep logs minimal and enable specific categories for debugging:

```bash
# Production: Only errors and operational milestones
LOG_LEVEL=error LOG_STORAGE_MIGRATION=info LOG_MCP_LIFECYCLE=info npm start
```

### Debugging Specific Features

Enable only the categories you need:

```bash
# Debugging chat features
LOG_CHAT=debug LOG_STORAGE_QUERY=debug npm run dev:web

# Debugging agent responses
LOG_EVENTS_AGENT=debug LOG_LLM=debug npm run dev:web

# Debugging MCP integration
LOG_MCP=debug npm run dev:web
```

### Log Streaming and Analysis

Logs use structured format suitable for log aggregation:

```bash
# Save logs to file
npm run dev:web 2>&1 | tee server.log

# Filter specific category
npm run dev:web 2>&1 | grep "STORAGE.MIGRATION"

# Parse structured logs with jq
npm run dev:web 2>&1 | grep "STORAGE.MIGRATION" | jq .
```

### Testing with Logs

During test runs, disable all logs except errors:

```bash
# Suppress noise during tests
LOG_LEVEL=error npm test

# Enable specific category for debugging test failures
LOG_STORAGE_MEMORY=debug npm test
```

---

## Security Considerations

### Never Log Sensitive Data

**❌ DON'T:**
```typescript
logger.debug('API call', {
  apiKey: process.env.OPENAI_API_KEY, // Never log credentials
  password: user.password,             // Never log passwords
  token: session.token                 // Never log tokens
});
```

**✅ DO:**
```typescript
logger.debug('API call', {
  provider: 'openai',
  hasApiKey: !!process.env.OPENAI_API_KEY,  // Boolean check only
  userId: user.id                            // Use IDs, not names
});
```

### Personal Identifiable Information (PII)

Avoid logging user names, emails, messages, or other PII in production:

```typescript
// Development/debug only
if (process.env.NODE_ENV === 'development') {
  logger.debug('User message', { content: message.content });
}

// Production-safe
logger.debug('User message received', {
  messageId: message.id,
  length: message.content.length,
  sender: message.sender
});
```

---

## Summary

Agent World's scenario-based logging helps you:

1. **Find issues faster** - Enable only the logs you need
2. **Understand system behavior** - Logs organized by what you're doing
3. **Debug efficiently** - Structured data with context
4. **Monitor production** - Minimal overhead when disabled

**Most Common Debugging Patterns:**

```bash
# Database issues
LOG_STORAGE_MIGRATION=info LOG_STORAGE_QUERY=debug

# MCP problems
LOG_MCP=debug

# Chat/messaging issues
LOG_CHAT_SESSION=info LOG_EVENTS=debug

# Agent response problems
LOG_EVENTS_AGENT=debug LOG_LLM=debug

# Performance analysis
LOG_MCP_EXECUTION=debug LOG_LLM=debug
```

For more help, see:
- [Project Documentation](../README.md)
- [Architecture Guide](./concepts.md)
- [GitHub Issues](https://github.com/yysun/agent-world/issues)
