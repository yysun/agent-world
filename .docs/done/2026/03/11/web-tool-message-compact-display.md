# Done: Web Tool Message Compact Display

**Date:** 2026-03-11
**Related:** [REQ](../../reqs/2026/03/11/req-web-tool-message-compact-display.md), [Plan](../../plans/2026/03/11/plan-web-tool-message-compact-display.md)

## Summary

Completed the web chat tool-message UI cleanup so tool activity no longer reads like a normal assistant reply and now behaves like a compact transcript status surface.

The final web behavior now:

- renders merged assistant tool-call rows and standalone tool rows with tool-specific transcript framing instead of assistant chrome
- shows a compact one-line tool summary with a pulsing running dot and chevron-only expand/collapse control
- keeps markdown-based tool previews constrained to a scrollable viewport instead of expanding into oversized transcript blocks
- aligns tool cards with the same left-side transcript indentation as other message boxes
- applies the same elevation/shadow treatment across tool cards, user/assistant messages, and the right-panel chat list

## Key Changes

1. Tool transcript framing and summary rendering were unified.
   - Added shared tool-row classification for merged assistant tool calls, tool streams, and tool results.
   - Removed assistant avatar/meta chrome from tool rows while preserving restore/merge behavior.
   - Reused the existing `toggle-tool-output` state path.

2. Tool output presentation was tightened.
   - Tool previews now use compact summary-first cards.
   - Markdown command-execution previews keep existing colors but use a smaller font, fixed preview height, and vertical scrolling.
   - The tool toggle uses icon-only chevrons with correct accessibility labels.

3. Visual consistency was extended beyond tool rows.
   - User and assistant transcript cards now share the same shadow treatment as tool cards.
   - Right-panel chat history rows reuse the same elevation class.
   - Tool rows reserve the same left transcript indentation as avatar-bearing rows on desktop while still collapsing cleanly on mobile.

4. Targeted unit coverage was expanded.
   - Added helper coverage for tool-row classification, row container classes, and shared shadow classes.
   - Added markdown preview viewport coverage for persisted tool envelopes.
   - Updated chat-history helper coverage for shared row styling.

## CR Notes

- Reviewed the current uncommitted diff for behavior regressions, layout risks, and test coverage gaps.
- No high-priority findings were identified in the reviewed changes.

## Verification

- `npx vitest run tests/web-domain/tool-message-ui.test.ts tests/web-domain/message-content-tool-summary.test.ts tests/web-domain/tool-execution-envelope.test.ts tests/web-domain/world-chat-history-search.test.ts`
- `npm run build --workspace=web`

## Notes

- The web production build still emits the pre-existing Vite chunk-size warning for the main bundle.
- The web production build still emits the existing `doodle.css/border.svg` runtime-resolution warning during bundling.
