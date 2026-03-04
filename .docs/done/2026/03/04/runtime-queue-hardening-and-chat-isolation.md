# Done: Runtime + Queue Hardening and Chat Isolation

**Date:** 2026-03-04  
**Scope:** Consolidated session fixes for queue dispatch reliability, runtime selection correctness, and world-registry refresh safety.

---

## Summary

This session hardened message queue processing and runtime selection to prevent stuck/lost messages caused by stale world instances or chat-coupled backend assumptions.

Key outcomes:

1. Backend queue/runtime selection no longer depends on `world.currentChatId`.
2. Runtime refresh now updates the registry's active world reference.
3. Queue dispatch/retry paths now consistently resolve the latest runtime world.
4. Queue no-responder handling is fail-safe and observable (no silent loss).

---

## Issues Addressed

### 1) `currentChatId` coupling in backend runtime selection

Problem:
- Runtime/queue routing could rely on `currentChatId`, which is a frontend session concept and can drift from queue target chat.

Fixes:
- `getActiveSubscribedWorld(worldId, preferredChatId)` now matches by runtime chat membership (`world.chats.has(chatId)`), not `currentChatId`.
- Subscription startup no longer auto-resumes queue from `runtime.world.currentChatId`.
- Queue/immediate dispatch paths prefer chat-aware active runtime lookup (`worldId + chatId`).

Files:
- `core/subscription.ts`
- `core/managers.ts`

---

### 2) World-registry refresh stale-pointer bug

Problem:
- Runtime refresh could produce a new world object, but registry still exposed the pre-refresh world reference.
- Symptoms included stale diagnostics and dispatching on torn-down runtime objects.

Fixes:
- Extended runtime refresh contract to allow returning replacement world (`Promise<TWorld | void>`).
- Registry refresh now updates `record.runtime.world` when refresh returns a new world object.
- Subscription runtime refresh now returns refreshed world to registry.

Files:
- `core/world-registry.ts`
- `core/subscription.ts`

---

### 3) Retry dispatch using captured stale world (P1)

Problem:
- Retry timer captured the original failed `world` reference and reused it later.
- If runtime changed before retry execution, retry could publish on stale/destroyed world.

Fix:
- Retry timer now resolves runtime world at execution time:
  1. `getActiveSubscribedWorld(worldId, chatId)`
  2. fallback `getWorld(worldId)`
- Retry is skipped safely with warning when no runtime world is available.

Files:
- `core/managers.ts`

---

### 4) Queue no-responder resilience and diagnostics

Problem:
- No-responder situations could look like silent failures and required better recovery behavior and observability.

Fixes:
- Added queue responder preflight with one runtime-refresh attempt before dispatch.
- If still no eligible responders, row transitions to `error` (no silent drop).
- Fallback timeout path routes through retry/error flow, preserving queue row state.
- Added detailed `agentStatus` snapshot into queue publish/failure/fallback logs.

Files:
- `core/managers.ts`

---

### 5) Subscription cleanup consistency

Problem:
- Destroyed runtime world could retain stale subscriber metadata maps.

Fix:
- Clear `_agentUnsubscribers` map on world teardown to avoid stale diagnostics artifacts.

Files:
- `core/subscription.ts`

---

## Test Coverage Added/Updated

### New tests
- `tests/core/subscription-active-world-selection.test.ts`
  - chat-map-based runtime selection
  - verifies no implicit `currentChatId` selection

### Updated tests
- `tests/core/world-registry.test.ts`
  - verifies refresh updates runtime world reference in registry
- `tests/core/subscription-world-registry.test.ts`
  - verifies subscriber sees refreshed runtime world instance
- `tests/core/restore-chat-validation.test.ts`
  - verifies retry path resolves latest active runtime world before re-dispatch
  - existing queue matrix/branch tests updated to assert new queue behavior

---

## Verification Executed

Executed with Node 22 (`nvm use default`):

1. Targeted vitest suites for queue/runtime/subscription paths: passed.
2. `tests/core/restore-chat-validation.test.ts`: passed.
3. `npm run integration`: passed.

---

## Related Session DD

- `.docs/done/2026/03/04/queue-retry-runtime-world-resolution.md` (focused P1 write-up)

