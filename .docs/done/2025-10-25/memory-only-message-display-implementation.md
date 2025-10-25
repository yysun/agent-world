# Memory-Only Message Display Implementation

**Date:** October 25, 2025  
**Feature:** Complete visibility of agent-to-agent message flow including memory-only messages

## Overview

Implemented comprehensive display of all agent-to-agent message interactions, including messages that are saved to an agent's memory without triggering a response (memory-only messages). This provides complete visibility into multi-agent communication patterns and message flow.

## Problem Statement

Previously, the frontend only displayed agent responses. When Agent A sent a message to Agent B, the message would be saved to Agent B's memory, but if Agent B didn't respond, this incoming message was invisible in the UI. This created an incomplete picture of agent interactions.

### Example Scenario
```
User: "hi" → sent to o1 and a1
o1: (processes, uses tools) → responds with message
a1: receives o1's response in memory → no reply needed
```

Without this feature, a1's received message was invisible, making it impossible to understand the full message flow.

## Solution Architecture

### Three-Tier Implementation

#### 1. Backend SSE Streaming (`core/events.ts`)
- Added `memory-only` event type to `WorldSSEEvent` union in `core/types.ts`
- Published SSE events when messages are saved to memory without triggering response
- Event emitted in `subscribeAgentToMessages` when `shouldAgentRespond` returns false

```typescript
// When message saved to memory but agent doesn't respond
if (!shouldRespond) {
  publishSSE(world, {
    agentName: agent.id,
    type: 'memory-only',
    content,
    messageId
  });
}
```

#### 2. Frontend SSE Handler (`web/src/utils/sse-client.ts`)
- Added `handleMemoryOnlyMessage` function
- **Critical Fix:** Set `type: 'user'` for incoming messages (not 'agent')
  - Incoming messages need sort priority 1 (user)
  - Replies need sort priority 0 (agent/assistant)
- Preserved `fromAgentId` and `seenByAgents` for cross-agent detection

```typescript
const handleMemoryOnlyMessage = (data: any, state: SSEComponentState) => {
  const message: Message = {
    id: `msg-${Date.now()}-${Math.random()}`,
    sender: data.agentName || 'unknown',
    text: data.content || '',
    messageId: data.messageId,
    createdAt: new Date(),
    type: 'user', // CRITICAL: incoming message, not 'agent'
    fromAgentId: data.agentName,
    seenByAgents: [data.agentName]
  };
  // ...
};
```

#### 3. Database Message Loading (`web/src/pages/World.update.ts`)
- **Critical Fix:** Updated `createMessageFromMemory` to check backend `role` field
- Previous bug: Set ALL agent messages to `type='agent'` based on sender name only
- New logic: Check `memoryItem.role` field from backend
  - `role='user'` → `type='user'` (incoming to memory)
  - `role='assistant'` → `type='agent'` (agent's own reply)
- Preserves `fromAgentId` from backend for cross-agent detection

```typescript
const createMessageFromMemory = (memoryItem: AgentMessage, agentName: string): Message => {
  let messageType: string;
  if (sender === 'HUMAN' || sender === 'USER' || sender === 'human' || sender === 'user') {
    messageType = 'user';
  } else if (memoryItem.role === 'user') {
    // Agent message saved to memory as incoming (not a reply)
    messageType = 'user';
  } else if (memoryItem.role === 'assistant') {
    // Agent's own reply
    messageType = 'agent';
  } else {
    // Fallback: if sender is an agent and role is not specified, assume it's a reply
    messageType = 'agent';
  }
  
  return {
    // ...
    type: messageType,
    fromAgentId: memoryItem.agentId || (isUserMessage ? undefined : agentName),
    role: memoryItem.role // Preserve for sorting
  };
};
```

### Display Logic (`web/src/components/world-chat.tsx`)

#### Message Type Detection
- **Reply:** `type === 'agent'` → "Agent: name (reply)"
- **Incoming:** `type === 'user' && fromAgentId` → "Agent: name (incoming from sender)"
- **Memory-only marker:** If incoming message has no subsequent reply → "[in-memory, no reply]"

#### Styling (`web/src/styles.css`)
```css
.memory-only-message {
  border-left: 3px solid #9e9e9e;
  align-self: flex-end;
  background: var(--message-bg);
  padding: var(--message-padding);
  border-radius: var(--message-border-radius);
  margin: var(--message-margin);
}
```

### Sorting Logic

#### Primary Sort: Timestamp (ascending)
Messages ordered by creation time

#### Secondary Sort: Role-based priority
When timestamps match (same logical message saved to multiple agents):
- Priority 0: `role === 'assistant'` (agent replies show first)
- Priority 1: `role === 'user'` (incoming messages show after)
- Priority 2: Other roles

**Why this matters:** When o1 sends a reply, the message appears as:
1. `role='assistant'` (o1's own reply)
2. `role='user'` (a1 receives it in memory)

With role-based sorting, the reply appears before the incoming version in the UI.

## Export Format Improvements (`core/export.ts`)

### Label Redesign
Removed confusing LLM role labels (user/assistant) and sender/receiver mixing.

**Before:**
```
user (sender: human) → agents

assistant (sender: o1)
[tool calls JSON dump]
```

**After:**
```
From: HUMAN
To: o1, a1
hi

Agent: o1 (reply)
[2 tool calls]

Agent: a1 (incoming from o1) [in-memory, no reply]
[2 tool calls]
```

### Tool Call Detection (3-Tier)
1. Check `message.tool_calls` array → extract function names
2. Check `message.role === 'tool'` → extract from content JSON
3. Parse message content for JSON tool call objects → extract names
4. If names empty → display "[X tool calls]" (X = count)

### In-Memory Detection
Identifies messages received without subsequent reply:
- Message has `role='user'` (incoming)
- Has `agentId` (received by specific agent)
- Next message from same agent is NOT a reply (different messageId or no next message)
- Marked with `[in-memory, no reply]`

## Technical Details

### Message Field Mapping

| Backend (AgentMessage) | Frontend (Message) | Purpose |
|------------------------|-------------------|---------|
| `role: 'user'` | `type: 'user'` | Incoming message |
| `role: 'assistant'` | `type: 'agent'` | Agent reply |
| `role: 'tool'` | `type: 'agent'` | Tool execution |
| `agentId` | `fromAgentId` | Cross-agent tracking |
| `sender` | `sender` | Display name |

### Critical Bug Fixes

#### Bug 1: SSE Handler Type Assignment
**Issue:** Memory-only messages created with `type: 'agent'` instead of `type: 'user'`  
**Impact:** Incorrect sorting (incoming before replies)  
**Fix:** Changed to `type: 'user'` in `handleMemoryOnlyMessage`

#### Bug 2: Database Loading Type Assignment
**Issue:** `createMessageFromMemory` ignored backend `role` field, set ALL agent messages to `type='agent'` based on sender name  
**Impact:** Database-loaded messages showed wrong labels even when SSE streaming worked  
**Fix:** Check `memoryItem.role` field to determine message type

#### Bug 3: Frontend Sorting Field Reference
**Issue:** Sort logic used non-existent `a.role` field  
**Impact:** Sorting failed, messages appeared in timestamp-only order  
**Fix:** Changed to `a.type === 'agent' || a.type === 'assistant'` for priority 0

## Display Format Examples

### Complete Message Flow
```
From: HUMAN
To: o1, a1
Time: 2025-10-25T21:24:51.218Z
hi

Agent: o1 (reply)
Time: 2025-10-25T21:24:57.105Z
[2 tool calls]

Agent: a1 (incoming from o1)
Time: 2025-10-25T21:24:57.105Z
[2 tool calls]

Agent: a1 (reply)
Time: 2025-10-25T21:24:58.395Z
Hi — how can I help you today?

Agent: o1 (incoming from a1) [in-memory, no reply]
Time: 2025-10-25T21:24:58.395Z
Hi — how can I help you today?
```

### Visual Styling
- **Human messages:** Blue left border (#2196f3)
- **Agent replies:** Blue left border (#2196f3)
- **Cross-agent messages:** Orange left border (#ff9800)
- **Memory-only messages:** Gray left border (#9e9e9e)

## Testing Validation

### Expected Behaviors
1. ✅ Memory-only messages appear in UI during streaming
2. ✅ Messages loaded from database have correct type assignment
3. ✅ Sorting shows replies before incoming at same timestamp
4. ✅ Tool calls display as "[X tool calls]" not raw JSON
5. ✅ Export format matches frontend display logic
6. ✅ "[in-memory, no reply]" marker appears for unreplied messages
7. ✅ Gray border styling applied to memory-only messages

### Files Modified
- `core/types.ts` - Extended WorldSSEEvent type union
- `core/events.ts` - Added memory-only SSE publishing
- `core/export.ts` - Redesigned labels, added in-memory detection, tool call summarization
- `web/src/styles.css` - Added .memory-only-message class
- `web/src/utils/sse-client.ts` - Added handleMemoryOnlyMessage with correct type assignment
- `web/src/pages/World.update.ts` - Fixed createMessageFromMemory to check backend role field
- `web/src/components/world-chat.tsx` - Updated display labels, added 3-tier tool detection

## Benefits

### Complete Visibility
- Users can see ALL message flow between agents
- Understand which agents received which messages
- Track memory-only interactions that don't trigger responses

### Better UX
- Clear labeling: "Agent: name (reply)" vs "Agent: name (incoming from sender)"
- Visual distinction with gray borders for memory-only
- Consistent export and UI display formats

### Debugging Support
- Tool calls visible as summaries instead of JSON dumps
- In-memory marker helps identify unreplied messages
- Sorting ensures logical conversation flow

## Architecture Decisions

### Why Check Backend Role Field?
The backend stores messages with proper `role` field:
- `role='user'` for incoming messages (saved to agent memory)
- `role='assistant'` for agent replies

Checking sender name alone is insufficient because the same agent can have both incoming and outgoing messages. The role field provides authoritative information about message direction.

### Why Sort by Role?
When the same logical message appears in multiple agents' memory at the same timestamp:
- The original reply (`role='assistant'`) should appear first
- The incoming versions (`role='user'`) should appear after

This creates a natural conversation flow where you see the reply, then see it being received by other agents.

### Why Three-Tier Tool Detection?
Different LLM implementations provide tool calls in different formats:
1. Structured `tool_calls` array (most common)
2. Messages with `role='tool'` (alternative format)
3. JSON objects in content (fallback/legacy)

Three-tier detection ensures compatibility across all formats.

## Future Enhancements

### Potential Improvements
- Collapse/expand memory-only messages for cleaner UI
- Group same message across multiple agents (e.g., "Received by: a1, a2, a3")
- Add timestamp grouping for rapid message sequences
- Filter to show/hide memory-only messages

### Performance Considerations
- Current O(n) deduplication using messageId Map
- Sorting is O(n log n) but necessary for proper display
- Consider virtual scrolling for very long conversations

## Conclusion

This implementation provides complete visibility into multi-agent message flow by displaying both agent replies and incoming messages saved to memory. The role-based type assignment, proper sorting, and clear labeling create an intuitive understanding of agent interactions.

The critical fix to `createMessageFromMemory` ensures that both SSE-streamed and database-loaded messages display correctly, providing a consistent user experience regardless of how messages are delivered to the frontend.
