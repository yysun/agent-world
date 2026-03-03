# REQ: Derive Approval Status from Message History

**Date:** 2026-02-28

## Problem

Skill execution approvals (`yes_in_session`, `yes_once`) are stored only in process-local `Set`s (`skillSessionApprovals`, `skillTurnApprovals` in `core/load-skill-tool.ts`). When the app restarts, all prior approval grants are lost, causing users to be re-prompted for skills they already approved during the same chat session.

The HITL prompt/resolution pairs are already persisted as synthetic `assistant` (tool_call) and `tool` (result) messages in agent memory. This data survives restarts but is not currently used to reconstruct the approval caches.

## Requirements

### R1: Reconstruct session-level approvals from message history on chat restore

When a chat is restored (via `restoreChat` / `activateChatWithSnapshot`), the system must scan persisted messages for `load_skill` approval resolution messages that granted `yes_in_session`, and repopulate `skillSessionApprovals` accordingly.

### R2: Reconstruct turn-level approvals from message history on chat restore

When a chat is restored, the system must scan persisted messages for `load_skill` approval resolution messages that granted `yes_once`, and repopulate `skillTurnApprovals` for the current (latest) turn only.

### R3: Message history is the source of truth

The in-memory `skillSessionApprovals` and `skillTurnApprovals` sets must be treated as caches derived from message history, not as primary stores. The existing flow of writing approval results into memory (via `persistLoadSkillApprovalResolutionMessage`) remains unchanged; reconstruction reads those same messages back.

### R4: No change to approval UX or options

The three-option approval prompt (`yes_once`, `yes_in_session`, `no`) and its behavior within a running session remain unchanged. The only difference is that grants survive app restarts.

### R5: Clear approvals on edit-and-resubmit

The existing `clearChatSkillApprovals` behavior on edit+resubmit must continue to work. Since edit+resubmit already removes messages from history, reconstruction from the pruned history will naturally reflect the cleared state.

## Scope

- **In scope:** `core/load-skill-tool.ts` (approval cache reconstruction), `core/managers.ts` (calling reconstruction on restore).
- **Out of scope:** The `pendingHitlRequests` map (Promise resolvers are inherently process-local and already have their own replay mechanism). The `pendingAgentCreates` TOCTOU guard (creation-in-flight lock, not an approval cache).

## Acceptance Criteria

1. After granting `yes_in_session` for a skill, restarting the app, and restoring the same chat, the user is NOT re-prompted for that skill.
2. After granting `yes_once` for a skill in the latest turn, restarting and restoring, the user is NOT re-prompted for that skill within the same turn context.
3. After edit-and-resubmit that removes an approval message, the corresponding approval is no longer cached.
4. Existing tests continue to pass; no regression in approval flow behavior.
