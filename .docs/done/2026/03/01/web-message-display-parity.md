# Done: Web App Message Display Parity with Electron

**Date:** 2026-03-01  
**REQ:** [req-web-message-display-parity.md](../../reqs/2026/03/01/req-web-message-display-parity.md)  
**Plan:** [plan-web-message-display-parity.md](../../plans/2026/03/01/plan-web-message-display-parity.md)

---

## Summary

Brought the web app's message rendering into parity with the Electron renderer across three areas: markdown pre-processing, merged tool call cards, and log event routing. Phase 4 (RAF-batched streaming) is deferred.

---

## Delivered Changes

### Phase 1 — Markdown Pre-processing Parity (REQ-2)

**File:** `web/src/utils/markdown.ts`

- Added `normalizeMultilineMarkdownLinks()` — collapses link label text that wraps across lines before passing to `marked()`.
- Added `isLikelyXmlPayload()` + `normalizeXmlForMarkdownDisplay()` — detects bare XML payloads (root tag heuristic, `<?xml`, `<!DOCTYPE`) and wraps them in a ` ```xml ` code fence so they display as code instead of broken HTML.
- Replaced the old `ALLOWED_ATTR: ALLOWED_ATTRIBUTES` (tag-scoped object) with a flat deduplicated `ALLOWED_ATTR` string array — matches DOMPurify v3 API correctly.
- Added `ALLOWED_URI_REGEXP` allowing `data:image/*;base64` URIs for embedded images.
- Added `ADD_DATA_URI_TAGS: ['img']` to the sanitize options.
- Exported `createMarkdownSanitizeOptions()` for unit test use.
- Updated `renderMarkdown()` signature to accept `string | null | undefined`.

### Phase 2 — Merged Tool Call Cards (REQ-1)

**New file:** `web/src/domain/tool-merge.ts`

Pure display-time merge function `buildCombinedRenderableMessages(messages)`:
- Indexes completed `role: tool` result rows by `tool_call_id`.
- Attaches `combinedToolResults: Message[]` to the matching `tool_calls` request row.
- Filters consumed result rows from the top-level array.
- Leaves `isToolStreaming: true` rows standalone (not merged until streaming finishes).

**File:** `web/src/domain/message-content.tsx`

- Added `getToolMergedStatus()` — derives `'done' | 'failed' | 'running'` from combined results.
- Added `renderMergedToolCard()` — renders a collapsible card with:
  - Tool name(s), status pill (✓ done / ✗ failed / ● running)
  - Per-call args (`<pre>`) and result output with 50K truncation warning
  - "waiting for result..." indicator when a result hasn't arrived yet
  - Collapse/expand toggle reusing the existing `toggle-tool-output` AppRun event
- Updated `renderMessageContent()` to dispatch to `renderMergedToolCard` when `message.combinedToolResults` is present.

**File:** `web/src/components/world-chat.tsx`

- Imported `buildCombinedRenderableMessages` and applied it after `filteredMessages` to produce `renderableMessages`.
- Changed the render loop to iterate `renderableMessages`.
- Removed the now-unreachable `if (message.logEvent)` inline render branch (~37 lines).

**File:** `web/src/styles.css`

- Added CSS: `.merged-tool-card`, `.tool-status`, `.tool-status-done`, `.tool-status-failed`, `.tool-status-running`, `.merged-tool-body`, `.tool-result-block`, `.tool-args`, `.tool-call-name`, `.tool-waiting`.
- Added `.merged-tool-card` to the `.chat-fieldset .message` width-override selector.

### Phase 3 — Log Events to `console.log` Only (REQ-4)

**File:** `web/src/utils/sse-client.ts`

- `handleLogEvent`: removed `logMessage` construction and state append. Function now returns `state` unchanged after `console.log()`. Chat transcript is no longer polluted with log rows.

**File:** `web/src/domain/message-visibility.ts`

- Added early-return guard in `shouldHideWorldChatMessage`: hides any message where `logEvent` is truthy — defensive cover for any log messages already persisted in older state.

---

## Bug Fixed During CR

**`result === null` strict check in `renderMergedToolCard`** (`message-content.tsx`)  
`Array.find()` returns `undefined` (not `null`) for unmatched items. The strict `=== null` guard silently skipped the "waiting for result..." indicator for parallel tool calls with partial results. Fixed to `== null` (loose equality).

---

## Tests

| Test file | Type | Cases |
|---|---|---|
| `tests/web-domain/markdown-rendering.test.ts` | New | 8 — sanitize options shape, null/empty inputs, XML wrapping, multiline link, plain text passthrough |
| `tests/web-domain/tool-merge.test.ts` | New | 5 — happy path merge, no results, streaming exclusion, human passthrough |
| `tests/web-domain/world-chat-message-visibility.test.ts` | Extended | +2 — logEvent hidden, non-logEvent visible |
| `tests/web-domain/sse-log-event.test.ts` | New | 6 — no message appended, state identity, console.log called, missing payload, chat filter |

**All 26 tests pass. Zero TypeScript errors in modified files.**

---

## Deferred

**Phase 4 — REQ-3: RAF-batched streaming** — independent scope; to be scheduled separately.
