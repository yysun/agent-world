# Chat ID Leakage / Contamination Protection

**Date**: 2026-02-15  
**Type**: Security Hardening + Isolation Guardrails + Test Coverage Expansion

## Overview

Implemented and validated stricter chat-session isolation to prevent cross-chat event/message contamination across core, API/web, and Electron paths.

The work focused on two protection classes:

1. **Routing/forwarding isolation**: chat-scoped subscriptions and handlers must only process events for the selected chat.
2. **Mutation-path isolation**: send/edit/switch operations must reject invalid chat targets and avoid implicit cross-chat side effects.

## What Changed

### 1) Core safeguards and coverage

- Added coverage to ensure edit flows do not mutate active chat context:
  - `tests/core/chatid-edit-isolation.test.ts`
    - `updateWorld` keeps `currentChatId` when chat field is not updated.
    - `updateAgent` runtime sync does not alter world `currentChatId`.
- Existing switch guard remains covered:
  - `tests/core/restore-chat-validation.test.ts`
    - `restoreChat` returns `null` for missing chats, with no persistence update.

### 2) API/web guardrails and coverage

- Added route-level isolation tests (real router handlers with mocked core):
  - `tests/api/chat-route-isolation.test.ts`
    - `POST /messages` rejects unknown `chatId`.
    - `PUT /messages/:messageId` rejects unknown `chatId`.
    - `POST /setChat/:chatId` keeps current session unchanged when target is invalid.
- Added API guard in edit endpoint:
  - `server/api.ts`
    - `PUT /worlds/:worldName/messages/:messageId` now returns `CHAT_NOT_FOUND` when `chatId` is not in world chat set.
- Added web message-filtering regression tests:
  - `tests/web-domain/world-update-message-filter.test.ts`
    - Ignores mismatched `chatId` events.
    - Ignores unscoped message events while session is selected.
    - Accepts matching `chatId` events.

### 3) Electron isolation hardening and coverage

- Added renderer-side regression test for unscoped system events:
  - `tests/electron/renderer/chat-event-handlers-domain.test.ts`
    - ignores system events without `chatId` when a session is selected.
- Existing electron coverage (already in place) confirms:
  - main-process scoped forwarding does not pass unscoped events into chat-scoped subscriptions,
  - IPC send path rejects invalid chat restoration targets.

## Verification

Executed under Node 22:

- Targeted suites for new/updated protections passed.
- Full repository suite passed:
  - **83 test files, 804 tests passed, 0 failed**.

## Residual Risks / Follow-ups

- API schema-only tests still exist for some endpoints; route-level behavioral tests are preferred for isolation-sensitive paths.
- Additional optional hardening: add one end-to-end stream test asserting SSE payloads remain chat-scoped across full request lifecycle.

## Related Work

- `.docs/done/2026-02-14/core-edit-message-resubmission-and-runtime-targeting.md`
- `.docs/done/2026-02-11/concurrent-chat-sessions.md`
