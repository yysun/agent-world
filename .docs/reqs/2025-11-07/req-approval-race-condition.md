# Requirement: Approval System Refactor

**Created:** 2025-11-07  
**Type:** Architecture Requirement  
**Status:** Approved with Conditions  
**Related Plan:** `.docs/plans/2025-11-07/plan-approval-race-condition.md`

---

## Problem Statement

### Frontend Race Conditions

The web frontend uses dual data sources (HTTP pulled agent memories + SSE pushed events), creating **three critical race conditions**:

1. **Race #1 - Page Load/Reload**: Approval requests in memory don't trigger UI on page load (only SSE events do)
2. **Race #2 - Dialog Dismissal**: User cannot re-open dismissed approval dialog (no UI mechanism)
3. **Race #3 - Multi-Tab**: Tabs have conflicting approval states for same backend memory

**Root Cause**: SSE events **trigger** UI, but memory is **source of truth** → no synchronization

### Backend Redundant Logic

The backend `checkToolApproval()` searches for **three types** of historical approvals:

1. **Session approval** (always) → Execute immediately
2. **Recent denial** (within 5 minutes) → Block execution  
3. **Recent one-time approval** (within 5 minutes) → Execute immediately

**Problems**:
- ❌ One-time approvals are already consumed → redundant checking
- ❌ Denial check prevents re-asking even if context changed
- ❌ Arbitrary 5-minute time windows add complexity
- ❌ Multiple message history scans (performance)

---

## Architectural Solution

### Memory-Driven Architecture ✅ **SELECTED**

**Core Principle**: Memory is single source of truth, events are notifications only

**Frontend Changes**:
- Derive approval UI state from agent memory (not SSE events)
- Allow dialog dismissal with "pending approvals" indicator
- Re-check memory on every message event (with performance optimization)
- Self-healing: UI always reflects current memory state

**Backend Simplification**:
- Only check for session-wide approval (name + directory + parameters)
- Remove redundant checks: recent denials, one-time approvals
- Single message history scan (performance)
- Enhanced protocol parsing: JSON format with legacy text fallback

**Session Approval Matching Rules** (frontend + backend):
- **Tool name** - Must match exactly (case-insensitive)
- **Working directory** - Must match if provided in approval
- **Parameters** - Must match exactly (deep equality check)
- No risk assessment in code - user decides what to approve

**Benefits**:
- ✅ Fixes ALL race conditions (load, dismiss, multi-tab)
- ✅ Persistence (survives reload, reconnect, server restart)
- ✅ Consistency (single source of truth)
- ✅ Simplicity (no event ↔ memory synchronization)
- ✅ Better UX (dismiss with re-open mechanism)
- ✅ Performance optimized (incremental detection)

---

## Architecture Review (AR) - Final Assessment

**Date:** 2025-11-07  
**Status:** ✅ **APPROVED with conditions**

### Critical Issues & Fixes

#### 🔴 Issue #1: Missing Context Parameter
**Problem**: Phase 1 code references `context?.workingDirectory` but `checkToolApproval()` doesn't accept context parameter.

**Fix**: Add context parameter to function signature:
```typescript
export async function checkToolApproval(
  world: World,
  toolName: string,
  toolArgs: any,
  message: string,
  messages: AgentMessage[],
  context?: { workingDirectory?: string; [key: string]: any }  // ✅ Add
)
```

#### 🟡 Issue #2: Missing workingDirectory in Call Site
**Problem**: `tool-utils.ts` calls `checkToolApproval()` without passing working directory context.

**Fix**: Pass context with working directory:
```typescript
const approvalCheck = await checkToolApproval(
  context.world,
  toolName,
  args,
  approvalMessage,
  context.messages,
  { workingDirectory: context.workingDirectory || process.cwd() }  // ✅ Pass
);
```

#### 🟡 Issue #3: Missing workingDirectory in Approval Request
**Problem**: Frontend extracts `workingDirectory` from `toolCallData`, but this field isn't populated when approval request is created.

**Fix**: Include in approval request message creation:
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
          workingDirectory: context?.workingDirectory || process.cwd()  // ✅ Add
        },
        message: approvalMessage,
        options: approvalCheck.approvalRequest?.options || [...]
      })
    }
  }]
};
```

#### 🟠 Issue #4: Legacy Text Fallback Security Warning
**Problem**: Legacy text parsing doesn't check parameters → security risk for blanket approvals.

**Fix**: Add security warning:
```typescript
// Legacy fallback with warning
if (content.includes('approve') && content.includes(toolName) && content.includes('session')) {
  loggerMemory.warn('Using legacy text-based approval (no parameter/directory check)', {
    toolName,
    security: 'UNSCOPED - all parameters and directories allowed for this tool'
  });
  return { decision: 'approve', scope: 'session', toolName };
}
```

### Strengths

1. **Memory-Driven Design** - Single source of truth eliminates race conditions
2. **Performance Optimized** - Incremental detection avoids O(n²)
3. **Security Improved** - Parameter-scoped session approvals
4. **User Experience** - Dismissal with re-open mechanism
5. **Test Coverage** - Comprehensive unit tests (26 scenarios)

### Conditions for Approval

**Must Fix** (before Phase 1 implementation):
- ✅ Add `context` parameter to `checkToolApproval()` (Issue #1)
- ✅ Pass `workingDirectory` in tool-utils.ts call site (Issue #2)
- ✅ Include `workingDirectory` in approval request message (Issue #3)

**Should Fix** (in Phase 1):
- ⚠️ Add security warning for legacy text approvals (Issue #4)

**Could Enhance** (future):
- 💡 Implement deep equality with normalization
- 💡 Add approval versioning/migration strategy
- 💡 Add monitoring and metrics
- 💡 Batch approval mechanism

### Risk Assessment

| Risk Category | Before Fixes | After Fixes | Mitigation |
|---------------|-------------|-------------|------------|
| Protocol Mismatch | 🔴 Critical | ✅ Fixed | JSON parsing + tests |
| Parameter Security | 🟡 Medium | ✅ Fixed | Scoped approvals |
| Performance | 🟡 Medium | ✅ Fixed | Incremental detection |
| Missing Context | 🔴 Critical | ✅ Fixed | Add context parameter |
| Legacy Approvals | 🟠 Low | ⚠️ Warned | Security log |
| **Overall** | **High** | **Low** | **All critical fixes applied** |

### Approval Decision

**Status:** ✅ **APPROVED with conditions**

**Next Steps**:
1. Update Phase 1 code with context parameter fixes
2. Update tool-utils.ts with workingDirectory handling
3. Add security warning for legacy text parsing
4. Run existing tests to establish baseline
5. Begin Phase 1 implementation with updated code
6. Pass all Phase 8 tests before Phase 9

---

## Implementation Plan

**See**: `.docs/plans/2025-11-07/plan-approval-race-condition.md`

**Summary**:
- **Phase 1**: Backend - Fix protocol parsing + simplify approval logic
- **Phase 2**: Frontend - Extract approval detection logic
- **Phase 3**: Frontend - Update state management
- **Phase 4**: Frontend - Update message event handler (incremental)
- **Phase 5**: Frontend - Update dialog handlers (dismissal support)
- **Phase 6**: Frontend - Add pending approvals indicator
- **Phase 7**: Frontend - Simplify SSE event handlers (optional)
- **Phase 8**: Update tests (26 scenarios)
- **Phase 9**: Update documentation

**Estimated Effort**: ~11 hours  
**Risk**: Medium → Low (after fixes)

---

## References

- **Current Frontend**: `web/src/pages/World.update.ts`
- **Current Backend**: `core/events.ts` (checkToolApproval, findSessionApproval)
- **Tool Execution**: `core/tool-utils.ts` (wrapToolWithValidation)
- **Enhanced Protocol**: JSON format `{"__type":"tool_result","content":"{...}"}`
- **Approval Cache**: `core/approval-cache.ts` (deprecated by memory-driven approach)
