# Done: Tool Execution Envelope Follow-Up Fixes

**Date:** 2026-03-06
**Related:** [REQ](../../reqs/2026/03/06/req-tool-execution-envelope.md), [Plan](../../plans/2026/03/06/plan-tool-execution-envelope.md)

## Summary

Closed the three post-review gaps in the tool execution envelope rollout.

The follow-up changes now ensure:

- merged completed web tool cards can recover renderer-specific previews from attached tool-result rows
- live `tool-result` events publish explicit `preview` payloads and separate `result` payloads instead of truncated serialized envelope JSON
- persisted `load_skill` artifact previews use stable same-origin `/api/tool-artifact` URLs rather than raw local filesystem paths
- `/api/tool-artifact` authorizes against real filesystem paths so linked skills still work while symlink escapes are blocked

## Key Changes

1. Web merged-card preview rendering now checks attached tool results for custom renderer matches.
   - This restores YouTube/VexFlow-style completed previews after assistant request + tool result merge.

2. Core tool-result event publishing now sends an explicit `toolExecution.preview` field for UI rendering and a separate `toolExecution.result` field for the actual tool result.
   - Web and Electron preview helpers now read only the explicit preview channel for live adopted-tool rendering.
   - The loose fallback that inferred preview rendering from arbitrary `result` objects was removed.

3. `load_skill` artifact previews now emit `/api/tool-artifact` URLs and the server serves only files inside approved world working directories or registered skill roots.
   - Registered skill roots are resolved with `realpath`, so symlinked skill installations continue to work.
   - Requested artifact paths are also resolved with `realpath`, and access is granted only when the real target remains inside an allowed real root.
   - Path normalization was tightened to avoid malformed doubled-root artifact paths under the existing test harness.

## Verification

- `npx vitest run tests/web-domain/tool-execution-envelope.test.ts tests/core/events/memory-manager-behavior.test.ts tests/core/load-skill-tool.test.ts tests/api/tool-artifact-route.test.ts`
- `npx vitest run tests/web-domain/message-content-tool-summary.test.ts tests/electron/renderer/message-content-status-label.test.ts tests/core/message-prep.test.ts`
- `npm run integration`
- `git diff --check`

## Notes

- A non-failing `MaxListenersExceededWarning` appeared during the targeted vitest run.
- A non-failing sourcemap warning from `node-cron` appeared during `npm run integration`.
