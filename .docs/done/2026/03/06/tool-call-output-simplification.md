# Done: Tool Call Output Simplification

**Date:** 2026-03-06
**Related:** [REQ](../../reqs/2026/03/06/req-tool-call-output-simplification.md), [Plan](../../plans/2026/03/06/plan-tool-call-output-simplification.md)

## Summary

Completed the remaining implementation work for the canonical `shell_cmd` tool-result contract.

The final runtime behavior now:

- persists one authoritative `role='tool'` completion record for `shell_cmd`
- stops writing new synthetic assistant stdout mirror rows
- uses one bounded-preview continuation contract instead of `minimal` vs `smart`
- normalizes shell terminal failures through the canonical result shape, including:
  - `validation_error`
  - `approval_denied`
  - `execution_error`
  - `non_zero_exit`
  - `timeout`
  - `canceled`
- preserves backward-compatible transcript rendering for historical chats that still contain legacy assistant stdout mirror rows
- allows completed web/Electron tool cards to reconstruct status from canonical tool-call + tool-result records only

## Key Changes

1. Canonical shell result semantics were completed in core.
   - Non-execution shell failures now use `exit_code: null`.
   - Validation and approval-denial paths no longer masquerade as `non_zero_exit`.

2. Web and Electron completed-card status detection now recognizes canonical shell failure reasons.
   - This includes persisted tool results serialized as plain text or JSON strings.

3. Transcript compatibility coverage was added.
   - Completed shell cards restore from assistant request + tool result only.
   - Legacy assistant stdout mirror rows remain renderable for historical chats.

## Verification

- `npx vitest run tests/core/shell-cmd-format.test.ts tests/core/shell-cmd-integration.test.ts tests/core/events/memory-manager-behavior.test.ts tests/core/events/memory-manager-continuation-guard.test.ts tests/web-domain/tool-merge.test.ts tests/web-domain/message-content-tool-summary.test.ts tests/electron/renderer/message-content-status-label.test.ts`
- `npm run integration`
- `npx vitest run tests/web-domain/message-content-tool-summary.test.ts`

## Notes

- A non-failing `MaxListenersExceededWarning` appeared during the targeted vitest run.
- A non-failing sourcemap warning from `node-cron` appeared during `npm run integration`.
