# Done: World Runtime Registry + User-Only Queue Dispatch

**Date:** 2026-03-03  
**Branch:** `feature/message-queue`  
**Requirements:**
- [req-world-runtime-registry.md](../../../reqs/2026/03/03/req-world-runtime-registry.md)
- [req-world-message-dispatch-queue.md](../../../reqs/2026/03/03/req-world-message-dispatch-queue.md)
**Plan:** [plan-world-runtime-registry.md](../../../plans/2026/03/03/plan-world-runtime-registry.md)

---

## Summary

Implemented a core world runtime registry and routed external user-send ingress through queue-backed dispatch while preserving internal immediate publish paths for assistant/tool/system events.

This change unifies runtime lifecycle ownership and guarantees queue processing is **user-message only**.

---

## Key Outcomes

1. Added core world runtime registry with storage-aware runtime identity and ref-count lifecycle.
2. Updated `subscribeWorld(...)` to acquire/reuse runtime via registry.
3. Added runtime-start queue recovery and active-chat queue resume hooks.
4. Routed external user message ingress in API, Electron IPC, and CLI through queue-backed helper.
5. Enforced user-only queueing in core dispatch helper:
   - `human`/`user*` senders: queued + event-driven processing
   - non-user senders: immediate publish (not queued)
6. Preserved existing public API compatibility and event semantics.

---

## Architecture Notes

### Runtime Registry

- New module: `core/world-registry.ts`
- Runtime key: `storageType + normalizedStoragePath + worldId`
- Features:
  - in-flight start dedup
  - ref-counted consumer ownership
  - runtime snapshots for diagnostics
  - deterministic stop/release

### Subscription Startup Ownership

- `core/subscription.ts` now delegates runtime acquisition to registry.
- During runtime start:
  - recover interrupted queue rows (`sending -> queued`)
  - resume queue for active chat

### User-Only Queue Dispatch

- New/extended core helper in `core/managers.ts`:
  - `enqueueAndProcessUserMessage(...)`
  - optional source metadata and preassigned message ID support
- Behavior:
  - user sender -> enqueue + trigger processing
  - non-user sender -> immediate event publish, bypass queue

---

## Files Changed

| File | Change |
|---|---|
| `core/world-registry.ts` | New runtime registry implementation |
| `core/subscription.ts` | Registry-based runtime acquisition, startup queue recovery/resume |
| `core/managers.ts` | Extended queue API, added user-only queue dispatch helper |
| `core/index.ts` | Exported registry and queue dispatch/recovery helpers |
| `server/api.ts` | Routed external message ingress to queue-backed helper |
| `electron/main-process/ipc-handlers.ts` | Send-message path switched to queue-backed helper |
| `electron/main.ts` | Wiring updates for new IPC dependency |
| `cli/commands.ts` | User message send routed to queue-backed helper |
| `tests/core/world-registry.test.ts` | New registry unit tests |
| `tests/core/subscription-world-registry.test.ts` | New subscription/runtime reuse tests |
| `tests/core/subscription-refresh-title-listener.test.ts` | Mock updates for new startup hooks |
| `tests/core/queue-user-only-dispatch.test.ts` | New user-only queue dispatch coverage |
| `tests/electron/ipc-handlers.test.ts` | IPC dependency shape updates |
| `tests/electron/main/main-ipc-handlers.test.ts` | Send-path assertions updated for queue helper |
| `.docs/plans/2026/03/03/plan-world-runtime-registry.md` | Progress updated to reflect completed implementation |

---

## Verification

### Targeted Tests

- `npm run test -- tests/core/queue-user-only-dispatch.test.ts tests/core/subscription-world-registry.test.ts tests/core/subscription-refresh-title-listener.test.ts tests/core/world-registry.test.ts tests/core/subscription-cleanup.test.ts tests/core/events/subscription-listener-count.test.ts tests/electron/ipc-handlers.test.ts tests/electron/main/main-ipc-handlers.test.ts`
- Result: **30 passed**

### Integration Tests

- `npm run integration`
- Result: **24 passed**

### Build

- `npm run build`
- Result: **success**

---

## Behavior Guarantees Confirmed

1. Queue dispatch is restricted to user messages only.
2. Assistant/tool/system messages do not get enqueued.
3. Runtime reuse prevents duplicate startup work for the same storage-context world.
4. Subscription lifecycle remains compatible with existing API surface.
