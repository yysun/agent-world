# DD: load_skill Duplicate Suppression + Continuation Seeding

**Date:** 2026-02-27  
**Status:** Completed (implementation + targeted verification)  
**Related REQ:** N/A (DF runtime bug fix)  
**Related AP:** N/A (targeted patch)

## Summary

Fixed duplicate `load_skill` execution in the same user run by suppressing repeated identical `load_skill(skill_id)` calls after a successful load.

The first suppression patch covered continuation recursion, but a boundary gap remained because the initial tool execution path runs in `orchestrator` before continuation starts. This follow-up seeds continuation with successfully loaded skill IDs from the initial tool execution so immediate duplicate calls are also suppressed.

## Root Cause

1. Model behavior
- LLM sometimes emitted the same `load_skill` call twice with different `tool_call_id` values but the same `skill_id`.

2. Runtime boundary gap
- First `load_skill` executed in `core/events/orchestrator.ts`.
- Duplicate suppression state lived in `core/events/memory-manager.ts` continuation logic.
- Continuation did not know that `load_skill` had just succeeded in orchestrator, so the immediate second call was still executed.

## Delivered

1. Continuation-run duplicate suppression state
- Added run-scoped tracking of successfully loaded skill IDs in `continueLLMAfterToolExecution`.
- Added cleanup when the continuation run exits.

2. Suppression behavior
- When continuation sees `load_skill` for an already-loaded `skill_id` in the same run, it skips tool execution and continues with a transient system notice.

3. Boundary fix (orchestrator -> continuation)
- Added seed extraction for successful `load_skill` execution in `orchestrator`.
- Passed `preloadedSkillIds` into continuation so immediate duplicate calls are suppressed.

4. Resume-path alignment
- In pending-tool resume flow, when resumed tool is `load_skill` and succeeds, pass seeded `preloadedSkillIds` into continuation.

5. Test coverage
- Added/updated continuation guard tests for:
  - Duplicate suppression within the same continuation run.
  - Immediate duplicate suppression when skill is preloaded before continuation starts.

## Files Updated

- `core/events/memory-manager.ts`
- `core/events/orchestrator.ts`
- `tests/core/events/memory-manager-continuation-guard.test.ts`

## CR Result

- Reviewed current uncommitted change set (`core/activity-tracker.ts`, `core/events/subscribers.ts`, `core/events/memory-manager.ts`, `core/events/orchestrator.ts`, related tests).
- No blocking/high-severity issues found after this patch set.

## Verification Performed

1. `npx tsc --noEmit --project tsconfig.build.json`
2. `npx vitest tests/core/events/memory-manager-continuation-guard.test.ts`
3. `npx vitest tests/core/events/post-stream-title.test.ts tests/core/events/memory-manager-continuation-guard.test.ts`

All listed commands passed.

## Notes

- Existing historical chats still contain prior duplicate entries and are unchanged.
- Validation should be done on a fresh chat after restart/build pickup.
