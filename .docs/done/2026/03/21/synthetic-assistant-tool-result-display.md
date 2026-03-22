# Done: Synthetic Assistant Tool Result Display

**Date:** 2026-03-21
**Status:** Completed With Deferred Follow-Ups
**Related:** [REQ](../../reqs/2026/03/21/req-synthetic-assistant-tool-result-display.md), [Plan](../../plans/2026/03/21/plan-synthetic-assistant-tool-result-display.md)

## Summary

Completed the persisted synthetic assistant tool-result display rollout across core, web, and Electron.

The delivered behavior now:

- persists eligible adopted tool results as display-only synthetic assistant messages linked to the canonical tool result/tool call
- keeps canonical tool lifecycle ownership on the assistant tool-call row plus terminal `role='tool'` result row
- filters persisted synthetic assistant rows out of future LLM history preparation
- suppresses ordinary agent-processing side effects for persisted synthetic display rows
- removes rich adopted-result rendering from tool rows and renders the full result through assistant-message presentation instead
- preserves richer display payloads than the LLM-facing tool result when needed, including `shell_cmd` markdown SVG data-URI content
- keeps chat-title generation from re-ingesting persisted synthetic display payloads
- exports persisted synthetic assistant rows as assistant-visible content instead of raw JSON marker blobs

## Key Changes

1. Core now persists explicit display-only synthetic assistant result rows.
   - Added a stable persisted marker and helpers in `core/synthetic-assistant-tool-result.ts`.
   - `shell_cmd`, `load_skill`, and `web_fetch` now seed synthetic assistant display content from canonical tool outcomes when eligible.
   - Orchestration and continuation paths append/publish the synthetic assistant row after persisting the tool result.

2. Model-facing history now excludes synthetic assistant display rows.
   - `core/message-prep.ts` filters persisted synthetic assistant rows from LLM history.
   - Event subscriber handling skips synthetic display-only assistant rows so they do not trigger normal agent auto-reply or mention-routing behavior.
   - Chat-title generation in `core/events/memory-manager.ts` now also skips synthetic assistant display rows when building title prompts.

3. Web and Electron render the synthetic assistant row instead of rich tool bodies.
   - Both clients unwrap persisted/live synthetic assistant rows into ordinary assistant-display content for transcript rendering.
   - Adopted tool rows suppress their rich result body when a linked synthetic assistant row exists.
   - Synthetic display rows are excluded from branch/true-agent message affordances where appropriate.

4. Export paths were aligned with the new persisted message shape.
   - World and chat markdown export now unwrap persisted synthetic assistant marker content before formatting.
   - Exported markdown shows the assistant-visible content rather than the stored JSON envelope/marker.

## Code Review Outcome

- Fixed the review finding where title generation still fed persisted synthetic assistant rows back into the LLM prompt.
- Fixed the review finding where world/chat markdown export emitted raw synthetic marker JSON instead of assistant-visible content.
- No remaining high-priority findings are tracked against this change set after the follow-up patch set.

## Validation

- `npm test -- --run tests/core/message-prep.test.ts tests/core/shell-cmd-integration.test.ts tests/web-domain/tool-merge.test.ts tests/web-domain/tool-message-ui.test.ts tests/electron/renderer/message-content-status-label.test.ts tests/electron/main/message-serialization.test.ts`
- `npm run integration`
- `npm test -- --run tests/core/events/post-stream-title.test.ts`
- `npm test -- --run tests/core/export.test.ts tests/core/events/post-stream-title.test.ts`

## Deferred Follow-Ups

- Add targeted event/persistence regression coverage proving persisted synthetic assistant display rows do not trigger agent auto-reply on restore-time publish.
- Add targeted edit/delete cleanup coverage proving synthetic assistant display rows are trimmed when their owning tool/user-turn tail is removed.
- Reconcile the remaining unchecked items in the architecture plan once those cleanup/restore regressions are covered.
