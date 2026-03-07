# Plan: Stabilize Electron Renderer Hook Callback References

**Req:** `.docs/reqs/2026/03/06/req-stable-hook-refs.md`

## Phase 1: Stabilize inline arrows in App.tsx (R1)

- [ ] 1.1 Add three `useCallback`-wrapped proxy functions before the `useWorldManagement` call:
  - `proxySetSessions = useCallback((updater) => sessionSetterProxyRef.current.setSessions?.(updater), [])`
  - `proxySetSelectedSessionId = useCallback((updater) => sessionSetterProxyRef.current.setSelectedSessionId?.(updater), [])`
  - `getSelectedSessionId = useCallback(() => selectedSessionIdRef.current, [])`
- [ ] 1.2 Replace the inline arrows in the `useWorldManagement({...})` call with the stable references.

## Phase 2: Ref-ify callback deps in useChatEventSubscriptions (R2, R3)

- [ ] 2.1 Add callback refs at the top of the hook body:
  - `onSessionSystemEventRef = useRef(onSessionSystemEvent)`
  - `refreshSessionsRef = useRef(refreshSessions)`
  - `resetActivityRef = useRef(resetActivityRuntimeState)`
  - `onMainLogEventRef = useRef(onMainLogEvent)`
  - `setHitlPromptQueueRef = useRef(setHitlPromptQueue)`
- [ ] 2.2 Sync refs on every render (assignment after ref declarations).
- [ ] 2.3 Update the global log listener effect:
  - `createGlobalLogEventHandler` captures its callback in a closure at creation time, so we cannot pass `onMainLogEvent` directly. Instead, pass a stable inline that reads `onMainLogEventRef.current` at call time.
  - Remove `onMainLogEvent` from the dep array. New deps: `[api]`.
- [ ] 2.4 Update the chat subscription effect:
  - The `forwardSessionSystemEvent` inline already wraps `onSessionSystemEvent` and `refreshSessions` — change those reads to `onSessionSystemEventRef.current` and `refreshSessionsRef.current`.
  - The HITL `setHitlPromptQueue` call inside the flush timer must read `setHitlPromptQueueRef.current`.
  - The cleanup function's `resetActivityRuntimeState()` call must read `resetActivityRef.current()`.
  - Remove `onSessionSystemEvent`, `refreshSessions`, `resetActivityRuntimeState`, `setHitlPromptQueue` from the dependency array.
  - Keep `chatSubscriptionCounter` in deps for lint correctness (it's a ref — stable identity, never triggers re-runs).
  - Final deps: `[api, chatSubscriptionCounter, loadedWorldId, selectedSessionId, setMessages, streamingStateRef]`.

## Phase 3: Update tests (R4)

- [ ] 3.1 Update `tests/electron/renderer/app-mount-regression.test.ts` — add mock for `panel-log-scope` if missing and verify no-throw.
- [ ] 3.2 Update `tests/electron/renderer/chat-event-subscriptions-system-status.test.ts` — verify the system-event forwarding still works through refs.
- [ ] 3.3 Run full test suite (`npm test`) and fix any failures.

## Files Changed

| File | Change |
|------|--------|
| `electron/renderer/src/App.tsx` | Wrap 3 inline arrows in `useCallback` |
| `electron/renderer/src/hooks/useChatEventSubscriptions.ts` | Ref-ify 5 callback deps, shrink effect dep arrays |
| `tests/electron/renderer/app-mount-regression.test.ts` | Add missing mock, verify fix |
| `tests/electron/renderer/chat-event-subscriptions-system-status.test.ts` | Adapt to ref-based forwarding |
