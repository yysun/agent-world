# Done: Shell Child Process Lifecycle Management and Control

**Date**: 2026-02-13  
**Related Requirement**: `/.docs/reqs/2026-02-13/req-shell-process-management.md`  
**Related Plan**: `/.docs/plans/2026-02-13/plan-shell-process-management.md`

## Overview

Implemented canonical shell child-process lifecycle management with execution-ID-based monitoring and control. The delivery adds deterministic process tracking, cancellation, safe deletion constraints, and chat-scoped stop isolation while preserving existing shell output streaming behavior.

## Delivered

- Added new process lifecycle registry module:
  - `core/shell-process-registry.ts`
  - Stable `executionId` for each shell command run
  - Lifecycle states: `queued`, `starting`, `running`, `completed`, `failed`, `canceled`, `timed_out`
  - Validated transition model and terminal-state handling
  - Active process handle tracking + chat-scoped index
  - Monitor/query APIs and status subscription API

- Integrated registry with shell execution runtime:
  - `core/shell-cmd-tool.ts`
  - Each execution now records `executionId` in `CommandExecutionResult`
  - `executeShellCommand` transitions lifecycle through start/run/terminal states
  - Cancel requests from control path are recognized and surfaced as canceled results
  - Existing stream callbacks remain intact (`onStdout`, `onStderr`)

- Added monitor/cancel/delete control surface in shell tool module:
  - `getProcessExecution(executionId)`
  - `listProcessExecutions(options)`
  - `cancelProcessExecution(executionId)`
  - `deleteProcessExecution(executionId)`
  - `subscribeProcessExecutionStatus(listener)`
  - `clearProcessExecutionStateForTests()`

- Updated chat-scoped stop integration:
  - `stopShellCommandsForChat(worldId, chatId)` now uses execution registry chat-scope stop behavior

- Exposed new APIs from public core entry:
  - `core/index.ts` exports added for monitor/cancel/delete/status subscription APIs

## Safety and Semantics

- Cancel is idempotent with explicit outcomes (`cancel_requested`, `already_finished`, `not_found`, `not_cancellable`).
- Delete is safe by default:
  - Blocks active records (`active_process_conflict`)
  - Allows terminal-state deletion only
- Concurrency isolation is preserved via world/chat-scoped execution indexing.

## Tests and Validation

### Added Tests
- `tests/core/shell-process-management.test.ts`
  - execution record creation and completed transition
  - cancel by execution ID + repeated cancel idempotency
  - delete blocked for active process and allowed post-terminal
  - chat-scoped stop isolation across concurrent executions

### Existing Tests Kept Passing
- `tests/core/shell-cmd-tool.test.ts`
- `tests/core/shell-cmd-integration.test.ts`

### Full Suite
- `npm test` passed:
  - **65 test files**
  - **710 tests**

## Notes

- Retention policy for this delivery remains in-memory with bounded history.
- Persisted process-history schema changes were intentionally deferred per optional Phase 5 policy decision.
