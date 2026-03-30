# Done: LLM Host-Agnostic Turn Loop

**Date:** 2026-03-29
**Status:** Completed
**Related:** [REQ](../../reqs/2026/03/29/req-llm-host-agnostic-turn-loop.md), [Plan](../../plans/2026/03/29/plan-llm-host-agnostic-turn-loop.md)

## Summary

Completed the first host-agnostic `runTurnLoop(...)` delivery in `packages/llm`, while restoring `core` to a direct runtime/provider ownership boundary instead of continuing the temporary `@agent-world/llm` coupling. This delivery also added a real terminal showcase runner for `runTurnLoop(...)` and aligned the existing package showcase around shared fixtures.

## Delivered

1. **Generic package turn loop**
   - Added `packages/llm/src/turn-loop.ts` with a callback-driven `runTurnLoop(...)`.
   - Kept the loop host-agnostic: no `world`, `agent`, `chat`, transcript-row, or queue-row types are required by the package API.
   - Added package-owned loop control/result contracts such as:
     - `TurnLoopControl`
     - `RunTurnLoopOptions`
     - `RunTurnLoopResult`
   - Kept model invocation flexible:
     - hosts can pass `callModel(...)`
     - or use a package-managed `modelRequest` path that composes existing `generate(...)` / `stream(...)`

2. **Preserved host-owned durability boundaries**
   - The package loop does not own:
     - persistence
     - message queue mutation
     - restore/replay
     - SSE/UI events
     - app-specific handoff semantics
   - Tool execution policy remains callback-owned by the host.
   - The package loop reuses package-native message and response contracts rather than importing anything from `core`.

3. **Core boundary rollback**
   - Restored `core/llm-config.ts` to a core-owned provider configuration module.
   - Removed the temporary package-backed HITL bridge from `core/mcp-server-registry.ts`.
   - Restored core-owned built-in registration for `human_intervention_request`.
   - Removed the temporary `@agent-world/llm` dependency from `core/package.json`.
   - Removed the temporary direct package path override from `core/tsconfig.json`.

4. **Tests updated for the rollback**
   - Added targeted package tests for `runTurnLoop(...)`.
   - Updated core regression coverage to match the restored runtime boundary.
   - Updated workspace-resolution assertions so the root keeps the package mapping while `core` no longer carries a temporary local override.

5. **Showcase additions**
   - Added a real terminal showcase runner for `runTurnLoop(...)`:
     - `tests/e2e/llm-turn-loop-showcase.ts`
   - Added shared showcase fixtures:
     - `tests/e2e/support/llm-showcase-fixtures.ts`
   - Refactored the existing package showcase runner to reuse those fixtures.
   - Added a mocked showcase test that exercises `runTurnLoop(...)`.
   - Added a new script:
     - `npm run test:llm-turn-loop-showcase`

## Scope

- Changed `packages/llm`, `core`, related tests, and showcase runners.
- Did not move Agent World durability, queue, or restore semantics into the package.
- Did not convert `core` to consume the new generic package loop.

## Code Review Outcome

- Completed CR on the package loop, the core rollback, and the new showcase runner.
- No blocking correctness or boundary findings remained after the final pass.

## Verification

Executed and passed:

- `npx vitest run tests/llm/turn-loop.test.ts tests/core/mcp-server-registry.test.ts tests/workspace-package-resolution.test.ts tests/core/llm-config.test.ts`
- `npm run check --workspace=packages/llm`
- `npm run check --workspace=core`
- `npm run integration`
- `npx vitest run tests/llm/showcase.test.ts tests/llm/showcase-config.test.ts tests/llm/turn-loop.test.ts`
- `npm run test:llm-showcase -- --dry-run`
- `npm run test:llm-turn-loop-showcase -- --dry-run`

Observed dry-run showcase outputs:

- `LLM package real showcase`
- `tools=load_skill, read_file, showcase_lookup_release`
- `dry-run=ok`
- `LLM package turn-loop real showcase`
- `tools=load_skill, read_file, showcase_lookup_release`
- `dry-run=ok`

Non-blocking note:

- The new turn-loop showcase was verified in dry-run mode only. A live provider-backed run was not executed in this completion pass.

## Files Delivered

- `packages/llm/src/index.ts`
- `packages/llm/src/turn-loop.ts`
- `core/llm-config.ts`
- `core/mcp-server-registry.ts`
- `core/package.json`
- `core/tsconfig.json`
- `tests/llm/turn-loop.test.ts`
- `tests/llm/showcase.test.ts`
- `tests/core/llm-config.test.ts`
- `tests/core/mcp-server-registry.test.ts`
- `tests/workspace-package-resolution.test.ts`
- `tests/e2e/llm-package-showcase.ts`
- `tests/e2e/llm-turn-loop-showcase.ts`
- `tests/e2e/support/llm-package-showcase-support.ts`
- `tests/e2e/support/llm-showcase-fixtures.ts`
- `package.json`
- `.docs/reqs/2026/03/29/req-llm-host-agnostic-turn-loop.md`
- `.docs/plans/2026/03/29/plan-llm-host-agnostic-turn-loop.md`
- `.docs/done/2026/03/29/llm-host-agnostic-turn-loop.md`

## Remaining Work

- If the repo wants `core` to consume the generic package loop later, that should be a separate follow-on story with an explicit adapter boundary.
- If the repo wants stronger confidence in the real turn-loop showcase, run `npm run test:llm-turn-loop-showcase` against a configured live provider.
