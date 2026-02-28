# Electron Branch Chat from Agent Message

**Date**: 2026-02-16  
**Type**: Feature + Reliability Hardening

## Overview
Implemented branch-chat support in the Electron app so users can branch directly from an assistant message.

Delivered behavior:
- Agent messages now expose a branch action icon.
- Branch action creates a new chat session in the same world.
- New chat contains copied source-chat messages from the start up to the selected assistant message (inclusive).
- UI selects the new branched chat immediately after creation.
- Failure path preserves current session and shows an error status.

## Implementation
- Added core branching capability:
  - `branchChatFromMessage(worldId, sourceChatId, messageId)`
  - Validates source chat + target message + assistant-role requirement
  - Creates new chat and copies message history up to target boundary
- Added reliability hardening in branch flow:
  - Rollback deletes newly created branch chat if copy fails mid-operation
  - Prevents partially copied/inconsistent branch sessions
- Added Electron IPC contract + route + handler:
  - New channel: `session:branchFromMessage`
  - New payload: worldId/chatId/messageId
- Added preload bridge and payload helper:
  - `branchSessionFromMessage(worldId, chatId, messageId)`
  - `toBranchSessionPayload(...)`
- Added renderer integration:
  - Branch icon action appears only on assistant message cards
  - Success path refreshes sessions and selects branched session
  - Failure path keeps source session selected and surfaces error

## Files Changed
- `core/managers.ts`
- `core/index.ts`
- `electron/shared/ipc-contracts.ts`
- `electron/main-process/ipc-routes.ts`
- `electron/main-process/ipc-handlers.ts`
- `electron/main.ts`
- `electron/preload/payloads.ts`
- `electron/preload/bridge.ts`
- `electron/renderer/src/App.jsx`
- `tests/electron/main/main-ipc-routes.test.ts`
- `tests/electron/preload/preload-bridge.test.ts`
- `tests/electron/preload/preload-payloads.test.ts`

## Testing
Focused suites executed with Node 22:
- `npm test -- tests/electron/main/main-ipc-routes.test.ts tests/electron/preload/preload-bridge.test.ts tests/electron/preload/preload-payloads.test.ts`

Full suite:
- `npm test`

Result:
- Focused suites: passed (`3` files, `14` tests)
- Full suite: passed (`86` files, `832` tests)

## Related REQ / AP Docs
- REQ: `.docs/reqs/2026-02-16/req-electron-branch-chat-from-agent-message.md`
- AP: `.docs/plans/2026-02-16/plan-electron-branch-chat-from-agent-message.md`

## Notes
- AP checklist item for dedicated renderer behavior test coverage remains open for future tightening.
