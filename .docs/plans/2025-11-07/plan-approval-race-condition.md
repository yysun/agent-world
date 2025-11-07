# Architecture Plan: Approval System Refactor

**Created:** 2025-11-07  
**Type:** Architecture Plan (AP)  
**Status:** Ready for Implementation  
**Related Requirement:** `req-approval-race-condition.md`

---

## Overview

This plan implements a **memory-driven approval architecture** to fix race conditions in both frontend (UI) and backend (approval checking). The core principle is: **memory is the single source of truth, events are notifications only**.

### Key Changes

1. **Backend**: Simplify `checkToolApproval()` to only check session-wide approval
2. **Frontend**: Derive approval UI state from memory, not events
3. **Architecture**: Events become audit/logging, not source of truth

---

## Implementation Phases

### ✅ Phase 1: Backend - Simplify Approval Logic

**Goal**: Remove redundant approval checks, keep only session approval, **fix protocol parsing**

**Files to modify**:
- `core/events.ts` - Update `checkToolApproval()`, fix `findSessionApproval()` to parse enhanced protocol
- `core/events.ts` - Deprecate `findRecentDenial()` and `findRecentApproval()`

**⚠️ CRITICAL FIX (AR Finding)**: Current `findSessionApproval()` uses text parsing, but frontend sends JSON protocol. This causes approval flow to break - session approvals are never detected!

**Critical Fixes** (from AR):
- ✅ Add `context` parameter to `checkToolApproval()` signature
- ✅ Pass `workingDirectory` from tool-utils.ts call site
- ✅ Include `workingDirectory` in approval request message creation
- ⚠️ Add security warning for legacy text-based approvals

**Changes**:

```typescript
// core/events.ts - findSessionApproval()

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
 *   content: '{"__type":"tool_result","content":"{\"decision\":\"approve\",\"scope\":\"session\",\"toolName\":\"...\",\"toolArgs\":{...},\"workingDirectory\":\"...\"}"}'  * }
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
        const parsed = JSON.parse(msg.content);
        if (parsed.__type === 'tool_result' && parsed.content) {
          const result = JSON.parse(parsed.content);
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
        }
      } catch (e) {
        // Not JSON or malformed, continue to fallback
      }
    }
    
    // Fallback: Legacy text parsing (backwards compatibility)
    if (msg.content && typeof msg.content === 'string') {
      const content = msg.content.toLowerCase();
      if ((content.includes('approve') && content.includes(toolName.toLowerCase()) && content.includes('session')) ||
          (content.includes(`approve_session`) && content.includes(toolName.toLowerCase()))) {
        
        // ⚠️ Security warning: Legacy approvals don't check parameters
        loggerMemory.warn('Using legacy text-based approval (no parameter/directory check)', {
          toolName,
          security: 'UNSCOPED - all parameters and directories allowed for this tool'
        });
        
        return { decision: 'approve', scope: 'session', toolName };
      }
    }
  }
  return undefined;
}

// core/events.ts - checkToolApproval()

/**
 * Check if a specific tool requires approval based on message history
 * Simplified: Only checks for session-wide approval, not one-time or denials
 * 
 * Logic:
 * 1. Search for session approval → Execute immediately
 * 2. No session approval → Request approval
 * 
 * @param context - Execution context with workingDirectory (CRITICAL FIX: AR Issue #1)
 */
export async function checkToolApproval(
  world: World,
  toolName: string,
  toolArgs: any,
  message: string,
  messages: AgentMessage[],
  context?: { workingDirectory?: string; [key: string]: any }
): Promise<{
  needsApproval: boolean;
  canExecute: boolean;
  approvalRequest?: any;
  reason?: string;
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

// core/tool-utils.ts - wrapToolWithValidation() updates

/**
 * CRITICAL FIX: Pass context to checkToolApproval (AR Issue #2)
 * and include workingDirectory in approval request message (AR Issue #3)
 */

// In wrapToolWithValidation, update the checkToolApproval call:
const approvalCheck = await checkToolApproval(
  context.world,
  toolName,
  args,
  approvalMessage,
  context.messages,
  { workingDirectory: context.workingDirectory || process.cwd() }  // ✅ Pass context
);

// In approval request message creation, include workingDirectory:
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
        options: approvalCheck.approvalRequest?.options || [...]
      })
    }
  }]
};
```

**Functions to deprecate** (mark with @deprecated, keep for backwards compatibility):

```typescript
/**
 * @deprecated This function is no longer used in approval checking logic.
 * One-time approvals are consumed after tool execution, checking for them is redundant.
 * Kept for backwards compatibility only.
 */
export function findRecentApproval(...) { ... }

/**
 * @deprecated This function is no longer used in approval checking logic.
 * Users should be allowed to change their mind about denials.
 * Kept for backwards compatibility only.
 */
export function findRecentDenial(...) { ... }
```

**Testing**:
- [ ] Update `tests/core/approval-flow-unit.test.ts`:
  - **🆕 CRITICAL**: Add test for JSON protocol parsing in `findSessionApproval()`
  - **🆕 CRITICAL**: Add test for legacy text parsing fallback with security warning
  - **🆕 CRITICAL**: Test `checkToolApproval()` accepts context parameter
  - **🆕 CRITICAL**: Test workingDirectory matching in session approval
  - **🆕 CRITICAL**: Test parameter matching with exact equality
  - Remove tests for `findRecentDenial()` logic in `checkToolApproval()`
  - Remove tests for `findRecentApproval()` logic in `checkToolApproval()`
  - Keep tests for session approval detection
  - Verify approval requests are generated when no session approval exists
  - Verify approval requests include workingDirectory
- [ ] Update `tests/core/approval-message-handling.test.ts`:
  - Simplify to focus on session approval only
  - Remove tests expecting denial/one-time approval behavior

---

### ⬜ Phase 2: Frontend - Extract Approval Detection Logic

**Goal**: Create reusable functions to find pending approvals from message history

**Files to create**:
- `web/src/domain/approval-detection.ts` (new file)

**Implementation**:

```typescript
// web/src/domain/approval-detection.ts

import { Message } from '../types';

export interface ApprovalRequest {
  toolCallId: string;
  toolName: string;
  toolArgs: any;
  message: string;
  options: string[];
  agentId: string;
  workingDirectory?: string; // For session approval matching
}

/**
 * Find the first pending approval in message history
 * Excludes dismissed approvals from the result
 * 
 * Note: Frontend detection only checks for pending requests (unanswered tool_call_id).
 * Session approval matching (name + directory + params) is done by backend.
 * 
 * @param messages - All messages in current chat
 * @param dismissedToolCallIds - Set of toolCallIds user has dismissed
 * @returns First pending approval, or null if none found
 */
export function findPendingApproval(
  messages: Message[],
  dismissedToolCallIds?: Set<string>
): ApprovalRequest | null {
  const dismissed = dismissedToolCallIds || new Set<string>();
  
  for (const msg of messages) {
    // Skip non-approval messages
    if (!msg.isToolCallRequest || !msg.toolCallData) continue;
    
    const toolCallId = msg.toolCallData.toolCallId;
    
    // Skip dismissed approvals
    if (dismissed.has(toolCallId)) continue;
    
    // Check if approval already has a response (tool message with matching tool_call_id)
    const hasResponse = messages.some(m =>
      m.role === 'tool' &&
      m.tool_call_id === toolCallId
    );
    
    if (!hasResponse) {
      // Found pending approval without response
      return {
        toolCallId: msg.toolCallData.toolCallId,
        toolName: msg.toolCallData.toolName,
        toolArgs: msg.toolCallData.toolArgs,
        message: msg.toolCallData.approvalMessage || '',
        options: msg.toolCallData.approvalOptions || ['deny', 'approve_once', 'approve_session'],
        agentId: msg.toolCallData.agentId || msg.sender,
        workingDirectory: msg.toolCallData.workingDirectory
      };
    }
  }
  
  return null;
}

/**
 * Find all pending approvals in message history
 * Useful for showing approval queue UI
 * 
 * @param messages - All messages in current chat
 * @param dismissedToolCallIds - Set of toolCallIds user has dismissed
 * @returns Array of all pending approvals
 */
export function findAllPendingApprovals(
  messages: Message[],
  dismissedToolCallIds?: Set<string>
): ApprovalRequest[] {
  const dismissed = dismissedToolCallIds || new Set<string>();
  const pendingApprovals: ApprovalRequest[] = [];
  
  for (const msg of messages) {
    if (!msg.isToolCallRequest || !msg.toolCallData) continue;
    
    const toolCallId = msg.toolCallData.toolCallId;
    if (dismissed.has(toolCallId)) continue;
    
    const hasResponse = messages.some(m =>
      m.role === 'tool' &&
      m.tool_call_id === toolCallId
    );
    
    if (!hasResponse) {
      pendingApprovals.push({
        toolCallId: msg.toolCallData.toolCallId,
        toolName: msg.toolCallData.toolName,
        toolArgs: msg.toolCallData.toolArgs,
        message: msg.toolCallData.approvalMessage || '',
        options: msg.toolCallData.approvalOptions || ['deny', 'approve_once', 'approve_session'],
        agentId: msg.toolCallData.agentId || msg.sender
      });
    }
  }
  
  return pendingApprovals;
}

/**
 * Count pending approvals (excludes dismissed)
 */
export function countPendingApprovals(
  messages: Message[],
  dismissedToolCallIds?: Set<string>
): number {
  return findAllPendingApprovals(messages, dismissedToolCallIds).length;
}
```

**Testing**:
- [ ] Create `tests/web-domain/approval-detection.test.ts`:
  - Test finding pending approval without responses
  - Test skipping approvals with responses
  - Test skipping dismissed approvals
  - Test finding multiple pending approvals
  - Test edge cases (empty messages, malformed data)

---

### ⬜ Phase 3: Frontend - Update State Management

**Goal**: Add dismissed approvals tracking to state, update `initWorld()` to read from memory

**Files to modify**:
- `web/src/pages/World.update.ts` - Update state interface and `initWorld()`

**Changes**:

```typescript
// web/src/pages/World.update.ts

import { findPendingApproval } from '../domain/approval-detection.js';

// Update state interface
interface WorldComponentState {
  // ... existing fields ...
  approvalRequest: ApprovalRequest | null;
  dismissedApprovals: Set<string>; // NEW: Track dismissed toolCallIds
}

// Update initWorld() - check memory for pending approvals
async function* initWorld(state: WorldComponentState, name: string, chatId?: string) {
  // ... existing world loading logic ...
  
  const world = await api.getWorld(worldName);
  
  // ... build messages from agent memories ...
  const messages = deduplicateMessages([...rawMessages], agents);
  
  // NEW: Always check for pending approvals in memory
  const pendingApproval = findPendingApproval(messages, state.dismissedApprovals);
  
  yield {
    ...state,
    world,
    messages,
    approvalRequest: pendingApproval, // Set from memory, not event
    dismissedApprovals: new Set(), // Reset dismissed on chat load
    loading: false
  };
}
```

**Testing**:
- [ ] Update `tests/web/World.test.ts`:
  - Test `initWorld()` detects pending approval from memory
  - Test `initWorld()` returns null when approval has response
  - Test dismissed approvals are reset on chat load

---

### ⬜ Phase 4: Frontend - Update Message Event Handler

**Goal**: Re-check pending approvals after new messages arrive via SSE, **with performance optimization**

**Files to modify**:
- `web/src/pages/World.update.ts` - Update `handleMessageEvent()`

**⚠️ Performance Optimization (AR Finding)**: Avoid O(n²) complexity by only scanning when approval-relevant messages arrive

**Changes**:

```typescript
// web/src/pages/World.update.ts

const handleMessageEvent = async (state: WorldComponentState, data: any) => {
  // ... existing message parsing and deduplication logic ...
  
  const newMessage = createMessageFromSSE(data);
  const newMessages = [...state.messages, newMessage];
  
  // Incremental approval detection - only scan when relevant message arrives
  let pendingApproval = state.approvalRequest;
  
  const isApprovalRequest = newMessage.isToolCallRequest && newMessage.toolCallData;
  const isApprovalResponse = newMessage.role === 'tool' && newMessage.tool_call_id;
  
  if (isApprovalRequest || isApprovalResponse) {
    // Re-scan only when approval state might have changed
    pendingApproval = findPendingApproval(newMessages, state.dismissedApprovals);
  }
  
  return {
    ...state,
    messages: newMessages,
    approvalRequest: pendingApproval, // Update from memory, not event flag
    needScroll: true
  };
};
```

**Testing**:
- [ ] Test message event triggers approval detection when approval request arrives
- [ ] Test approval dialog appears when approval request arrives
- [ ] Test approval dialog closes when response arrives
- [ ] **🆕 Performance**: Test non-approval messages don't trigger re-scan
- [ ] **🆕 Performance**: Test large message history (1000+ messages) performs well

---

### ⬜ Phase 5: Frontend - Update Dialog Handlers

**Goal**: Support dismissal with tracking, clear dismissed on approval, **include parameters and directory in approval response**

**Files to modify**:
- `web/src/pages/World.update.ts` - Update `hideApprovalRequestDialog()` and `submitApprovalDecision()`

**Changes**:

```typescript
// web/src/pages/World.update.ts

// Update hideApprovalRequestDialog - track dismissal
const hideApprovalRequestDialog = (state: WorldComponentState) => {
  if (!state.approvalRequest) return state;
  
  // Add to dismissed set
  const dismissed = new Set(state.dismissedApprovals);
  dismissed.add(state.approvalRequest.toolCallId);
  
  return {
    ...state,
    approvalRequest: null,
    dismissedApprovals: dismissed
  };
};

// Update submitApprovalDecision - clear from dismissed, include full approval data
const submitApprovalDecision = async (state: WorldComponentState, payload: any) => {
  // ... existing approval submission logic ...
  
  // Create approval response with full matching data
  const enhancedMessage = JSON.stringify({
    __type: 'tool_result',
    tool_call_id: request.toolCallId,
    agentId: request.agentId,
    content: JSON.stringify({
      decision: approvalDecision,
      scope: approvalScope,
      toolName: request.toolName,
      toolArgs: request.toolArgs,         // For session approval matching
      workingDirectory: request.workingDirectory // For session approval matching
    })
  });
  
  // Remove from dismissed set (user made decision)
  const dismissed = new Set(state.dismissedApprovals);
  dismissed.delete(payload.toolCallId);
  
  return {
    ...baseState,
    dismissedApprovals: dismissed
  };
};
```

**Testing**:
- [ ] Test dismissing dialog adds to dismissed set
- [ ] Test dismissed approval doesn't reappear in same session
- [ ] Test approving clears from dismissed set
- [ ] Test dismissal persists across message events
- [ ] **🆕** Test approval response includes toolArgs and workingDirectory

---

### ⬜ Phase 6: Frontend - Add Pending Approvals Indicator

**Goal**: Show visual indicator when approvals are dismissed, allow re-opening

**Files to create**:
- `web/src/components/PendingApprovalsIndicator.ts` (new component)

**Files to modify**:
- `web/src/pages/World.view.ts` - Add indicator to chat UI

**Implementation**:

```typescript
// web/src/components/PendingApprovalsIndicator.ts

import { app } from 'apprun';
import { countPendingApprovals } from '../domain/approval-detection.js';

export default function PendingApprovalsIndicator({ messages, dismissedApprovals }) {
  const pendingCount = countPendingApprovals(messages, dismissedApprovals);
  
  if (pendingCount === 0) return null;
  
  return (
    <div class="pending-approvals-indicator">
      <button
        class="btn btn-warning btn-sm"
        $onclick={['show-next-approval']}
        title="Show pending approval requests"
      >
        ⚠️ {pendingCount} Pending Approval{pendingCount > 1 ? 's' : ''}
      </button>
    </div>
  );
}
```

```typescript
// web/src/pages/World.view.ts

import PendingApprovalsIndicator from '../components/PendingApprovalsIndicator.js';

// Add to chat UI (near message input or header)
<div class="chat-controls">
  {PendingApprovalsIndicator({ messages: state.messages, dismissedApprovals: state.dismissedApprovals })}
  {/* ... existing controls ... */}
</div>
```

**Event handler** (in `World.update.ts`):

```typescript
// Show next approval from dismissed list
'show-next-approval': (state) => {
  // Re-scan with empty dismissed set to get first pending
  const pendingApproval = findPendingApproval(state.messages, new Set());
  
  return {
    ...state,
    approvalRequest: pendingApproval
    // Don't clear dismissedApprovals - just override display
  };
}
```

**Testing**:
- [ ] Test indicator appears when approval dismissed
- [ ] Test indicator shows correct count
- [ ] Test clicking indicator re-opens approval dialog
- [ ] Test indicator disappears when all approvals resolved

---

### ⬜ Phase 7: Frontend - Simplify SSE Event Handlers (Optional)

**Goal**: Remove approval-specific SSE event handling, convert to logging only

**Files to modify**:
- `web/src/pages/World.update.ts` - Remove `handleMessageToolCalls()` or convert to logging

**Changes**:

```typescript
// web/src/pages/World.update.ts

// BEFORE: Tool calls trigger approval UI
const handleMessageToolCalls = (message: any): void => {
  const toolCalls = message.tool_calls || message.toolCalls;
  
  for (const toolCall of toolCalls) {
    if (toolCall?.function?.name === 'client.requestApproval') {
      // ❌ OLD: Trigger show-approval-request event
      publishEvent('show-approval-request', approvalData);
    }
  }
};

// AFTER: Tool calls are logged only (approval detection happens in handleMessageEvent)
const handleMessageToolCalls = (message: any): void => {
  // Log for audit trail only
  console.log('[Approval Audit] Tool call detected in SSE', {
    toolCalls: message.tool_calls,
    agentId: message.agentId,
    messageId: message.messageId
  });
  
  // UI will detect approval from memory automatically via handleMessageEvent
};
```

**Rationale**:
- Approval detection already happens in `handleMessageEvent()` via `findPendingApproval()`
- No need for duplicate event-based triggering
- Simplifies code and removes race condition source

**Testing**:
- [ ] Test approval dialogs still appear correctly
- [ ] Test no regression in approval flow
- [ ] Verify logging works for audit trail

---

### ⬜ Phase 8: Update Tests

**Goal**: Update existing tests to reflect new architecture, remove obsolete tests

**Files to update**:
- `tests/core/approval-flow-unit.test.ts` - Remove denial/one-time approval tests
- `tests/core/approval-message-handling.test.ts` - Simplify to session approval only
- `tests/integration/approval-flow-ws.test.ts` - Update integration tests

**Changes**:

**Remove from `approval-flow-unit.test.ts`**:
- ❌ Tests for `findRecentDenial()` behavior
- ❌ Tests for `findRecentApproval()` behavior with consumption
- ❌ Tests for time-based expiry (5-minute windows)

**Keep in `approval-flow-unit.test.ts`**:
- ✅ Tests for `findSessionApproval()` detection
- ✅ Tests for `checkToolApproval()` with session approval
- ✅ Tests for `checkToolApproval()` without any approval (request generation)

**Add to `approval-flow-unit.test.ts`**:
- 🆕 Test session approval allows immediate re-execution
- 🆕 Test no session approval triggers request every time
- 🆕 Test approval request generation includes correct metadata

**Testing**:
- [ ] Run `npm test` and verify all approval tests pass
- [ ] Remove obsolete test cases
- [ ] Update test descriptions to reflect new behavior

---

### ⬜ Phase 9: Update Documentation

**Goal**: Document new approval architecture and migration guide

**Files to update**:
- `.docs/done/2025-11-07/approval-architecture-refactor.md` (new)
- `docs/Agent Message Response Flow.md` - Update approval flow diagrams

**Documentation sections**:
1. Architecture overview (memory-driven)
2. Backend changes (simplified approval checking)
3. Frontend changes (memory-based UI state)
4. Migration guide (for custom tool implementations)
5. Testing strategy
6. Performance considerations

**Testing**:
- [ ] Review documentation for completeness
- [ ] Verify all code examples are correct
- [ ] Add diagrams for new approval flow

---

## Success Criteria

### Backend
- [ ] `checkToolApproval()` only checks session approval
- [ ] `findRecentDenial()` and `findRecentApproval()` marked as deprecated
- [ ] All backend tests pass with new logic
- [ ] No regressions in tool execution flow

### Frontend
- [ ] Approval UI state derived from memory, not events
- [ ] Approval dialog appears on page load if pending approval in memory
- [ ] Dialog dismissal tracked with re-open mechanism
- [ ] Pending approvals indicator shows correct count
- [ ] All frontend tests pass

### Architecture
- [ ] Memory is single source of truth (backend + frontend)
- [ ] Events used for audit/logging only
- [ ] No race conditions on reload/dismiss/multi-tab
- [ ] Code is simpler and more maintainable

### Testing
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] Manual testing confirms no regressions
- [ ] Performance is acceptable (< 100ms for approval detection)

---

## Rollback Plan

If issues are discovered:

1. **Backend rollback**: Revert `checkToolApproval()` changes, restore denial/one-time checks
2. **Frontend rollback**: Revert to event-driven approval triggering
3. **Partial rollback**: Keep backend changes, revert frontend (or vice versa)

Each phase is independent and can be rolled back individually.

---

## Estimated Effort

| Phase | Complexity | Time | Risk |
|-------|-----------|------|------|
| Phase 1: Backend logic **+ Protocol Fix** | Medium | **2 hours** | **High** ⚠️ |
| Phase 2: Frontend detection | Low | 1 hour | Low |
| Phase 3: State management | Medium | 1 hour | Medium |
| Phase 4: Message handler **+ Performance** | Medium | **1 hour** | Low |
| Phase 5: Dialog handlers | Low | 30 min | Low |
| Phase 6: Indicator UI | Medium | 1 hour | Low |
| Phase 7: SSE simplification | Low | 30 min | Low |
| Phase 8: Test updates **+ Protocol Tests** | High | **3 hours** | High ⚠️ |
| Phase 9: Documentation | Low | 1 hour | Low |
| **Total** | | **~11 hours** | **High** |

**⚠️ Risk increased to HIGH due to AR findings**:
- Critical protocol mismatch fix required (Phase 1)
- New test coverage needed for JSON parsing (Phase 8)
- Performance optimization added (Phase 4)

---

## Architecture Review Summary (2025-11-07)

### Critical Issues Found

1. **🔴 Protocol Mismatch**: `findSessionApproval()` uses text parsing but frontend sends JSON - **session approvals will never work**
2. **🟡 Missing Protocol Tests**: No test coverage for enhanced string protocol format
3. **🟡 Performance Concern**: O(n²) message scanning on every event - **optimized with incremental detection**
4. **🟠 Code Duplication**: Frontend/backend approval logic duplicated - **acceptable for now, consider API in future**

### Solutions Implemented

- **Phase 1**: Fix `findSessionApproval()` to parse JSON protocol with legacy fallback
- **Phase 4**: Add incremental approval detection (only scan on relevant messages)
- **Phase 8**: Add comprehensive tests for JSON protocol parsing
- **Architecture**: Hybrid approach balances correctness, performance, and simplicity

### Risk Mitigation

- **Before implementation**: Review updated plan and run existing tests to establish baseline
- **During Phase 1**: Run approval tests after every change to catch regressions
- **After Phase 4**: Performance test with 1000+ message history
- **Before Phase 9**: Full integration test with real approval scenarios

---

## Next Steps

1. ✅ **Requirement reviewed**: Memory-driven architecture confirmed
2. ✅ **Plan created**: This document
3. ⬜ **SS (Step-by-step)**: Implement phases with progress tracking
4. ⬜ **TT (Test)**: Run full test suite after each phase
5. ⬜ **DD (Done & Document)**: Create completion documentation
6. ⬜ **GC (Git Commit)**: Commit with clear message describing changes
