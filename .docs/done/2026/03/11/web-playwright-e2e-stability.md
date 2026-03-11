# DONE: Web Playwright E2E Stability Pass

**Date Completed:** 2026-03-11
**Related REQ:** `.docs/reqs/2026/03/10/req-web-playwright-e2e-harness.md`
**Related AP:** `.docs/plans/2026/03/10/plan-web-playwright-e2e-harness.md`
**Related AT:** `.docs/tests/test-web-playwright-e2e-harness.md`

---

## What Was Delivered

Completed the follow-up stabilization pass for the real-browser web Playwright harness so all runnable web E2E coverage now passes against the live web app, Express API, SSE stream, and real Gemini-backed agent flow.

Final result:

- `36 passed`
- `5 skipped`
- `0 failed`

The 5 skipped tests remain the intentionally pending queue-management-panel cases in `tests/web-e2e/queue.spec.ts`.

---

## Scope of the Stability Pass

This pass fixed the remaining failures that appeared after the initial harness landed:

1. Chat-flow matrix races in the real browser:
   - optimistic user rows disappearing before edit/delete actions
   - switched-chat HITL prompt ownership and replay drift
   - chat mutation actions racing world-processing completion
   - brittle delete assertions matching page-wide duplicate text instead of current conversation state

2. World smoke failures:
   - Home carousel smoke checks assuming the seeded world card was already focused
   - chat-search input not actually updating component state
   - world-settings smoke looking at a hidden duplicate button instead of the visible control

---

## App Fixes

### `web/src/pages/World.update.ts`

- Preserved pending `hitlPromptQueue` entries across `load-chat-from-history` so chat-switch async-generator loading states do not drop pending approvals.
- Scoped send/input blocking to `hasHitlPromptForChat(...)` for the active chat only.
- Added `update-chat-search` so the chat-history filter input updates real component state.
- Backfilled missing HITL `chatId` on `handleToolProgress` from `data.chatId` or `state.currentChat.id` when the incoming prompt payload omitted chat scope.

### `web/src/pages/World.tsx`

- Added `chatSearchQuery` to World page state.
- Passed `chatSearchQuery` into `WorldChatHistory`.
- Continued deriving visible HITL UI from `selectHitlPromptForChat(...)` so only the active chat’s prompt is rendered.

### `web/src/domain/hitl.ts`

- Added chat-scoped helper selection for HITL prompt visibility:
  - `selectHitlPromptForChat`
  - `hasHitlPromptForChat`

### `web/src/utils/sse-client.ts`

- Forwarded `chatId` with tool events (`tool-start`, `tool-progress`, `tool-result`, `tool-error`) so the web renderer can keep HITL prompts and tool state tied to the owning chat.

### `web/src/types/index.ts`

- Added `chatSearchQuery` to `WorldComponentState`.
- Extended `WorldChatHistoryProps` with `chatSearchQuery`.

### `web/src/types/events.ts`

- Added `update-chat-search` event typing.

### `web/src/components/swipe-carousel.tsx`

- Added stable `world-dot-*` test IDs so web smoke tests can focus the seeded world before asserting enter/delete controls.

---

## Harness and Spec Fixes

### `tests/web-e2e/support/web-harness.ts`

- Added API-level world-idle polling using `/api/worlds/:world/status`.
- `waitForWorldIdle(...)` now waits for both UI idle and API idle.
- `createNewChat(...)` now waits for the world to be fully idle before issuing chat creation.
- `deleteAllAgents(...)` now waits for API idle before teardown attempts, avoiding `AGENT_DELETE_ERROR` races.

### `tests/web-e2e/chat-flow-matrix.spec.ts`

- Hardened setup turns to explicitly forbid tool usage so real-model bootstrap messages do not accidentally create unrelated HITL prompts.
- Scoped delete-success and cross-chat delete-isolation assertions to the current conversation area instead of page-wide text.
- Kept longer real-browser timeouts for switched-chat and HITL scenarios.

### `tests/web-e2e/world-smoke.spec.ts`

- Focuses the seeded world via the carousel dot before checking enter/delete affordances.
- Updated the chat-search smoke to assert the empty-state message and hidden chat list together.
- Targets the visible world-settings button on the world page rather than a hidden duplicate control.

---

## Regression Coverage Added or Updated

### `tests/web-domain/world-update-chat-switch-hitl-replay.test.ts`

Added targeted regressions for:

- preserving pending HITL queue entries through chat-switch loading
- updating `chatSearchQuery` from the search input payload
- backfilling missing HITL prompt `chatId` from the active chat during tool-progress handling

### Existing focused regressions kept green

- `tests/web-domain/hitl.test.ts`
- `tests/core/new-chat-default-reuse.test.ts`

---

## Files Changed

| File | Purpose |
|------|---------|
| `web/src/pages/World.update.ts` | chat-switch HITL preservation, active-chat HITL gating, chat-search state update, HITL chatId fallback |
| `web/src/pages/World.tsx` | state wiring for `chatSearchQuery` and chat-scoped HITL display |
| `web/src/domain/hitl.ts` | active-chat HITL prompt selection helpers |
| `web/src/utils/sse-client.ts` | tool-event `chatId` propagation |
| `web/src/types/index.ts` | world state and chat-history prop typing updates |
| `web/src/types/events.ts` | typed `update-chat-search` event |
| `web/src/components/swipe-carousel.tsx` | stable `world-dot-*` test IDs |
| `tests/web-e2e/support/web-harness.ts` | API-idle synchronization helpers for real-browser chat actions |
| `tests/web-e2e/chat-flow-matrix.spec.ts` | deterministic setup turns and conversation-scoped delete assertions |
| `tests/web-e2e/world-smoke.spec.ts` | aligned smoke expectations with current UI behavior |
| `tests/web-domain/world-update-chat-switch-hitl-replay.test.ts` | targeted regressions for chat-search and HITL scope fallback |

---

## Verification

### Focused unit and domain checks

```bash
npm test -- tests/web-domain/world-update-chat-switch-hitl-replay.test.ts tests/web-domain/hitl.test.ts tests/core/new-chat-default-reuse.test.ts
```

Result: passing

### Integration suite

```bash
npm run integration
```

Result: `24 passed`

### Full web Playwright suite

```bash
npm run test:web:e2e:run
```

Result:

- `36 passed`
- `5 skipped`
- `0 failed`

---

## Outcome

The real-browser web Playwright harness is now stable enough to serve as a local quality gate for all implemented web E2E coverage. All runnable scenarios pass, including:

- loaded current chat flows
- switched chat flows
- new chat flows
- delete/edit/HITL/error paths
- world and chat management smoke coverage
- queue indicator / stop / error-overlay coverage

Only the explicitly pending queue-management-panel tests remain skipped because the corresponding web UI is not yet implemented.
