# Done: LLM Explicit Environment

**Date:** 2026-03-28
**Status:** Completed
**Related:** [REQ](../../reqs/2026/03/28/req-llm-explicit-environment.md), [Plan](../../plans/2026/03/28/plan-llm-explicit-environment.md)

## Summary

Completed the `packages/llm` explicit-environment refactor so the package no longer depends on `createLLMRuntime(...)` as a public or implementation path. The package now centers on per-call `generate(...)` and `stream(...)`, with optional injected `LLMEnvironment` for explicit provider, MCP, and skill dependencies, while keeping convenience caching internal.

## Delivered

1. **Explicit environment model**
   - Added public `LLMEnvironment` and `LLMEnvironmentOptions`.
   - Added `createLLMEnvironment(...)` as the explicit dependency-construction helper.
   - Added `environment?: LLMEnvironment` to per-call generation and tool-resolution APIs.

2. **Removed runtime-constructor compatibility**
   - Removed `createLLMRuntime(...)` from `packages/llm/src/runtime.ts`.
   - Removed constructor-era `LLMRuntime*` types from `packages/llm/src/types.ts`.
   - Kept the public package surface focused on:
     - `createLLMEnvironment(...)`
     - `generate(...)`
     - `stream(...)`
     - `resolveTools(...)`
     - `resolveToolsAsync(...)`

3. **Shared environment-aware orchestration**
   - Refactored provider dispatch, built-in resolution, MCP merge, and skill access to operate through `LLMEnvironment`.
   - Kept the convenience path for plain per-call usage by building cached environments internally when no explicit environment is passed.
   - Preserved reserved built-in name protection and existing package-owned built-in behavior.

4. **Tests and showcase updated**
   - Updated unit tests to cover explicit injected environments and convenience per-call usage.
   - Updated the live Gemini showcase runner to build and reuse one explicit environment for its scenarios.
   - Kept the mocked llm showcase aligned with the same package surface.

## Scope

- Changed `packages/llm` and llm package tests only.
- Did not change `core`.

## Code Review Outcome

- Completed CR on the package-only explicit-environment diff.
- No blocking findings remain in the delivered `packages/llm` changes.

## Verification

Executed and passed:

- `npm run check --workspace=packages/llm`
- `npx vitest run tests/llm/*.test.ts`
- `npm run build --workspace=packages/llm`
- `npm run test:llm-showcase`
- `npm run integration`

Non-blocking note:

- `npm run integration` emitted a `node-cron` sourcemap warning, but the suite passed.

## Files Delivered

- `packages/llm/src/index.ts`
- `packages/llm/src/runtime.ts`
- `packages/llm/src/types.ts`
- `packages/llm/src/llm-config.ts`
- `tests/llm/runtime.test.ts`
- `tests/llm/runtime-provider.test.ts`
- `tests/llm/mcp-runtime.test.ts`
- `tests/llm/showcase.test.ts`
- `tests/e2e/llm-package-showcase.ts`
- `.docs/plans/2026/03/28/plan-llm-explicit-environment.md`
- `.docs/done/2026/03/28/llm-explicit-environment.md`

## Remaining Work

- If the repo wants the same explicit-environment pattern propagated beyond `packages/llm`, that is separate follow-on work.
