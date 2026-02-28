# DD: HITL Core Activation Snapshot and Chat Resume Hardening

**Date:** 2026-02-25  
**Type:** CR + DD  
**Related REQ:**
- `.docs/reqs/2026-02-24/req-hitl-tool-call-driven-ui.md`
- `.docs/reqs/2026-02-24/req-chat-load-auto-resume.md`

## Scope Completed

- Centralized chat activation into core via `activateChatWithSnapshot`.
- Updated server `/setChat` and Electron `selectSession` to use core activation snapshot output.
- Preserved history-first UX and deterministic pending HITL prompt availability on chat load/switch.
- Added runtime HITL replay on subscription with persisted-message fallback.
- Persisted synthetic `human_intervention_request` tool-call and matching tool-result messages in `load_skill` approval flow.

## CR Summary

### Reviewed Areas

- `core/managers.ts`
- `core/hitl.ts`
- `core/events/memory-manager.ts`
- `core/load-skill-tool.ts`
- `server/api.ts`
- `electron/main-process/realtime-events.ts`
- `electron/main-process/ipc-handlers.ts`
- `electron/renderer/src/App.tsx`
- `web/src/pages/World.update.ts`
- `tests/api/chat-route-isolation.test.ts`
- `tests/core/restore-chat-validation.test.ts`
- `tests/electron/main/main-realtime-events.test.ts`

### High-Priority Findings and Actions

1. **Duplicate architecture path in server `/setChat`**
   - Finding: route-local HITL reconstruction still existed after introducing core activation snapshot.
   - Action: removed route-local helper and switched route to core snapshot output only.

2. **Regression in API route tests due to architecture shift**
   - Finding: tests still expected `restoreChat` and route-local memory reconstruction calls.
   - Action: updated tests to assert `activateChatWithSnapshot` behavior and payload.

3. **Potential replay visibility gap on subscription timing**
   - Finding: runtime pending HITL prompts could be missed before renderer listener attachment.
   - Action: added runtime pending HITL replay in Electron subscription flow.

## Validation Executed

- `npx vitest run tests/api/chat-route-isolation.test.ts` ✅
- `npx tsc --noEmit` ✅

## Notes

- Full `npm test` is intentionally left as a follow-up broader regression pass.
- Final architecture now keeps core as single source for chat activation snapshot and pending HITL prompt selection.
