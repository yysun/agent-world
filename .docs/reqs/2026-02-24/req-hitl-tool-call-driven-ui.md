# REQ: HITL UI Driven by Tool Calls (No System-Event Replay Dependency)

## Summary
Move HITL prompt rendering to a tool-call-driven model where frontend clients display HITL UI when they observe `human_intervention_request` tool calls in the live stream, instead of relying on `system` event emission/replay as the primary source for prompt UI.

## Problem Statement
Current HITL UI behavior relies on `hitl-option-request` system events and replay payloads to keep prompts visible across chat switches and reconnects. This creates duplicated delivery paths (tool stream + system event stream), increases coupling, and adds replay-specific logic in API/web flows.

## Goals
- Make tool-call streaming the primary trigger for showing HITL prompt UI.
- Remove frontend dependence on `hitl-option-request` system-event replay for normal prompt display.
- Preserve correctness for pending HITL requests across reconnect/chat switch.
- Keep option validation and world/chat scoping guarantees intact.
- Maintain compatibility for existing non-HITL tool flows.

## Non-Goals
- Redesigning HITL prompt visual UI.
- Re-introducing free-text HITL input mode.
- Changing unrelated world activity/SSE completion behavior.

## Requirements (WHAT)
1. Frontend clients MUST render HITL prompts when a streamed `human_intervention_request` tool call is observed.
2. The prompt shown from tool-call data MUST include stable request identity usable for response submission.
3. The system MUST continue enforcing request validation by `(worldId, requestId, optionId, chatId)` scope.
4. Switching chats or reconnecting MUST preserve visibility of unresolved HITL prompts for the active chat.
5. Recovery of unresolved prompts MUST NOT require replaying prior `system` events to the frontend.
6. API contracts used by web/electron/cli for HITL response submission MUST remain deterministic and backward compatible.
7. Existing non-HITL system events (e.g. `chat-title-updated`, `agent-created`) MUST remain unaffected.
8. If insufficient data exists in streamed tool-call payloads to build a valid HITL prompt, the backend MUST provide a deterministic, non-replay fallback read model for pending HITL prompts.
9. HITL request/response lifecycle MUST remain auditable.

## Non-Functional Requirements
- Prompt rendering SHOULD be idempotent (duplicate stream chunks/events do not duplicate prompt queue entries).
- Chat scope filtering MUST prevent cross-chat HITL prompt leakage.
- Runtime behavior SHOULD be equivalent across web and electron clients.

## Acceptance Criteria
- A newly emitted `human_intervention_request` tool call appears as HITL prompt UI without parsing `hitl-option-request` system events.
- Submitting an option still succeeds using the same server endpoint and validation rules.
- Chat switch/reconnect restores pending HITL prompt visibility through a non-event-replay mechanism.
- Removing/ignoring HITL system-event replay does not regress prompt visibility or submission correctness.
- Non-HITL system-event UX remains unchanged.

## Architecture Review Notes (AR)

### High-Priority Issues Found and Resolved
- Identity gap risk: tool-call payload may not always expose a stable `requestId` required by HITL response API.
  - Resolution: require stable request identity in streamed tool data or provide deterministic backend pending-prompt read model.
- Recovery gap risk: removing replay without replacement can lose pending prompts after reconnect/chat switch.
  - Resolution: require non-replay restoration path for unresolved prompts scoped by active chat.
- Dual-path divergence risk: tool-call and system-event flows can drift and create inconsistent UI.
  - Resolution: declare tool-call stream as primary; keep a single authoritative pending state contract.

### Tradeoffs
- Tool-call-driven UI (selected)
  - Pros: fewer delivery paths, lower coupling to system-event replay semantics.
  - Cons: requires strict guarantees around request identity and reconnect restoration.
- Event replay-driven UI (rejected as primary)
  - Pros: explicit prompt envelopes and simple replay semantics.
  - Cons: extra channel coupling and replay-specific frontend logic.
