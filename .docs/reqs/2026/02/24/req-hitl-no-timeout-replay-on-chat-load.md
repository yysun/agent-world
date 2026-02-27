# REQ: Remove HITL Timeout/Retry and Replay Blocked Requests on Chat Load

## Summary
HITL requests must no longer expire or auto-retry via timeout logic. If a HITL request remains blocked/pending, loading the related chat must re-fire that pending HITL request event so the frontend can present the user input prompt again.

## Problem Statement
Current HITL behavior can lose user-facing prompt visibility when requests are blocked or UI/session context changes. Timeout and retry behavior also creates ambiguous request lifecycle semantics (expired vs retried vs still pending), which can prevent the user from resolving the original prompt.

## Goals
- Remove timeout-based failure behavior from HITL request lifecycle.
- Remove automatic retry behavior from HITL request lifecycle.
- Ensure blocked/pending HITL requests are recoverable by replaying them when chat is loaded.
- Guarantee frontend can receive and render pending HITL prompts for user input.

## Non-Goals
- Redesigning HITL UI components or visual presentation.
- Changing non-HITL tool execution lifecycles.
- Introducing a new approval model outside existing HITL request/response semantics.
- Persisting pending HITL requests across full process restarts.

## Requirements (WHAT)
1. HITL request handling MUST NOT use timeout to auto-fail, auto-cancel, or auto-complete pending HITL requests.
2. HITL request handling MUST NOT use automatic retry behavior for pending HITL requests.
3. A HITL request that is pending/blocked MUST remain pending until explicitly resolved by a valid user response or explicit cancellation flow.
4. Chat-load behavior MUST check for unresolved HITL requests scoped to the loaded chat context.
5. When unresolved HITL requests exist for the loaded chat context, the system MUST re-fire/replay the corresponding HITL request event(s) to the frontend.
6. Re-fired HITL request events MUST preserve original request identity (at minimum request ID) so frontend resolution maps to the original pending request.
7. Re-fired HITL request events MUST carry sufficient prompt payload for frontend rendering (question/instructions/options and associated metadata already required by existing HITL event contract).
8. Re-fire behavior MUST be idempotent: repeated chat loads MUST NOT create duplicate pending request records.
9. Re-fire behavior MUST NOT mark a pending HITL request as resolved unless a valid HITL response is submitted.
10. Submitting a valid HITL response after replay MUST resolve the original pending request and unblock downstream flow.
11. Existing audit/event history MUST continue to represent pending and resolved HITL request lifecycle accurately.
12. Existing non-HITL chat load behavior MUST remain backward compatible.
13. Replay MUST only include unresolved HITL requests that belong to the loaded world/chat scope; requests outside that scope MUST NOT be replayed.
14. If multiple unresolved HITL requests are replayed for a loaded chat, replay order MUST be deterministic and stable for that unresolved set.
15. The replay MUST be frontend-observable immediately after chat load completion via existing chat-load/realtime delivery paths.

## Non-Functional Requirements
- Reliability: pending HITL prompts are recoverable after navigation/reload/chat switch.
- Consistency: replay behavior is deterministic for a given unresolved request set.
- Safety: no duplicate logical resolutions for a single request ID.

## Acceptance Criteria
- A pending HITL request does not auto-fail after elapsed time.
- A pending HITL request is not auto-retried by timeout/retry policy.
- Loading a chat with unresolved HITL request(s) causes frontend-observable re-fire of those request event(s).
- Replayed HITL request(s) are limited to the loaded world/chat scope only.
- When multiple unresolved HITL requests exist, replay order is deterministic.
- Frontend can render replayed HITL prompt(s) and accept user selection/input using existing HITL response path.
- Resolving a replayed request resolves the original request ID.
- Reloading chat multiple times does not create duplicate pending request records.
- Non-HITL chat loading and messaging behavior remains unchanged.

## Architecture Review Notes (AR)

### High-Priority Issues Found and Resolved
- Ambiguity: whether “re-fire” means creating a new request versus replaying existing pending request.
  - Resolution: require replay of the original pending request identity; no new logical request is created.
- Risk: repeated chat-load replay can produce duplicate persistence/state side effects.
  - Resolution: require idempotent replay that does not duplicate pending records.
- Scope risk: replay could surface pending prompts from a different chat/world context.
  - Resolution: constrain replay to loaded world/chat scope only.
- Ordering risk: multiple unresolved prompts could replay in non-deterministic order and confuse users.
  - Resolution: require stable deterministic replay order for a given unresolved set.
- Durability assumption risk: pending HITL storage is process-local.
  - Resolution: explicitly scope this REQ to in-process pending requests (no restart durability requirement).

### Decision
- Keep pending HITL requests durable until explicit resolution, and use chat-load replay to restore prompt visibility.

### Tradeoffs
- No-timeout/no-retry lifecycle (selected)
  - Pros: clear ownership of resolution state; prevents hidden expiration paths.
  - Cons: requires robust recovery/replay behavior for stuck visibility cases.
- Timeout/retry lifecycle (rejected)
  - Pros: can reduce very old pending prompts automatically.
  - Cons: can lose intended user decision point and create ambiguous state transitions.
