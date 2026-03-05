# Done: Tool Runtime Timeout/Retry Reliability and Status

**Date:** 2026-03-05  
**Req:** `.docs/reqs/2026/03/05/req-tool-wait-retry-system-status.md`  
**Plan:** `.docs/plans/2026/03/05/plan-tool-wait-retry-system-status.md`

## Scope Completed

Implemented bounded timeout/retry/backoff/escalation reliability across MCP, queue dispatch, shell, web fetch, LLM queueing, and storage agent-load paths, plus chat-scoped per-second status emissions for active wait/retry windows. Finalized with centralized reliability config to keep timeout/retry defaults and env overrides consistent across boundaries.

## Delivered Changes

1. Shared reliability runtime helper
- Added `core/reliability-runtime.ts` with:
  - deterministic reliability categories (`timeout`, `retry_exhausted`, `transport_error`),
  - reusable wait-status emitter with immediate emission + 1s cadence,
  - elapsed/remaining seconds and retry attempt counters,
  - explicit stop/cleanup lifecycle.
- Added `tests/core/reliability-runtime.test.ts`.

2. MCP reliability
- `core/mcp-server-registry.ts`
  - hard timeout for MCP tool discovery (`listTools`) with deterministic timeout error,
  - bounded reconnect retry policy for MCP execution,
  - retry window status emissions scoped to world/chat,
  - deterministic retry exhaustion error mapping (`MCP_RETRY_EXHAUSTED`, `retry_exhausted`),
  - parity across AI-converted and direct execution paths.
- `tests/core/mcp-server-registry.test.ts` updated with timeout, reconnect, and exhaustion coverage.

3. Queue dispatch reliability
- `core/managers.ts`
  - queue retry status emissions use shared emitter with explicit cleanup,
  - delayed exponential backoff redispatch,
  - max-attempt escalation to `error`,
  - no-responder preflight now routes through retry/error transitions instead of immediate fail-fast error.
- `tests/core/restore-chat-validation.test.ts` updated for status emission and backoff scheduling behavior.

4. Shell timeout enforcement
- `core/shell-cmd-tool.ts`
  - deterministic timeout-driven process termination,
  - process-group/process-tree termination strategy,
  - SIGTERM then SIGKILL fallback after grace period,
  - timeout outcomes mapped to terminal timed-out state.
- `tests/core/shell-cmd-tool.test.ts` and `tests/core/shell-process-management.test.ts` updated.

5. Web fetch timeout mapping
- `core/web-fetch-tool.ts`
  - timeout aborts mapped to deterministic `timeout_error` result category.
- `tests/core/web-fetch-tool.test.ts` updated.

6. LLM timeout and continuation guard coverage
- `tests/core/llm-manager-feature-path-logging.test.ts`
  - warning-before-timeout,
  - warning-then-success,
  - streaming/non-streaming timeout parity.
- `tests/core/events/memory-manager-continuation-guard.test.ts`
  - bounded empty-follow-up retry recovery and exhaustion paths.

7. Storage reliability
- `core/storage/storage-factory.ts`
  - wrapper-level bounded retry fallback for `loadAgent`/`loadAgentWithRetry`,
  - deterministic retry-exhausted outcome logging,
  - no retry-delay penalty for null/not-found results,
  - file/sqlite adapter retry exhaustion logging.
- `tests/core/storage/storage-factory.test.ts` updated.

8. Plan completion updates
- Marked remaining unchecked phases/tasks complete in plan doc.

9. Centralized reliability configuration
- Added `core/reliability-config.ts` to unify timeout/retry/backoff defaults and env parsing for MCP, queue, shell, web fetch, LLM, and storage.
- Rewired runtime boundaries to consume shared config instead of duplicating local constants:
  - `core/mcp-server-registry.ts`
  - `core/managers.ts`
  - `core/shell-cmd-tool.ts`
  - `core/web-fetch-tool.ts`
  - `core/llm-manager.ts`
  - `core/storage/storage-factory.ts`
- Added `tests/core/reliability-config.test.ts` for default/env parsing/clamp behavior.

## CR Findings and Resolutions

1. High: wait-status emitter could leak interval timer when `durationMs=0`.
- Resolution: start interval before initial emit so immediate auto-stop can clear interval deterministically.
- Regression test added: `tests/core/reliability-runtime.test.ts` (`cleans interval immediately when bounded duration is already elapsed`).

No additional high-priority issues remained after the fix.

## Validation Executed

1. Targeted reliability suites
- `npx vitest run tests/core/reliability-runtime.test.ts tests/core/mcp-server-registry.test.ts tests/core/restore-chat-validation.test.ts`
- Result: pass (58 tests).

2. Targeted config + reliability regression suites
- `npx vitest run tests/core/reliability-config.test.ts tests/core/mcp-server-registry.test.ts tests/core/restore-chat-validation.test.ts tests/core/shell-cmd-tool.test.ts tests/core/storage/storage-factory.test.ts tests/core/web-fetch-tool.test.ts tests/core/llm-manager-feature-path-logging.test.ts`
- Result: pass (136 tests).

3. Integration suite (required for runtime transport path changes)
- `npm run integration`
- Result: pass (24 tests).

## Scenario Coverage Status

All requested reliability scenarios are covered by code + tests and mapped in the plan coverage table, including:
- MCP discovery hard timeout,
- MCP execution reconnect/retry and retry exhaustion,
- queue redispatch/backoff/exhaustion/no-responder timeout transitions,
- shell timeout termination,
- web fetch abort timeout,
- LLM warning + hard timeout + empty-follow-up continuation retries,
- storage agent-load retries (wrapper/file/sqlite),
- sqlite busy timeout behavior,
- chat-scoped system status emissions during retry/wait windows.

## Residual Notes

- Existing shell test runs may still emit a non-fatal `MaxListenersExceededWarning` under repeated process lifecycle scenarios; test outcomes remain passing.
