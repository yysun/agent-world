# Requirement: Electron Concurrent Chat Sessions

**Date**: 2026-02-11  
**Type**: Feature Enhancement  
**Status**: ✅ Requirements Reviewed (AR Completed)

## 🔍 Architecture Review (AR)

**Review Date**: 2026-02-11  
**Reviewer**: AI Assistant  
**Result**: ✅ **APPROVED WITH REVISIONS** - Proceed with explicit session-context architecture

### Review Summary

The feature is feasible and aligns with product needs, but current runtime behavior still has a world-level mutable chat pointer in critical processing paths. Existing chat-sync safeguards reduce routing errors, but they do not fully guarantee concurrent isolation under overlapping execution.

### Validated Assumptions

- Electron IPC send paths already include `worldId` and `chatId`.
- Realtime payloads can carry canonical chat IDs and are already routed through subscription-level filters.
- Persistence model already stores `chatId` per message/event and can support concurrent sessions without schema redesign.

### Gaps Confirmed During Review

- Core message processing and memory-save paths still rely on `world.currentChatId` in key branches.
- Main process send flow still updates selected chat state before publish.
- Renderer send/busy state remains globally scoped in key controls, not per session.

### Options Considered

1. **Option A: Full explicit `chatId` propagation through core/runtime (Recommended)**  
   Best correctness and long-term maintainability; fully satisfies concurrent-isolation goals.

2. **Option B: Keep global chat pointer and add lock/queue around sends**  
   Lower change volume but does not satisfy true concurrent chat requirements; serializes behavior.

3. **Option C: Duplicate world runtime per chat session**  
   Strong isolation but high complexity/cost; unnecessary for current requirements.

### AR Decision

- Proceed with **Option A**.
- Treat `world.currentChatId` as selection/navigation state only.
- Enforce event-origin `chatId` as authoritative for routing/rendering.

## Overview

Enable users to run and monitor multiple chat sessions concurrently in the Electron app without cross-session interference. A user must be able to send a message in one session, switch to another session, and continue sending/receiving messages independently in each session.

## Goals

- Allow concurrent active chat sessions within the same world.
- Preserve strict session isolation for message context, streaming output, and tool activity.
- Ensure users can switch sessions freely while background activity continues in other sessions.
- Provide predictable, session-scoped UI state for sending, busy indicators, and message updates.

## Functional Requirements

- **REQ-1**: The system must allow a user to send a message to any selected chat session even if one or more other sessions are still processing prior messages.
- **REQ-2**: The system must preserve session context per message so that each response is generated from the correct session history.
- **REQ-3**: Streaming events (start/chunk/end/error) must be associated with and delivered to the correct originating chat session.
- **REQ-4**: Tool activity events (start/progress/result/error) must be associated with and delivered to the correct originating chat session.
- **REQ-5**: Messages and events from one session must not appear in another session’s message timeline.
- **REQ-6**: Switching the selected session in the UI must not cancel, overwrite, or re-route active processing in other sessions.
- **REQ-7**: Session-level send controls must be independent so one session’s in-flight send state does not block sends in other sessions.
- **REQ-8**: Session-level busy/processing indicators must reflect only activity for the relevant session.
- **REQ-9**: Persisted messages and metadata must retain correct chat-session ownership for all concurrently active sessions.
- **REQ-10**: Realtime subscriptions must support multiple simultaneously active session streams without cross-canceling or cross-routing.
- **REQ-11**: If one session encounters an error during processing, other active sessions must continue unaffected.
- **REQ-12**: Deleting or closing one session must not interrupt active processing in other sessions.
- **REQ-13**: Chat-scoped realtime events must include canonical event `chatId`; missing/invalid `chatId` must be rejected for chat-scoped subscriptions.
- **REQ-14**: Runtime processing correctness must not depend on mutable world-level selected chat state.
- **REQ-15**: The system must support at least two concurrent in-flight chat sessions in a single world with no cross-session leakage.

## Non-Functional Requirements

- **NFR-1 (Correctness)**: Concurrent session execution must not leak messages, stream chunks, tool events, or state across sessions.
- **NFR-2 (Reliability)**: Concurrent activity must remain stable during rapid user actions such as fast session switching and repeated sends.
- **NFR-3 (Usability)**: Users must be able to understand which sessions are active and which are idle from clear session-scoped UI signals.
- **NFR-4 (Observability)**: Logs and diagnostics must preserve session identifiers so concurrent activity can be traced accurately.
- **NFR-5 (Migration Safety)**: Existing single-session behavior must remain functionally correct during rollout.

## Constraints

- Must maintain compatibility with existing world, chat, and message persistence behavior.
- Must preserve existing message ordering guarantees within each individual session.
- Must not require users to open multiple app windows to achieve concurrent chat operation.
- Must preserve existing session selection UX while decoupling selection from execution context.

## Out of Scope

- Multi-world concurrent orchestration changes beyond current world/session workflows.
- New UX paradigms for split-screen multi-session chat views.
- Changes to unrelated web or CLI interaction models unless required for shared core correctness.

## Acceptance Criteria

- [ ] A user can send in session A, switch to session B, and send in session B before session A completes.
- [ ] Both session A and session B produce responses tied to their own message histories.
- [ ] Streaming output from session A is never rendered in session B, and vice versa.
- [ ] Tool activity from session A is never rendered in session B, and vice versa.
- [ ] Session switching during in-flight processing does not corrupt response routing or message ownership.
- [ ] Session-scoped send/busy state remains accurate for each active session.
- [ ] Concurrent session activity remains correct after repeated rapid switching and message sends.
- [ ] Error in one session does not block or terminate processing in another active session.
- [ ] Events with missing/invalid `chatId` are blocked for chat-scoped subscriptions and surfaced via diagnostics.
