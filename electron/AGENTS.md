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

## Core Auto-Resume Rules (Strict)

These rules apply to all changes touching `core/managers.ts` `restoreChat`,
`core/queue-manager.ts`, and any future resume-on-load logic.

### 11. Queue is the only automatic resume authority for user turns

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

### 12. Automatic recovery is limited to queue-owned `queued` / interrupted `sending` rows

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

### 13. Send/edit dispatch must use the active runtime after restore

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

### 14. Subscription/rebind helpers must be idempotent

Rebinding agent/world listeners must first remove any existing listener for the same target.

Do not stack duplicate listeners for:

- agent message subscriptions
- world message/system/activity forwarding
- chat realtime subscriptions

Duplicate listeners cause duplicate processing, duplicate persisted errors, and misleading
UI “duplicates” that are actually multi-processing bugs.

### 15. Edit/delete mutation flows must suppress restore-time auto-resume

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

### 16. Failed user turns do not auto-retry; recovery is explicit

Queue dispatch failure behavior:

- user-authored dispatch/runtime failures transition the queue row to durable `error`
- no-response fallback and preflight no-responder failures also transition to `error`
- there is no automatic exponential-backoff replay for failed user turns
- retry is an explicit user action from queue/transcript recovery UI

Background replay of failed user turns should be treated as a regression.

### 17. Queue APIs are user-turn-only; non-user dispatch stays immediate

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

### 18. Persist at most one canonical durable system-error row per failed turn, but trim and orphan-clean it

Logs stay in the logs panel. The transcript may show a structured `system` error row for a
failed user turn, and that row must survive refresh/restart. But it must also be removed
when the failed turn is edited away.

Rules:

- Persist structured `system/error` events with canonical IDs and chat scope.
- Realtime and restored system-error transcript rows must share canonical identity.
- Refresh/replay must preserve the original event timestamp; do not restamp restored rows
  with `now`, or old errors will look like fresh duplicates.
- Edit/delete trim must remove post-cutoff persisted events for the removed tail.
- Cleanup must also remove orphaned persisted `system/error` rows whose triggering user turn
  no longer survives in chat memory.

Target model:

- one canonical durable system-error row per failed turn
- duplicate rows should be treated as a bug in subscription, persistence, or cleanup logic

Failure modes:

- Switching away and back shows many “duplicate” system errors from historical failed turns.
- Editing again does not clear old leftover error rows.
- Old persisted errors reappear after refresh/restart even though the turn was replaced.

Relevant code:

- core trim/orphan cleanup in `core/message-edit-manager.ts`
- renderer replay/merge in `electron/renderer/src/domain/message-updates.ts`

### 19. Durable failed-turn artifacts should keep a stable turn link

Whenever possible, persisted failed-turn artifacts should carry a stable link to the
triggering user turn, such as `triggeringMessageId`.

Do not rely only on loose timestamp similarity when exact turn ownership can be persisted.
Exact links make trim/orphan cleanup deterministic and prevent old failed-turn rows from
surviving unrelated later edits.

Until an explicit turn-link field exists, cleanup may infer ownership from persisted event
ordering and surviving chat memory. New schemas and migrations should prefer exact links.

### 20. Queue preflight/dispatch failures must surface durable recovery state

If queue dispatch is blocked or fails before streaming starts, the turn must still surface
explicit recovery state.

Rules:

- transition the queue row to durable `error`
- persist a structured system-error row when appropriate
- do not silently fail with “nothing streamed” and no visible recovery path

---

## Tool / HITL Turn Lifecycle Rules (Strict)

These rules apply to tool-call execution, `load_skill`, HITL approval prompts, and any
queue/restore behavior that overlaps with those flows.

### 21. Tool/HITL state remains part of the owning user turn lifecycle

A queue-owned user turn is not complete just because assistant text or a tool-start event
was emitted.

The turn remains active until it reaches one of these durable outcomes:

- terminal assistant completion
- terminal tool error/result with continuation settled
- durable pending HITL/approval wait state
- durable failed-turn recovery state

Do not treat tool/HITL boundaries as detached side channels outside the user-turn lifecycle.

### 22. Pending approval prompts must be reconstructable from persisted messages

Runtime HITL maps are process-local and may be empty after refresh/restart. Frontends and
restore flows must be able to reconstruct pending approval state from persisted messages.

Rules:

- synthetic approval prompts such as `load_skill` -> `human_intervention_request` must keep
  stable `chatId`, `requestId`, `toolCallId`, and relevant metadata
- the matching tool-response message must resolve that same prompt identity
- runtime replay is additive, not the sole source of truth for pending approval UI

Tests: `tests/core/hitl.test.ts` and `tests/electron/main/main-realtime-events.test.ts`.

### 23. Queue stale-send recovery must not auto-resume across a pending HITL boundary

If persisted chat state already shows an unresolved HITL/approval prompt for the chat, a
stale queue row must not be blindly recovered back to `queued` and re-published.

Rules:

- unresolved persisted HITL prompts block restore-time auto-resume for the owning chat
- stale raw `sending` should move to explicit recovery/error state instead of replaying
  the user turn again
- pending approval UI may replay, but the original user turn must not be auto-resubmitted

Tests: `tests/core/auto-resume-sse-error-guard.test.ts`.

### 24. Every persisted tool-start needs a terminal partner or explicit wait artifact

A persisted `tool-start` must not leave the chat stuck forever with only a raw `sending`
queue row.

Acceptable follow-ups are:

- `tool-result`
- `tool-error`
- durable pending HITL/approval artifact tied to the same turn
- explicit durable failed-turn recovery state

Raw `tool-start` with no terminal partner and no durable wait/recovery artifact is a bug.

### 25. Edit/delete trim must clear orphaned tool/HITL artifacts for the removed tail

When a user edits or deletes a turn, cleanup must remove orphaned artifacts created by the
trimmed tail, including:

- persisted system-error rows
- pending HITL requests for that chat tail
- stale queue rows for trimmed turns
- tool/HITL artifacts whose owning turn no longer survives

Do not let replaced turns leave behind retryable queue state or recoverable approval UI.

### 26. Messages briefly appearing then disappearing on chat switch is a streaming-state sign

If the renderer shows messages momentarily and then they vanish on chat switch, check:

1. **Auto-resume loop** (core) — is `restoreChat` re-submitting a message that always
   errors? Look for repeating `sse start → sse error` pairs in the events table with no
   new `message` events between them. Also check whether queue state already owns the
   message, whether a stale `sending` row is being recovered incorrectly, and whether
   mutation-mode restore suppression is being bypassed. See Rule 11, Rule 12, and Rule 15.
2. **Subscription cycling** (renderer) — is `useChatEventSubscriptions` tearing down and
   recreating because a callback dep is unstable? See Rule 1 and Rule 3.
3. **Stale chatId on events** (main process) — are events arriving for the previous chat
   being applied to the new chat's message list before the subscription re-binds?
   See Rule 4 and Rule 5.
