# Loading Flicker & Edit-Path Streaming Fix

**Date:** 2026-03-06
**Status:** Done

---

## Summary

Two runtime bugs were identified and fixed after the stable-hook-refs feature was completed.

---

## Bug 1 — "Loading messages..." and Welcome card flicker on chat switch

### Root Cause
`onSelectSession` in `useSessionManagement.ts` called `setMessages([])` immediately on chat switch,
plus queued a redundant prefetch IIFE. This produced two separate flicker states:

1. **Loading-card flicker:** With `messages = []` and `loading.messages = true` (set by the
   subsequent `refreshMessages` call), `shouldShowLoading` became `true` briefly.
2. **Welcome-card flicker:** Between the `setMessages([])` render and the moment
   `refreshMessages` set `loading.messages = true`, there was a render where both
   `messages = []` and `loading.messages = false` — satisfying
   `shouldShowWelcome = !messagesLoading && !hasConversationMessages`, which showed the Welcome
   card for one frame.

The prefetch IIFE was also dead code: `refreshMessages` (triggered by `useEffect` in App.tsx)
always incremented `messageRefreshCounter.current` before the IIFE's `api.getMessages` resolved,
causing the IIFE's result to be silently discarded.

### Fix
1. Removed `setMessages([])` and the dead prefetch IIFE from `onSelectSession`. The previous
   chat's messages stay visible until `refreshMessages` overwrites them; `shouldApplyChatRefresh`
   already guards against stale loads on rapid switches.
2. Removed the `shouldShowLoading && selectedSession` branch from `MessageListPanel.tsx` that
   rendered the "Loading messages..." card (no longer needed; nothing sets that state now).

**Files changed:**
- `electron/renderer/src/hooks/useSessionManagement.ts` — removed `setMessages([])` and prefetch IIFE; removed `setMessages` from `onSelectSession` deps
- `electron/renderer/src/components/MessageListPanel.tsx` — removed "Loading messages..." card branch

---

## Bug 2 — Streaming lost on switch-chat → edit-message → send

### Root Cause
A race condition between two async operations:

1. **Chat switch** triggers `useEffect → refreshMessages(worldId, chatB)` with
   `refreshId = ++messageRefreshCounter.current`.
2. `refreshMessages` runs asynchronously (`api.selectSession` + `api.getMessages`).
3. Before it resolves, the user **edits a message** → `onSaveEditMessage` fires →
   `api.editMessage` returns → SSE streaming begins and messages appear in state.
4. `refreshMessages` resolves. `shouldApplyChatRefresh(refreshId=N, counter=N, chatB, chatB)`
   returns **true** (the counter was never invalidated by the edit path) and calls
   `setMessages(history)`, overwriting the streaming messages.

### Fix
Passed `messageRefreshCounter` ref into `useMessageManagement`. In `onSaveEditMessage`,
immediately before `api.editMessage` is called, `messageRefreshCounter.current` is incremented.
This invalidates any in-flight `refreshMessages` (its stored `refreshId` is now stale), so
`shouldApplyChatRefresh` returns `false` and the streamed messages are preserved.

**Files changed:**
- `electron/renderer/src/App.tsx` — pass `messageRefreshCounter` to `useMessageManagement`
- `electron/renderer/src/hooks/useMessageManagement.ts` — accept `messageRefreshCounter`,
  increment it in `onSaveEditMessage` before the IPC edit call, add to deps array

---

## Tests
All 178 test files / 1450 tests continue to pass (`npm test`).
