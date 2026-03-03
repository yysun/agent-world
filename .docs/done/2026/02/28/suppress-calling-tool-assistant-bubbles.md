# Done: Suppress Verbose "Calling Tool" Assistant Bubbles

**Date**: 2026-02-28
**Type**: Bug Fix / UX Improvement
**Related**: `.docs/reqs/2026/02/28/req-electron-tool-calls-panel.md`

## Summary

Assistant messages containing tool calls were rendered as normal chat bubbles in the Electron transcript, displaying verbose "Calling tool: xxx (params)" text. This caused visual duplication since the same tool call was also represented by the tool-result card merged into the message. Fixed by correcting the classification logic so assistant messages with `tool_calls` are treated as tool-related messages and rendered as compact, collapsed-by-default tool cards.

## Root Cause

In `isToolRelatedMessage()` (`electron/renderer/src/utils/message-utils.ts`), the `role === 'assistant'` check returned `false` early, before the `tool_calls` array presence check could be reached. This meant every assistant message — even those whose sole purpose was a tool invocation — was classified as a regular assistant message and rendered as a full chat bubble.

## Changes

### `electron/renderer/src/utils/message-utils.ts`

Reordered the conditional checks in `isToolRelatedMessage()`:

- **Before**: `role === 'assistant'` → return `false` (short-circuit before `tool_calls` check)
- **After**: `tool_calls` array check → return `true` if present; then `role === 'assistant'` → return `false`

This ensures assistant messages with `tool_calls` are classified as tool-related, which causes them to:
- Render as compact tool cards instead of verbose chat bubbles
- Default to collapsed state (via `isMessageCollapsed` logic at line 347)
- Be filterable via the `showToolMessages` setting

### `tests/electron/renderer/app-utils-extraction.test.ts`

- Updated assertion for assistant + `tool_calls` message from `toBe(false)` to `toBe(true)`
- Added assertion that plain assistant messages (no `tool_calls`) still return `false`

## Testing

- All 17 tests in `app-utils-extraction.test.ts` pass.
