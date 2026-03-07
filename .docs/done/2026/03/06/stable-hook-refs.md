# stable-hook-refs — Done

**Date:** 2026-03-06  
**Story:** Stabilize inline arrow callbacks in Electron renderer hooks to prevent subscription teardown on every render.

---

## Problem

Inline arrow functions passed to `useWorldManagement` in `App.tsx` received new identities on every render. Downstream, `useChatEventSubscriptions` had 10 callback-type dependencies in its subscription `useEffect`, causing the subscription to tear down and rebuild whenever any callback changed — losing in-flight streaming messages and causing the welcome card to flicker on user input.

---

## Changes Made

### `electron/renderer/src/App.tsx`
- Added three `useCallback(..., [])` stable proxy functions **before** the `useWorldManagement` call:
  - `proxySetSessions` — delegates to `sessionSetterProxyRef.current.setSessions`
  - `proxySetSelectedSessionId` — delegates to `sessionSetterProxyRef.current.setSelectedSessionId`
  - `getSelectedSessionId` — reads `selectedSessionIdRef.current`
- Replaced the three former inline arrow functions in the `useWorldManagement({...})` call with the stable proxies.

### `electron/renderer/src/hooks/useChatEventSubscriptions.ts`
- Added five callback refs immediately after `pendingHitlFlushTimerRef`:
  - `onMainLogEventRef`, `onSessionSystemEventRef`, `refreshSessionsRef`, `resetActivityRef`, `setHitlPromptQueueRef`
- Each ref is synced to the latest prop on every render (`ref.current = prop`).
- Global log listener effect: passes `(entry) => onMainLogEventRef.current?.(entry)` so the handler always reads the latest callback at call-time. Deps reduced: `[api, onMainLogEvent]` → `[api]`.
- Chat subscription effect: all five forked callbacks now read from refs at call-time. Deps reduced from 10 to 6: removed `onSessionSystemEvent`, `refreshSessions`, `resetActivityRuntimeState`, `setHitlPromptQueue` (callback-type); retained `api`, `chatSubscriptionCounter`, `loadedWorldId`, `selectedSessionId`, `setMessages`, `streamingStateRef` (data-identity-stable).

---

## Key Design Decision

`createGlobalLogEventHandler` and `createChatSubscriptionEventHandler` capture their callback arguments in closures at creation time. Refs must therefore be read through **stable wrapper functions** (e.g. `(entry) => ref.current?.(entry)`) that are created inside the effect, not passed as direct ref values. This ensures the handler created once at effect-mount always routes to the latest callback at invocation time.

---

## Tests Added

| File | Tests | What They Cover |
|------|-------|-----------------|
| `tests/electron/renderer/app-mount-regression.test.ts` | 3 | Proxy-ref indirection pattern: latest setter always receives calls, stale setter is not invoked, function updaters work |
| `tests/electron/renderer/chat-event-subscriptions-ref-stability.test.ts` | 3 | `createGlobalLogEventHandler` stable-wrapper tracks latest callback; safe when ref is unset; `forwardSessionSystemEvent` reads latest callbacks at call-time |

All 178 test files (1450 tests) pass. Integration tests pass.

---

## References

- REQ: `.docs/reqs/2026/03/06/req-stable-hook-refs.md`
- Plan: `.docs/plans/2026/03/06/plan-stable-hook-refs.md`
