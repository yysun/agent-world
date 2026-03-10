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

### 6. Normal sends must insert an optimistic user row immediately

The renderer must not leave the selected chat visually empty between submit and the
backend's canonical user-message echo.

Rules:

- `onSendMessage` must insert an optimistic user message in the selected chat before IPC send.
- The optimistic row must use the canonical optimistic-user helper so later realtime
  user-message events reconcile by chat/content rather than appending duplicates.
- On transport failure, remove the optimistic row.
- On success, do **not** manually remove it; let the backend user-message echo reconcile it.

Why this matters:

- Without the optimistic row, new/empty chats briefly render the welcome card after submit.
- That flicker is a regression even when the backend eventually streams correctly.

Tests: `tests/electron/renderer/message-updates-domain.test.ts` and
`tests/electron/renderer/tool-call-display-fixes.test.ts`.

### 7. Refresh must merge live selected-chat state, not overwrite it

`refreshMessages(...)` must preserve selected-chat live state that may not yet be reflected
in persisted history.

At minimum, refresh reconciliation must preserve:

- optimistic user rows
- live structured system-error rows
- live streaming/tool rows until their canonical replacements arrive

Do not replace the selected chat transcript with raw history when live rows still matter.

### 8. Do not clear the selected chat message list during normal chat mutation flows

`setMessages([])` is only valid when there is no selected chat or the world/session is
being torn down.

Do not clear the selected chat transcript during:

- normal send
- edit
- delete
- refresh of the same selected chat

Clearing during those flows causes welcome-card/loading flicker and dropped transient rows.

### 9. Restored event timestamps must preserve original time

Replay/rehydration helpers must accept persisted `createdAt` values as either `string` or
`Date` and preserve the original event time.

Do not restamp restored events with `new Date()` unless no persisted timestamp exists at all.
Otherwise historical errors will look like fresh duplicates on revisit.

### 10. Testing Electron renderer hooks

- Electron renderer tests run in a `node` environment with no jsdom and no React runtime.
- App.tsx is called as a plain function with all React hooks and child components mocked.
- Do **not** use `vi.mock('react', ...)` to intercept React hooks for components in
  `electron/renderer/src/` — those components resolve react from `electron/node_modules/react`,
  which is a separate module instance from the root `node_modules/react`.
- Prefer testing **pure domain functions** and **proxy-ref patterns** directly (no React
  render required). See `tests/electron/renderer/` for examples.

---

## Electron Chat Runtime Rules (Strict)

Cross-app queue, restore, durable error, and tool/HITL lifecycle rules now live in the
root `AGENTS.md` Event and Message Rules section. This Electron doc only keeps the
additional renderer/main-runtime constraints that are specific to desktop chat behavior.

### 11. Send/edit dispatch must use the active runtime after restore

Chat activation can swap or refresh the runtime world instance. Any queue or immediate
dispatch that uses a pre-restore world reference risks publishing onto a stale emitter.

Rules:

- If a flow restores/activates a chat before dispatch, re-resolve the subscribed runtime
  world after restore and dispatch on that post-restore instance.
- Do not capture a world instance, call `restoreChat(...)`, and then publish using the
  stale pre-restore reference.
- This is especially important in Electron main IPC send/edit flows because the renderer
  subscribes to the active runtime emitter only.

Failure mode:

- User send appears accepted, but no realtime `message`/`sse` events reach the selected chat.
- Streaming appears globally broken even though queue rows persist.

Tests: `tests/electron/main/main-ipc-handlers.test.ts`.

### 12. Subscription/rebind helpers must be idempotent

Rebinding agent/world listeners must first remove any existing listener for the same target.

Do not stack duplicate listeners for:

- agent message subscriptions
- world message/system/activity forwarding
- chat realtime subscriptions

Duplicate listeners cause duplicate processing, duplicate persisted errors, and misleading
UI “duplicates” that are actually multi-processing bugs.

### 13. Messages briefly appearing then disappearing on chat switch is a streaming-state sign

If the renderer shows messages momentarily and then they vanish on chat switch, check:

1. **Queue/restore lifecycle bug** (core) — is restore replaying or recovering a turn that
   should remain in explicit recovery state? Look for repeating `sse start → sse error`
   pairs with no new user turn, stale `sending` rows that should have moved to `error`,
   or pending HITL/tool boundaries that were treated as resumable. See the root `AGENTS.md`
   Event and Message Rules section.
2. **Subscription cycling** (renderer) — is `useChatEventSubscriptions` tearing down and
   recreating because a callback dep is unstable? See Rule 1 and Rule 3.
3. **Stale chatId on events** (main process) — are events arriving for the previous chat
   being applied to the new chat's message list before the subscription re-binds?
   See Rule 4 and Rule 5.
