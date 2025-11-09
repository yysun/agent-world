# Requirements: Approval Flow Refactoring

**Date:** 2025-11-08  
**Status:** Draft  
**Type:** Architecture Refactoring

---

## Problem Statement

### Current Issues

1. **Mixed Responsibilities**
   - LLM providers execute tools and handle approval logic
   - Should be pure data transformers (only call LLM APIs)
   - Tool execution belongs in orchestration layer (events.ts)

2. **Complex Message Handler**
   - `subscribeAgentToMessages()` handles BOTH text messages AND tool approvals
   - 300+ lines of mixed logic with complex branching
   - Hard to maintain, test, and understand

3. **Security Vulnerability**
   - Tool approval responses can leak across agents
   - No verification that tool_call_id belongs to target agent
   - User-supplied agentId trusted without ownership validation

4. **Type-Unsafe Approval Submission**
   - Approvals sent as JSON-encoded strings: `'@a1 {"__type":"tool_result",...}'`
   - Requires parsing at multiple layers
   - Error-prone manual JSON construction
   - Semantic confusion (tool results ≠ text messages)

---

## Requirements

### REQ-1: Structured Tool Result Messages

**What:**
- Use existing `role: 'tool'` message format for approval responses
- Create `publishToolResult(world, agentId, {...})` that constructs proper tool message
- Send via existing `'message'` event channel but with structured data

**Why:**
- Reuse existing LLM conversation format (role: 'tool' is standard)
- No new event type needed - tool messages already exist
- Tool messages already filtered correctly in utils.ts
- Simpler architecture - leverage existing infrastructure

**Success Criteria:**
- `publishToolResult(world, agentId, {...})` API exists
- Constructs proper ChatMessage with role='tool', tool_call_id, content
- Separate event handler `subscribeAgentToToolMessages()` exists
- No approval logic in main message handler

---

### REQ-2: Verify Tool Call Ownership

**What:**
- Before processing approval, verify tool_call_id exists in agent's memory
- Reject approvals for tool calls not owned by target agent

**Why:**
- Security: Prevent cross-agent approval contamination
- User could manually specify wrong agentId
- Tool call ID is cryptographic proof of ownership

**Success Criteria:**
- Handler checks: `agent.memory.some(msg => msg.tool_calls?.some(tc => tc.id === event.tool_call_id))`
- Rejects if not found
- Test: Agent B cannot process Agent A's approval

---

### REQ-3: Simplify Message Handler

**What:**
- Remove all approval handling from `subscribeAgentToMessages()`
- Message handler only processes: mentions, auto-mention, text messages
- Reduce from 300+ lines to ~150 lines

**Why:**
- Single responsibility principle
- Easier to maintain and test
- Clearer code flow

**Success Criteria:**
- No `if (role === 'tool')` checks in message handler
- No tool execution in message handler
- No approval logic in message handler
- Code reduction: 60%+

---

### REQ-4: Type-Safe Tool Result API

**What:**
- Create `ToolResultData` interface for structured input
- `publishToolResult()` constructs proper ChatMessage internally
- No manual JSON encoding by users

**Why:**
- Compile-time validation
- No parsing errors
- Constructs correct role='tool' message format
- Clear API contract
- Better developer experience

**Success Criteria:**
- TypeScript enforces required fields (tool_call_id, decision, etc.)
- No manual JSON.stringify() needed
- Automatically constructs proper tool message format
- CLI and UI use structured API

---

### REQ-5: LLM Providers as Pure Functions

**What:**
- Providers return unified `LLMResponse` type
- Providers do NOT execute tools
- Providers do NOT handle approvals
- Tool execution moved to `events.ts`

**Why:**
- Separation of concerns: providers = data transformers
- Consistency across providers (OpenAI, Anthropic, Google)
- Easier to test providers in isolation
- Adding new providers is simpler

**Success Criteria:**
- All providers return `LLMResponse { type: 'text' | 'tool_calls', ... }`
- No `tool.execute()` calls in providers
- No approval flow logic in providers
- Tool execution orchestrated in `events.ts`

---

## Conceptual Flow

### Current Flow (Mixed)

```
User Approval String → publishMessage()
  ↓
'message' event broadcast
  ↓
subscribeAgentToMessages() [ALL agents receive]
  ↓
Parse JSON string to detect tool result
  ↓
Check if role === 'tool' (line 825)
  ↓
Handle approval (270 lines, lines 825-1095)
  OR
Handle text message (lines 1047-1500)
```

**Problems:**
- All agents receive all messages (inefficient)
- Complex branching in single handler
- Approval logic mixed with message logic
- No ownership verification

---

### Target Flow (Separated)

```
TEXT MESSAGE FLOW:
User Text → publishMessage()
  ↓
'message' event
  ↓
subscribeAgentToMessages()
  ↓
Check mentions → shouldAgentRespond()
  ↓
Save to memory → processAgentMessage()
  ↓
Call LLM → Apply auto-mention
  ↓
Publish response

TOOL APPROVAL FLOW:
User Approval → publishToolResult(agentId, {...})
  ↓
Constructs proper tool message: {role: 'tool', tool_call_id, content}
  ↓
'message' event (contains tool message)
  ↓
subscribeAgentToMessages() [ALL agents receive, but...]
  ↓
Detects role='tool' → Routes to subscribeAgentToToolMessages()
  ↓
Verify agentId matches (from tool_call_id lookup)
  ↓
Verify tool_call_id ownership (security)
  ↓
Execute tool if approved
  ↓
Save result to memory
  ↓
Resume LLM with result
```

**Benefits:**
- Clear separation of concerns (different handlers)
- Reuses existing message infrastructure
- Type-safe structured data
- Security check built-in
- Tool messages already correctly filtered in LLM context

---

## Agent Response Flow

### Current: Provider Executes Tools (Wrong Layer)

```
Agent triggers → processAgentMessage()
  ↓
Call LLM Provider
  ↓
Provider receives tool_calls from LLM
  ↓
Provider executes tools (WRONG LAYER)
  ↓
Provider handles approval requests (WRONG LAYER)
  ↓
Provider returns string OR approval_flow object (inconsistent)
  ↓
events.ts handles response
```

**Problems:**
- Tool execution duplicated in 3 providers
- Approval logic duplicated in 3 providers
- Inconsistent return types

---

### Target: events.ts Orchestrates Tools (Right Layer)

```
Agent triggers → processAgentMessage()
  ↓
Call LLM Provider
  ↓
Provider receives tool_calls from LLM
  ↓
Provider returns LLMResponse { type: 'tool_calls', messages: [...] } (pure)
  ↓
events.ts receives LLMResponse
  ↓
events.ts checks if approval required
  ↓
IF needs approval:
  ├─ Create client.requestApproval message
  ├─ Save to memory
  └─ Wait for user (via publishClientToolResult)
  ↓
IF approved or no approval needed:
  ├─ Execute tool in events.ts
  ├─ Save result to memory
  └─ Loop: Call LLM again with result
```

**Benefits:**
- Providers are pure (no side effects)
- Tool orchestration centralized in events.ts
- Consistent flow across all providers
- Easy to test and maintain

---

## Message Type Architecture

### Current Messages

```
'message' event contains:
  - Text messages (role='user', 'assistant', 'system')
  - Tool result messages (role='tool') encoded as JSON strings
```

**Problem:** Tool results encoded as JSON strings, requires parsing

---

### Target Messages

```
'message' event contains:
  - Text messages (role='user', 'assistant', 'system')
  - Tool result messages (role='tool') with proper structure
  
Message handlers:
  - subscribeAgentToMessages() → Routes to appropriate handler based on role
  - subscribeAgentToToolMessages() → Handles role='tool' messages ONLY
```

**Benefit:** 
- Same event channel, cleaner message structure
- Separate handlers for different message types
- Reuses existing LLM conversation format

---

## Data Structures

### Current: String-Based Approval

```
User sends string:
'@a1 {"__type":"tool_result","tool_call_id":"call_123","agentId":"a1","content":"..."}'

Issues:
- Double JSON encoding (content is stringified twice)
- Manual construction
- Parsing required at multiple layers
- Type-unsafe
```

---

### Target: Structured Approval → Proper Tool Message

```
User calls API:
publishToolResult(world, 'a1', {
  tool_call_id: 'call_123',
  decision: 'approve',
  scope: 'session',
  toolName: 'shell_cmd',
  toolArgs: { command: 'ls', parameters: ['-la'] }
});

API constructs proper tool message:
{
  role: 'tool',
  content: '{"decision":"approve","scope":"session",...}',
  tool_call_id: 'call_123',
  sender: 'human',
  // ... other fields
}

Then publishes via publishMessage()

Benefits:
- Type-safe API (TypeScript validates input)
- Constructs correct LLM message format
- No manual JSON encoding
- Reuses existing message infrastructure
```

---

## Security Model

### Current: Trust User Input

```
User sends: {"agentId": "a1", ...}
  ↓
Agent checks: targetAgentId === agent.id
  ↓
If match, process approval

Problem: No verification that tool_call_id belongs to agent
```

---

### Target: Verify Ownership

```
User sends approval for tool_call_id
  ↓
Agent checks: agentId === agent.id (filter)
  ↓
Agent verifies: tool_call_id exists in agent.memory
  ↓
If found, process approval
  ↓
If not found, reject (security)

Benefit: Cryptographic proof of ownership
```

---

## Auto-Mention Compatibility

### Concern
Will approval refactoring break auto-mention system?

### Answer: No Impact

**Reason:**
- Approval responses bypass auto-mention logic (early return, line 1036)
- Auto-mention only applies to LLM-generated text responses
- `shouldAutoMention()` explicitly skips HUMAN messages (line 709)
- Approval flow and message flow are independent

**Flow:**
```
Approval Response → subscribeAgentToClientToolResults()
  ↓
Execute tool → Save result → Resume LLM
  ↓
LLM generates NEW text response
  ↓
NEW response goes through processAgentMessage()
  ↓
Auto-mention logic applies to NEW response (not approval)
```

**Conclusion:** Auto-mention works on LLM responses after approval, not on approval itself.

---

## Non-Goals

**What this refactoring does NOT change:**

1. **Approval UX**: User still approves/denies via CLI/UI prompts
2. **Approval Storage**: Still stored in agent.memory as tool result messages
3. **Approval Scope**: Still supports session/once scopes
4. **LLM Context**: LLM still sees approval results in conversation history
5. **Message Threading**: replyToMessageId logic unchanged
6. **SSE Streaming**: Streaming still works the same way
7. **Auto-Mention Logic**: Remains unchanged

**What changes:**
- HOW approvals are submitted (structured vs string)
- WHERE approvals are processed (dedicated handler vs message handler)
- WHEN tools are executed (events.ts vs provider)
- HOW ownership is verified (memory check vs trust user)

---

## Success Criteria

### Code Quality
- [ ] Message handler < 200 lines (currently 300+)
- [ ] Tool result handler fully isolated (~100 lines)
- [ ] Providers are pure functions (no tool execution)
- [ ] No JSON string parsing for approvals

### Functionality
- [ ] All existing tests pass
- [ ] Approval flow works end-to-end
- [ ] Auto-mention still works
- [ ] Multi-agent chat works (no approval leaks)

### Security
- [ ] Tool call ownership verified
- [ ] Cross-agent contamination prevented
- [ ] Test: Agent B cannot process Agent A's approval

### API
- [ ] `publishClientToolResult()` function exists
- [ ] CLI uses new API
- [ ] Web UI uses new API
- [ ] Backward compatibility maintained during migration

### Performance
- [ ] Only target agent processes approval events
- [ ] No broadcast to all agents
- [ ] Fewer event handlers triggered

---

## Migration Strategy

**Phase 0:** Create new types and functions (no breaking changes)  
**Phase 1:** Add separate event handler (parallel with old flow)  
**Phase 2:** Update CLI to use new API (with feature flag)  
**Phase 3:** Update Web UI to use new API  
**Phase 4:** Remove old approval handling from message handler  
**Phase 5:** Remove legacy parsing code, update docs

**Timeline:** Can be done incrementally, backward compatible at each step

---

## Risks & Mitigations

### Risk: Breaking existing approval workflows
**Mitigation:** Support both old and new APIs during migration, feature flags for testing

### Risk: Missing edge cases in new handler
**Mitigation:** Extract existing approval logic, move (don't rewrite), comprehensive tests

### Risk: Performance regression
**Mitigation:** Benchmark before/after, targeted events are faster than broadcast

### Risk: Security check too strict
**Mitigation:** Log warnings when rejecting, monitor false positives, adjust if needed
