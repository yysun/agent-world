# Electron Message Display Flow Alignment (Web Parity)

**Completed:** 2026-02-20  
**Requirement:** [req-electron-web-message-display-flow.md](../../reqs/2026-02-20/req-electron-web-message-display-flow.md)  
**Plan:** [plan-electron-web-message-display-flow.md](../../plans/2026-02-20/plan-electron-web-message-display-flow.md)

## Summary

Implemented Electron message/indicator behavior alignment with web flow for:
- immediate optimistic user message display,
- assistant placeholder display at stream start,
- single-message streaming lifecycle (start/chunk/end/final),
- full pending-lifecycle inline working indicator visibility.

Also applied AR-driven safeguards:
- deterministic reconciliation for identical consecutive user messages,
- hidden edit/delete actions for pending optimistic user messages until backend confirmation.

## Key Changes

### Renderer domain/state

- `electron/renderer/src/domain/message-updates.ts`
  - Added optimistic user message helpers:
    - `createOptimisticUserMessage`
    - `reconcileOptimisticUserMessage`
    - `removeOptimisticUserMessage`
  - Extended `upsertMessageList` with deterministic fallback reconciliation for incoming user events against pending optimistic messages in the same chat.

### Send flow

- `electron/renderer/src/hooks/useMessageManagement.ts`
  - On send:
    - inserts optimistic user message immediately,
    - reconciles temp message to canonical backend `messageId` on invoke success,
    - removes optimistic message on send failure.

### Streaming flow

- `electron/renderer/src/hooks/useStreamingActivity.ts`
  - `onStreamStart`: inserts assistant streaming placeholder (`...`).
  - `onStreamUpdate`: updates same streaming message.
  - `onStreamEnd`: removes streaming placeholder so final backend message becomes canonical visible message.

### Working indicator

- `electron/renderer/src/App.tsx`
  - Inline working indicator visibility now follows session activity lifecycle (`hasComposerActivity`) rather than only the narrow `calling LLM...` phase text.

### UI action safety

- `electron/renderer/src/components/MessageListPanel.tsx`
  - Suppresses edit/delete controls for pending optimistic user messages.
  - Controls reappear after backend reconciliation confirmation.

## Tests and Verification

### Focused tests executed

- `npm test -- tests/electron/renderer/message-updates-domain.test.ts tests/electron/renderer/chat-event-handlers-domain.test.ts tests/electron/renderer/streaming-state.test.ts`
- Result: 3 files passed, 78 tests passed, 0 failed.

### Type/build checks executed

- `npm run check`
- Result: passed (`tsc` root/core/web + electron main build).

## Notes

- `CR` found no high/medium-severity issues in current uncommitted changes.
- Remaining gap: manual Electron UI verification is still recommended for full end-to-end confirmation of timing/indicator behavior.
