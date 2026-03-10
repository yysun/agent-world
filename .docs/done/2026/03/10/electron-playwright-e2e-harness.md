# Done: Electron Playwright E2E Harness + HITL Session Scope

**Date:** 2026-03-10  
**Branch:** `electron-test`  
**Story:** `electron-playwright-e2e-harness`

---

## Summary

Delivered a full Playwright-based Electron E2E harness with real-provider (Gemini) desktop test coverage, and fixed three blocking runtime bugs discovered during the E2E run. All 29 tests pass.

---

## Deliverables

### New Code

| File | Description |
|------|-------------|
| `electron/renderer/src/domain/hitl-scope.ts` | Pure session-scoping helpers: `selectHitlPromptForSession`, `hasHitlPromptForSession`, `deriveHitlPromptDisplayState` |
| `tests/electron/renderer/hitl-queue-scope.test.ts` | 9 unit tests for the above helpers |

### Modified Code

| File | Change |
|------|--------|
| `electron/renderer/src/App.tsx` | AD-4 fix: replaced per-switch `useEffect` HITL filter with render-time session scoping via `deriveHitlPromptDisplayState`; queue is preserved across session switches |
| `electron/main-process/ipc-handlers.ts` | Removed `refreshWorldSubscription` call from `selectWorldSession` to avoid dropping in-flight SSE events on session switch |
| `electron/main-process/realtime-events.ts` | Added `runtimeEmittedToolCallIds` set so live runtime map's correct option IDs (`approve`/`deny`) are not overwritten by persisted-message replay's re-derived `opt_1`/`opt_2` IDs |
| `tests/electron-e2e/chat-flow-matrix.spec.ts` | Unskipped HITL scope test; added 60 s timeouts on all HITL call sites; fixed "create new chat and edit HITL" to approve the LLM's `human_intervention_request` on the setup message before editing; added `selectSessionByName` before contamination test |
| `tests/electron-e2e/support/electron-harness.ts` | `deleteLatestUserMessage`: replaced `page.once('dialog')` with `page.evaluate(() => window.confirm = () => true)`; `waitForHitlPrompt`/`respondToHitlPrompt`: added optional `timeoutMs` parameter |
| `tests/electron/main/main-ipc-handlers.test.ts` | Updated 2 tests to reflect no-refresh behavior in `selectWorldSession` (37/37 pass) |
| `tests/electron/main/main-realtime-events.test.ts` | New regression test: `skips persisted-message HITL replay for toolCallIds already emitted by runtime map` (14/14 pass) |

---

## Bugs Fixed

### AD-4: HITL Prompt Visible in Wrong Session
**Root cause:** `App.tsx` cleared the entire HITL prompt queue on every session switch, losing in-flight prompts from other sessions.  
**Fix:** Queue is never cleared on switch. `deriveHitlPromptDisplayState(queue, selectedSessionId)` returns only prompts for the active session at render time.

### Option ID Mismatch (`approve`/`deny` vs `opt_1`/`opt_2`)
**Root cause:** Two HITL replay paths fire on `subscribeChatEvents`. The live runtime map emits correct IDs (`approve`/`deny` for `shell_cmd`). The persisted-message replay re-derives `opt_1`/`opt_2` for the same `toolCallId`. Renderer deduplicates by `requestId`; if persisted arrived first, `submitWorldHitlResponse` rejected the submission.  
**Fix:** `runtimeEmittedToolCallIds` set tracks all `toolCallId` values emitted by the runtime replay. Persisted-message replay skips any ID already in the set.

### Session Switch Drops In-Flight SSE Events
**Root cause:** `selectWorldSession` called `refreshWorldSubscription` after `activateChatWithSnapshot`, which tore down and re-established chat-event subscriptions — dropping events already in flight.  
**Fix:** Removed the `refreshWorldSubscription` call from `selectWorldSession` entirely.

### `window.confirm` Not Caught by Playwright in Electron
**Root cause:** `page.once('dialog')` does not reliably intercept native `window.confirm` in Electron.  
**Fix:** `page.evaluate(() => { window.confirm = () => true; })` before clicking the delete button.

### LLM Routes "HITL" Setup Message to `human_intervention_request`
**Root cause:** In the "create new chat and edit HITL" test, the setup message contained the word "HITL", triggering the agent's `human_intervention_request` rule. `waitForAssistantToken` timed out because the system never went idle.  
**Fix:** Test now approves the `human_intervention_request` HITL prompt first, waits for the Send button to re-appear, then proceeds with the edit.

### Contamination Test Used Wrong Starting Session
**Root cause:** In the full suite, the prior test left a different session active. The contamination test sent the isolation message to the wrong session.  
**Fix:** Added `selectSessionByName(page, CHAT_NAMES.current)` at the start of the contamination test.

---

## Test Results

| Suite | Result |
|-------|--------|
| `tests/electron/renderer/hitl-queue-scope.test.ts` | 9/9 ✅ |
| `tests/electron/main/main-realtime-events.test.ts` | 14/14 ✅ |
| `tests/electron/main/main-ipc-handlers.test.ts` | 37/37 ✅ |
| E2E: `chat-flow-matrix.spec.ts` (full suite) | **29/29 ✅** |
