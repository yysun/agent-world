# Pi-Agent-Core Integration Findings

## Investigation Summary

Date: 2026-02-01  
Package: `@mariozechner/pi-agent-core` v0.50.9  
Underlying LLM Library: `@mariozechner/pi-ai` v0.50.9

## Key Discoveries

### 1. Architecture Mismatch

**CRITICAL**: The `@mariozechner/pi-agent-core` package is NOT a simple LLM calling library as described in the problem statement. It's a complete stateful agent framework with its own:

- State management (`AgentState`)
- Message history (`AgentMessage[]`)
- Event system (`AgentEvent`)
- Tool execution loop
- Conversation flow control

This is fundamentally different from Agent-World's architecture, which manages:
- Agent state via `managers.ts`
- Memory via storage layer
- Events via world.eventEmitter
- Tool execution via MCP integration

### 2. Underlying LLM Library

The actual LLM calling functionality is in `@mariozechner/pi-ai`, which:
- ✅ Supports all major providers (OpenAI, Anthropic, Google, Azure, etc.)
- ✅ Has unified API: `stream()` and `complete()`
- ✅ Handles tool calling properly
- ✅ Provides token usage and cost tracking
- ✅ Supports streaming with detailed events

### 3. Integration Approach

Two possible approaches:

#### Option A: Use `@mariozechner/pi-ai` (Recommended)
Replace our direct provider SDKs with the unified `pi-ai` library:
- Minimal changes to Agent-World architecture
- Keeps our state management, memory, events, MCP integration
- Simply replaces LLM calling layer
- Better fit for the problem statement goal

#### Option B: Use `@mariozechner/pi-agent-core` (NOT Recommended)
- Would require complete architectural refactor
- Duplicate state management systems
- Complex event translation layer
- High risk of bugs and regressions
- NOT aligned with problem statement

## Recommendation

**Use `@mariozechner/pi-ai` instead of `@mariozechner/pi-agent-core`**.

The problem statement says:
> "Replace the core agent execution logic (LLM calling, streaming, tool handling)"

This matches `@mariozechner/pi-ai`, not the full `@mariozechner/pi-agent-core` framework.

## Implementation Plan (Revised)

### What We'll Replace

Replace these files with `@mariozechner/pi-ai` integration:
- `core/openai-direct.ts` (~350 lines)
- `core/anthropic-direct.ts` (~350 lines)  
- `core/google-direct.ts` (~360 lines)
- Simplify `core/llm-manager.ts` (~200 lines)

### Integration Points

1. **Create adapter layer** (`core/pi-agent/`):
   - Convert Agent-World ChatMessage to pi-ai Message
   - Convert pi-ai events to Agent-World SSE events
   - Adapt MCP tools to pi-ai Tool format
   - Map provider configurations

2. **Replace LLM calls** in `llm-manager.ts`:
   - `streamAgentResponse()` → Use pi-ai `stream()`
   - `generateAgentResponse()` → Use pi-ai `complete()`
   - Keep all error handling, activity tracking, queue management

3. **Keep unchanged**:
   - Agent CRUD (`managers.ts`)
   - Storage layer (`storage/*`)
   - Event system (`events/*`)
   - MCP integration (`mcp-*.ts`)
   - Orchestrator logic (`events/orchestrator.ts`)
   - All UIs

## API Compatibility

### pi-ai Message Format

```typescript
type Message = 
  | { role: 'user'; content: string | (TextContent | ImageContent)[] }
  | { role: 'assistant'; content: (TextContent | ToolCall)[] }
  | { role: 'toolResult'; toolCallId: string; toolName: string; content: TextContent[]; isError: boolean }
```

### Agent-World ChatMessage Format

```typescript
interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}
```

### Conversion Required

- pi-ai separates text and tool calls in `content[]` blocks
- Agent-World puts text in `content` string, tool calls in `tool_calls[]`
- Need adapter functions for bidirectional conversion

## Tool Integration

pi-ai uses TypeBox schemas:

```typescript
interface Tool {
  name: string;
  description: string;
  parameters: TSchema; // TypeBox schema
}
```

Agent-World uses MCP tool schemas (JSON Schema):

```typescript
interface MCPTool {
  name: string;
  description: string;
  inputSchema: object; // JSON Schema
}
```

### Conversion Strategy

1. Convert JSON Schema to TypeBox schema
2. OR: Use pi-ai's schema directly for validation
3. Keep MCP execution separate (pi-ai doesn't execute tools)

## Event Streaming

pi-ai provides granular streaming events:

```typescript
type StreamEvent = 
  | { type: 'start'; partial: AssistantMessage }
  | { type: 'text_start' }
  | { type: 'text_delta'; delta: string }
  | { type: 'text_end'; text: string }
  | { type: 'toolcall_start'; contentIndex: number }
  | { type: 'toolcall_delta'; ... }
  | { type: 'toolcall_end'; toolCall: ToolCall }
  | { type: 'done'; reason: StopReason }
  | { type: 'error'; error: Error }
```

Agent-World expects:

```typescript
publishSSE(worldId, chatId, {
  type: 'stream',
  content: string,
  sender: agentId,
  messageId: string
});
```

### Adapter Needed

Map pi-ai streaming events to Agent-World SSE events.

## Provider Configuration

pi-ai handles provider config via:
1. Environment variables (auto-detected)
2. Programmatic API key injection via `getApiKey` callback

Agent-World uses `llm-config.ts` for configuration.

### Integration Strategy

Create a `getApiKey` callback that reads from Agent-World's config:

```typescript
const model = getModel('openai', 'gpt-4o-mini');
const context = {
  systemPrompt: agent.systemPrompt,
  messages: adaptedMessages,
  tools: adaptedTools,
};

const options = {
  getApiKey: async (provider) => {
    const config = getLLMProviderConfig(agent.provider);
    return config.apiKey;
  },
};

const stream = await stream(model, context, options);
```

## Feature Flags

Use same approach as planned:
- `USE_PI_AGENT=true` enables pi-ai integration
- `PI_AGENT_PROVIDERS=openai,anthropic,google` controls which providers
- Default: disabled (use existing code)

## Testing Strategy

1. Create adapter unit tests
2. Test with real API keys (optional, can mock)
3. Verify all existing tests pass
4. Add integration tests for pi-ai streaming

## Rollback Plan

Same as original plan:
- Set `USE_PI_AGENT=false`
- Restart services
- No code changes needed

## Next Steps

1. ✅ Install `@mariozechner/pi-agent-core` (includes pi-ai as dependency)
2. ✅ Document findings (this file)
3. Create adapter layer for pi-ai (not pi-agent-core)
4. Integrate into llm-manager.ts
5. Test thoroughly
6. Deploy with feature flag

## Conclusion

**The problem statement name is misleading**. We should use `@mariozechner/pi-ai` (the LLM calling layer), not `@mariozechner/pi-agent-core` (the full agent framework). This aligns perfectly with the stated goal of replacing "LLM calling, streaming, tool handling" while keeping everything else intact.
