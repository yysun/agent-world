# Plan: Derive Approval Status from Message History

**Date:** 2026-02-28
**REQ:** [req-approval-persistence.md](../../reqs/2026/02/28/req-approval-persistence.md)

## Overview

Add a reconstruction function that scans persisted skill-approval resolution messages and repopulates the in-memory `skillSessionApprovals` / `skillTurnApprovals` caches on chat restore.

## Key Observations

1. **Resolution messages already contain everything needed.** Each `role: 'tool'` message written by `persistLoadSkillApprovalResolutionMessage` has JSON content: `{ requestId, optionId, source, skillId }`. The `optionId` is `"yes_once"` | `"yes_in_session"` | `"no"`, and `skillId` identifies the skill.

2. **Turn scoping.** `yes_once` approvals are only valid for the current turn (latest user message). On restore, we derive the current turn marker from the last `user` message in history, and only restore `yes_once` grants that appear *after* that user message.

3. **Session scoping.** `yes_in_session` approvals are valid for the entire chat session regardless of turn. All such grants in the message history are restored.

4. **Integration point.** `restoreChat()` already calls `syncRuntimeAgentMemoryFromStorage()` then `replayPendingHitlRequests()`. The new reconstruction call goes between these — after memory is synced but before HITL replay.

## Implementation

### Phase 1: Reconstruction function in `load-skill-tool.ts`

- [x] Add exported function `reconstructSkillApprovalsFromMessages(worldId, chatId, messages)`
  - Accepts `worldId: string`, `chatId: string | null`, `messages: AgentMessage[]`
  - **Step 1:** Find the current turn marker — scan backwards for the last `role: 'user'` message matching `chatId`, derive marker using same logic as `getCurrentTurnMarker` (prefer `msg:${messageId}`, fallback to `ts:`, `content:`, `idx:`)
  - **Step 2:** Scan all `role: 'tool'` messages. For each, try `JSON.parse(content)`. If it has both `skillId` and `optionId` fields:
    - If `optionId === 'yes_in_session'`: add `createSessionApprovalKey(worldId, chatId, skillId)` to `skillSessionApprovals`
    - If `optionId === 'yes_once'` AND the message appears after the last user message (same turn): add `createTurnApprovalKey(worldId, chatId, skillId, turnMarker)` to `skillTurnApprovals`
    - If `optionId === 'no'`: skip (denial is the default)
  - Returns count of approvals restored (for logging)

### Phase 2: Wire into restore flow in `managers.ts`

- [x] Import `reconstructSkillApprovalsFromMessages` from `./load-skill-tool.js`
- [x] In `restoreChat()`, after `syncRuntimeAgentMemoryFromStorage` and before `replayPendingHitlRequests`, call:
  ```
  const memory = await storageWrappers.getMemory(resolvedWorldId, chatId)
  reconstructSkillApprovalsFromMessages(resolvedWorldId, chatId, memory)
  ```
  - Apply to **both** code paths (chat-is-current and switching-to-different-chat)

### Phase 3: Tests

- [x] Unit test `reconstructSkillApprovalsFromMessages` directly:
  - Session approval restored from `yes_in_session` message
  - Turn approval restored from `yes_once` message in current turn
  - Turn approval NOT restored from `yes_once` message in a previous turn
  - `no` decisions are not cached
  - Malformed/non-approval tool messages are safely skipped
  - Empty message list produces no approvals
- [x] Integration test: approval survives simulated restart
  - Grant `yes_in_session` → clear in-memory caches → reconstruct from messages → verify not re-prompted

## Files Changed

| File | Change |
|---|---|
| `core/load-skill-tool.ts` | Add `reconstructSkillApprovalsFromMessages()`, export it |
| `core/managers.ts` | Call reconstruction in `restoreChat()` |
| `tests/` | New test file for reconstruction logic |

## Design Decisions

1. **Scan all messages, not just recent ones** — `yes_in_session` grants from early in the conversation must still be honored. The scan is O(n) over messages which is acceptable for chat-length histories.

2. **Reuse existing key-creation helpers** — `createSessionApprovalKey` and `createTurnApprovalKey` are already well-defined; reconstruction uses the same functions to guarantee key format consistency.

3. **No changes to persistence** — the existing `persistLoadSkillApprovalResolutionMessage` already writes sufficient data. No schema changes needed.

4. **No changes to `clearChatSkillApprovals`** — it already clears all entries for a (worldId, chatId) prefix. On edit+resubmit, messages are pruned and caches cleared; any subsequent restore reconstructs from the pruned history.
