# DD: Approval Persistence via Message-History Reconstruction

**Date:** 2026-02-28  
**Status:** Complete  
**Related REQ:** `.docs/reqs/2026/02/28/req-approval-persistence.md`  
**Related AP:** `.docs/plans/2026/02/28/plan-approval-persistence.md`  

## Summary

Implemented approval-cache reconstruction for `load_skill` HITL approvals so grants survive restart and chat restore:
- session approvals (`yes_in_session`) are rebuilt from persisted tool-result messages,
- turn approvals (`yes_once`) are rebuilt only for the current (latest) turn,
- restore flow now clears stale chat-scoped caches and repopulates from storage-backed history,
- edit-and-resubmit path clears chat-scoped approval and pending HITL runtime state.

## Implemented Scope

### 1) Reconstruction in `load-skill-tool`

Added exported reconstruction utility in `core/load-skill-tool.ts`:
- `reconstructSkillApprovalsFromMessages(worldId, chatId, messages)`
- derives current turn marker from latest matching user message (`msg` -> `ts` -> `content` -> `idx`)
- restores:
  - `yes_in_session` -> `skillSessionApprovals`
  - `yes_once` in current turn only -> `skillTurnApprovals`
- ignores malformed/non-approval payloads and non-`load_skill_approval` records

### 2) Restore-flow integration in `managers`

Updated `restoreChat()` in `core/managers.ts` (both restore branches):
- loads memory via storage wrappers,
- clears chat-scoped approval cache,
- reconstructs approval cache from persisted messages,
- then replays pending HITL prompts.

### 3) Edit-and-resubmit cache hygiene

Updated `editUserMessage()` in `core/managers.ts` to clear stale chat-scoped runtime state before removal/resubmission:
- `clearChatSkillApprovals(worldId, chatId)`
- `clearPendingHitlRequestsForChat(worldId, chatId)`

Added helper in `core/hitl.ts`:
- `clearPendingHitlRequestsForChat(worldId, chatId)`

### 4) Tests

Added/updated tests for reconstruction and restart behavior:
- `tests/core/reconstruct-skill-approvals.test.ts`
  - session restore
  - current-turn `yes_once` restore
  - prior-turn `yes_once` not restored
  - `no` not cached
  - malformed/non-approval skipped
  - non-`load_skill_approval` payload ignored
  - empty/missing-world/null-chat edge cases
- `tests/core/load-skill-tool.test.ts`
  - restart simulation: grant `yes_in_session` -> clear caches -> reconstruct from messages -> no re-prompt on later turn

## Requirement Coverage

1. **R1 session reconstruction on restore:** implemented.
2. **R2 current-turn-only `yes_once` reconstruction:** implemented.
3. **R3 message history as source of truth:** implemented via clear-and-reconstruct on restore.
4. **R4 no approval UX/option changes:** preserved (`yes_once`, `yes_in_session`, `no`).
5. **R5 clear on edit-and-resubmit:** implemented and validated in runtime flow.

## Files in Reference Commit

- `.docs/plans/2026/02/28/plan-approval-persistence.md`
- `.docs/reqs/2026/02/28/req-approval-persistence.md`
- `core/hitl.ts`
- `core/load-skill-tool.ts`
- `core/managers.ts`
- `tests/core/load-skill-tool.test.ts`
- `tests/core/reconstruct-skill-approvals.test.ts`

## Verification

### Commands

1. `npm test`
2. `npm run integration`

### Results

- Unit suite passed.
- Integration suite passed.
