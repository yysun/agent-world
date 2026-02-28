# REQ: HITL UI Driven by Tool Calls (No System-Event Replay Dependency)

**Last Updated:** 2026-02-25

## Summary
Move HITL prompt rendering to a tool-call-driven model where frontend clients display HITL UI when they observe `human_intervention_request` tool calls in the live stream, and reconstruct unresolved HITL prompts from persisted raw tool-call request/response messages when restoring chats.

## Problem Statement
Current HITL UI behavior previously relied on `hitl-option-request` system events and replay payloads to keep prompts visible across chat switches and reconnects. After removing that dependency, unresolved prompt recovery must be guaranteed from persisted raw LLM tool-call request/response messages without introducing a separate HITL persistence store.

## Goals
- Make tool-call streaming the primary trigger for showing HITL prompt UI.
- Remove frontend dependence on `hitl-option-request` system-event replay for normal prompt display.
- Preserve correctness for pending HITL requests across reconnect/chat switch and process restart.
- Keep option validation and world/chat scoping guarantees intact.
- Maintain compatibility for existing non-HITL tool flows.

## Non-Goals
- Redesigning HITL prompt visual UI.
- Re-introducing free-text HITL input mode.
- Changing unrelated world activity/SSE completion behavior.
- Adding a dedicated HITL persistence store/table.

## Requirements (WHAT)
1. Frontend clients MUST render HITL prompts when a streamed `human_intervention_request` tool call is observed.
2. The prompt shown from tool-call data MUST include stable request identity usable for response submission.
3. The system MUST continue enforcing request validation by `(worldId, requestId, optionId, chatId)` scope.
4. Switching chats or reconnecting MUST preserve visibility of unresolved HITL prompts for the active chat.
5. Recovery of unresolved prompts MUST NOT require replaying prior `system` events to the frontend.
6. API contracts used by web/electron/cli for HITL response submission MUST remain deterministic and backward compatible.
7. Existing non-HITL system events (e.g. `chat-title-updated`, `agent-created`) MUST remain unaffected.
8. Raw LLM tool-call request and response messages MUST remain persisted in the existing message storage model (assistant `tool_calls` + tool `tool_call_id` responses).
9. HITL request/response lifecycle MUST remain auditable.
10. After migration validation is complete, the system MUST completely remove HITL-specific `system` event emission, forwarding, replay, and frontend consumption paths (`hitl-option-request`).
11. Post-migration, HITL prompt UI MUST be sourced exclusively from tool-call stream data and persisted raw tool-call messages (for restoration), not from HITL system events.
12. The system MUST NOT introduce a dedicated HITL persistence store/table; restoration MUST derive pending state from existing persisted messages.
13. Pending/resolved determination MUST be computed by pairing persisted assistant HITL tool-call request IDs with persisted tool response `tool_call_id` values.
14. HITL response identity MUST align with tool-call identity (either `requestId === toolCallId` or a deterministic reversible mapping persisted in raw tool payloads).
15. Chat activation/switch APIs MUST return active-chat pending HITL prompts from the same authoritative core snapshot used to restore chat memory so clients can render prompts deterministically without route-local reconstruction logic.

## Non-Functional Requirements
- Prompt rendering SHOULD be idempotent (duplicate stream chunks/events do not duplicate prompt queue entries).
- Chat scope filtering MUST prevent cross-chat HITL prompt leakage.
- Runtime behavior SHOULD be equivalent across web and electron clients.
- Pending reconstruction SHOULD be linear-time over the loaded chat message set.

## Assumptions
- `human_intervention_request` remains the canonical HITL tool name.
- HITL response submission continues using existing server endpoint semantics (`requestId` + `optionId` + optional `chatId`).
- Existing persisted message schema (`assistant.tool_calls` and `tool.tool_call_id`) is available on chat restore.

## Acceptance Criteria
- A newly emitted `human_intervention_request` tool call appears as HITL prompt UI without parsing `hitl-option-request` system events.
- Submitting an option still succeeds using the same server endpoint and validation rules.
- Chat switch/reconnect restores pending HITL prompt visibility by parsing persisted raw tool-call request/response messages.
- Process restart + chat reload restores unresolved HITL prompt visibility from persisted raw messages.
- Removing/ignoring HITL system-event replay does not regress prompt visibility or submission correctness.
- HITL-specific `system` event emission/forwarding/replay code paths are removed from core/server/frontend runtime flow.
- No client code parses `hitl-option-request` system events for prompt rendering after migration.
- Non-HITL system-event UX remains unchanged.
- No dedicated HITL persistence store/table is introduced.

## Architecture Review Notes (AR)

### High-Priority Issues Found and Resolved
- Identity gap risk: tool-call payload may not always expose a stable `requestId` required by HITL response API.
  - Resolution: require stable request identity in streamed/persisted tool data and align response identity with tool-call ID.
- Recovery gap risk: removing replay without replacement can lose pending prompts after reconnect/chat switch.
  - Resolution: require restoration by parsing persisted raw tool-call request/response pairs scoped by active chat.
- Dual-path divergence risk: tool-call and system-event flows can drift and create inconsistent UI.
  - Resolution: declare tool-call stream as primary; keep a single authoritative pending state contract.
- Pairing integrity risk: pending checks can fail if `requestId` and `toolCallId` diverge.
  - Resolution: enforce `requestId === toolCallId` (preferred) or persist deterministic reversible mapping.

### Tradeoffs
- Tool-call-driven UI (selected)
  - Pros: fewer delivery paths, lower coupling to system-event replay semantics.
  - Cons: requires strict guarantees around request identity and reconstruction from persisted raw messages.
- Event replay-driven UI (rejected as primary)
  - Pros: explicit prompt envelopes and simple replay semantics.
  - Cons: extra channel coupling and replay-specific frontend logic.

## SS Notes (Solution Strategy)

- Use streamed tool events for immediate HITL prompt rendering.
- On chat restore, reconstruct unresolved HITL prompts from persisted messages by:
  1) collecting assistant `human_intervention_request` tool calls,
  2) collecting tool-role responses keyed by `tool_call_id`,
  3) rendering requests that have no matched response.
- Keep submission endpoint unchanged externally, but enforce internal identity alignment with tool-call ID for deterministic matching.

### AR Exit Condition
- No unresolved high-priority architecture issue remains when all acceptance criteria above are satisfiable without consuming replayed HITL system events and with deterministic request/response pairing from persisted raw tool-call messages.
