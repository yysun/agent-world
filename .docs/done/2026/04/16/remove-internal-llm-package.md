# Done: Remove Internal LLM Package

**Date:** 2026-04-16  
**Related Requirement:** `.docs/reqs/2026/04/16/req-remove-internal-llm-package.md`  
**Related Plan:** `.docs/plans/2026/04/16/plan-remove-internal-llm-package.md`

## Summary

Completed the migration from the repository-owned `packages/llm` workspace to the external npm package `llm-runtime`.

The final state is a single runtime boundary:

- `llm-runtime` owns provider/model execution, runtime orchestration, and runtime-side recovery behavior.
- Agent World `core/` keeps host concerns only: queue ownership, persistence, SSE/event publication, and chat/world-specific side effects.
- The deleted internal package is no longer part of the workspace, package exports, tests, or Electron dependency wiring.

## Implemented Changes

### Workspace and Dependency Boundary

- Removed `packages/llm` from the root workspace list.
- Removed the root `./llm` package export.
- Removed root build/check/test script wiring that referenced `packages/llm`.
- Added `llm-runtime@^0.3.0` as the runtime dependency used by the repo.
- Removed local `@agent-world/llm` workspace wiring from Electron.
- Removed the root TypeScript path mapping for `@agent-world/llm`.
- Cleaned root and Electron lockfiles so live metadata no longer points at the deleted workspace package.

### Core Runtime Migration

- Deleted `core/llm-manager.ts`.
- Deleted `core/llm-config.ts`.
- Deleted direct provider runtime files that previously kept provider execution in-repo:
  - `core/openai-direct.ts`
  - `core/anthropic-direct.ts`
  - `core/google-direct.ts`
- Added `core/llm-runtime.ts` as the host integration seam for `llm-runtime`.
- Rewired `core/index.ts`, CLI/server startup, event-loop code, and runtime consumers to use the new seam.
- Updated the agent turn loop to call `llm-runtime` through the new host boundary while preserving Agent World message/event semantics.

### Tests and Showcase Removal

- Removed `tests/llm/**`.
- Removed package-specific showcase and package-resolution coverage.
- Removed LLM package showcase e2e runners and related support fixtures.
- Removed internal-package-facing core tests that only existed for deleted runtime/provider modules.

### CR Fixes Landed During Review

Two blocking issues surfaced during code review and were fixed before documenting completion:

1. `core/llm-runtime.ts` queue cancellation and timeout handling

- Fixed a bug where chat cancellation could mark queued calls as canceled without rejecting them.
- Fixed timeout handling so queue timeouts reject deterministically even if the provider path ignores abort signals.
- Added focused regression coverage in `tests/core/llm-runtime-queue.test.ts`.

2. `electron/package-lock.json`

- Fixed a broken Electron lockfile state caused by manual cleanup.
- Regenerated the Electron lockfile from `electron/package.json` so it is valid JSON and aligned with the manifest again.

## Validation

The following validations were completed successfully during the migration and final CR cleanup:

- `npm run check`
- `npm run integration`
- `./node_modules/.bin/vitest run tests/core/llm-runtime-queue.test.ts`

Additional review validation confirmed:

- the repo no longer has live source/package wiring to `packages/llm`
- the Electron dependency boundary no longer points to `file:../packages/llm`
- the focused queue regression passes cleanly under the default NVM alias on this machine

## Final Outcome Against Requirement

- Internal workspace package ownership removed: complete.
- External `llm-runtime` dependency adopted: complete.
- Internal package test and showcase surface removed: complete.
- Core-side duplicated runtime/config/provider ownership removed: complete.
- Agent World runtime path preserved through the new boundary: complete.
- Tool/runtime retry ownership consolidated away from the deleted internal package boundary: complete at the repository integration layer.

## Notes

- Historical req/plan/done documents still mention prior `packages/llm` work by design; they were not treated as active workflow blockers.
- The default `nvm` alias on this machine currently resolves to Node `v22.22.0`, so the final validation runs were executed under that runtime.