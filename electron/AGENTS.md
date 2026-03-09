## Electron Renderer Hook & Event Rules (Strict)

These rules apply to all changes inside `electron/renderer/src/`. They encode lessons
from real regressions (2026-03-06) where unstable hook references and unscoped event
payloads caused streaming loss, flickering, and dropped messages.

### 1. Memoize every callback that enters a `useEffect` dependency array

If a function is passed as a prop to a hook **and** that hook lists it in its `useEffect`
dep array, it **must** be wrapped in `useCallback`.

- An inline arrow function creates a **new reference on every render**. Any `useEffect`
  that depends on it will tear down and re-run on every render.
- In `useChatEventSubscriptions`, a re-run calls `streamingStateRef.current.cleanup()`,
  which destroys all in-progress streaming state — causing messages to disappear mid-stream.
- **Rule:** never pass an inline `() => {}` to any hook that puts it in a `useEffect` dep
  array. Always `useCallback(fn, [...stableDeps])`.

```tsx
// BAD — new function reference every render → subscription cycles every render
useChatEventSubscriptions({ onSessionSystemEvent: (e) => handleEvent(e) });

// GOOD — stable reference; effect only re-runs when loadedWorld.id changes
const onSessionSystemEvent = useCallback((e) => handleEvent(e), [loadedWorld?.id, stableHelper]);
useChatEventSubscriptions({ onSessionSystemEvent });
```

### 2. All `useEffect` deps must be statically stable

Before adding a value to a `useEffect` dep array, verify its reference stability:

| Source | Stable? | How |
|---|---|---|
| `useRef(...)` | Yes | Ref object identity never changes |
| `useCallback(fn, [])` | Yes | Empty deps = memo forever |
| `useCallback(fn, [primitive])` | When primitive is stable | Only re-creates on primitive change |
| `useMemo(fn, [])` | Yes | Same as above |
| Inline `() => {}` | **No** | New object every render |
| Inline `{}` / `[]` | **No** | New object every render |
| `useState` setter | Yes | React guarantees stable identity |

If you cannot make a dep stable, use a ref-indirection (proxy-ref pattern):
```tsx
// Proxy ref: stable callback that always delegates to the latest underlying function
const latestFnRef = useRef(fn);
latestFnRef.current = fn;                         // sync on every render (no dep needed)
const stableCallback = useCallback((...args) => latestFnRef.current(...args), []);
```

### 3. Subscription cleanup destroys streaming state — keep subscriptions stable

`useChatEventSubscriptions` cleanup:
- calls `streamingStateRef.current.cleanup()` — flushes and clears all active streams
- calls `resetActivityRuntimeState()` — resets activity overlays
- removes IPC listeners and unsubscribes from chat events

Any unnecessary re-run mid-stream silently discards all buffered chunks and tool results.
The user sees: welcome card flicker, messages disappear, streaming stops with no output.
**Keep all subscription deps stable across normal renders.**

### 4. All event payloads sent to the renderer must carry an explicit `chatId`

As of 2026-03-06, the renderer drops any SSE / tool / activity / system event that
arrives **without** a scoped `chatId`. There is no fallback to `selectedSessionId` or
`world.currentChatId`.

- `realtime-events.ts`: activity events, SSE events, and tool events all `return` early if
  `eventChatId` is falsy.
- `chat-event-handlers.ts`: same guards in the renderer-side handler factory.
- **Rule:** every event emitted by the main process or server must include `chatId`.
  Missing `chatId` = event is silently dropped = messages never appear.

### 5. After a chat switch, wait for the subscription to re-bind before sending events

`selectWorldSession` → `activateChatWithSnapshot` → `refreshWorldSubscription` rebinds
the realtime listener to the new `chatId`. Events fired before `refreshWorldSubscription`
completes carry the **old** `chatId` and will be filtered out by the new subscription.

Do not fire streaming events immediately after `selectWorldSession` without awaiting the
full activation sequence.

### 6. Testing Electron renderer hooks

- Electron renderer tests run in a `node` environment with no jsdom and no React runtime.
- App.tsx is called as a plain function with all React hooks and child components mocked.
- Do **not** use `vi.mock('react', ...)` to intercept React hooks for components in
  `electron/renderer/src/` — those components resolve react from `electron/node_modules/react`,
  which is a separate module instance from the root `node_modules/react`.
- Prefer testing **pure domain functions** and **proxy-ref patterns** directly (no React
  render required). See `tests/electron/renderer/` for examples.

---

## Core Auto-Resume Rules (Strict)

These rules apply to all changes touching `core/managers.ts` `restoreChat` /
`triggerPendingLastMessageResume`, and any future resume-on-load logic.

### 7. Never auto-resume a user-last message that already has a terminal SSE event

**Symptom (2026-03-09):** Switching to a failing chat causes messages to briefly appear
(including error messages) and then disappear. Every subsequent switch or restart repeats
the cycle. The chat's event table accumulates hundreds of `sse start + sse error` pairs
with no new user message between them.

**Root cause:** `triggerPendingLastMessageResume` detected a user-last message in chat
memory and re-submitted it unconditionally. On permanently-failing chats (every LLM call
errors), this created an infinite loop: restore → re-submit → LLM error → sse events
fire into renderer (transient state flash) → memory still ends with user message →
next restore re-submits again.

**Fix:** Before auto-resuming a user-last message, check the event storage:

```
if eventStorage exists:
  lastSseSeq  = seq of last SSE event for this chat
  lastMsgSeq  = seq of last message event for this chat
  if lastSseSeq > lastMsgSeq AND lastSse.payload.type ∈ {error, end}:
    skip auto-resume  ← terminal SSE post-dates the message; already processed
```

Allow resume when:
- No SSE events exist at all (message was never processed).
- Last SSE is `'start'` (stream was interrupted mid-flight — should retry).
- Last SSE pre-dates the last message event (new message arrived after the old error — should process).
- World has no `eventStorage` configured (safe default: allow resume).

**Implementation:** `triggerPendingLastMessageResume` in `core/managers.ts`. Tests in
`tests/core/auto-resume-sse-error-guard.test.ts`.

### 8. SSE `start` without a matching `end`/`error` means the stream is interrupted — resume it

The persisted SSE sequence `start → (nothing)` means the process crashed or restarted
mid-stream. This is the one case where auto-resume is correct even though a prior SSE
exists. Always allow resume when the last persisted SSE type is `'start'`.

### 9. Messages briefly appearing then disappearing on chat switch is a streaming-state sign

If the renderer shows messages momentarily and then they vanish on chat switch, check:

1. **Auto-resume loop** (core) — is `restoreChat` re-submitting a message that always
   errors? Look for repeating `sse start → sse error` pairs in the events table with no
   new `message` events between them. See Rule 7.
2. **Subscription cycling** (renderer) — is `useChatEventSubscriptions` tearing down and
   recreating because a callback dep is unstable? See Rule 1 and Rule 3.
3. **Stale chatId on events** (main process) — are events arriving for the previous chat
   being applied to the new chat's message list before the subscription re-binds?
   See Rule 4 and Rule 5.

