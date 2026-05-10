# Done: Electron Non-Chat Human Panel Layout

**Date**: 2026-05-10  
**Type**: Bug fix / layout redesign

## Overview

Completed the Electron renderer non-chat layout redesign for `board`, `grid`, and `canvas` so the latest human input remains visible after switching away from chat view and lower content keeps a single, stable scroll owner.

This work also included a CR follow-up fix for a non-chat regression where HITL prompts and inline working rows could render outside the non-chat scroll pane and become clipped or unreachable.

## Summary

- Redesigned non-chat rendering into a dedicated two-region shell:
  - top latest-human panel,
  - lower scroll-owned content pane.
- Restricted outer transcript auto-scroll to chat view only.
- Kept canonical persisted human sender detection aligned with renderer message semantics, including `you`.
- Moved non-chat supplemental rows such as HITL prompts and inline working status into the non-chat content pane so they stay reachable after view switches.
- Added focused renderer regression coverage for the new shell contract and the supplemental-row placement fix.

## Completed Scope

### Non-chat shell redesign
- Reworked non-chat `MessageListPanel` rendering so `board`, `grid`, and `canvas` no longer behave like patched variants of the chat transcript surface.
- Established one clear non-chat vertical layout contract:
  - stable latest-human section,
  - `min-h-0 flex-1 overflow-y-auto` lower content pane.
- Kept board/grid/canvas content rendering inside the lower pane instead of sharing scroll ownership with the outer transcript viewport.

### Scroll-policy cleanup
- Added a dedicated transcript scroll policy helper.
- Updated renderer workspace auto-scroll so only chat view inherits transcript auto-scroll behavior.
- Removed the need for non-chat outer-scroll compensation as the primary layout mechanism.

### Canonical human-message detection
- Updated world-view partitioning so canonical persisted human sender values remain eligible for the non-chat top panel.
- Covered the `sender: 'you'` regression in focused domain tests.

### CR follow-up fix
- Identified that non-chat HITL and inline working rows were still rendered outside the non-chat shell.
- Refactored those rows into shared render helpers.
- Rendered them inside the non-chat content pane for `board`, `grid`, and `canvas`, while preserving existing chat placement.

## Key Files Updated

- `/Users/esun/Documents/Projects/agent-world/electron/renderer/src/features/chat/components/MessageListPanel.tsx`
- `/Users/esun/Documents/Projects/agent-world/electron/renderer/src/app/RendererWorkspace.tsx`
- `/Users/esun/Documents/Projects/agent-world/electron/renderer/src/domain/world-view.ts`
- `/Users/esun/Documents/Projects/agent-world/electron/renderer/src/domain/transcript-scroll-policy.ts`
- `/Users/esun/Documents/Projects/agent-world/tests/electron/renderer/message-list-plan-visibility.test.ts`
- `/Users/esun/Documents/Projects/agent-world/tests/electron/renderer/world-view-domain.test.ts`
- `/Users/esun/Documents/Projects/agent-world/tests/electron/renderer/transcript-scroll-policy-domain.test.ts`
- `/Users/esun/Documents/Projects/agent-world/.docs/reqs/2026/05/10/req-electron-non-chat-human-panel-layout.md`
- `/Users/esun/Documents/Projects/agent-world/.docs/plans/2026/05/10/plan-electron-non-chat-human-panel-layout.md`
- `/Users/esun/Documents/Projects/agent-world/.docs/tests/test-electron-non-chat-human-panel-layout.md`

## Validation Performed

### Focused renderer validation
- `runTests` on:
  - `tests/electron/renderer/message-list-plan-visibility.test.ts`
  - `tests/electron/renderer/message-list-hitl-skip.test.ts`
- Result: 15 passed, 0 failed.

### Static validation
- `get_errors` on:
  - `electron/renderer/src/features/chat/components/MessageListPanel.tsx`
  - `tests/electron/renderer/message-list-plan-visibility.test.ts`
- Result: no errors found.

### Live Electron shell validation
- Ran:
  - `npm run build:core`
  - `npm run electron:main:build`
  - `npm run electron:renderer:build`
  - `npx playwright test --config playwright.electron.config.ts tests/electron-e2e/app-shell.spec.ts`
- Result: 9 passed.
- Coverage from that live run includes real desktop view switching through `Board`, `Grid`, `Canvas`, and back to `Chat`.

## Notes

- The dedicated regression fix for non-chat HITL/working placement is covered at the renderer-unit boundary.
- A dedicated Electron E2E that opens a live HITL prompt, switches world views, and asserts prompt reachability was identified as a useful follow-up but was not added in this change.

## Related Docs

- `.docs/reqs/2026/05/10/req-electron-non-chat-human-panel-layout.md`
- `.docs/plans/2026/05/10/plan-electron-non-chat-human-panel-layout.md`
- `.docs/tests/test-electron-non-chat-human-panel-layout.md`