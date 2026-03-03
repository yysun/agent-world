# REQ: Web App Message Display Parity with Electron

**Date:** 2026-03-01  
**Status:** Draft  

---

## Background

A detailed comparison of web (`web/src/`) and Electron (`electron/renderer/src/`) message display revealed several functional and quality gaps in the web app. The Electron renderer has accumulated meaningful improvements that should be brought to the web app for consistent user experience.

---

## Requirements

### REQ-1: Merged Tool Call Cards

**Current behavior:** The web app renders each tool request row and its corresponding tool result row as two separate, independent entries in the chat transcript.

**Required behavior:** Tool result rows must be merged into their matching tool request row by `tool_call_id`, and the standalone tool result rows must be removed from the transcript. The merged card must display:
- The tool name and arguments (from the request row)
- The output/result (from the result row)
- A status indicator: `running`, `done`, or `failed`
- A collapse/expand toggle so the user can hide verbose tool output

This merging must happen at display/render time only and must not mutate the underlying message state.

**Streaming rows:** Tool rows that are still actively streaming (`isToolStreaming === true`) must not be merged into a request card. They remain as standalone streaming rows until the stream ends and a completed result row is available.

---

### REQ-2: Markdown Pre-processing Parity

**Current behavior:** The web app's `renderMarkdown` converts text to HTML using `marked` + `DOMPurify` without any pre-processing.

**Required behavior:** The web app's `renderMarkdown` must apply the same two pre-processing steps already present in the Electron renderer:

1. **Multiline link normalization** — Markdown links whose label or URL spans multiple lines (due to word-wrap) must be collapsed to a single line before parsing, so they render as proper hyperlinks rather than broken text.

2. **XML payload wrapping** — When message text is detected as a raw XML payload (starts with `<?xml`, `<!DOCTYPE`, or matches an XML root-tag heuristic), it must be automatically wrapped in a ` ```xml ` fenced code block before rendering, so it is displayed as escaped code rather than partially interpreted as HTML.

Additionally, the DOMPurify config must be updated to:
- Use a flat `ALLOWED_ATTR` array (matching the Electron approach for more reliable attribute preservation across DOMPurify versions)
- Include `ALLOWED_URI_REGEXP` to explicitly permit `data:image/*;base64` URIs so embedded markdown images (including SVG) render correctly

---

### REQ-3 (Suggested): RAF-Batched Streaming Updates

**Current behavior:** Every incoming SSE streaming chunk triggers an immediate AppRun `setState`, which can cause excessive re-renders at high token throughput.

**Required behavior:** Streaming chunk state updates should be batched and flushed on `requestAnimationFrame` (≈16 ms), matching the Electron renderer's debounce behavior. End/error events must flush immediately (no delay) to ensure the final state is applied promptly. HITL prompt events must also flush immediately and must never be delayed by the RAF buffer.

---

### REQ-4 (Suggested): Log Event Routing Out of Chat Transcript

**Current behavior:** Log event messages (`message.logEvent === true`) are rendered inline in the chat transcript as collapsible rows.

**Required behavior:** Log event rows must not appear in the main chat transcript. They should be excluded from the rendered message list by extending `shouldHideWorldChatMessage` in `message-visibility.ts`. Log event messages must instead be emitted to `console.log` in the SSE client so they remain visible in browser DevTools without cluttering the chat UI.

---

## Out of Scope

- Changing the underlying SSE or IPC transport
- Avatar rendering (sprite vs. initials) — visual preference, not a functional gap
- Action button hover behavior — minor UX polish, lower priority
- Any changes to the Electron renderer

---

## Acceptance Criteria

| REQ | Criterion |
|-----|-----------|
| REQ-1 | Tool request + result pairs appear as a single merged card in the web chat; standalone tool result rows are absent from the transcript; collapse/expand toggle works; status (`running`/`done`/`failed`) is shown correctly |
| REQ-2 | Multiline markdown links render as clickable links; raw XML message content is displayed in a code block; base64 inline images render; attribute sanitization does not strip `href`/`src` from sanitized output |
| REQ-3 | Streaming token throughput does not trigger more than one DOM update per animation frame; final message state commits immediately on stream end |
| REQ-4 | Log event messages do not appear in the chat transcript; log event content is emitted to `console.log` and visible in browser DevTools |

---

## Priority

| REQ | Priority | Rationale |
|-----|----------|-----------|
| REQ-1 | High | Core UX gap — merged tool cards are significantly cleaner; already proven in Electron |
| REQ-2 | High | Correctness issue — multiline links and XML payloads produce broken/unsafe output today |
| REQ-3 | Medium | Performance improvement for high-throughput streaming; not a blocker |
| REQ-4 | Medium | Transcript cleanliness; log events clutter the chat for non-developer users |
