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

These rules apply to all changes touching `core/managers.ts` `restoreChat`,
`core/queue-manager.ts`, and any future resume-on-load logic.

### 7. Queue is the only automatic resume authority for user turns

**Symptom (2026-03-09):** Switching to a failing chat causes messages to briefly appear
(including error messages) and then disappear. Every subsequent switch or restart repeats
the cycle. The chat's event table accumulates hundreds of `sse start + sse error` pairs
with no new user message between them.

**Root cause:** restore logic used to inspect persisted user-last chat memory and
re-submit it outside queue ownership. On permanently-failing chats (every LLM call
errors), this created an infinite loop: restore → re-submit → LLM error → sse events
fire into renderer (transient state flash) → memory still ends with user message →
next restore re-submits again.

**Current rule:** `message_queue` is the only automatic resume authority for user turns.
Persisted chat memory may rebuild transcript/UI state, but it must never directly resend
or enqueue a user turn.

Resume behavior:

- Queue row exists with `queued` status: resume via queue.
- Queue row exists with recoverable `sending` state: recover via queue logic.
- Queue row exists with `error` or `cancelled` status: do not auto-resume.
- No queue row exists: do not invent a new automatic replay path from chat memory.

**Implementation:** `restoreChat(...)` in `core/managers.ts` now replays pending tool
calls separately, then delegates user-turn recovery only to `triggerPendingQueueResume(...)`
in `core/queue-manager.ts`. The old memory-based `triggerPendingLastMessageResume`
behavior must not be reintroduced.

### 8. Automatic recovery is limited to queue-owned `queued` / interrupted `sending` rows

The persisted SSE sequence still matters, but only for queue-owned recovery.

Rules:

- `queued` rows may dispatch normally on restore.
- Stale `sending` rows may recover only when they still represent the latest queued user turn
  and the latest post-message SSE is non-terminal.
- If the latest post-message SSE is `error` or `end`, mark the stale `sending` row `error`.
- If the latest persisted message event belongs to a newer turn, mark the stale `sending`
  row `error` as superseded rather than recovering it.
- `error` and `cancelled` rows never auto-resume.

Do not apply this interrupted-flight guard to:

- normal send
- manual queue retry
- explicit resend
- edit resubmission

Tests: `tests/core/auto-resume-sse-error-guard.test.ts` and
`tests/core/restore-chat-validation.test.ts`.

### 9. Edit/delete mutation flows must suppress restore-time auto-resume

`editMessageInChat(...)` and `deleteMessageFromChat(...)` restore chat state before
mutating persisted messages. That restore must not replay the old failed user-last turn.

Rule:

- mutation flows must call `restoreChat(worldId, chatId, { suppressAutoResume: true })`
- this suppression applies only during the mutation restore path
- after mutation completes, normal queue/send behavior resumes
- trimming a turn must also clear persisted queue rows for that chat so obsolete failed
  turns do not remain retryable after edit/delete

Without this suppression, a failed last user message can be replayed during restore and
then the edited replacement is submitted, creating duplicate persisted user messages.

### 10. Failed user turns do not auto-retry; recovery is explicit

Queue dispatch failure behavior:

- user-authored dispatch/runtime failures transition the queue row to durable `error`
- no-response fallback and preflight no-responder failures also transition to `error`
- there is no automatic exponential-backoff replay for failed user turns
- retry is an explicit user action from queue/transcript recovery UI

Background replay of failed user turns should be treated as a regression.

### 11. Queue APIs are user-turn-only; non-user dispatch stays immediate

Queue ownership rules:

- only human/user-authored chat turns may enter `message_queue`
- assistant/tool/system/non-user messages must not create queue rows
- queue-backed submission must use the explicit user-turn API
- non-user messages must use the explicit immediate-dispatch API

Current boundary:

- `enqueueAndProcessUserTurn(...)` is the queue-only ingress for user-authored turns
- `dispatchImmediateChatMessage(...)` is the immediate path for assistant/tool/system/non-user dispatch

Do not reintroduce mixed helpers where a queue-shaped API also direct-publishes non-user
messages. That ambiguity was a source of retry/resume confusion and made queue behavior
harder to reason about across edit, restore, CLI, API, and Electron IPC paths.

### 12. Messages briefly appearing then disappearing on chat switch is a streaming-state sign

If the renderer shows messages momentarily and then they vanish on chat switch, check:

1. **Auto-resume loop** (core) — is `restoreChat` re-submitting a message that always
   errors? Look for repeating `sse start → sse error` pairs in the events table with no
   new `message` events between them. Also check whether queue state already owns the
   message, whether a stale `sending` row is being recovered incorrectly, and whether
   mutation-mode restore suppression is being bypassed. See Rule 7, Rule 8, and Rule 9.
2. **Subscription cycling** (renderer) — is `useChatEventSubscriptions` tearing down and
   recreating because a callback dep is unstable? See Rule 1 and Rule 3.
3. **Stale chatId on events** (main process) — are events arriving for the previous chat
   being applied to the new chat's message list before the subscription re-binds?
   See Rule 4 and Rule 5.
