# Electron Streaming Refresh Regression

## Problem

The Electron renderer has regressed to a state where assistant streaming content is not visible during a live turn and the user only sees the final assistant message after completion.

## Requirements

1. Assistant SSE streaming rows in the Electron renderer must remain visible while a turn is actively streaming.
2. Selected-chat refresh reconciliation must preserve live assistant streaming rows for the active chat until their canonical finalized message arrives.
3. The fix must not reintroduce cross-chat leakage; live streaming rows must remain explicitly scoped to the active `chatId`.
4. Existing final-message behavior must remain unchanged once the canonical assistant message is published.

## Acceptance Criteria

1. When the Electron renderer receives SSE `start`/`chunk` events for the selected chat, interim assistant content remains visible in the transcript instead of disappearing before completion.
2. If a selected-chat refresh resolves while an assistant stream is in progress, the live streaming row for that chat remains in the message list.
3. Focused Electron renderer unit tests cover the chat-scoped streaming path and pass.
