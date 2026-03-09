# Done: managers.ts God-Module Decomposition

**Date:** 2026-03-09  
**Plan:** `.docs/plans/2026/03/09/plan-managers-refactor.md`  
**Req:** `.docs/reqs/2026/03/09/req-managers-refactor.md`  

---

## Summary

Decomposed the 2928-line `core/managers.ts` god-module into three focused sub-modules with zero breaking API changes. The public export surface is identical to before — all symbols remain importable from `core/managers.ts` via re-exports.

---

## Files Changed

### New Files
| File | Lines | Responsibility |
|---|---|---|
| `core/storage-init.ts` | 141 | Storage singleton, lazy init, dedup guard, world/agent ID resolution, `overrideStorageForTests()` |
| `core/queue-manager.ts` | 1063 | Per-chat FIFO queue, dispatch, retry/fallback, pause/resume/stop/clear, responder preflight |
| `core/message-edit-manager.ts` | 576 | Message remove/edit/migrate, title rollback, error log via `StorageAPI` optional methods |
| `tests/core/queue-manager.test.ts` | — | 4 unit tests for queue public API (vi.fn() mock storage) |
| `tests/core/message-edit-manager.test.ts` | — | 3 unit tests for removeMessagesFrom + logEditError/getEditErrors |

### Modified Files
| File | Change |
|---|---|
| `core/managers.ts` | 2928 → 1300 lines; all domain logic removed, re-exports added, `activateChatResources` helper extracted |
| `core/types.ts` | Added `saveEditErrors?` / `loadEditErrors?` optional methods to `StorageAPI` |
| `core/storage/memory-storage.ts` | Implemented `saveEditErrors` / `loadEditErrors` using in-memory Map; `clear()` updated |
| `core/storage/storage-factory.ts` | Added NoOp fallback wrappers for `saveEditErrors` / `loadEditErrors` |

---

## Architecture Decisions

### Cycle prevention via dynamic imports
`subscription.ts` statically imports `managers.ts`, so all new sub-modules use **dynamic `import('./managers.js')`** at the call site when they need `getWorld`, and **dynamic `import('./subscription.js')`** for `getActiveSubscribedWorld`. This keeps ESM live bindings working without introducing new static cycles.

### `overrideStorageForTests(wrappers)`
Exported from `storage-init.ts`. Replaces the singleton and resets the initialization guard atomically. Tests use `vi.fn()` mock `storageWrappers` objects rather than the full in-memory backend, because queue operations (`addQueuedMessage`, etc.) only exist in the SQLite backend.

### `activateChatResources` helper
Added to `managers.ts` to consolidate the previously duplicated resource-reactivation sequence (memory sync → skill approvals → HITL replay → pending resume → queue unpause) that appeared in both branches of `restoreChat`.

### `logEditError` / `getEditErrors` storage migration
Previously wrote to raw filesystem. Now routes through `StorageAPI` optional `saveEditErrors`/`loadEditErrors` with a `[]` fallback — making the feature portable across SQLite, in-memory, and future backends.

---

## Test Results

| Suite | Files | Tests |
|---|---|---|
| Unit (`npm test`) | 182 | 1471 ✅ |
| Integration (`npm run integration`) | 3 | 24 ✅ |
| TypeScript (`tsc --noEmit`) | — | 0 errors ✅ |

---

## Metrics

| Metric | Before | After |
|---|---|---|
| `managers.ts` lines | 2928 | 1300 (−55%) |
| New focused modules | 0 | 3 |
| New unit tests | 0 | 7 |
| Public API breakage | — | None |
