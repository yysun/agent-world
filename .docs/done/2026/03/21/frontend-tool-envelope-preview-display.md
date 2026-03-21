# Done: Frontend Tool Envelope Preview Display

**Date:** 2026-03-21
**Status:** Completed
**Related:** [REQ](../../reqs/2026/03/21/req-frontend-tool-envelope-preview-display.md), [Plan](../../plans/2026/03/21/plan-frontend-tool-envelope-preview-display.md), [Test Scenarios](../../tests/test-frontend-tool-envelope-preview-display.md)

## Summary

Completed the frontend rollout that makes tool transcript rendering preview-first for adopted `tool_execution_envelope` messages in both Electron and web transcript surfaces.

The delivered behavior now:

- renders Electron tool rows and assistant-linked combined tool views from structured envelope preview data instead of flattening everything to summary text
- preserves request/result transcript composition without duplicating consumed placeholder-linked tool rows
- keeps failed tool summaries red for plain-text tool execution failures such as `Error executing tool: Tool not found: ...`
- restores Electron collapse/expand controls for completed merged tool request/result rows so the tool affordance matches web behavior
- adds guarded inline HTML preview rewriting on `/api/tool-artifact` for web bundle-style HTML artifact previews

## Key Changes

1. Electron tool-body rendering was upgraded to structured preview rendering.
   - Added preview-item rendering for text, markdown, image/SVG, audio, video, PDF/HTML document previews, and file-style fallbacks.
   - Applied the same structured body logic to standalone tool rows and merged assistant request/result views.

2. Tool transcript merge behavior was re-tightened in both clients.
   - Placeholder `Calling tool:` rows still absorb linked tool results and streaming tool rows.
   - Consumed linked tool rows are removed from the top-level transcript list again so request/result pairs do not render twice.

3. Tool failure detection was broadened for plain-text runtime failures.
   - Electron and web summary/status helpers now treat `Error executing tool...` and `Tool not found...` text as failed outcomes.

4. Electron collapse behavior was brought back into parity with web.
   - Completed merged tool request/result rows now remain collapsible and default to expanded.
   - The visible `Open` / `Collapse` toggle label helper is exported and covered directly by unit tests.

5. Guarded inline HTML artifact preview support was added on the API route.
   - `/tool-artifact?preview=inline-html` now rewrites relative `src`/`href` asset references through the guarded artifact route instead of leaking raw local file URLs.

6. Post-review follow-up fixes were completed.
   - Web narrated assistant tool-call border styling now uses the shared tool status parser again, so enveloped failed tool results keep the failed border state.
   - Electron HTML artifact iframe previews now opt into the guarded `preview=inline-html` mode so relative bundle assets resolve inside the preview.

## CR Outcome

- Reviewed the uncommitted frontend/api diff and fixed the two P2 findings raised during CR.
- No remaining high-priority findings are tracked against this story after the follow-up patch set.

## Verification

- `npm test -- --run tests/electron/renderer/message-content-status-label.test.ts tests/electron/renderer/message-list-plan-visibility.test.ts tests/web-domain/tool-merge.test.ts tests/web-domain/shell-stream-web-parity.test.ts tests/web-domain/message-content-tool-summary.test.ts tests/web-domain/tool-message-ui.test.ts`
- `npm test -- --run tests/electron/renderer/message-list-collapse-default.test.ts tests/electron/renderer/message-list-plan-visibility.test.ts tests/electron/renderer/message-content-status-label.test.ts`
- `npm test -- --run tests/web-domain/tool-message-ui.test.ts tests/electron/renderer/message-content-status-label.test.ts`

## Notes

- The targeted frontend/domain renderer suites passed after the final patch set.
- `npm run integration` was not run during this pass.
