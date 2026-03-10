# Requirement: Chat Title Idle-Only Trigger

**Date**: 2026-03-10  
**Type**: Reliability Simplification  
**Status**: ✅ Implemented

## Overview

Simplify chat title generation by removing the human-message debounce trigger and keeping title generation exclusively on chat-scoped idle activity events.

## Goals

- Reduce race and timing complexity in title generation.
- Make title-generation timing easier to reason about and test.
- Preserve chat-scoped correctness and default-title safety.
- Keep generated titles limited to chats that have actually reached idle state.

## Functional Requirements

- **REQ-1 (Single Trigger Path)**: Automatic chat title generation must be triggered only by a chat-scoped `idle` activity event with `pendingOperations = 0`.
- **REQ-2 (No Human Debounce Path)**: Human message persistence and publication paths must not directly schedule or invoke chat title generation.
- **REQ-3 (Chat Scope Preservation)**: Idle-triggered title generation must continue using the captured `chatId` from the triggering activity event through generation, commit, and event publication.
- **REQ-4 (Default-Title Guard)**: Automatic title replacement must continue applying only to chats that are still in default-title state at commit time.
- **REQ-5 (In-Flight Deduplication)**: Repeated idle events for the same world/chat pair must not create concurrent title-generation work for that same pair.
- **REQ-6 (Event Consistency)**: Successful automatic title updates must continue publishing a correctly scoped `chat-title-updated` system event for the affected chat.
- **REQ-7 (Behavioral Clarity)**: If a chat never emits an eligible idle event, the system must not generate a title for that chat.

## Non-Functional Requirements

- **NFR-1 (Race Reduction)**: The title-generation flow must have a single runtime entry point so trigger timing is deterministic and auditable.
- **NFR-2 (Maintainability)**: Title scheduling logic must not be split across independent trigger mechanisms.
- **NFR-3 (Isolation)**: Removing the debounce path must not weaken world-level or chat-level event isolation guarantees.

## Constraints

- Must preserve existing canonical event contracts and chat-scoped event ordering.
- Must remain compatible with existing storage compare-and-set title commit behavior.
- Must not introduce a replacement synthetic trigger path in message persistence logic for this change.

## Out of Scope

- Prompt-quality changes for generated titles.
- User-editable title UX.
- Re-titling chats that already have non-default names.
- Introducing a new synthetic idle emitter or alternate scheduling worker.

## Acceptance Criteria

- [x] A human message alone does not directly schedule title generation.
- [x] An eligible idle event for chat A can generate a title only for chat A.
- [x] Repeated idle events while generation is in flight still produce at most one generation attempt for that world/chat pair.
- [x] Chats without an eligible idle event remain titled `New Chat`.
- [x] Existing compare-and-set commit semantics and `chat-title-updated` event payload shape remain intact.
- [x] Automated tests cover removal of the debounce path and preservation of idle-only title generation.

## Architecture Review Updates (AR)

### Validated Assumptions

- The idle event is the cleanest single boundary for automatic title generation.
- Removing one trigger path reduces timing ambiguity without changing commit-time safety rules.

### Challenged Assumptions

- The current runtime may not emit an eligible idle event for a plain human-only chat flow.
- Responsiveness may feel slightly slower compared with the prior 120ms debounce path.

### Options Considered

1. **Option A: Keep Both Triggers**
   - Pros: earlier title updates for human-only chats.
   - Cons: two independent timing paths remain to reason about and test.
2. **Option B: Idle-Only Trigger (Recommended)**
   - Pros: one entry point, simpler race analysis, clearer behavior.
   - Cons: title generation depends entirely on idle-event availability.
3. **Option C: Message Path Emits Synthetic Idle-Compatible Event**
   - Pros: one downstream generation path with earlier scheduling opportunity.
   - Cons: adds a second upstream trigger mechanism and expands change scope.

### AR Outcome

- Proceed with **Option B**.
- Accept that title generation now depends strictly on eligible idle-event emission for the target chat.
- Accept the explicit behavior change that human-only chats with no agent-processing lifecycle will remain `New Chat` unless some other runtime path emits an eligible idle event for that chat.
