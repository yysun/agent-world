# Plan: Web Tool Message Compact Display

**Date:** 2026-03-11
**Req:** `.docs/reqs/2026/03/11/req-web-tool-message-compact-display.md`

## Approach

- [x] Add a web chat row-classification path that treats tool-related renderable rows as a distinct transcript surface instead of normal assistant rows.
- [x] Update the web tool summary renderer so collapsed tool rows show a compact one-line status layout with an explicit `Open` / `Collapse` affordance and active-status indicator.
- [x] Refine tool-row styling so compact tool rows are visually separate from assistant replies while keeping expanded details readable and subordinate.
- [x] Reuse the existing `toggle-tool-output` state flow so expand/collapse behavior stays local to current web message state management.
- [x] Add targeted unit tests for row classification and compact tool-summary rendering/toggle behavior.
- [x] Run focused vitest coverage for the updated web chat/tool-display paths.

## Implementation Notes

- Keep the change inside the current web boundaries:
  - `web/src/components/world-chat.tsx` for transcript-row framing and metadata/avatar treatment
  - `web/src/domain/message-content.tsx` for compact tool summary rendering
  - `web/src/styles.css` for the non-assistant tool surface and active indicator styling
  - existing web-domain tests for summary/row-state coverage
- Preserve display-time merge behavior from `web/src/domain/tool-merge.ts`; do not change persistence or SSE contracts.
- Prefer extracting or reusing pure helpers for row classification and summary-state logic so tests can stay deterministic and black-box at the component/domain boundary.

## Test Plan

- Add or update 1 to 3 targeted unit tests:
  - tool-related renderable rows are classified as tool UI, including merged assistant tool-call rows
  - compact tool summary exposes the expected one-line label/state for running and terminal rows
  - expand/collapse behavior continues to toggle the same message state path
- If implementation reaches transport/runtime behavior unexpectedly, run `npm run integration` per project policy.

## AR Notes

- The current confusion is caused by two layers together:
  - `world-chat.tsx` frames merged tool-call rows as agent messages because row classification is based on sender type plus `isToolResultMessage(message)`
  - `message-content.tsx` already has a compactish tool header, but that content still sits inside agent-message chrome
- The plan must treat merged assistant tool-call rows and standalone tool-result/tool-stream rows as the same product surface at render time. Restricting the change to `type === 'tool'` rows would leave the primary bug in place.
- Existing `toggle-tool-output` message state is sufficient for the requested interaction and does not require new persistence, chat restore logic, or SSE changes.
- The safest implementation is presentation-only. Any attempt to re-shape tool message data upstream would add avoidable risk to event ordering, merge behavior, and transcript restoration.
