# Requirements: Electron Status Bar System Event Visibility

**Date:** 2026-03-06
**Status:** Draft

---

## Current State

The Electron renderer already receives chat-scoped realtime `system` events, but it does not surface them in the status bar.

- Structured system events such as `chat-title-updated` reach the renderer and are used only for side effects such as refreshing the session list.
- Plain-text system status events such as LLM timeout warnings, hard timeout notifications, and queue retry countdown updates are emitted by core and forwarded to Electron, but they are not shown to the user in the status bar.
- The Electron status bar currently shows only three modes:
  - local transient notifications triggered by renderer actions,
  - working indicators while agents are active,
  - a static `Done` state after completion.

As a result, users cannot see important session-scoped system events in the Electron app even though those events already exist and are delivered in realtime.

---

## Summary

The Electron app status bar must display session-scoped system events for the currently selected chat. This includes title update events, timeout-related events, retry tracking events, and other human-readable system events that are already emitted on the world `system` channel. The status bar must treat system events as status-bar content, not as chat messages, and it must preserve strict chat/world isolation.

For this feature, all status-bar-visible system events must be chat scoped. An event that is not explicitly associated with a chat is not eligible for display in the chat status bar.

---

## Problem Statements

1. **Realtime system events are invisible in the Electron status bar.** Important operational updates are emitted and transported correctly, but users do not see them unless they inspect logs or infer them from later state changes.

2. **Only one system event type currently has renderer behavior.** `chat-title-updated` triggers session refresh, but it still does not become visible status text, and other system-event families have no renderer-facing UX at all.

3. **Timeout and retry tracking are especially opaque.** The core runtime emits chat-scoped timeout warnings, hard timeout notices, and per-second queue retry countdown messages, but the Electron UI does not expose those states in the primary chat status surface.

4. **The current status bar is renderer-local rather than event-aware.** It can display local notifications and working state, but it does not reflect canonical system events emitted from core for the active session.

5. **Future system events would require one-off handling unless generalized.** A design that only special-cases title updates, timeouts, or retries would continue to miss other session-scoped system events.

6. **Implicit or unscoped system events are unsafe for a chat status bar.** A chat status bar cannot safely display events that are world-scoped, ambiguous, or only indirectly associated with the current chat.

---

## Goals

- Make session-scoped realtime system events visible in the Electron app's status bar.
- Ensure the selected chat's status bar reflects important core-originated system status changes such as title updates, timeout warnings, hard timeouts, and retry countdowns.
- Support both structured system-event payloads and plain-text system-event payloads.
- Preserve world/chat scoping guarantees so status text never leaks between chats or worlds.
- Keep the conversation timeline semantics unchanged: system events remain status-bar state, not chat messages.
- Generalize the Electron status-bar behavior so newly added session-scoped system events can appear without requiring bespoke UI plumbing for every event family.

## Non-Goals

- Redesigning the overall Electron layout or replacing the existing working indicator model.
- Converting system events into persisted chat messages or injecting them into the conversation transcript.
- Changing system-event emission semantics in core unless required by a separate story.
- Changing web, CLI, or server status surfaces as part of this story.
- Defining a new logging panel behavior for system events.

---

## Requirements

### R1 — Selected-Chat System Events Must Be Visible in the Status Bar

The Electron status bar MUST display system events that are scoped to the currently selected chat in the currently loaded world.

- The displayed status must update in realtime as matching system events arrive.
- System events for other chats or other worlds MUST NOT appear in the current chat's status bar.
- Unscoped system events MUST NOT leak into a chat-scoped status bar view.

### R1.1 — Status-Bar-Visible System Events Must Be Explicitly Chat Scoped

Any system event that is intended to appear in the Electron chat status bar MUST carry an explicit chat association in its emitted event contract.

- Title-update, timeout, retry-tracking, and similar status-bar-visible system events MUST be emitted with a concrete target chat.
- A world-scoped or otherwise unscoped system event is out of scope for the chat status bar and MUST NOT be displayed there.
- If a future system-event producer is intended for status-bar visibility but does not emit an explicit chat association, that producer MUST be hardened before the event is considered supported by this feature.

### R2 — Both Structured and Plain-Text System Payloads Must Be Supported

The status bar MUST support both of the system-event payload shapes that already exist in the runtime:

- structured content objects, such as payloads carrying `eventType`, `title`, `message`, or related metadata,
- plain string content used for human-readable status updates.

The renderer MUST derive human-readable status-bar text from either shape.

### R3 — Required Event Families

At minimum, the status bar MUST visibly handle the currently emitted session-scoped system-event families below:

- chat title updates, including events equivalent to `chat-title-updated`,
- LLM timeout warning events indicating processing is taking too long,
- terminal LLM timeout events indicating processing timed out,
- queue retry tracking events, including retry reason, attempt progression, and countdown-style updates,
- other session-scoped system events that already include human-readable content.

This requirement is intentionally not limited to a hardcoded allowlist. If a system event is chat-scoped and carries user-meaningful content, the Electron status bar MUST be able to surface it.

### R4 — Title Updates Must Be Visible Without Losing Existing Side Effects

When a title update system event is received for the selected chat, the Electron app MUST continue performing any existing metadata refresh behavior and MUST also show a human-readable title-update status in the status bar.

- The title-update status must identify the new title or otherwise clearly communicate that the chat title changed.
- Session-list refresh behavior for title updates must remain intact.

### R5 — Retry and Timeout Tracking Must Remain Live and Readable

For retry countdowns and timeout-related system events, the status bar MUST show the latest known state for the selected chat while the event stream is active.

- Repeated retry-tracking updates must update the visible status so the user sees current countdown/attempt information rather than stale earlier text.
- Timeout warnings and timeout failures must be surfaced as status-bar-visible events for the affected chat.
- The status bar must not continue showing stale retry or timeout text after the user switches away from the chat or after a newer status supersedes it.

### R6 — Status-Bar Behavior Must Preserve Existing Working/Notification Semantics

Adding system-event visibility MUST NOT break the current Electron status bar's existing responsibilities.

- Renderer-triggered local notifications must still be supported.
- Existing working and completed session states must still be supported when no system-event status is active.
- The UI must have deterministic behavior when local notifications, working state, completion state, and system-event status all compete for the same status-bar surface.

### R7 — System Events Must Not Be Treated as Conversation Messages

Displaying system events in the status bar MUST NOT change chat transcript semantics.

- The conversation message list and display-message counting rules must remain unchanged.
- System-event visibility in the status bar must be a separate presentation concern from message rendering.

### R8 — Future Session-Scoped System Events Must Be Extensible

The Electron renderer MUST expose session-scoped system events through a generalized status-bar path rather than a one-off special case per event type.

- Adding a new human-readable, chat-scoped system event in core should not require inventing a new renderer-only surface outside the status bar just to make it visible.
- Event-specific side effects may still exist when needed, but user-visible status display must not depend on ad hoc branching for every new event family.
- This extensibility applies only to events that are explicitly chat scoped; broader world-scoped system events remain out of scope for the chat status bar unless a separate story defines a different UI surface.

### R9 — Automated Coverage Is Required

Targeted automated coverage MUST verify the status-bar-visible behavior for session-scoped system events in the Electron app.

Coverage must include at least:

- selected-chat title update visibility,
- ignored system events for non-selected chats,
- plain-text timeout status visibility,
- live retry-tracking updates replacing earlier retry text,
- preservation of existing status-bar behavior when no system-event status is active.

---

## Acceptance Criteria

| # | Criterion |
|---|---|
| AC1 | A `chat-title-updated` event for the selected chat becomes visible in the Electron status bar and the session list still refreshes correctly |
| AC2 | A plain-text timeout warning or hard-timeout system event for the selected chat becomes visible in the status bar |
| AC3 | Queue retry tracking events for the selected chat visibly update the status bar with the latest retry state rather than leaving stale earlier retry text |
| AC4 | System events for a different chat or different world do not appear in the active chat's status bar |
| AC5 | Switching chats clears or replaces prior chat-scoped system status so the new chat does not inherit stale text from the previous one |
| AC6 | Existing local notifications and working/done states continue to function when no system-event status is active |
| AC7 | The conversation transcript and message counts remain unchanged by this feature |
| AC8 | Status-bar-visible system events are all explicitly chat scoped; unscoped system events are not shown in the chat status bar |
| AC9 | Targeted automated tests cover the required session-scoped system-event status-bar behavior |

---

## Architecture Review Notes (AR)

### High-Priority Issues Found and Resolved

- **Renderer gap:** system events already reach Electron, but the status bar ignores them.
  - Resolution: require the status bar to surface selected-chat system events as first-class status content.

- **Payload-shape gap:** current runtime emits both structured system payloads and plain strings.
  - Resolution: require the status-bar path to support both shapes so title updates and timeout/retry text are all displayable.

- **Over-specialization risk:** handling only `chat-title-updated` would leave timeout and retry events invisible and would force repeated renderer patchwork for future event types.
  - Resolution: require a generalized session-scoped system-event-to-status-bar path, with title update / timeout / retry as mandatory covered families rather than an exhaustive list.

- **Status collision risk:** the existing status bar already carries local notifications plus working/done state.
  - Resolution: require deterministic coexistence so new system-event visibility does not regress current notification or activity behavior.

- **Leakage risk:** chat-scoped status text could bleed across chats if cached without session isolation.
  - Resolution: require strict selected-world and selected-chat scoping, plus stale-status clearing on chat change or superseding status.

- **Implicit-scope risk:** a producer that relies on world-level or fallback chat context cannot be safely treated as a chat-status-bar event.
  - Resolution: require explicit chat scoping for every status-bar-visible system event; unscoped events are out of scope unless their producer is hardened first.

- **Transcript regression risk:** surfacing system events in the UI could accidentally push them into the chat message timeline.
  - Resolution: explicitly require status-bar-only presentation and preserve existing transcript/message-count behavior.

### New Issues Found (AR Pass 2, 2026-03-06)

- **Scoping contract must be explicit, not assumed.** The currently relevant status-event producers reviewed for this story are already chat scoped, but the requirement previously relied on that as an implementation detail rather than a contract.
  - Resolution: make explicit chat scoping part of the requirement and acceptance criteria for all status-bar-visible system events.
- **Future emitter drift risk.** A future producer could emit a world-scoped system event and accidentally appear eligible for status-bar display if the contract is not explicit.
  - Resolution: declare unscoped events out of scope for the chat status bar and require producer hardening before they are supported.

### Decision

Use the Electron status bar as the user-visible surface for selected-chat system events, with generalized support for chat-scoped structured and plain-text payloads.

### Tradeoffs

- **Generalized status-bar event visibility (selected)**
  - Pros: surfaces existing core events immediately, reduces invisible state, scales to future system events, preserves transcript semantics.
  - Cons: requires clear precedence rules between system events and existing local notifications/working states.

- **Event-type-specific ad hoc handling (rejected)**
  - Pros: smaller initial scope for a single event family.
  - Cons: misses timeout/retry visibility, duplicates logic, and guarantees future drift as new system events are added.

### AR Exit Condition

No unresolved high-priority issue remains once the selected chat's Electron status bar can visibly and safely surface realtime session-scoped system events, including title updates, timeout statuses, and retry tracking updates, without cross-chat leakage, implicit/unscoped event ambiguity, or transcript regressions.