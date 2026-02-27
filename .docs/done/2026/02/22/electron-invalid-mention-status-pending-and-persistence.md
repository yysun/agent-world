# Done: Electron Invalid Mention Status, Pending Semantics, and Persistence

**Date**: 2026-02-22  
**Context**: User-reported regressions around wrong `@mention` handling, status bar messaging, pending semantics, working indicator visibility, and no-response message persistence.

## Summary

Completed an end-to-end fix across Electron renderer and core event subscribers to ensure:
- status attribution is derived from core-emitted activity events only,
- completion messaging is explicit and accurate,
- pending response state is populated only when an agent actually starts,
- working indicator remains visible during send handshake,
- human messages are persisted even when no agent responds.

## Completed Scope

### 1) Core-event-only activity attribution
- Removed frontend mention validation/inference from send and status paths.
- Status and processed-agent counting now derive only from core realtime activity events (`activeSources` + lifecycle transitions).

### 2) Status bar completion messaging
- Added processed-agent completion wording:
  - `N agents processed this message` for non-zero,
  - `No agent processed the message.` for zero.
- Added send-finish fallback: when send completes and no core activity appears within a short window, emit `No agent processed the message.`.

### 3) Pending semantics and working indicator behavior
- Enforced strict pending semantics:
  - removed optimistic pending insertion on send,
  - pending is now driven by actual realtime agent-start activity.
- Preserved UX feedback by including send-state handshake in composer activity indicator logic.

### 4) Core persistence fix for no-response path
- Fixed subscriber logic so incoming human messages are saved to memory even when `shouldRespond` is false.
- Preserved no-double-save behavior when `shouldRespond` is true.

## Key Files Updated

- `electron/renderer/src/utils/app-helpers.ts`
- `electron/renderer/src/App.tsx`
- `electron/renderer/src/hooks/useMessageManagement.ts`
- `core/events/subscribers.ts`
- `tests/electron/renderer/app-utils-extraction.test.ts`

## Validation Performed

- `npx vitest run tests/electron/renderer/app-utils-extraction.test.ts tests/core/event-persistence-enhanced.test.ts`
- `npx vitest run tests/electron/renderer/app-utils-extraction.test.ts tests/core/event-persistence-enhanced.test.ts tests/core/events/post-stream-title.test.ts`
- Diagnostics check on changed files via editor problems API.

## Validation Results

- Test result: 3 test files passed, 38 tests passed.
- Diagnostics result: no errors in modified files.

## Notes

- This DD captures the final integrated behavior after iterative fixes for core-driven status text, pending semantics, and persistence.
- Optional follow-up manual check: run Electron and verify wrong-mention flow from send → status → storage visibility in one pass.
