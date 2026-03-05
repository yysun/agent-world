# REQ: Tool Runtime Timeout/Retry Reliability and Status

**Date:** 2026-03-05  
**Last Updated:** 2026-03-05 (implementation + config centralization)  
**Status:** Implemented (verified)

---

## Summary

Enforce bounded waits, retries, and escalation across tool runtime paths (MCP, queue dispatch, shell, web fetch, LLM, and storage), while emitting deterministic user-visible status for chat-scoped waits and using centralized reliability configuration to prevent cross-boundary drift.

---

## Problem

Several runtime paths can stall indefinitely, fail immediately on transient errors, or fail without clear progress visibility. This creates hangs, silent stalls, and poor recovery behavior.

---

## Requirements (WHAT)

1. MCP tool discovery must use a hard timeout and fail fast with a deterministic timeout outcome when exceeded.
2. MCP tool execution must recover from transport-level failures by reconnecting and retrying with bounded attempts.
3. Queued chat message dispatch must retry transient send failures with delayed exponential backoff.
4. Queued chat messages must transition to terminal error after max retry attempts are exhausted.
5. Queue send state must guard `no responder started` conditions via timeout and route through retry/error transitions (not hang forever).
6. Shell command execution must enforce a hard execution time limit, terminate long-running process trees, and mark the result as timed out.
7. Web fetch tool requests must enforce per-request timeout via abort signals to avoid stuck HTTP calls.
8. Per-call LLM processing must enforce a warning threshold (`taking too long`) and a hard timeout threshold.
9. Post-tool LLM continuation that returns empty output must use bounded continuation retries before terminal failure to avoid silent tool-loop stalls.
10. Agent loading from storage must retry with short delay to tolerate transient read/consistency failures.
11. Storage-layer agent loads (file and sqlite wrappers) must use bounded retries with delay between attempts.
12. SQLite configuration must set busy timeout so brief lock contention waits before failing.
13. During chat-scoped waiting/retry windows, runtime must emit deterministic per-second `system` status updates with elapsed time, and remaining time when known.
14. Retry status messages must include attempts used and attempts remaining whenever retries apply.
15. Status emissions must remain world/chat scoped, stop immediately when wait ends, and never leak across worlds/chats.
16. Added reliability controls must preserve existing stream lifecycle ordering (`start -> chunk -> end`, explicit `error`) and maintain parity for streaming and non-streaming paths.
17. If execution context has no resolvable world/chat, runtime must not emit chat-visible status messages for that execution.
18. Timeout/retry defaults and environment overrides for covered boundaries must be managed through a shared reliability config module to keep values consistent and auditable.

---

## Runtime Contract (WHAT)

1. Every timeout/retry-capable boundary must have explicit:
   - timeout duration (where applicable),
   - max attempts,
   - retry delay policy (where retries apply),
   - terminal error mapping.
2. All retry loops must be bounded; unbounded retry is prohibited.
3. Timeout/retry outcomes must be surfaced as deterministic error categories (for example: `timeout`, `retry_exhausted`, `transport_error`).
4. For waits shorter than one second, runtime must still emit an initial status message when status emission is in scope.
5. Remaining time is optional when unknown; elapsed time and retry counters remain required where applicable.

---

## Acceptance Criteria

- Given MCP discovery hangs past timeout, it terminates with timeout outcome and no indefinite pending state.
- Given MCP tool execution encounters transport failure, reconnect/retry occurs until success or bounded exhaustion, then emits terminal failure.
- Given queue dispatch transient failure, redispatch retries occur with delayed exponential backoff and eventually succeed or exhaust.
- Given retries exhaust for queue dispatch, message transitions to error with final retry-exhausted status.
- Given queue `no responder started` condition, send state exits via timeout path and enters retry/error transitions.
- Given shell command exceeds execution limit, process is terminated and result is marked timed out.
- Given web fetch exceeds per-request timeout, request is aborted and surfaced as timeout failure.
- Given LLM call passes warning threshold, runtime emits `taking too long`; given hard threshold exceed, runtime terminates call as timeout.
- Given post-tool continuation returns empty output, continuation retry runs up to bounded limit, then fails deterministically if still empty.
- Given storage/agent load transient failures, retries run with delay and resolve or exhaust deterministically.
- Given sqlite brief lock contention, busy timeout waits before failing; lock spikes no longer fail immediately.
- Given chat-scoped waits/retries, users receive initial status plus per-second updates until wait ends.
- Given concurrent worlds/chats, status and retry state remain isolated per world/chat.
- Given cancellation/abort/success/failure completion, status timers stop with no orphan intervals.

---

## Assumptions

- Existing timeout/retry defaults may be reused initially, but each boundary must be explicitly configured (no implicit infinite waits).
- Existing message persistence and SSE transport remain authoritative.
- Some reconnect attempts may be immediate; remaining-time fields may be unavailable in those phases.

---

## Out of Scope

- New product features unrelated to reliability controls.
- UI-only synthetic progress that is not backed by runtime state transitions.
- Unbounded policy tuning/optimization beyond introducing bounded safe defaults.

---

## AR Findings and Resolutions

1. High: The previously linked 2025-11-03 approval plan is a different concern and does not provide timeout/retry reliability coverage.
   - Resolution: define reliability requirements directly in this REQ and align to a dedicated 2026-03-05 reliability plan.
2. High: Previous REQ covered visibility only, not control behavior for the 12 failure scenarios.
   - Resolution: expand requirements to include bounded timeout/retry/escalation semantics per boundary.
3. High: Queue/LLM/storage/shell/web-fetch reliability paths were missing acceptance criteria.
   - Resolution: add explicit acceptance criteria for each runtime boundary.
4. Medium: Retry semantics risk inconsistency across subsystems.
   - Resolution: require explicit per-boundary contracts (timeout/max attempts/delay/terminal mapping) and deterministic outcomes.
