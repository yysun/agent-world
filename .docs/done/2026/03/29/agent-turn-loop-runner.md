# DD: Explicit Agent Turn Loop Runner

**Date**: 2026-03-29
**Related Requirement**: [req-agent-turn-loop-runner.md](../../../reqs/2026/03/29/req-agent-turn-loop-runner.md)
**Related Plan**: [plan-agent-turn-loop-runner.md](../../../plans/2026/03/29/plan-agent-turn-loop-runner.md)

## Summary

The runtime now exposes an explicit durable agent-turn loop shape instead of relying on fragmented continuation behavior spread across model calls, tool continuation, queue recovery, and message publication. The delivered slice makes turn state and terminal outcome durable, routes direct and continuation model calls through one loop helper, treats `send_message` as a first-class terminal handoff outcome, and keeps queue/restore behavior aligned with persisted turn metadata instead of assistant-text inference.

This DD also includes the CR follow-up fix that closed the per-chat queue-clear regression and tightened the docs to match the actual same-process idempotency guarantee.

## Scope Completed

- Added explicit durable `agentTurn` state and terminal outcome metadata.
- Persisted structured terminal completion metadata on final assistant responses.
- Introduced `runAgentTurnLoop(...)` as the canonical model-call / inspect / retry runtime unit.
- Routed direct-turn and post-tool continuation model-call paths through the loop helper.
- Normalized tool actions into loop-owned categories including `tool_call`, `hitl_request`, `agent_handoff`, and `final_response`.
- Marked successful `send_message` dispatches as terminal `handoff_dispatched` outcomes.
- Preserved durable HITL reconstruction and waiting-state semantics across restore.
- Moved shared persisted single-tool execution into `core/events/tool-action-runtime.ts` for direct, continuation, and restore paths.
- Made queue/restore consume persisted turn lifecycle metadata as the authority for terminality.
- Replaced the global singleton LLM queue with per-world/chat serialization.
- Fixed `clearLLMQueue()` so clearing pending work does not detach an active same-chat queue from the registry.
- Corrected req/plan wording so duplicate-prevention claims match the implemented same-process / ordinary restore-path guarantee.

## Code Review Outcome

### Finding 1: per-chat queue-clear regression

- `clearLLMQueue()` could clear the registry while a same-chat call was still active, allowing a second queue to be created for the same chat.
- Fixed by preserving active queues in the registry and only removing idle queues after clearing pending work.

### Finding 2: docs overstated exactly-once semantics

- The req/plan docs claimed a stronger duplicate-prevention guarantee than the implementation provided.
- Fixed by documenting the real boundary: duplicate-prevention is guaranteed within one running process and ordinary restore/queue re-entry paths, not across hard crashes with a cross-process execution ledger.

## Validation

- `npm test -- --run tests/core/llm-manager-feature-path-logging.test.ts`
- `npm run test:web:e2e:run`
- `npm run test:electron:e2e:run`
- `npm run integration`

## Results

- Web Playwright: `56 passed`, `5 skipped`
- Electron Playwright: `62 passed`
- Integration: `24 passed`

## Primary Files Delivered

- `core/events/agent-turn-loop.ts`
- `core/events/tool-action-runtime.ts`
- `core/events/memory-manager.ts`
- `core/events/orchestrator.ts`
- `core/llm-manager.ts`
- `core/queue-manager.ts`
- `tests/core/events/memory-manager-behavior.test.ts`
- `tests/core/events/orchestrator-chatid-isolation.test.ts`
- `tests/core/queue-manager.test.ts`
- `tests/core/llm-manager-feature-path-logging.test.ts`

## Residual Note

The delivered harness is durable and chat-scoped, but it still does not provide a cross-process execution ledger for exactly-once side effects after a hard process crash. That remains outside the delivered scope and is now documented consistently across the req, plan, and DD artifacts.
