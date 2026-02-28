# Done: Targeted Test Coverage Hardening

**Date:** 2026-02-27  
**Scope:** Replace outdated/simulation tests with production-path tests, expand targeted coverage for high-risk runtime modules, and verify stability.

## Summary

Completed a targeted test hardening pass focused on runtime confidence:
- Removed outdated or low-signal legacy test suites.
- Added/replaced behavioral tests that execute production code paths.
- Improved coverage in previously weak modules (`mcp-server-registry`, `world-storage`, `migration-runner`, `sqlite-schema`, `llm-config`, `tool-bridge-logging`).
- Verified that unit, coverage, and integration suites all pass.

## Completed Work

### Follow-up: API/SSE + SQLite deepening

Added additional targeted suites:
- `tests/api/sse-handler.test.ts`
- `tests/api/messages-nonstreaming-collection.test.ts`
- Expanded `tests/core/storage/sqlite-storage.test.ts` with world/chat/archive/integrity transaction behavior

Coverage config update:
- `vitest.config.ts` now includes selected server contracts in coverage:
  - `server/api.ts`
  - `server/sse-handler.ts`

### Follow-up: Storage Factory + GitHub Import hardening

Expanded targeted storage/import coverage:
- `tests/core/storage/storage-factory.test.ts`
  - Added wrapper error normalization checks for chat/world-chat methods
  - Added wrapper fallback tests for batch/integrity/repair and optional archive/memory helpers
  - Added mocked sqlite branch delegation test coverage (including retry and init-warning paths)
- `tests/core/github-world-import.test.ts`
  - Added `stageGitHubWorldFromShorthand` success-path staging test
  - Added cleanup-on-failure tests for empty source, byte limits, and download failures using mocked fetch/fs

Coverage verification after this follow-up (`npm run test:coverage`):
- `core/storage/github-world-import.ts`: **85.95% lines**, **70.51% branches**
- `core/storage/storage-factory.ts`: **80.62% lines**, **66.15% branches**

### Follow-up: Agent Storage + File Event Storage hardening

Expanded targeted storage/event coverage:
- `tests/core/storage/agent-storage.test.ts`
  - Added advanced integrity/repair/retry/batch/delete-memory behavior tests using an in-memory virtual FS
  - Added coverage for `saveAgentConfig`, `saveAgentMemory`, `archiveAgentMemory`, `loadAgentWithRetry`, `loadAgentsBatch`, and `deleteMemoryByChatId`
- `tests/core/storage/file-event-storage.test.ts`
  - Added filtering/query coverage (`sinceSeq`, `sinceTime`, `types`, order/limit)
  - Added duplicate-ID suppression assertions (single + batch), range/latest-seq coverage, and delete/compact behaviors
  - Added zero-result and error-path deletion assertions

Coverage verification after this follow-up (`npm run test:coverage`):
- `core/storage/agent-storage.ts`: **88.29% lines**, **59.77% branches**
- `core/storage/eventStorage/fileEventStorage.ts`: **88.68% lines**, **71.55% branches**

### Follow-up: Memory Event Storage + SQLite branch deepening

Expanded targeted runtime storage coverage:
- `tests/core/storage/memory-event-storage.test.ts` (new)
  - Added direct behavioral tests for sequence assignment, duplicate suppression, deep-clone guarantees, filtering/order/limit behavior, range queries, world/chat deletions, stats helpers, and clear/factory behavior.
- `tests/core/storage/sqlite-storage.test.ts` (expanded)
  - Added behavioral tests for `saveAgent`/`deleteAgent`/`listAgents`, batch helpers (`saveAgentsBatch`/`loadAgentsBatch`), delete helpers (`deleteMemoryByChatId`/`deleteChatData`), `repairData` fallback, `close` wrapper, `updateChatData` description branch, `validateIntegrity` catch path, migration-path fallback branch, and context-wrapper creation.

Coverage verification after this follow-up (`npm run test:coverage`):
- `core/storage/eventStorage/memoryEventStorage.ts`: **97.89% lines**, **83.60% branches**
- `core/storage/sqlite-storage.ts`: **100.00% lines**, **68.18% branches**

### Follow-up: API Contracts + Memory Manager deepening

Expanded high-value runtime behavior coverage:
- `tests/api/world-mcp-routes.test.ts` (new)
  - Added route-level coverage for world bootstrap/list/create conflict/patch filtering/delete failure/export contracts.
  - Added MCP route coverage for server listing, restart not-found/failure branches, and health failure fallback payload.
- `tests/api/chat-agent-management-routes.test.ts` (new)
  - Added route-level coverage for world middleware 404 contract, agent create/update/delete/memory-clear branches, message stop/edit/delete branches, HITL response validation/success, and chat list/create/delete contracts.
- `tests/core/events/memory-manager-behavior.test.ts` (new)
  - Added direct behavior coverage for `saveIncomingMessageToMemory`, `resetLLMCallCountIfNeeded`, plain-text tool intent fallback parsing, missing-tool/parse-error continuation branches, and `resumePendingToolCallsForChat`.

Coverage verification after this follow-up (`npm run test:coverage`):
- `server/api.ts`: **62.97% lines**, **43.87% branches**
- `core/events/memory-manager.ts`: **76.51% lines**, **58.29% branches**

### 1) Outdated test cleanup

Removed legacy/outdated suites:
- `tests/api/chat-endpoint.test.ts`
- `tests/api/timestamp-protection.test.ts`
- `tests/api/world-patch-endpoint.test.ts`
- `tests/core/managers.test.ts`
- `tests/core/mcp/tool-validation.test.ts`
- `tests/core/mcp/type-correction-integration.test.ts`
- `tests/core/storage/sqlite-chat-storage.test.ts_`
- `tests/core/storage/storage-integration.test.ts_`

### 2) Production-path test replacements/additions

Added/updated targeted tests:
- `tests/core/mcp-server-registry.test.ts`
- `tests/core/storage/world-storage.test.ts`
- `tests/core/storage/migration-runner.test.ts`
- `tests/core/storage/sqlite-storage.test.ts`
- `tests/core/storage/sqlite-event-storage.test.ts`
- `tests/core/storage/sqlite-schema.test.ts`
- `tests/core/llm-config.test.ts`
- `tests/core/events/tool-bridge-logging.test.ts`
- `tests/core/storage/storage-factory.test.ts` (expanded)
- `tests/core/queue-storage.test.ts` (rewritten to production behavior)
- `tests/integration/ws-integration.test.ts` (manual WS flow replaced by deterministic in-process API integration)
- `tests/integration/mcp-config.test.ts` (vitest import alignment)
- `tests/api/case-insensitive-agent-lookup.test.ts` (route-level normalization behavior)
- `tests/api/world-mcp-routes.test.ts` (route-level world/MCP contracts)
- `tests/api/chat-agent-management-routes.test.ts` (route-level chat/agent/message/HITL contracts)
- `tests/core/events/memory-manager-behavior.test.ts` (direct memory-manager behavioral branches)

### 3) Supporting reliability updates

- Added script alias in `package.json`:
  - `test:integration` -> `npm run integration`
- Added Phase 5 quality gate scripts in `package.json`:
  - `coverage:scorecard` -> generates subsystem scorecard artifacts from `coverage-summary.json`
  - `test:coverage:gate` -> `test:coverage` + core threshold gate + scorecard generation
  - `ci:test` -> coverage gate + integration suite gate
- Added CI workflow:
  - `.github/workflows/ci.yml`
  - Runs `npm run ci:test` on push/PR to `main`
  - Publishes coverage scorecard to step summary and uploads coverage artifacts
- Added scorecard + threshold gate script:
  - `scripts/coverage-scorecard.mjs`
  - Enforces core coverage minima (statements/branches/functions/lines)
- Fixed queue completion/failure matching in `core/storage/queue-storage.ts` to consistently use queue `messageId`.

## Verification Executed

Commands run:
1. `npm test`
2. `npm run test:coverage`
3. `npm run integration`
4. `npm run ci:test`

Results:
- Unit suite: **122 files, 1052 tests passed**
- Integration suite: **3 files, 24 tests passed**
- Coverage run: passed
- Phase 5 gate run (`ci:test`): passed

## Coverage Highlights

Notable improvements in this hardening pass:
- `core/mcp-server-registry.ts`: **4.53% -> 65.08%** (lines)
- `core/storage/world-storage.ts`: **2.06% -> 93.98%** (lines)
- `core/storage/migration-runner.ts`: **1.68% -> 82.30%** (lines)
- `core/storage/sqlite-schema.ts`: **24.53% -> 96.22%** (lines)
- `core/storage/sqlite-storage.ts`: **22.61% -> 100.00%** (lines)
- `core/storage/storage-factory.ts`: **17.01% -> 80.62%** (lines)
- `core/storage/github-world-import.ts`: **24.79% -> 85.95%** (lines)
- `core/storage/agent-storage.ts`: **44.68% -> 88.29%** (lines)
- `core/storage/eventStorage/fileEventStorage.ts`: **50.22% -> 88.68%** (lines)
- `core/storage/eventStorage/memoryEventStorage.ts`: **0.00% -> 97.89%** (lines)
- `core/events/memory-manager.ts`: **~51.84% -> 76.51%** (lines)
- `core/llm-config.ts`: **27.90% -> 67.44%** (lines)
- `core/events/tool-bridge-logging.ts`: **18.33% -> 93.33%** (lines)
- `server/sse-handler.ts`: **68.75%** lines (newly included in coverage accounting)
- `server/api.ts`: **30.96% -> 62.97%** (lines)
- Repository overall statements: **60.4% -> 71.52%**

## CR Outcome (Code Review)

Reviewed current uncommitted diff for architecture, quality, maintainability, and runtime risk:
- **No high-priority defects identified** in the reviewed changeset.
- Remaining risk is concentrated outside the newly hardened storage/API/event-management set (notably broader LLM provider paths and large orchestrator-level event flows).

## DD Checkpoint (Final)

`DD` update completed on **2026-02-27**.

Status at this checkpoint:
- High-value targets completed: default runtime storage path hardening, simulation-test replacement for critical modules, API/SSE contract test expansion, and CI/coverage gating (Phase 5).
- Validation state remains green for the latest run set:
  - `npm test`
  - `npm run test:coverage`
  - `npm run integration`
  - `npm run ci:test`
- Remaining open items are governance-only follow-ups from Phase 6 (ownership mapping/policy/triage process), not blocking the hardening objective.
