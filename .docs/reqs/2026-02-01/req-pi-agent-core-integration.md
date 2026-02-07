# Requirement: Pi-Agent-Core Integration

## Overview

Replace the existing agent runtime implementation with the `@mariozechner/pi-agent-core` package, which provides a complete stateful agent framework with tool execution and event streaming.

## Package Information

- **Package**: `@mariozechner/pi-agent-core`
- **NPM**: https://www.npmjs.com/package/@mariozechner/pi-agent-core
- **Description**: Stateful agent with tool execution and event streaming

## What Pi-Agent-Core Provides

The package is a complete agent framework that includes:

1. **State Management (`AgentState`)**
   - Agent state lifecycle management
   - State persistence and restoration

2. **Message History (`AgentMessage[]`)**
   - Standard LLM messages: `user`, `assistant`, `toolResult`
   - Custom app-specific message types via declaration merging
   - Message conversion utilities (`convertToLlm`)
   - Timestamp-based message ordering

3. **Event System (`AgentEvent`)**
   - `message_start` - Assistant message begins
   - `message_update` - Streaming text deltas
   - `tool_start` / `tool_end` - Tool execution lifecycle
   - `turn_end` - Turn completes with assistant message and tool results
   - `agent_end` - Agent completes with all new messages

4. **Tool Execution Loop**
   - Automatic tool execution and response handling
   - Tool result injection into message context
   - Multi-tool execution support

5. **Conversation Flow Control**
   - Steering messages (interrupt agent while tools run)
   - Follow-up messages (queue work after agent stops)
   - Turn-based conversation management
   - Context requirement: last message must be `user` or `toolResult`

## What to Replace

The following existing modules should be replaced by pi-agent-core:

| Current Module | Purpose | Pi-Agent-Core Equivalent |
|---------------|---------|-------------------------|
| `core/llm-manager.ts` | LLM calls, streaming, queue | Agent tool execution loop, event streaming |
| `core/openai-direct.ts` | OpenAI provider integration | `@mariozechner/pi-ai` getModel() |
| `core/anthropic-direct.ts` | Anthropic provider integration | `@mariozechner/pi-ai` getModel() |
| `core/google-direct.ts` | Google provider integration | `@mariozechner/pi-ai` getModel() |
| `core/llm-config.ts` | Provider API key injection | Pi-agent-core `getApiKey` callback |
| `core/types.ts` (AgentMessage) | Message types | Pi-agent-core `AgentMessage` types |
| `core/events/memory-manager.ts` (partial) | Memory update after responses | Pi-agent-core state management |
| `core/mcp-server-registry.ts` | MCP tool registration | Pi-agent-core `AgentTool` definitions |
| `core/approval-checker.ts` | Tool approval flow | Removed (pi-agent-core executes tools directly) |
| `core/tool-utils.ts` | Tool validation wrappers | Removed (pi-agent-core handles tool execution) |

## What to Keep

The following modules should remain unchanged:

| Module | Purpose | Reason to Keep |
|--------|---------|----------------|
| `core/managers.ts` | World, Agent, Chat CRUD | Business logic independent of agent runtime |
| `core/storage/*` | SQLite/file storage layer | Persistence layer (schema adapts to pi-agent-core messages) |
| `core/events/orchestrator.ts` | Agent coordination | Adapts to pi-agent-core events |
| `core/events/publishers.ts` | Event publishing | Connects pi-agent-core events to World.eventEmitter |
| `core/events/subscribers.ts` | Event subscription | Responds to pi-agent-core events |
| All UIs (`web/`, `react/`) | Frontend components | No runtime changes needed |
| `server/api.ts` | REST API endpoints | Endpoints call managers/orchestrator |
| `cli/*` | Command-line interface | Uses managers/orchestrator |

## Integration Requirements

### 1. Adopt Pi-Agent-Core Message Types

Replace existing `AgentMessage` with pi-agent-core message format:

```typescript
// Pi-agent-core AgentMessage types (from @mariozechner/pi-agent-core)
type AgentMessage = 
  | UserMessage      // { role: 'user', content: string | ContentPart[] }
  | AssistantMessage // { role: 'assistant', content: string, toolCalls?: ToolCall[] }
  | ToolResultMessage; // { role: 'toolResult', toolCallId: string, result: string }

// Storage schema adapts to pi-agent-core format:
// - 'tool' role → 'toolResult' role
// - 'system' role → first message in context or agent.systemPrompt
// - tool_call_id → toolCallId (camelCase)
```

### 2. Use Pi-Agent-Core Configuration

Replace `llm-config.ts` with pi-agent-core's configuration pattern:

```typescript
import { Agent } from "@mariozechner/pi-agent-core";
import { getModel } from "@mariozechner/pi-ai";

const agent = new Agent({
  // Model via pi-ai
  getModel: (provider, model) => getModel(provider, model),
  
  // API key injection (replaces getLLMProviderConfig)
  getApiKey: (provider) => {
    switch (provider) {
      case 'openai': return process.env.OPENAI_API_KEY;
      case 'anthropic': return process.env.ANTHROPIC_API_KEY;
      case 'google': return process.env.GOOGLE_API_KEY;
    }
  },
  
  // Optional thinking budget for Claude
  thinkingBudgets: world.thinkingBudgets,
});
```

### 3. Event Bridge

Bridge pi-agent-core events to existing `World.eventEmitter` system:

- `message_update` → emit `sse` event with `type: 'chunk'`
- `message_start` → emit `sse` event with `type: 'start'`
- `turn_end` → emit `message` event with complete response
- `agent_end` → save to storage, emit `sse` event with `type: 'end'`

### 4. Use Pi-Agent-Core Tools Directly

Define tools using pi-agent-core's `AgentTool` format with TypeBox schemas:

```typescript
import { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@sinclair/typebox";

const tool: AgentTool = {
  name: 'example_tool',
  description: 'An example tool',
  parameters: Type.Object({
    input: Type.String({ description: 'Input value' })
  }),
  execute: async (toolCallId, params, signal, onUpdate) => {
    // Pi-agent-core handles execution directly
    // No approval wrappers, no MCP layer
    return { result: 'success' };
  }
};

agent.setTools([tool]);
```

**Removed:**
- MCP server registry and transport layer
- Tool approval/validation wrappers
- Human-in-the-loop (HITL) tool pausing

### 5. Storage Synchronization

Pi-agent-core manages in-memory agent state. Storage layer adapts:

- **Schema update**: Map storage columns to pi-agent-core message fields
- **On agent start**: Load messages from SQLite, convert to pi-agent-core format
- **On `agent_end`**: Persist new messages back to SQLite
- **Keep** existing `managers.ts` for World/Agent/Chat CRUD

```typescript
// Storage message → Pi-agent-core message
function toAgentMessage(stored: StoredMessage): AgentMessage {
  if (stored.role === 'tool') {
    return { role: 'toolResult', toolCallId: stored.tool_call_id, result: stored.content };
  }
  // ... map other roles
}
```

### 6. Multi-Agent Coordination

The orchestrator coordinates multiple agents:

- Each agent has its own pi-agent-core `Agent` instance
- Mention detection triggers agent activation
- Turn limits enforce handoff to human via `agent.abort()`

## Non-Requirements

The following are explicitly out of scope:

1. **UI Changes** - No modifications to web or react frontends
2. **API Changes** - REST endpoints remain identical  
3. **World/Chat Lifecycle** - CRUD operations unchanged
4. **External Tool Protocols** - No MCP, no HITL, no approval flow (use pi-agent-core direct execution)

## Success Criteria

1. All existing tests pass without modification
2. Streaming responses work identically to current implementation
3. Tool execution flows match current behavior
4. Multi-agent conversations function correctly
5. Message persistence unchanged
6. SSE events maintain same structure for UI compatibility

## Open Questions

All resolved:

1. ~~**Provider Configuration**~~: Use pi-agent-core's `getApiKey` callback with `getModel()` from `@mariozechner/pi-ai`.

2. ~~**Custom Message Types**~~: Use pi-agent-core's standard message types (`user`, `assistant`, `toolResult`). No custom fields needed.

3. ~~**Turn Limits**~~: Count `turn_end` events per agent. Call `agent.abort()` when limit reached.

4. ~~**Tool Approval**~~: **REMOVED** - Pi-agent-core executes tools directly. No approval/HITL flow needed.

---

# Architecture Review (AR)

## Validated Assumptions ✅

### 1. Pi-Agent-Core is a Complete Replacement
The package provides everything needed for agent runtime:
- `Agent` class with state management
- Event-driven streaming (`message_update`, `text_delta`)
- Tool execution loop with automatic continuation
- Message history management

**Confirmed**: Replace `llm-manager.ts`, `openai-direct.ts`, `anthropic-direct.ts`, `google-direct.ts`, `llm-config.ts` completely.

### 2. Model Configuration via `@mariozechner/pi-ai`
Pi-agent-core uses `getModel(provider, model)` from `@mariozechner/pi-ai`:
```typescript
import { getModel } from "@mariozechner/pi-ai";
const model = getModel("anthropic", "claude-sonnet-4-20250514");
```
Configuration via `getApiKey` callback - no need for `llm-config.ts`.

**Confirmed**: Multi-provider support is built-in with cleaner configuration.

### 3. Event Bridging is Straightforward
Pi-agent-core event → Agent-world event mapping:
| Pi-Agent-Core Event | Agent-World Equivalent |
|---------------------|------------------------|
| `message_update` with `text_delta` | `sse` event with `type: 'chunk'` |
| `message_start` | `sse` event with `type: 'start'` |
| `message_end` | `sse` event with `type: 'end'` |
| `tool_execution_start` | `world` event with `type: 'tool-start'` |
| `tool_execution_end` | `world` event with `type: 'tool-result'` |
| `agent_end` | Persist to storage, emit completion |

**Confirmed**: Direct 1:1 mapping is possible.

### 4. Pi-Agent-Core Tools Replace MCP/Approval Layer
Pi-agent-core's `AgentTool` format with TypeBox schemas replaces:
- MCP server registry and transport
- Tool approval/validation wrappers
- HITL pause mechanisms

Tools execute directly without approval flow:
```typescript
const tool: AgentTool = {
  name: 'read_file',
  description: 'Read a file',
  parameters: Type.Object({ path: Type.String() }),
  execute: async (id, params) => fs.readFileSync(params.path, 'utf-8')
};
```

**Confirmed**: Simpler tool model, remove MCP layer entirely.

### 5. Storage Adapts to Pi-Agent-Core Message Types
Pi-agent-core uses standard message types:
- `user` - User messages
- `assistant` - Agent responses with optional `toolCalls`
- `toolResult` - Tool execution results (replaces `tool` role)

Storage schema adapts:
- `role: 'tool'` → `role: 'toolResult'`
- `tool_call_id` → `toolCallId` (camelCase in pi-agent-core)
- System prompts via `agent.systemPrompt` instead of `role: 'system'` messages

**Confirmed**: Minor schema mapping, no structural changes needed.

## Simplified Architecture

```
┌───────────────────────────────────────────────────────────────────────┐
│                           Web/React UI                                   │
└───────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌───────────────────────────────────────────────────────────────────────┐
│                           REST API + Managers                            │
└───────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌───────────────────────────────────────────────────────────────────────┐
│                 Orchestrator + Pi-Agent Adapter                          │
│  • Creates pi-agent-core Agent per agent                                 │
│  • Bridges events + manages turn limits                                  │
└───────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌───────────────────────────────────────────────────────────────────────┐
│                   @mariozechner/pi-agent-core                            │
│  • Agent state + message history                                         │
│  • Tool execution (AgentTool with TypeBox)                               │
│  • Event streaming + LLM via pi-ai                                       │
└───────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌───────────────────────────────────────────────────────────────────────┐
│                         Storage (SQLite)                                 │
│  • Messages: user, assistant, toolResult                                 │
│  • Worlds, Agents, Chats CRUD via managers.ts                            │
└───────────────────────────────────────────────────────────────────────┘
```

## Files to Remove

| File | Reason |
|------|--------|
| `core/llm-manager.ts` | Replaced by pi-agent-core Agent |
| `core/openai-direct.ts` | Replaced by pi-ai |
| `core/anthropic-direct.ts` | Replaced by pi-ai |
| `core/google-direct.ts` | Replaced by pi-ai |
| `core/llm-config.ts` | Replaced by getApiKey callback |
| `core/mcp-server-registry.ts` | Replaced by AgentTool definitions |
| `core/approval-checker.ts` | No approval flow needed |
| `core/tool-utils.ts` | No tool validation wrappers needed |

## Dependencies Changes

**Remove:**
```json
"@anthropic-ai/sdk": "^0.71.2",
"@google/generative-ai": "^0.24.1",
"openai": "^6.15.0",
"@modelcontextprotocol/sdk": "^1.0.0"
```

**Add:**
```json
"@mariozechner/pi-agent-core": "^0.50.9",
"@sinclair/typebox": "^0.32.0"
```

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Provider API differences | Low | Pi-ai abstracts providers natively |
| Memory sync issues | Medium | Robust persist-on-agent_end with error handling |
| Breaking changes in pi-agent-core | Low | Pin version; monitor changelog |
| Loss of MCP tool ecosystem | Medium | Define essential tools as AgentTool; can add MCP back later |

---

## AR Update: Decision to Remove MCP

**Date**: 2026-02-01 (Final Decision)

### Decision: Remove MCP Entirely

Per user decision, remove all MCP infrastructure now. Can be added back later if needed.

### Code Review Summary (2026-02-01)

#### Orchestrator Changes Required

`core/events/orchestrator.ts` (~450 lines) is the main integration point:

```typescript
// CURRENT: Calls llm-manager.ts 
const { streamAgentResponse } = await import('../llm-manager.js');
const result = await streamAgentResponse(world, agent, filteredMessages, publishSSE);

// NEW: Calls pi-agent-core via adapter
const piAgent = await getPiAgentForAgent(world, agent);
for await (const event of piAgent.run(messages)) {
  bridgeEventToWorld(world, event);
}
```

#### Message Role Mapping

| Current | Pi-agent-core |
|---------|---------------|
| `user` | `user` |
| `assistant` | `assistant` |
| `tool` | `toolResult` |
| `system` | (agent.systemPrompt) |

#### Code to Delete: ~4500 lines

| File | Lines | Reason |
|------|-------|--------|
| `core/llm-manager.ts` | ~600 | Pi-agent-core Agent |
| `core/openai-direct.ts` | ~400 | Pi-ai |
| `core/anthropic-direct.ts` | ~350 | Pi-ai |
| `core/google-direct.ts` | ~300 | Pi-ai |
| `core/llm-config.ts` | ~100 | getApiKey callback |
| `core/mcp-server-registry.ts` | ~2100 | MCP removed |
| `core/approval-checker.ts` | ~200 | Approval removed |
| `core/tool-utils.ts` | ~420 | Wrappers removed |

#### Server API Changes

**Remove from `server/api.ts` (lines 1247-1330):**
- `GET /mcp/servers`
- `POST /mcp/servers/:serverId/restart`
- `GET /mcp/health`

**Remove from `server/index.ts`:**
- Line 30: `import { initializeMCPRegistry, shutdownAllMCPServers }`
- Line 141: `initializeMCPRegistry()`
- Line 165: `await shutdownAllMCPServers()`

#### Risk Analysis

| Risk | Impact | Mitigation |
|------|--------|------------|
| Message format mismatch | Medium | Role mapping layer |
| Streaming behavior | Low | Event bridge maintains SSE |
| Tool execution | Low | shell-cmd-tool preserved |
| Rollback needed | Medium | Feature flag for runtime |

---

*Created: 2026-02-01*  
*AR Completed: 2026-02-01*  
*AR Updated: 2026-02-01* (Detailed code review completed)
