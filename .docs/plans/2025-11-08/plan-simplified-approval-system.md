# Architecture Plan: Simplified Approval System

**Created:** 2025-11-08  
**Type:** Architecture Plan (AP)  
**Status:** Ready for Implementation  
**Related:** AR document `ar-simplified-approval-system.md`

---

## Overview

This plan implements a **server-driven approval architecture** that radically simplifies the approval system:

1. **Remove approval cache** - Eliminate redundant in-memory caching
2. **Server tracks completion** - Add `toolCallStatus` to messages
3. **Inline display** - Show approvals in chat, not modal dialog
4. **Fix protocol parsing** - Parse JSON protocol in `findSessionApproval()`
5. **No client scanning** - Client reads completion status from server

**Core Principle:** Server is single source of truth, client is pure display layer.

### Simplified Client Architecture

**Client responsibilities:**
- ✅ Display tool call requests with approval buttons (when `complete: false`)
- ✅ Display tool call results (when `complete: true`)
- ✅ Send approval decisions to server
- ❌ No approval history checking
- ❌ No pending approval indicators/counters
- ❌ No completion status validation
- ❌ No dismissal tracking

**Server responsibilities:**
- ✅ Track tool call completion status (`toolCallStatus` in messages)
- ✅ Check session approvals with parameter matching
- ✅ Mark requests complete when response received
- ✅ Provide completion status via SSE events

---

## Implementation Phases

### ✅ Phase 1: Backend - Simplify Approval Logic & Fix Protocol Parsing

**Goal**: Remove approval cache, fix JSON protocol parsing, simplify approval checking to session-only

**Estimated Time**: 2-3 hours  
**Risk**: High ⚠️ (Critical protocol fix)

#### Files to Delete
- `core/approval-cache.ts`

#### Files to Modify

**1. `core/events.ts` - Fix `findSessionApproval()` with JSON protocol parsing**

⚠️ **CRITICAL FIX (from AR):** Correct protocol parsing order to properly distinguish enhanced vs legacy formats.

```typescript
/**
 * Find session-wide approval for a tool in message history
 * Supports both enhanced string protocol (JSON) and legacy text parsing
 * 
 * Session approval matches on:
 * - Tool name (required)
 * - Working directory (if provided)
 * - Parameters (exact match)
 * 
 * Enhanced protocol format:
 * {
 *   role: 'tool',
 *   tool_call_id: 'approval_...',
 *   content: '{"__type":"tool_result","content":"{\"decision\":\"approve\",\"scope\":\"session\",\"toolName\":\"...\",\"toolArgs\":{...},\"workingDirectory\":\"...\"}"}'
 * }
 */
export function findSessionApproval(
  messages: AgentMessage[], 
  toolName: string, 
  toolArgs?: any,
  workingDirectory?: string
): { decision: 'approve'; scope: 'session'; toolName: string } | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    
    // Primary: Enhanced string protocol (JSON tool result)
    if (msg.role === 'tool' && msg.tool_call_id && msg.content) {
      try {
        const outerParsed = JSON.parse(msg.content);
        
        // Enhanced protocol: Outer layer MUST have __type
        if (outerParsed.__type === 'tool_result') {
          if (!outerParsed.content) {
            loggerMemory.warn('Enhanced protocol missing content field', { 
              toolCallId: msg.tool_call_id 
            });
            continue; // Skip malformed enhanced protocol
          }
          
          try {
            const result = JSON.parse(outerParsed.content);
            if (result.decision === 'approve' && 
                result.scope === 'session' && 
                result.toolName?.toLowerCase() === toolName.toLowerCase()) {
              
              // Match working directory if provided in approval
              if (result.workingDirectory && workingDirectory) {
                if (result.workingDirectory !== workingDirectory) {
                  continue; // Directory mismatch, keep searching
                }
              }
              
              // Match parameters (exact deep equality)
              if (result.toolArgs && toolArgs) {
                const argsMatch = JSON.stringify(result.toolArgs) === JSON.stringify(toolArgs);
                if (!argsMatch) {
                  continue; // Parameters mismatch, keep searching
                }
              }
              
              return { decision: 'approve', scope: 'session', toolName };
            }
          } catch (innerError) {
            loggerMemory.error('Malformed enhanced protocol content', {
              toolCallId: msg.tool_call_id,
              content: outerParsed.content,
              error: innerError
            });
            continue; // Skip malformed inner JSON
          }
        }
        // If outer JSON parsed but no __type, might be legacy JSON approval
        // (not currently used, but future-proof)
      } catch (outerError) {
        // Outer JSON.parse failed - not JSON at all, try legacy text
      }
    }
    
    // No legacy fallback - enhanced protocol required
  }
  return undefined;
}
```

**2. `core/events.ts` - Update `checkToolApproval()` with context parameter**

⚠️ **IMPROVEMENT (from AR):** Make context parameter required (with optional properties) for better API design.

```typescript
/**
 * Check if a specific tool requires approval based on message history
 * Simplified: Only checks for session-wide approval, not one-time or denials
 * 
 * Logic:
 * 1. Search for session approval → Execute immediately
 * 2. No session approval → Request approval
 * 
 * @param context - Required execution context (workingDirectory optional within)
 */
export async function checkToolApproval(
  world: World,
  toolName: string,
  toolArgs: any,
  message: string,
  messages: AgentMessage[],
  context: { workingDirectory?: string; [key: string]: any }  // ✅ Required object, optional properties
): Promise<{
  needsApproval: boolean;
  canExecute: boolean;
  approvalRequest?: any;
}> {
  try {
    // Check for session-wide approval ONLY (matches name + directory + params)
    const workingDirectory = context?.workingDirectory || process.cwd();
    const sessionApproval = findSessionApproval(messages, toolName, toolArgs, workingDirectory);
    
    if (sessionApproval) {
      return {
        needsApproval: false,
        canExecute: true
      };
    }

    // No session approval found - need to request approval
    return {
      needsApproval: true,
      canExecute: false,
      approvalRequest: {
        toolName,
        toolArgs,
        message,
        workingDirectory, // Include for session approval matching
        requestId: `approval-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        options: ['deny', 'approve_once', 'approve_session']
      }
    };
  } catch (error) {
    loggerAgent.error('Error checking tool approval', {
      toolName,
      error: error instanceof Error ? error.message : error
    });
    return {
      needsApproval: true,
      canExecute: false,
      approvalRequest: {
        toolName,
        toolArgs,
        message,
        workingDirectory, // Include even in error case
        requestId: `approval-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        options: ['deny', 'approve_once', 'approve_session']
      }
    };
  }
}
```

**3. `core/events.ts` - Remove deprecated functions**

Delete these functions entirely:
- `findRecentApproval()`
- `findRecentDenial()`

**4. `core/tool-utils.ts` - Pass context to `checkToolApproval()`**

Locate the call to `checkToolApproval()` and update:

```typescript
// BEFORE:
const approvalCheck = await checkToolApproval(
  context.world,
  toolName,
  args,
  approvalMessage,
  context.messages
);

// AFTER:
const approvalCheck = await checkToolApproval(
  context.world,
  toolName,
  args,
  approvalMessage,
  context.messages,
  { workingDirectory: context.workingDirectory || process.cwd() }  // ✅ Pass context
);
```

**5. `core/tool-utils.ts` - Include `workingDirectory` in approval request**

Locate approval request message creation and update:

```typescript
const approvalResult = {
  role: 'assistant' as const,
  content: '',
  tool_calls: [{
    id: approvalToolCallId,
    type: 'function' as const,
    function: {
      name: 'client.requestApproval',
      arguments: JSON.stringify({
        originalToolCall: {
          name: toolName,
          args: args,
          workingDirectory: context?.workingDirectory || process.cwd()  // ✅ Include
        },
        message: approvalMessage,
        options: approvalCheck.approvalRequest?.options || ['deny', 'approve_once', 'approve_session']
      })
    }
  }]
};
```

**6. `core/index.ts` - Remove approval cache exports**

Remove these lines:
```typescript
export {
  ApprovalCache,
  approvalCache
} from './approval-cache.js';
```

**7. `core/mcp-server-registry.ts` - Remove approval cache import**

Remove this line (if present):
```typescript
import { approvalCache } from './approval-cache.js';
```

#### Testing Checklist

- [ ] Test JSON protocol parsing in `findSessionApproval()`
  - [ ] Parse nested JSON: `{"__type":"tool_result","content":"..."}`
  - [ ] Extract decision, scope, toolName, toolArgs, workingDirectory
  - [ ] Match toolName (case-insensitive)
  - [ ] Match workingDirectory (exact)
  - [ ] Match toolArgs (deep equality via JSON.stringify)
  - [ ] Reject malformed outer JSON (skip, don't crash)
  - [ ] Reject malformed inner JSON (skip, don't crash)
- [ ] Test `checkToolApproval()` with context parameter
  - [ ] Accept context parameter without error
  - [ ] Use context.workingDirectory in session approval check
  - [ ] Include workingDirectory in approval request
- [ ] Test approval cache removal
  - [ ] Verify `approval-cache.ts` deleted
  - [ ] Verify no imports of ApprovalCache
  - [ ] Verify no runtime errors after removal
- [ ] Test deprecated function removal
  - [ ] Verify `findRecentApproval()` removed
  - [ ] Verify `findRecentDenial()` removed
  - [ ] Update tests that reference these functions

#### Rollback Plan

If critical issues found:
1. Revert `core/events.ts` changes
2. Restore `core/approval-cache.ts` from git
3. Restore exports in `core/index.ts`

---

### ⬜ Phase 2: Backend - Add Tool Call Completion Tracking

**Goal**: Add server-side completion status to tool call messages

**Estimated Time**: 2 hours  
**Risk**: Medium

#### Files to Modify

**1. `core/types.ts` - Add `toolCallStatus` to `AgentMessage` interface**

```typescript
export interface AgentMessage {
  // ... existing fields ...
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  
  // NEW: Tool call completion tracking
  toolCallStatus?: {
    [toolCallId: string]: {
      complete: boolean;
      result?: {
        decision: 'approve' | 'deny';
        scope?: 'once' | 'session';
        timestamp: string;
      };
    };
  };
  
  // ... other existing fields ...
}
```

**2. `core/events.ts` - Add `toolCallStatus` to approval request messages**

Locate where approval request messages are created (in `publishEvent` or message construction):

```typescript
// When creating approval request message
const approvalRequestMessage: AgentMessage = {
  role: 'assistant',
  content: '',
  tool_calls: [{
    id: toolCallId,
    type: 'function',
    function: {
      name: 'client.requestApproval',
      arguments: JSON.stringify(approvalRequest)
    }
  }],
  // NEW: Initialize as incomplete
  toolCallStatus: {
    [toolCallId]: {
      complete: false,
      result: null
    }
  },
  // ... other fields ...
};
```

**3. `core/events.ts` - Update tool result handler to mark completion**

Locate where tool result messages are processed:

```typescript
// When processing tool result for approval
const toolResultMessage: AgentMessage = {
  role: 'tool',
  tool_call_id: toolCallId,
  content: JSON.stringify(approvalResult),
  // NEW: Mark as complete
  toolCallStatus: {
    [toolCallId]: {
      complete: true,
      result: {
        decision: approvalResult.decision,
        scope: approvalResult.scope,
        timestamp: new Date().toISOString()
      }
    }
  },
  // ... other fields ...
};
```

**4. SSE Streaming - Include `toolCallStatus` in events**

Locate SSE event construction for messages:

```typescript
// In publishEvent or SSE message serialization
world.eventEmitter.emit(EventType.MESSAGE, {
  // ... existing event fields ...
  toolCallStatus: message.toolCallStatus  // Include completion status
});
```

**5. Storage - Persist `toolCallStatus` field**

Update storage layer to include new field:
- `core/storage/memory-storage.ts` - Include in memory serialization
- `core/storage/agent-storage.ts` - Include in database schema (if needed)

#### Testing Checklist

- [ ] Test approval request creation
  - [ ] Verify `toolCallStatus` present with `complete: false`
  - [ ] Verify `result: null` for pending requests
- [ ] Test tool result processing
  - [ ] Verify `toolCallStatus` updated with `complete: true`
  - [ ] Verify `result` contains decision, scope, timestamp
- [ ] Test SSE event streaming
  - [ ] Verify `toolCallStatus` included in SSE payloads
  - [ ] Verify frontend receives completion status
- [ ] Test persistence
  - [ ] Verify `toolCallStatus` saved to storage
  - [ ] Verify `toolCallStatus` restored on load
- [ ] Test backwards compatibility
  - [ ] Legacy messages without `toolCallStatus` work
  - [ ] Default to `complete: false` for missing status

#### Migration Strategy

For existing approval messages in storage:
- Add migration script to populate `toolCallStatus`
- Default: `complete: false` for requests, `complete: true` for responses
- Parse content to extract decision/scope for completed approvals

---

### ⬜ Phase 3: Frontend - Inline Tool Call Display

**Goal**: Remove approval dialog, display approvals inline in chat

**Estimated Time**: 2 hours  
**Risk**: Medium

#### Files to Create

**1. `web/src/components/ToolCallMessage.ts` - New inline approval component**

```typescript
/**
 * ToolCallMessage Component - Inline Approval Request/Response Display
 * 
 * Features:
 * - Shows approval request with buttons if not complete
 * - Shows approval result if complete
 * - Reads completion status from server (no client-side checking)
 * 
 * Changes:
 * - 2025-11-08: Initial implementation for simplified approval system
 */

import { app } from 'apprun';

export default function ToolCallMessage({ message }) {
  const toolCall = message.toolCallData;
  
  if (!toolCall) return null;
  
  // Read completion status from server (no fallback needed)
  const isComplete = toolCall.complete || false;
  
  if (!isComplete) {
    // Show approval request with buttons
    return (
      <div class="tool-call-request card mb-3 border-warning">
        <div class="card-body">
          <div class="d-flex align-items-center mb-2">
            <span class="badge bg-warning text-dark me-2">⚠️ Approval Required</span>
            <code class="text-muted small">{toolCall.toolName}</code>
          </div>
          <p class="card-text mb-3">{toolCall.approvalMessage || 'This tool requires your approval to continue.'}</p>
          
          {/* Tool arguments preview (collapsible) */}
          {toolCall.toolArgs && Object.keys(toolCall.toolArgs).length > 0 && (
            <details class="mb-3">
              <summary class="text-muted small" style="cursor: pointer;">View parameters</summary>
              <pre class="bg-light p-2 small mt-2" style="max-height: 200px; overflow-y: auto;">
                {JSON.stringify(toolCall.toolArgs, null, 2)}
              </pre>
            </details>
          )}
          
          {/* Approval buttons */}
          <div class="btn-group w-100" role="group">
            {toolCall.approvalOptions?.map(option => {
              const isApprove = option.includes('approve');
              const label = option.replace(/_/g, ' ').toUpperCase();
              const btnClass = isApprove ? 'btn-success' : 'btn-danger';
              
              return (
                <button 
                  class={`btn ${btnClass}`}
                  $onclick={['submit-approval-decision', { 
                    toolCallId: toolCall.toolCallId,
                    decision: isApprove ? 'approve' : 'deny',
                    scope: option.includes('session') ? 'session' : (option.includes('once') ? 'once' : undefined)
                  }]}>
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }
  
  // Show approval result (completed)
  const result = toolCall.result;
  const isApproved = result?.decision === 'approve';
  const alertClass = isApproved ? 'alert-success' : 'alert-danger';
  const icon = isApproved ? '✓' : '✗';
  
  return (
    <div class={`tool-call-result alert ${alertClass} mb-2 d-flex align-items-center justify-content-between`}>
      <div>
        <strong>{icon} {isApproved ? 'Approved' : 'Denied'}</strong>
        <code class="ms-2 small text-muted">{toolCall.toolName}</code>
      </div>
      {result?.scope && (
        <span class="badge bg-secondary">{result.scope === 'session' ? 'Always' : 'Once'}</span>
      )}
    </div>
  );
}
```

#### Files to Modify

**1. `web/src/types/index.ts` - Update state interface**

```typescript
// REMOVE from WorldComponentState:
export interface WorldComponentState extends SSEComponentState {
  // ... existing fields ...
  
  // ❌ REMOVE:
  // approvalRequest: ApprovalRequest | null;
  // dismissedApprovals: Set<string>;
  
  // ... other fields ...
}

// UPDATE Message['toolCallData']:
export interface Message {
  // ... existing fields ...
  
  toolCallData?: {
    toolCallId: string;
    toolName: string;
    toolArgs: Record<string, unknown>;
    approvalMessage?: string;
    approvalOptions?: string[];
    agentId?: string;
    
    // NEW: Server-provided completion status
    complete?: boolean;  // ✅ Add
    result?: {           // ✅ Add
      decision: 'approve' | 'deny';
      scope?: 'once' | 'session';
      timestamp: string;
    };
    
    // REMOVE (no longer needed):
    // approvalDecision?: 'approve' | 'deny';
    // approvalScope?: 'once' | 'session' | 'none';
  };
}
```

**2. `web/src/pages/World.update.ts` - Update message detection**

```typescript
/**
 * Detect if message contains tool call approval request
 * Reads completion status from server-provided metadata
 */
const detectToolCallRequest = (messageData: any): Message['toolCallData'] | null => {
  const toolCalls = messageData?.tool_calls || messageData?.toolCalls;
  
  if (!toolCalls || !Array.isArray(toolCalls)) {
    return null;
  }

  for (const toolCall of toolCalls) {
    if (toolCall?.function?.name === 'client.requestApproval') {
      try {
        const parsedArgs = JSON.parse(toolCall.function?.arguments || '{}');
        
        // Read completion status from server-provided metadata
        const status = messageData?.toolCallStatus?.[toolCall.id];
        
        return {
          toolCallId: toolCall.id,
          toolName: parsedArgs?.originalToolCall?.name ?? 'Unknown tool',
          toolArgs: parsedArgs?.originalToolCall?.args ?? {},
          approvalMessage: parsedArgs?.message ?? 'This tool requires your approval to continue.',
          approvalOptions: parsedArgs?.options || ['deny', 'approve_once', 'approve_session'],
          agentId: messageData?.sender || messageData?.agentId,
          complete: status?.complete ?? false,  // ✅ Read from server
          result: status?.result ?? null         // ✅ Read from server
        };
      } catch (error) {
        console.warn('Failed to parse approval request arguments:', error);
      }
    }
  }
  
  return null;
};
```

**3. `web/src/pages/World.update.ts` - Remove dialog handlers**

Delete these handlers:
```typescript
// ❌ DELETE:
const showApprovalRequestDialog = (state, request) => { ... };
const hideApprovalRequestDialog = (state) => { ... };

// Also remove from worldUpdateHandlers:
// 'show-approval-request': showApprovalRequestDialog,
// 'hide-approval-request': hideApprovalRequestDialog,
```

**4. `web/src/pages/World.update.ts` - Keep inline approval submission**

Update `submitApprovalDecision` to work with inline buttons:

```typescript
const submitApprovalDecision = async (
  state: WorldComponentState, 
  payload: WorldEventPayload<'submit-approval-decision'>
): Promise<WorldComponentState> => {
  const { decision, scope, toolCallId } = payload;

  // Find the message with matching toolCallId
  const message = state.messages?.find(msg =>
    msg.toolCallData?.toolCallId === toolCallId
  );

  if (!message?.toolCallData) {
    return state; // No matching request found
  }

  const request = message.toolCallData;

  const baseState: WorldComponentState = {
    ...state,
    needScroll: true
  };

  // Create approval decision
  const approvalDecision: 'approve' | 'deny' = decision === 'approve' ? 'approve' : 'deny';
  const approvalScope: 'session' | 'once' | undefined = 
    scope === 'session' ? 'session' : (scope === 'once' ? 'once' : undefined);

  // Use enhanced string protocol with agentId
  const enhancedMessage = JSON.stringify({
    __type: 'tool_result',
    tool_call_id: request.toolCallId,
    agentId: request.agentId,
    content: JSON.stringify({
      decision: approvalDecision,
      scope: approvalScope,
      toolName: request.toolName,
      toolArgs: request.toolArgs,         // ✅ Include for session approval matching
      workingDirectory: request.workingDirectory // ✅ Include for session approval matching
    })
  });

  try {
    await sendChatMessage(state.worldName, enhancedMessage, {
      sender: 'HUMAN'
    });

    return {
      ...baseState,
      isWaiting: decision === 'approve' // Wait for streaming response if approved
    };
  } catch (error) {
    return {
      ...baseState,
      isWaiting: false,
      error: (error as Error).message || 'Failed to submit approval decision'
    };
  }
};
```

**5. `web/src/utils/sse-client.ts` - Simplify/remove approval event publishing**

```typescript
// BEFORE: publishApprovalRequests() triggers modal
// AFTER: Remove or simplify to logging only

// ❌ REMOVE or convert to audit log:
const publishApprovalRequests = (toolCalls: any[], agentId?: string): void => {
  // Log for audit trail only
  console.log('[Approval Audit] Tool call detected', {
    toolCalls,
    agentId,
    timestamp: new Date().toISOString()
  });
  
  // ❌ REMOVE: No event publishing needed, UI reads from message
  // publishEvent('show-approval-request', ...);
};
```

**6. Message rendering - Include `ToolCallMessage` component**

In the file where messages are rendered (likely `World.view.ts` or similar), add:

```typescript
import ToolCallMessage from '../components/ToolCallMessage.js';

// In message rendering loop:
{state.messages?.map(msg => {
  // ... existing message rendering ...
  
  // Render tool call requests/responses inline
  if (msg.isToolCallRequest || msg.isToolCallResponse) {
    return <ToolCallMessage message={msg} />;
  }
  
  // ... other message types ...
})}
```

#### Testing Checklist

- [ ] Test inline approval display
  - [ ] Approval request shows with buttons when `complete: false`
  - [ ] Approval result shows when `complete: true`
  - [ ] Tool parameters collapsible preview works
- [ ] Test approval button actions
  - [ ] Deny button works
  - [ ] Approve once button works
  - [ ] Approve session button works
  - [ ] Buttons disabled during submission
- [ ] Test approval state management
  - [ ] No approval dialog appears
  - [ ] No `approvalRequest` state in component
  - [ ] Approval responses update message display
- [ ] Test multiple pending approvals
  - [ ] Multiple requests display in sequence
  - [ ] Each shows buttons independently
  - [ ] Completing one doesn't affect others
- [ ] Test reload behavior
  - [ ] Pending approvals show on page load
  - [ ] Completed approvals show result on load
  - [ ] No client-side scanning required

---

### ⬜ Phase 4: Testing & Documentation

**Goal**: Comprehensive testing and documentation

**Estimated Time**: 2 hours  
**Risk**: Low

#### Testing Tasks

**1. Update `tests/core/approval-flow-unit.test.ts`**

- [ ] Add JSON protocol parsing tests:
  ```typescript
  describe('findSessionApproval - JSON protocol', () => {
    test('parses enhanced string protocol', () => {
      const messages = [{
        role: 'tool',
        tool_call_id: 'approval_123',
        content: JSON.stringify({
          __type: 'tool_result',
          content: JSON.stringify({
            decision: 'approve',
            scope: 'session',
            toolName: 'test_tool',
            toolArgs: { arg1: 'value1' },
            workingDirectory: '/path/to/dir'
          })
        })
      }];
      
      const result = findSessionApproval(messages, 'test_tool', { arg1: 'value1' }, '/path/to/dir');
      expect(result).toBeDefined();
      expect(result.decision).toBe('approve');
    });
    
    test('matches toolName case-insensitive', () => { ... });
    test('matches workingDirectory exact', () => { ... });
    test('matches toolArgs deep equality', () => { ... });
    test('rejects workingDirectory mismatch', () => { ... });
    test('rejects toolArgs mismatch', () => { ... });
  });
  
  });
  ```

- [ ] Remove obsolete tests:
  - ❌ Tests for `findRecentDenial()`
  - ❌ Tests for `findRecentApproval()`
  - ❌ Tests for approval cache
  - ❌ Tests for legacy text parsing (no backwards compatibility)

- [ ] Add context parameter tests:
  ```typescript
  test('checkToolApproval accepts context parameter', async () => {
    const result = await checkToolApproval(
      world,
      'test_tool',
      { arg1: 'value1' },
      'Test message',
      messages,
      { workingDirectory: '/path/to/dir' }
    );
    // ... assertions ...
  });
  ```

**2. Update `tests/core/approval-message-handling.test.ts`**

- [ ] Simplify to session approval only
- [ ] Remove one-time approval tests
- [ ] Remove denial expiry tests
- [ ] Add completion status tests

**3. Create `tests/integration/approval-inline-display.test.ts`**

```typescript
describe('Approval inline display integration', () => {
  test('displays pending approval with buttons', () => { ... });
  test('clicking approve sends response', () => { ... });
  test('completion updates display to result', () => { ... });
  test('session approval persists across reloads', () => { ... });
  test('multiple pending approvals display correctly', () => { ... });
});
```

**4. Create `tests/web-domain/tool-call-message.test.ts`**

```typescript
describe('ToolCallMessage component', () => {
  test('renders approval request when incomplete', () => { ... });
  test('renders approval result when complete', () => { ... });
  test('shows parameters in collapsible section', () => { ... });
  test('approval buttons emit correct events', () => { ... });
});
```

#### Documentation Tasks

**1. Create `.docs/done/2025-11-08/approval-architecture-refactor.md`**

Document:
- Architecture changes overview
- Approval cache removal rationale
- JSON protocol parsing (enhanced only, no legacy)
- Server-driven completion tracking
- Inline display UX
- No backwards compatibility (breaking change)

**2. Update `docs/Agent Message Response Flow.md`**

- Update approval flow diagrams
- Document `toolCallStatus` field
- Document enhanced protocol format
- Remove references to approval cache

**3. Update API documentation**

Add to message schema documentation:
```typescript
/**
 * AgentMessage with Tool Call Approval
 * 
 * Approval requests have:
 * - tool_calls with client.requestApproval
 * - toolCallStatus.complete = false
 * 
 * Approval responses have:
 * - role = 'tool'
 * - tool_call_id matching request
 * - toolCallStatus.complete = true
 * - toolCallStatus.result with decision/scope
 */
```

**4. Breaking changes guide**

This is a breaking change with no backwards compatibility:
- Approval cache removed - external code using `approvalCache` will break
- Legacy text parsing removed - must use enhanced JSON protocol
- `findRecentApproval()` removed - no one-time approvals
- `findRecentDenial()` removed - no denial tracking
- Frontend: approval dialog removed - UI completely changed
- Protocol: enhanced string format REQUIRED (old format not supported)

#### Final Validation

- [ ] Run full test suite: `npm test`
- [ ] Run integration tests: `npm run test:integration`
- [ ] Manual testing:
  - [ ] Session approval works correctly
  - [ ] Inline display renders properly
  - [ ] Approval submission works
  - [ ] Page reload preserves state
  - [ ] Multi-tab consistency maintained
- [ ] Code review:
  - [ ] No approval cache references remain
  - [ ] No deprecated function calls
  - [ ] All comment blocks updated
  - [ ] No legacy text parsing code remains
  - [ ] Enhanced protocol parsing is correct

---

## Success Criteria

**Backend:**
- [x] Phase 1 complete
  - [ ] `approval-cache.ts` removed
  - [ ] `findSessionApproval()` parses JSON protocol (enhanced only, no legacy)
  - [ ] `checkToolApproval()` accepts required context parameter
  - [ ] `findRecentDenial()` and `findRecentApproval()` removed
  - [ ] Approval requests include `workingDirectory`
  - [ ] All backend tests pass
- [x] Phase 2 complete
  - [ ] `toolCallStatus` added to `AgentMessage`
  - [ ] Approval requests marked `complete: false`
  - [ ] Approval responses marked `complete: true`
  - [ ] SSE events include completion status
  - [ ] Storage persists `toolCallStatus`

**Frontend:**
- [x] Phase 3 complete
  - [ ] `approvalRequest` state removed
  - [ ] `ToolCallMessage` component created
  - [ ] Inline approval display works
  - [ ] Approval buttons functional
  - [ ] No approval dialog present
  - [ ] `detectToolCallRequest()` reads server status
  - [ ] All frontend tests pass

**System:**
- [x] Phase 4 complete
  - [ ] All tests pass
  - [ ] Documentation updated
  - [ ] No regressions in approval flow

**Quality:**
- [ ] Code is simpler (less LOC, no legacy support)
- [ ] No race conditions
- [ ] Multi-tab consistency maintained
- [ ] Server is single source of truth
- [ ] Client is pure display layer (no checking/validation)
- [ ] Enhanced protocol only (no backwards compatibility burden)
- [ ] Security improved with parameter matching

---

## Rollback Plan

### Per-Phase Rollback

**Phase 1 Rollback:**
1. Restore `core/approval-cache.ts` from git
2. Revert `core/events.ts` changes
3. Restore exports in `core/index.ts`
4. Revert `core/tool-utils.ts` changes

**Phase 2 Rollback:**
1. Remove `toolCallStatus` from types
2. Revert message construction changes
3. Remove SSE event field

**Phase 3 Rollback:**
1. Delete `ToolCallMessage` component
2. Restore `approvalRequest` state
3. Restore dialog handlers
4. Revert message detection

**Phase 4 Rollback:**
1. Revert test changes
2. Revert documentation

### Full Rollback

If entire plan needs rollback:
```bash
git checkout approval -- .
git clean -fd
npm test
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| **Protocol parsing breaks session approvals** | Comprehensive tests for JSON parsing, legacy fallback |
| **Inline display clutters UI** | Collapsible design, clear visual hierarchy |
| **Performance degradation** | Removed client-side scanning, server provides status |
| **Breaking external users** | Approval cache was internal API, document migration |
| **Regression in approval flow** | 26+ test scenarios, integration tests |

---

## Timeline Estimate

| Phase | Time | Dependencies |
|-------|------|--------------||
| Phase 1 | 2-3 hours | None |
| Phase 2 | 2 hours | Phase 1 complete |
| Phase 3 | 2 hours | Phase 2 complete |
| Phase 4 | 2 hours | Phase 3 complete |
| **Total** | **8-9 hours** | Linear progression |

---

## References

- **Architecture Review:** `.docs/plans/2025-11-08/ar-simplified-approval-system.md`
- **Original Plan:** `.docs/plans/2025-11-07/plan-approval-race-condition.md`
- **Requirement:** `.docs/reqs/2025-11-07/req-approval-race-condition.md`
- **Approval Cache:** `core/approval-cache.ts` (to be deleted)
- **Approval Logic:** `core/events.ts`
- **Frontend State:** `web/src/pages/World.update.ts`
- **Message Types:** `web/src/types/index.ts`

---

## Architecture Review Recommendations Incorporated

This plan has been updated based on comprehensive AR feedback:

### ✅ Critical Fixes Applied

1. **Protocol Parsing Order** (Issue #1)
   - Fixed JSON parsing to differentiate outer/inner layers
   - Enhanced protocol detection before legacy fallback
   - Proper error handling for malformed JSON

2. **Approval Response Metadata** (Issue #2)
   - Added `toolCallStatus` update in tool result handler
   - Updates both response message and original request
   - Persists completion status to storage

### ✅ Improvements Incorporated

3. **Required Context Parameter** (Improvement #1)
   - Made context parameter required (not optional)
   - Forces callers to think about execution context
   - Self-documenting API design

### 🚫 Backwards Compatibility Removed

- No legacy text parsing fallback
- No support for old approval formats
- Enhanced JSON protocol REQUIRED
- Breaking change - clearly documented

### 📊 Updated Estimates

- **Phase 1:** 2-3 hours (unchanged)
- **Phase 2:** 2 hours (unchanged)
- **Phase 3:** 2 hours (unchanged)
- **Phase 4:** 2 hours (unchanged)
- **Total:** 8-9 hours (unchanged)

---

## Next Steps

1. ✅ **Architecture Review (AR)** - Complete
2. ✅ **Architecture Plan (AP)** - This document (updated with AR recommendations)
3. ⬜ **Step-by-step (SS)** - Implement Phase 1 with progress tracking
4. ⬜ **Test (TT)** - Run tests after each phase
5. ⬜ **Done & Document (DD)** - Create completion doc after Phase 4
6. ⬜ **Git Commit (GC)** - Commit with clear message
