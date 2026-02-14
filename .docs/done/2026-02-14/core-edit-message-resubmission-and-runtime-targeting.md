# Core Edit-Message Resubmission and Runtime Targeting

**Date**: 2026-02-14  
**Type**: Bug Fix + Architecture Cleanup + Test Hardening

## Overview

Moved edit-message clear+resend behavior fully into core so Electron no longer mutates subscription/runtime state during edit flows. The edit path now deletes from storage, syncs runtime memory, and resubmits from core using the active world runtime when available.

## Root Cause

The resend portion of edit-message was coupled to runtime/session assumptions (including current-chat gating and frontend/main-process subscription refresh behavior) rather than being fully core-owned. In real flows this caused a mismatch: deletion succeeded in storage, but resend was skipped or routed through a non-active runtime path, so users saw message removal without the edited message being re-emitted.

A secondary P2 issue was test reliability: reused in-memory world IDs across tests allowed async/runtime bleed, which could hide regressions by making strict resubmission expectations flaky.

## What Changed

- Core (`core/managers.ts`):
  - Updated `editUserMessage` to be core-managed end-to-end for clear+resend.
  - Removed current-session/current-chat gating checks that incorrectly skipped valid resubmissions.
  - Added runtime memory sync from storage after removal and before resubmission.
  - Resubmission now prefers active subscribed world runtime; if none exists, subscribes local runtime handlers before publishing.

- Subscription runtime tracking (`core/subscription.ts`):
  - Added active subscribed world registry and `getActiveSubscribedWorld(worldId)`.
  - Register/unregister active world runtime during subscription lifecycle and refresh.

- Electron delegation (`electron/main-process/ipc-handlers.ts`, `electron/main.ts`):
  - `message:edit` now directly delegates to core `editUserMessage`.
  - Removed edit-specific main-process subscription refresh/rebind side effects.

- Tests:
  - `tests/electron/main/main-ipc-handlers.test.ts`: verifies pure core delegation with no refresh call.
  - `tests/core/message-edit.test.ts`:
    - restored strict resubmission-success expectations for key edit paths,
    - isolated world state between tests by deleting all worlds in `afterEach`,
    - used unique world IDs in runtime-sensitive cases to prevent cross-test bleed.

## Verification

Executed:

- `npm test -- tests/core/message-edit.test.ts`
- `npm test -- tests/electron/main/main-ipc-handlers.test.ts tests/electron/main/main-ipc-routes.test.ts`

All passed.
