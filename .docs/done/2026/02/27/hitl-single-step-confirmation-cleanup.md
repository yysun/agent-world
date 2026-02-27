# DD: HITL Single-Step Confirmation Cleanup

**Date:** 2026-02-27  
**Status:** Completed (implementation + targeted verification)  
**Related REQ:** `.docs/reqs/2026/02/20/req-hitl-tool.md`  
**Related AP:** `.docs/plans/2026/02/20/plan-hitl-tool.md`

## Summary

Removed the built-in second confirmation phase from `human_intervention_request` so HITL completes after one option selection, aligned clients with this behavior, and cleaned stale modal artifacts.

Also added backward-compatible argument cleanup in validation so legacy callers sending removed confirmation fields do not fail.

## Delivered

1. Core HITL tool behavior and contract cleanup
- Removed the post-selection confirmation prompt stage from `core/hitl-tool.ts`.
- Updated HITL timeout messaging to selection-focused wording.
- Removed `requireConfirmation` and `confirmationMessage` from the HITL tool schema and runtime contract.
- Updated built-in tool description text in `core/mcp-server-registry.ts` to reflect single-step selection.

2. Backward compatibility for legacy callers
- Updated `core/tool-utils.ts` HITL alias normalization to strip removed confirmation fields (`requireConfirmation`, `confirmationMessage`, snake_case/kebab-case variants) before schema validation.
- Kept `prompt -> question` and `default_option -> defaultOption` normalization.

3. Client cleanup (web/cli/electron)
- Confirmed no remaining runtime use of removed HITL confirmation parameters in web, cli, or electron.
- Removed unused Electron `HitlPromptModal` component and barrel export.
- Updated stale web comment wording that still referenced an approval modal path.

4. Test coverage updates
- Updated HITL tool tests for single-step behavior and schema contract validation.
- Added tool-utils coverage for backward-compatible stripping of removed confirmation fields.

## Files Updated

- `core/hitl-tool.ts`
- `core/mcp-server-registry.ts`
- `core/tool-utils.ts`
- `electron/renderer/src/components/index.ts`
- `electron/renderer/src/components/HitlPromptModal.tsx` (deleted)
- `web/src/pages/World.tsx`
- `tests/core/hitl-tool.test.ts`
- `tests/core/tool-utils.test.ts`

## Verification Performed

1. `npx vitest run tests/core/hitl-tool.test.ts`
2. `npx vitest run tests/core/hitl.test.ts`
3. `npx vitest run tests/core/tool-utils.test.ts`
4. `npx vitest run tests/cli/hitl.test.ts`
5. `npx vitest run tests/web-domain/hitl.test.ts`
6. `npx vitest run tests/electron/renderer/chat-event-subscriptions-hitl.test.ts`

All listed test runs passed.

## Notes

- No blocking/high-severity issues were found in CR for this change set.
- Removed confirmation fields are no longer part of the HITL tool schema, but legacy payloads carrying those fields are tolerated by validation and stripped before execution.
