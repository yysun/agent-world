# REQ: Built-in Tool Approval Messages Must Be Durable

**Date:** 2026-03-12

**Related Docs:**
- `.docs/reqs/2026/03/11/req-tool-permissions.md`
- `.docs/reqs/2026/03/06/req-hitl-message-authoritative-state.md`
- `.docs/reqs/2026/02/28/req-approval-persistence.md`

## Summary

Built-in tool approvals that currently rely on `requestToolApproval()` must materialize durable, canonical message records for the approval prompt and its terminal resolution so approval-denied outcomes survive restore, reload, and cross-client replay.

## Problem Statement

The current built-in approval flows are split.

- `load_skill` persists a synthetic `human_intervention_request` assistant tool-call message plus a matching tool response message, so the prompt and its outcome survive reload.
- Other built-in approval producers such as `shell_cmd`, `web_fetch`, and `create_agent` depend on transient HITL runtime events for the prompt itself.
- When those approvals are denied, the chat usually retains only the owning tool's terminal result or error. The approval boundary is not represented as its own canonical prompt/resolution pair.

That means the system can remember that a tool failed or was denied, but it cannot consistently reconstruct that the user was shown a specific approval prompt, what options were offered, and which approval decision ended the turn. This weakens replay, restore, transcript accuracy, and cross-client consistency.

## Goals

- Make built-in approval prompts and their outcomes durable in chat history.
- Ensure denied and timed-out approvals survive restore/reload as first-class approval artifacts, not only as generic tool failures.
- Align built-in approval producers with the message-authoritative HITL model already used by `load_skill`.
- Preserve world/chat isolation and stable request identity across restore and replay.

## Non-Goals

- Changing the permission matrix introduced by tool permissions.
- Redesigning approval UI.
- Introducing a new persistence table or a separate approval store.
- Automatically resuming tool execution after restart when the owning execution context is no longer recoverable.

## Requirements

### R1: Built-in approval prompts MUST produce canonical persisted prompt messages

When a built-in tool requests human approval through the shared approval path, the chat history MUST include a canonical persisted approval prompt message that can be interpreted through the same message-authoritative HITL model used for other HITL prompts.

### R2: Built-in approval outcomes MUST produce canonical persisted resolution messages

When a built-in approval resolves as approved, denied, or timed out, the chat history MUST include a canonical persisted resolution message linked to the approval prompt so the terminal approval outcome survives restore and replay.

### R3: Denied approvals MUST remain distinguishable from normal execution failures

If a tool is denied before execution proceeds, the persisted chat record MUST preserve that the turn stopped at an approval boundary and that the outcome was `denied` or `timeout`. A restored transcript MUST NOT reduce that outcome to only a generic tool execution failure without approval context.

### R4: Approval artifacts MUST keep stable identity

Each persisted approval prompt/resolution pair MUST keep stable `chatId`, `requestId`, and owning `toolCallId` linkage so message-authoritative matching is deterministic across restore, replay, edit, and cross-client rendering.

### R4a: `requestId` and `toolCallId` MUST have a consistent contract

The system MUST treat `requestId` and `toolCallId` as related but distinct identifiers.

1. `requestId` identifies the approval prompt/resolution pair.
2. `toolCallId` identifies the owning built-in tool call that requested approval.
3. For legacy or already-compatible flows, `requestId` MAY equal `toolCallId`.
4. For built-in approvals that need a separate canonical `human_intervention_request` artifact, `requestId` MAY differ from `toolCallId`.
5. No consumer may require `requestId === toolCallId` as a universal invariant.
6. Matching, replay, response submission, and dedupe logic MUST continue to work in both cases: `requestId === toolCallId` and `requestId !== toolCallId`.

### R4b: Producers and consumers MUST use the correct identifier for the correct job

The system MUST use:

1. `requestId` as the identity of the approval request itself,
2. `toolCallId` as the identity of the owning tool call/turn linkage,
3. stable metadata when reconstructing or rendering the relationship between the approval artifact and the owning tool.

Clients and runtime helpers MUST NOT silently swap these meanings or infer one identifier from the other unless the persisted data explicitly shows they are the same value.

### R5: Message history MUST be sufficient to explain approval outcomes

For any built-in approval that reached a terminal outcome, message history alone MUST be sufficient to determine:

1. which built-in tool requested approval,
2. which user-visible options were offered,
3. whether the approval resolved as approved, denied, or timed out, and
4. which owning tool call/turn the approval belonged to.

### R6: Restore and replay MUST converge on the same approval state

Reloaded or restored clients MUST derive the same approval history from persisted messages regardless of whether they also saw the original realtime HITL event.

### R7: Existing `load_skill` durable approval behavior MUST remain compatible

The existing `load_skill` prompt/resolution persistence pattern MUST continue to work and MUST remain compatible with the shared built-in approval model.

### R8: Edit and trim flows MUST remove orphaned approval artifacts

If a message edit, delete, or transcript trim removes the branch that created a built-in approval prompt, any orphaned prompt or resolution artifacts for that removed branch MUST also be removed or excluded by the authoritative message model.

### R9: Cross-client behavior MUST stay aligned

Core, server, web, Electron, and CLI flows MUST interpret the persisted approval artifacts consistently so the same chat history yields the same pending/resolved approval view across clients.

### R10: Durable approval history MUST NOT imply automatic execution resume

Persisting approval prompt/resolution messages MUST NOT by itself cause a previously interrupted tool execution to auto-resume after restart. Queue ownership and existing recovery rules remain authoritative for user-turn continuation.

## Scope

- **In scope:** built-in approval producers that use the shared tool-approval path or equivalent built-in approval UX, including `shell_cmd`, `web_fetch`, `create_agent`, and alignment of `load_skill` with the shared durable pattern.
- **Out of scope:** changing unrelated non-approval tool result formatting, new storage tables, and automatic replay of execution contexts that were terminated by restart.

## Acceptance Criteria

1. If `shell_cmd` requests approval and the user denies it, the restored chat history still shows a durable approval prompt/resolution pair that identifies the denial outcome.
2. If `web_fetch` requests local/private access approval and the user denies it, the restored chat history still shows that approval denial as a canonical approval resolution, not only as a generic fetch failure.
3. If `create_agent` approval is denied or times out, the approval boundary and outcome survive reload/restore as canonical message artifacts.
4. The same persisted approval artifacts are sufficient for clients to reconstruct approval history without relying on transient runtime-only HITL state.
5. Existing `load_skill` approval durability remains intact.
6. Edit/delete flows do not leave stale approval artifacts for removed branches.

## Architecture Review Notes (AR)

### High-Priority Findings

- The current shared approval helper is transport-only; it normalizes approval results but does not persist a prompt/resolution artifact by itself.
- The current HITL runtime couples `requestId` and `toolCallId` too tightly for a generic persisted approval prompt that belongs to an existing owning tool call.
- Denied approval outcomes already survive indirectly through owning tool results in some flows, but that does not preserve the approval boundary as a first-class chat artifact.

### Resolution for the Identity Issue

- The AR direction is to explicitly remove `requestId === toolCallId` as a universal requirement.
- The system will keep a compatibility model where equality is still allowed for existing flows, but new durable built-in approval artifacts may use a distinct `requestId` while retaining the owning `toolCallId` link.
- Any implementation that still assumes equality in runtime validation, replay, dedupe, or response submission is considered incomplete for this story.

### Decision

Built-in approval prompts and their terminal outcomes must become durable canonical message artifacts instead of remaining event-only prompt state with a generic terminal tool error/result.

### Tradeoffs

- Durable approval artifacts
  - Pros: replay-safe, restore-safe, transcript-accurate, cross-client consistent.
  - Cons: requires a stable approval identity model and dedupe rules.
- Event-only prompts with terminal tool errors/results
  - Pros: simpler live implementation.
  - Cons: loses approval context after restore and leaves message history unable to fully explain why a tool did not run.

### AR Exit Condition

No unresolved high-priority issue remains once built-in approval-denied outcomes can be reconstructed from messages as canonical approval prompt/resolution history instead of only from transient events or generic tool failures.

The identity contract is not considered resolved until the design explicitly supports both `requestId === toolCallId` and `requestId !== toolCallId` without ambiguity about which identifier is authoritative for prompt identity versus owning tool linkage.