# Subscription Consolidation — Done

**Date:** 2026-03-03  
**REQ:** `.docs/reqs/2026/03/03/req-subscription-consolidation.md`  
**Plan:** `.docs/plans/2026/03/03/plan-subscription-consolidation.md`

---

## Problem

`MaxListenersExceededWarning: 11 system listeners added to [EventEmitter]. MaxListeners is 10`

Each world accumulated three independent listeners on the `message` channel and two on the `world` channel at the infrastructure level:

| Registrar | Channel(s) | Count |
|---|---|---|
| `setupEventPersistence` | `message`, `sse`, `world`, `system` | 4 |
| `subscribeWorldToMessages` | `message` | 1 |
| `setupWorldActivityListener` | `world` | 1 |

With 8+ agent listeners also on `message`, total exceeded 10.  
Root cause: incremental feature drift across multiple git commits — not a design decision.

---

## Solution

Introduced **`core/events/title-scheduler.ts`** as a new Layer 4 module.  
`persistence.ts` (Layer 4) needed to call title-scheduling logic but couldn't import from `subscribers.ts` (Layer 6) without a layer violation. Extracting the logic to Layer 4 solved both the circular dependency and the duplicate listener problem.

### New listener topology

| Channel | Listener | Owner |
|---|---|---|
| `message` | combined: persist + title-schedule | `setupEventPersistence` |
| `world` | combined: persist + idle-title | `setupEventPersistence` |
| `sse` | persist start/end | `setupEventPersistence` |
| `system` | persist | `setupEventPersistence` |

`subscribeWorldToMessages` and `setupWorldActivityListener` are now **idempotent wrappers** that short-circuit (return the existing handle) when `setupEventPersistence` has already run for the same world. They still work as standalone fallbacks when `DISABLE_EVENT_PERSISTENCE=true`.

---

## Files Changed

| File | Type | Description |
|---|---|---|
| `core/events/title-scheduler.ts` | **New** | Layer 4 module: `isHumanSender`, `scheduleNoActivityTitleUpdate`, `runIdleTitleUpdate`, `clearWorldTitleTimers` |
| `core/events/persistence.ts` | Modified | `messageHandler` and `toolHandler` made `async`; combined persistence + title logic per channel; cleanup sets/clears `_worldMessagesUnsubscriber` and `_activityListenerCleanup` |
| `core/events/subscribers.ts` | Modified | Removed ~110 lines of private title logic; `subscribeWorldToMessages` and `setupWorldActivityListener` are idempotent wrappers; imports title logic from `title-scheduler.ts` |
| `core/events/index.ts` | Modified | Added `export * from './title-scheduler.js'` in Layer 4 section |
| `tests/core/events/subscription-listener-count.test.ts` | **New** | 10 regression tests verifying exactly 1 listener per channel with and without persistence |

---

## Invariants Now Enforced

- `message` channel: always exactly 1 world-level infrastructure listener (regardless of agent count)  
- `world` channel: always exactly 1 world-level infrastructure listener  
- Both idempotent wrappers verified by regression test to be safe no-ops in the combined path

---

## Zero Callers Changed

All existing call sites (`managers.ts`, `subscription.ts`, server, CLI, Electron) continue to work unchanged. The redundant call to `setupWorldActivityListener` in `managers.ts` (called after `setupEventPersistence`) now safely returns the existing handle rather than adding a second listener.

---

## Test Results

- TypeScript: no errors (`tsc --noEmit`)
- Unit tests: **152 files, 1234 tests — all pass**
- Post-stream title scenarios: all 11 existing tests pass unchanged
- New listener-count regression: 10 tests, all pass
