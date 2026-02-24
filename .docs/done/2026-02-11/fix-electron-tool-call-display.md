# Fix: Incomplete Tool Call Display in Electron App

## Problem

In the CLI, tool call information was displayed with full details including parameters:
```
a2: {"command": "codex", "parameters": ["exec", "hi"], "directory": "./", "timeout": 600000}
```

But in the Electron app, the tool call info was incomplete - missing parameters:
```
e1 (reply to HUMAN)
10:28 AM
Calling tool: shell_cmd
```

## Root Cause

The issue occurred in the streaming flow:

1. **CLI Flow (Working)**:
   - LLM streaming returns tool_calls
   - Orchestrator formats the message with parameters: `"Calling tool: shell_cmd (command: "codex", parameters: ["exec", "hi"], ...)"`
   - Message event is emitted with the formatted content AND tool_calls data
   - CLI message handler displays the formatted text with parameters

2. **Electron/Web Flow (Broken)**:
   - LLM streaming returns tool_calls
   - Orchestrator formats the message with parameters
   - SSE 'end' event is sent WITHOUT the formatted content or tool_calls
   - Web client only received streaming chunks with text content (no tool_calls)
   - Web UI couldn't format the message because it didn't have the tool_calls data

## Solution

### 1. Send Tool Calls via SSE in Streaming Mode

**File**: `core/events/orchestrator.ts`

When tool calls are returned in streaming mode, send an SSE chunk with:
- The formatted tool call message content
- The tool_calls data with all parameters

```typescript
// For streaming mode, send the formatted tool call message via SSE
// This ensures web clients receive the complete tool call info with parameters
if (isStreamingEnabled()) {
  publishSSE(world, {
    agentName: agent.id,
    type: 'chunk',
    content: messageContent,
    messageId,
    tool_calls: executableToolCalls
  });
}
```

### 2. Preserve tool_calls in SSE Client

**File**: `web/src/utils/sse-client.ts`

Updated `handleStreamChunk` to preserve tool_calls from the chunk event:

```typescript
export const handleStreamChunk = <T extends SSEComponentState>(state: T, data: StreamChunkData): T => {
  const { messageId, sender, content, tool_calls } = data;
  // ...
  messages[i] = {
    ...messages[i],
    text: content || '',
    createdAt: new Date(),
    // Preserve tool_calls if present
    ...(tool_calls && { tool_calls })
  };
  // ...
};
```

### 3. Update Type Definitions

**File**: `core/types.ts`

Added `tool_calls` to `WorldSSEEvent`:

```typescript
export interface WorldSSEEvent {
  // ... existing fields
  // Tool calls data for complete display with parameters
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string | Record<string, unknown>;
    };
  }>;
}
```

**File**: `core/events/publishers.ts`

Updated `publishSSE` to include tool_calls:

```typescript
export function publishSSE(world: World, data: Partial<WorldSSEEvent>): void {
  const sseEvent: WorldSSEEvent = {
    agentName: data.agentName!,
    type: data.type!,
    content: data.content,
    error: data.error,
    messageId: data.messageId || generateId(),
    usage: data.usage,
    logEvent: data.logEvent,
    tool_calls: data.tool_calls  // Added
  };
  world.eventEmitter.emit('sse', sseEvent);
}
```

## Files Changed

1. `core/events/orchestrator.ts` - Send tool_calls via SSE in streaming mode
2. `core/types.ts` - Add tool_calls to WorldSSEEvent interface
3. `core/events/publishers.ts` - Include tool_calls in publishSSE
4. `web/src/utils/sse-client.ts` - Preserve tool_calls in handleStreamChunk

## Testing

After the fix:

**Electron App** should now display:
```
e1 (reply to HUMAN)
10:28 AM
Calling tool: shell_cmd (command: "codex", parameters: ["exec", "hi"], directory: "./", timeout: 600000)
```

The web UI's `formatMessageText` function (in `world-chat.tsx`) already handles tool_calls formatting, so once the data is preserved, it will automatically format the display correctly.

## Impact

- CLI behavior unchanged (continues to work as before)
- Electron/Web now displays complete tool call information with parameters
- No breaking changes to existing APIs
- Streaming and non-streaming modes both work correctly
