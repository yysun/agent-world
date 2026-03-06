# Done: Electron System Event Status Bar

**Date:** 2026-03-06
**Branch:** main
**Req:** `.docs/reqs/2026/03/06/req-electron-system-event-status-bar.md`
**Plan:** `.docs/plans/2026/03/06/plan-electron-system-event-status-bar.md`

---

## Summary

Implemented selected-chat system event visibility in the Electron renderer status bar.

The status bar now surfaces chat-scoped system events such as title updates, timeout notices, retry tracking updates, and other human-readable operational messages without inserting them into the conversation transcript.

## Completed Scope

- Added a pure renderer-domain helper to normalize chat-scoped system events into transient status-bar entries.
- Extended renderer subscription wiring so selected-chat system events continue existing title-refresh side effects and also reach App-level status state.
- Added App-level transient system-status lifecycle management with supersession, expiry, and clearing on world or chat change.
- Extended `WorkingStatusBar` rendering precedence so local notifications remain highest priority, selected-chat system status renders next, and working or done fallback remains last.
- Kept eligibility strict: only explicitly chat-scoped system events are shown in the chat status bar.
- Preserved existing transcript behavior so system events are not treated as conversation messages.

## Files Added

| File | Purpose |
|---|---|
| `electron/renderer/src/domain/session-system-status.ts` | Pure formatting and retention helpers for selected-chat system status |
| `tests/electron/renderer/session-system-status.test.ts` | Formatter, scoping, and retention regression coverage |
| `tests/electron/renderer/chat-event-subscriptions-system-status.test.ts` | Subscription forwarding helper coverage |

## Files Updated

| File | Change |
|---|---|
| `electron/renderer/src/hooks/useChatEventSubscriptions.ts` | Forward selected-chat system events to App-level status handling while preserving title refresh |
| `electron/renderer/src/App.tsx` | Own transient selected-chat system status state and lifecycle |
| `electron/renderer/src/components/WorkingStatusBar.tsx` | Render system-event status with deterministic precedence |
| `tests/electron/renderer/working-status-bar.test.ts` | Added precedence coverage for notifications, system status, and working fallback |

## Validation Performed

- `npx vitest run tests/electron/renderer/session-system-status.test.ts tests/electron/renderer/working-status-bar.test.ts tests/electron/renderer/chat-event-subscriptions-system-status.test.ts tests/electron/renderer/chat-event-handlers-domain.test.ts` → passed
- `npm test` → passed
- `npm run build` → passed

## CR Outcome

- No high-priority issues remained after implementation and test review.
- One hook-level test approach was replaced with a pure-helper test after an invalid React hook runtime setup; final coverage stays at the unit boundary and is deterministic.

## Outcome

Electron now shows relevant selected-chat system events directly in the status bar with bounded lifecycle and explicit chat scoping, while preserving existing session refresh behavior and transcript isolation.