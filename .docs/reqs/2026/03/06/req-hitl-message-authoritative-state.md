# REQ: HITL State Must Be Message-Authoritative

**Last Updated:** 2026-03-06

## Summary
Human-in-the-loop (HITL) state must be derived from chat messages, not from transient event streams or replay envelopes. Pending status, matching, resolution, restoration, and UI-visible prompt state must all come from the authoritative message record for the active chat.

## Problem Statement
HITL behavior currently has residual logic that still depends on events for parts of status calculation, request matching, replay, and resolution flow. That split authority creates drift between runtime state and persisted chat history, especially when a new HITL request is created, the user switches chats, or a message is edited/resubmitted. The result is duplicated fixes, inconsistent pending state, and a higher risk of stale or orphaned HITL prompts.

## Goals
- Make chat messages the single authoritative source for HITL pending/resolved state.
- Remove residual event-authoritative HITL logic from status calculation, matching, restore, and resolve flows.
- Ensure HITL behavior is consistent for new message arrival, chat switching, and message edit/resubmit flows.
- Consolidate HITL state determination so all clients observe the same result for the same chat transcript.
- Preserve existing world/chat scoping guarantees and request identity guarantees.

## Non-Goals
- Redesigning HITL UI presentation.
- Changing the options-only HITL interaction model.
- Introducing a new HITL storage table or dedicated persistence store.
- Changing unrelated non-HITL event contracts unless required to stop HITL state drift.

## Requirements (WHAT)
1. The system MUST treat the message history of the active chat as the authoritative source for HITL state.
2. HITL pending status MUST be computed from messages, not from world events, system-event replay payloads, or other transient runtime-only envelopes.
3. HITL request matching MUST be based on stable message-linked identity, so a HITL request and its resolution can be paired deterministically from chat messages.
4. HITL resolution state MUST be derived from whether the authoritative message history contains a valid corresponding resolution for a given HITL request.
5. Event delivery MAY continue to exist for realtime transport, but events MUST NOT be the source of truth for whether a HITL request is pending, resolved, restorable, or visible after restore.
6. The system MUST expose one authoritative HITL state result per chat so core, server, web, electron, and CLI behavior remains consistent for the same message set.
7. New HITL requests created during normal message processing MUST become visible as pending because of the authoritative message state for that chat, not because of a separate event-only record.
8. When the active chat changes, the system MUST recalculate HITL state from the message history of the newly active chat and MUST NOT leak pending prompts from another chat or world.
9. When a user edits, resubmits, or otherwise replaces a message chain that previously produced HITL requests, the system MUST recompute HITL state from the updated message history and MUST clear orphaned pending prompts that no longer correspond to the authoritative messages.
10. HITL state recomputation for chat switch or message edit MUST NOT require special-case patch logic separate from the main HITL state calculation path.
11. The system MUST remove residual HITL logic that relies on event records as the authoritative basis for status calculation, request matching, restore, replay eligibility, or resolution acceptance.
12. If realtime transport emits a HITL prompt before the full chat snapshot is refreshed, subsequent authoritative message-derived state MUST converge to the same logical request set without duplicating pending prompts.
13. Multiple unresolved HITL requests in one chat MUST be surfaced in deterministic, stable order derived from the authoritative message history for that chat.
14. The system MUST preserve strict world/chat isolation when computing or exposing HITL state.
15. Editing or switching chats MUST NOT silently resolve a HITL request unless the authoritative message history indicates a valid resolution.
16. Existing non-HITL message behavior and non-HITL system events MUST remain backward compatible.
17. All HITL producers, including non-LLM/internal flows such as built-in tool approvals or agent-management confirmations, MUST materialize canonical message records that participate in the same authoritative HITL matching model; there MUST NOT be hidden event-only or runtime-only HITL exceptions. **Exception (execution-context-bound producers):** A HITL producer that is structurally inseparable from a live in-process execution context (e.g., a shell command approval issued mid-tool-execution within the running agent loop) is exempt from message-persistence if and only if: (a) a server restart unconditionally kills the execution context making the prompt irresolvable regardless of message persistence, and (b) the producer is correctly handled for all live-session cases including chained simultaneous requests. Such producers MUST be explicitly documented as execution-context-bound exceptions; they MUST NOT create any additional undocumented runtime-only paths.
18. A restored or reloaded pending HITL prompt MUST remain resolvable after reconnect or process restart by reconstructing the authoritative pending request set from messages, rather than requiring an already-populated in-memory pending map.
19. Chat snapshot, restore, and subscription flows MUST NOT merge runtime-derived pending HITL state and message-derived pending HITL state as competing authorities; message-derived state MUST be authoritative, and any runtime hint MUST only be used to accelerate convergence to that same result.
20. The codebase MUST provide targeted automated coverage for the message-authoritative HITL calculation and the key lifecycle cases called out in this requirement.

## Required Behavioral Cases
1. New message case: when a new assistant/tool message sequence creates a HITL request, the authoritative chat messages for that chat MUST reflect the request as pending until resolved.
2. Switch chat case: when the user activates a different chat, the visible HITL state MUST be recomputed from that chat's messages only.
3. Edit message case: when the user edits or resubmits a message that invalidates or replaces a prior HITL-producing branch, pending HITL state MUST be recomputed from the revised message history and stale prompts MUST disappear.
4. Resolve case: when the user submits a valid HITL response, the authoritative message history and the derived HITL state MUST agree that the original request is no longer pending.

## Non-Functional Requirements
- Determinism: the same chat message set MUST always produce the same HITL state.
- Consistency: all clients and transport paths MUST observe the same pending/resolved result for the same chat.
- Safety: no cross-chat or cross-world HITL leakage.
- Maintainability: HITL state logic SHOULD be centralized enough that future fixes modify one authoritative decision path rather than multiple special cases.

## Acceptance Criteria
- A chat with an unresolved HITL request shows that request as pending based on its messages even if no replay/system event is consulted.
- A chat with a matched HITL resolution does not show that request as pending.
- Switching from chat A to chat B recomputes HITL state from chat B messages and does not carry pending prompts from chat A.
- Editing or resubmitting a message that removes or replaces a HITL-producing branch removes stale pending prompts that are no longer supported by the authoritative message history.
- Realtime event delivery does not create a second logical source of truth for HITL pending state.
- Pending HITL ordering is deterministic for a chat with multiple unresolved requests.
- The same authoritative HITL result is used across restore/load, live updates, and response submission validation paths.
- Built-in/internal HITL prompts are also represented by canonical messages and therefore participate in the same pending/resolved calculation as LLM-originated HITL prompts.
- A pending HITL prompt restored from persisted messages can still be resolved correctly after reconnect or process restart without depending on leftover runtime-only pending state.
- Targeted automated tests cover at least:
  - new message pending-state creation,
  - chat-switch recalculation,
  - edit/resubmit stale-prompt cleanup,
  - request/response matching and resolution from messages.

## Architecture Review Notes (AR)

### High-Priority Issues Found and Resolved
- Split-authority risk: message history and event-derived state can disagree.
  - Resolution: require message history to be the sole authority for HITL pending/resolved state.
- Patchwork risk: fixing chat switch, edit, and live-message cases independently causes behavior drift.
  - Resolution: require one consolidated HITL state calculation path used across those cases.
- Restore/replay risk: event replay can surface prompts that are no longer justified by current messages.
  - Resolution: require replay/restore eligibility to follow authoritative message-derived state only.
- Orphaned-prompt risk: editing or resubmitting messages can leave stale pending HITL requests alive.
  - Resolution: require recomputation from updated message history and removal of prompts unsupported by the revised transcript.
- Validation drift risk: accepting a HITL response against runtime-only state can diverge from persisted chat truth.
  - Resolution: require request matching and resolved/unresolved determination to align with message-linked identity.
- Hidden-exception risk: internal/built-in HITL producers can bypass the message-authoritative model if they only create runtime prompts.
  - Resolution: require every HITL producer to materialize canonical message records that feed the same authoritative matching path.
- Restart-resolution risk: restored prompts can be visible from messages while submission still depends on a missing in-memory pending map.
  - Resolution: require pending request reconstruction from messages to support response acceptance after reconnect/restart; the `/hitl/respond` API endpoint must auto-reconstruct from persisted messages when the runtime map lacks the request entry.

### New Issues Found (AR Pass 2, 2026-03-06 post-codebase review)
- Edit/resubmit recomputation gap: `editUserMessage()` currently clears the runtime HITL map but does not call `replayPendingHitlRequests()` afterward, leaving surviving HITL requests (still present in the trimmed transcript) absent from the runtime map until the next full chat restore. This must be fixed as part of Phase 3.
  - Resolution: call `replayPendingHitlRequests()` after `syncRuntimeAgentMemoryFromStorage()` in `editUserMessage()`, not as special-case patch logic but as the same recomputation path used by chat activation.
- Direct-API-before-restoreChat gap: a client calling `/hitl/respond` immediately after server restart (without a prior `/setChat` call) cannot currently succeed because `submitWorldHitlResponse()` requires an in-memory pending map entry that has not been populated. This violates REQ 18.
  - Resolution: harden the `/hitl/respond` handler to reconstruct pending state from persisted messages for the relevant chatId when the runtime map lacks the target requestId.

### Chained HITL Finding (AR Pass 3, 2026-03-06 chained scenario review)
- **Live session — skill approval → shell/script approval:** Both producers use the shared `requestWorldOption()` runtime path. Both requests are registered in the FIFO-ordered pending map simultaneously. Both are visible to the UI and resolve independently. This case is **handled correctly** with no changes needed.
- **After server restart — chained pending scenario:** Skill approval reconstructs from persisted messages ✅. Shell/script approval (`requestShellCommandRiskApproval`) is a runtime-only producer — it does not write a `human_intervention_request` tool-call message to chat history ❌. However, shell approval only occurs while an agent is actively executing a shell command. A server restart kills the execution coroutine unconditionally, making the shell command irresolvable regardless of whether the approval prompt is persisted. This is an execution-context-bound gap, not a standalone state management bug.
  - Resolution: update REQ 17 to add an execution-context-bound exception (done above). Require the shell approval producer to be explicitly documented as the only exempt runtime-only HITL exception. Add a live-session chained regression test to Phase 6.

### Known Constraint
- In-flight HITL across server restart: if the server restarts mid-tool-execution before the assistant tool-call message is persisted, the prompt cannot be recovered from messages. This is an inherent transient gap and does not violate REQ 18, which requires recovery from *persisted* messages. It is not introduced by this change.

### Decision
- HITL state must be message-authoritative, with events limited to transport/notification roles only.

### Tradeoffs
- Message-authoritative model (selected)
  - Pros: deterministic restore behavior, fewer stale prompts, one source of truth, easier regression prevention.
  - Cons: requires stricter identity discipline and consistent message-derived recomputation.
- Event-authoritative or mixed model (rejected)
  - Pros: can appear simpler for immediate UI updates.
  - Cons: introduces state drift, replay ambiguity, and case-by-case fixes for chat switching and message edits.

### AR Exit Condition
- No unresolved high-priority issue remains once HITL pending/resolved state, matching, restoration, and stale-prompt cleanup can all be explained solely from authoritative chat messages.
- The `/hitl/respond` endpoint must be restart-safe (does not require a prior `/setChat` call).
- The edit/resubmit path must call `replayPendingHitlRequests()` after truncation so surviving HITL requests are present in the runtime map without a separate chat reload.
