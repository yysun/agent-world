# REQ: Cross-Client System Status Parity

**Date:** 2026-03-12
**Status:** Draft

---

## Current State

The product design is to use world `system` events as the canonical way to push world and chat runtime status to clients.

That contract is only partially realized today.

- Core emits chat-scoped system events for important runtime states such as chat title updates, queue dispatch failures, LLM timeout warnings/timeouts, retry countdowns, and validation errors.
- The server SSE layer forwards `system` events, but current coverage does not verify the scoped forwarding behavior and the scoped stream behavior is not aligned with the stricter client-side chat-scoping rules.
- The web app ingests system events but hides them from the visible chat surface.
- The CLI subscribes to system events but does not render most of them for users.
- The Electron app has partial system-event status behavior, but users still do not reliably see all selected-chat status events in the main chat experience.

As a result, users do not consistently know what is happening while a turn is running or failing, even though the runtime is already emitting canonical status events.

---

## Summary

System events must become the consistent, user-visible status channel across the API transport layer, the web app, the CLI, and the Electron app.

If the runtime emits a chat-scoped, user-meaningful system event for the active chat, every client must either visibly display it in the appropriate selected-chat status surface or explicitly surface the resulting failure state. The transport contract must preserve strict world/chat isolation so status never leaks across chats.

---

## Problem Statements

1. **The canonical runtime status channel exists, but client visibility is inconsistent.**
   Core emits system events, yet users on different clients receive different levels of visibility.

2. **Web currently ingests system events without a visible selected-chat status surface.**
   Important status updates are converted into hidden internal rows, so users do not see the status text.

3. **CLI currently subscribes to system events but does not render most of them.**
   This breaks the design goal that users should know what is happening in realtime.

4. **Electron still does not reliably expose all selected-chat system statuses in the main chat experience.**
   Existing partial handling is not sufficient if users still cannot see the emitted status events during real usage.

5. **API/SSE transport coverage is not strong enough for the system-event contract.**
   The transport path needs explicit verification that selected-chat streams forward eligible system events and do not admit cross-chat or unscoped leakage into chat-scoped views.

6. **Future status producers will drift unless the cross-client visibility contract is explicit.**
   A status system that works only for a subset of clients or a subset of event shapes will regress again as new status families are added.

---

## Goals

- Make chat-scoped runtime system events visibly useful to users on every supported client.
- Keep `system` events as the canonical pushed status contract rather than adding parallel ad hoc client-specific status channels.
- Preserve explicit world/chat isolation across transport and UI surfaces.
- Support both plain-string and structured-object system-event payloads.
- Preserve existing specialized error handling where applicable while ensuring the user can still see what is happening.
- Add targeted automated coverage for the transport and display behavior on all touched surfaces.

## Non-Goals

- Redesigning unrelated client layouts.
- Replacing the existing `/worlds/:worldName/status` route with system events.
- Turning all system events into persisted chat transcript messages.
- Changing non-status event contracts such as message, tool, or world activity payloads beyond what is required for parity.

---

## Requirements

### R1 — System Events Are the Canonical Pushed User-Visible Status Contract

When core emits a user-meaningful `system` event for a chat, that event MUST remain the canonical pushed status signal delivered to clients.

- Clients MUST NOT require a separate duplicate status channel for the same runtime condition.
- Clients MUST NOT depend on periodic polling of `/worlds/:worldName/status` to surface the same selected-chat runtime state covered by pushed system events.
- Client-specific presentation may differ, but the underlying pushed status source remains the `system` event channel.

### R2 — Selected-Chat Status Visibility Must Exist on Every Client

Every user-facing client surface in scope for this story MUST visibly surface eligible selected-chat system events.

This includes:

- web chat UI,
- CLI interactive mode,
- CLI non-interactive/pipeline mode,
- Electron selected-chat UI.

Eligible system events are:

- explicitly chat scoped,
- associated with the currently active chat for that client surface,
- user-meaningful plain-text or structured status updates.

### R3 — API/SSE Transport Must Preserve Chat Scope for System Events

The server transport path for chat-scoped realtime subscriptions MUST forward system events using the same isolation guarantees expected by clients.

- A chat-scoped subscription MUST receive system events for its own chat.
- A chat-scoped subscription MUST NOT receive system events for a different chat.
- A chat-scoped subscription MUST NOT rely on unscoped system events being forwarded into the selected-chat view.
- Transport behavior for system events must remain consistent with the project’s explicit-chat-id event contract.

### R4 — Both Structured and Plain-Text System Payloads Must Be Displayable

All in-scope clients MUST support the two payload shapes already used by the runtime:

- plain string content,
- structured object content carrying fields such as `eventType`, `message`, `title`, `type`, `failureKind`, or related metadata.

Client display logic MUST derive readable user-facing status text from either shape.

### R5 — Existing Important Status Families Must Be Visible Cross-Client

At minimum, the following currently emitted chat-scoped system-event families MUST be visible on all in-scope clients:

- chat title updates,
- queue dispatch failures,
- LLM timeout warnings,
- LLM terminal timeout failures,
- retry/wait countdown status updates,
- tool or validation failures already emitted as system events,
- other chat-scoped human-readable runtime status events already emitted by core.

### R6 — Error and Recovery Semantics Must Remain User-Visible

Making system status visible MUST NOT remove the client’s ability to expose actionable failures.

- If a client already surfaces a terminal failure state such as an error overlay, that behavior may remain.
- In those cases, the underlying system-event status must still be handled in a way that preserves clear user visibility of what happened.

### R7 — Transcript Semantics Must Remain Intentional

Cross-client parity MUST NOT require treating every system event as a normal conversation message.

- A client may surface system events in a status bar, status banner, transient notice area, or an intentionally scoped failure row.
- Hidden ingestion without visible presentation does not satisfy the requirement.
- Routing status only into diagnostics/log-only surfaces does not satisfy the requirement.
- Any transcript-visible system-event behavior must remain deliberate and consistent with that client’s existing message semantics.

### R8 — Status Visibility Must Clear or Rebind on Context Change

Client-visible system status must remain bound to the active world/chat context.

- Switching chats or worlds MUST clear or replace stale prior status.
- A newer eligible system event for the same selected chat MUST supersede stale earlier status where appropriate.

### R9 — Automated Coverage Is Required

Targeted automated coverage MUST verify:

- core emits the required chat-scoped system status families,
- API/SSE transport forwards scoped system events correctly,
- web visibly surfaces selected-chat system status,
- CLI visibly renders system events in interactive and pipeline modes,
- Electron visibly surfaces selected-chat system status,
- non-selected or unscoped events do not leak into selected-chat views.

---

## Acceptance Criteria

| # | Criterion |
|---|---|
| AC1 | A chat-scoped title update system event becomes visibly apparent to users on web, CLI, and Electron |
| AC2 | A queue-dispatch failure system event becomes visibly apparent to users on web, CLI, and Electron and still preserves existing actionable failure handling |
| AC3 | A plain-text timeout warning or timeout failure system event becomes visibly apparent to users on web, CLI, and Electron |
| AC4 | Retry/wait countdown system events update the visible selected-chat status on web, CLI, and Electron rather than being hidden or silently dropped |
| AC5 | A chat-scoped SSE subscription forwards selected-chat system events and does not leak other-chat or unscoped system events into the selected-chat UI contract |
| AC6 | Switching chats/worlds clears or replaces stale selected-chat system status on web and Electron |
| AC7 | CLI interactive mode prints system events instead of swallowing them behind the status-line flow |
| AC8 | CLI pipeline mode prints system events instead of silently discarding them |
| AC9 | Hidden internal ingestion of selected-chat system events without visible user presentation no longer exists on the web client |
| AC10 | Targeted automated tests cover the transport and client display behavior for the touched surfaces |

---

## Architecture Review Notes (AR)

### High-Priority Issues Found and Resolved

1. **Web render gap:** the web app currently consumes system events but hides them from users.
   - Resolution: require a visible selected-chat status presentation path instead of hidden internal rows.

2. **CLI render gap:** the CLI subscribes to system events but does not render most of them.
   - Resolution: require interactive and pipeline visibility for system events.

3. **Transport parity gap:** the server SSE contract lacks explicit verification for scoped system-event forwarding behavior.
   - Resolution: require scoped system transport coverage and strict selected-chat isolation.

4. **Cross-client drift risk:** Electron has partial status support, but parity is incomplete if users still cannot see emitted statuses consistently.
   - Resolution: require end-to-end selected-chat visibility on Electron as part of the same story rather than treating Electron as already complete.

5. **Coverage gap:** current tests mostly validate ingestion or routing, not actual visible status behavior on every client.
   - Resolution: require targeted coverage at the transport boundary and each client’s display boundary.

### New Issues Found (AR Pass 2, 2026-03-12)

1. **Polling drift risk:** clients could be patched by polling `/status` instead of fixing pushed selected-chat system-event visibility, which would split the status contract across two sources of truth.
   - Resolution: explicitly require pushed system events to remain the selected-chat runtime status contract for this story and reject polling as the primary fix.

2. **Electron App-path verification gap:** helper-level renderer tests can still pass while the user-visible App/status-bar path remains broken.
   - Resolution: require Electron verification at the App/status-bar-visible boundary, not helper logic alone.

### Decision

Keep `system` events as the canonical pushed runtime status contract and bring all in-scope clients into parity on top of that contract.

### AR Exit Condition

No unresolved high-priority issue remains once selected-chat system events are transported with strict scoping and are visibly surfaced for users on web, CLI, and Electron without hidden-drop behavior or cross-chat leakage.
