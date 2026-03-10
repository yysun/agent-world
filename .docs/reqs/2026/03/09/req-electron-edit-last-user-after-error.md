# REQ: Electron Edit Last User Message After Error

**Last Updated:** 2026-03-10

## Summary

When an Electron chat turn fails after the user has sent a message, the latest user message in that chat must remain editable. Error rows, failed streaming state, or queued-message error state must not leave the failed turn in a dead-end state where the user can only retry blindly or manually copy the text.

## Problem Statement

The current Electron chat flow can surface a failed turn as a user message followed by an error log/system row, but the latest user message is not reliably editable in that state. This is especially visible for pre-response failures such as missing LLM provider configuration, where the natural recovery action is to edit and resend the last prompt. The UI currently treats some failed-turn states as non-editable, which breaks the expected recovery workflow.

## Goals

- Keep the latest failed-turn user message editable in Electron.
- Ensure the edit action still targets the user's message, not the trailing error artifact.
- Preserve the existing "edit message and all subsequent responses" semantics.
- Keep the recovery path deterministic when a turn fails before any assistant reply is produced.
- Route edit resubmission through the same queue-backed user-submit path as normal sends.
- Make the queue contract explicit: queue storage and queue lifecycle apply only to user-authored turns.
- Remove the misleading mixed-send API shape where a “user message” helper also direct-publishes non-user senders.
- Stop automatic resend of failed turns; let the user choose the next action explicitly.
- Stop automatic queue replay after dispatch/runtime failure; only interrupted in-flight recovery remains automatic.
- Keep queue-based resume as the only automatic recovery authority; remove restore-based resend from persisted chat memory.
- Add targeted automated coverage for failed-turn editability.
- Preserve live selected-chat state during refresh so optimistic sends, live system errors, and streaming/tool rows are not lost when history reloads.
- Surface a durable transcript recovery artifact when queue dispatch fails before streaming starts.
- Keep subscription/rebind paths idempotent so one user turn is processed once.
- Preserve persisted system-error timestamps exactly on replay.

## Non-Goals

- Redesigning the Electron message list UI.
- Changing web, CLI, or server chat UX unless required by a later approved plan.
- Changing canonical SSE or message event contracts unless inspection proves the current contract cannot support the requirement.
- Reworking the broader queue UX beyond what is required to recover the failed last-turn edit path.
- Re-introducing blind restore-time retries of already-failed turns.
- Moving assistant/tool/system dispatch onto the user queue.

## Requirements (WHAT)

1. In Electron, when the latest visible chat turn ends in an error after a user message, that latest user message MUST remain editable.
2. A trailing error artifact MUST NOT become the effective end-of-turn barrier that prevents editing the preceding user message.
3. The editable target MUST remain the canonical user message for that chat turn, not the error row and not an unrelated prior message.
4. The failed-turn recovery path MUST work whether the failure is surfaced as:
   - a selected-chat error log row,
   - a sticky error system status,
   - a queue-backed failed message state, or
   - a streaming/runtime failure that occurs before a normal assistant reply completes.
5. If the failed turn already has a canonical user `messageId`, the edit action MUST continue to use that identity.
6. If the failed turn is represented in Electron by queue/error state before a normal assistant response completes, the UI MUST still provide a deterministic way to edit the user's latest message content for resend.
7. Error-state recovery MUST remain scoped to the active chat; a failure in chat A must not make chat B's last user message appear editable as the recovery target.
8. Existing successful-turn edit behavior MUST remain unchanged.
9. Existing delete behavior MUST remain unchanged.
10. Existing event ordering guarantees (`start -> chunk -> end`, explicit `error`) MUST remain unchanged.
11. Existing world/chat event isolation MUST remain unchanged.
12. The fix MUST include targeted automated regression coverage for the failed-turn editability cases.
13. Edit resubmission MUST use the same queue-backed user-turn submission path as normal new-message send.
14. A terminally failed user turn MUST NOT auto-resend on chat restore.
15. Retry after terminal failure MUST require explicit user choice rather than automatic replay.
16. Automatic queue retry/backoff for user-authored turns MUST NOT replay a turn after dispatch/runtime failure; such turns must transition to an explicit recovery state instead.
17. Restore logic MUST NOT republish or auto-enqueue a user turn directly from persisted chat memory; automatic resume MUST flow only through queue-owned state.
18. Queue persistence and queue lifecycle state MUST apply only to human/user-authored chat turns.
19. Assistant, tool, system, and other non-user message dispatch MUST NOT create user queue rows.
20. The public dispatch API surface MUST make the user-queue boundary explicit; a helper named as user-queue submission MUST NOT also direct-publish non-user messages.
21. The current mixed-send helper MUST be renamed or split so callers can clearly choose between:
   - queue-backed user-turn submission, and
   - immediate non-user dispatch.
22. Edit resubmission MUST call the renamed/split queue-only user-turn API, not a mixed user/non-user dispatch helper.

## Required Process Rules

### Restore / Resume Authority

1. For user-turn auto-resume, queue state MUST be the primary authority.
2. Restore-time auto-resume decisions MUST use `message_queue` state as the sole automatic resume authority for user turns.
3. A queue row with status:
   - `queued` MUST be considered resumable,
   - `sending` MAY be resumable only after interrupted-flight recovery logic,
   - `error` MUST NOT auto-resume,
   - `cancelled` MUST NOT auto-resume.
4. Restore-time inspection of persisted chat memory MAY derive diagnostics or UI state, but it MUST NOT directly trigger resend of a user turn.
5. A queue row with terminal failed state MUST remain visible for diagnostics but MUST NOT automatically re-enter processing.
6. A user-authored queue row that reaches dispatch/runtime failure MUST transition to explicit recovery state instead of bounded automatic retry/backoff replay.
7. Restore and retry logic MUST treat only user-authored queue rows as resumable/retryable queue work.
8. Non-user messages MUST bypass queue-owned resume/retry state entirely.

### Terminal-SSE Guard Scope

5. The terminal-SSE guard MUST apply only to queue-owned interrupted-flight recovery decisions during restore.
6. The terminal-SSE guard MUST NOT block:
   - normal new-message sending,
   - explicit manual queue retry,
   - edit resubmission,
   - explicit user resend.
7. If a terminal SSE event (`error` or `end`) post-dates a queue-owned candidate user message, restore-time auto-resume for that message MUST be suppressed.
8. If only a `start` SSE exists after a queue-owned candidate user message and no terminal SSE follows it, interrupted-flight recovery MAY resume that message.
9. Once a user turn has reached terminal failure and surfaced a recovery state to the user, the system MUST NOT automatically resend it on future restore.

### User-Controlled Retry Rules

10. When a user turn fails terminally, the UI MUST surface explicit recovery options for that failed turn.
11. Those recovery options MUST let the user choose whether to retry, edit, or dismiss/leave the failed turn as-is.
12. Recovery options MAY vary by error type, but they MUST be explicit user actions rather than automatic replay.
13. Recovery affordances for failed turns MUST remain derivable after app restart from persisted chat/queue/system-error state; they MUST NOT rely solely on process-local pending HITL runtime state.

### Edit Mutation Rules

13. Editing a user message MUST enter a chat-scoped mutation mode that suppresses restore-time auto-resume for the pre-edit last user message in that chat.
14. During edit mutation, the system MUST NOT auto-enqueue or auto-resume the old target user message.
15. Edit mutation MUST:
   - stop active processing for the chat,
   - remove the target user message and all subsequent turn artifacts,
   - clear or invalidate queue rows associated with the removed turn,
   - resubmit the edited content through the canonical queue-backed user-submit path.
16. If the edited turn fails terminally, the new edited user message MUST become the latest failed-turn editable target.
17. Edit/delete mutation cleanup MUST clear queue state only for removed user-turn artifacts, not for unrelated non-removed chat work.

### Display Rules

17. Transcript rendering MUST keep one canonical user-row anchor per user `messageId`.
18. Error rows, system rows, and queue-error indicators MUST be diagnostic artifacts only; they MUST NOT replace the canonical user-row anchor for editability.
19. After a terminal failure, the latest canonical user message for the selected chat MUST remain the edit target in the transcript.
20. Queue-error UI MAY expose queue-specific retry/remove controls, but transcript editability MUST remain anchored to the canonical user message row.
21. Error logs MUST remain in the logs panel; the transcript must show only the durable system-error artifact intended for conversation recovery.
22. Transcript/system rendering MUST NOT infer queue ownership for assistant/tool/system rows; queue-backed affordances belong only to user turns.
23. Refreshing the selected chat MUST reconcile persisted history with live selected-chat state rather than blindly replacing it.
24. Selected-chat refresh MUST preserve, at minimum:
   - optimistic user rows awaiting canonical confirmation,
   - durable/live structured system-error rows,
   - live streaming and tool-stream rows until canonical replacements arrive.
25. A normal send/edit/delete/refresh flow for the selected chat MUST NOT clear the visible transcript to an empty state while the chat still exists.
26. When queue dispatch fails before streaming begins, the user MUST still get a durable recovery artifact in the transcript or equivalent failed-turn surface; the failure MUST NOT appear as silent non-streaming.
27. Agent/world/chat subscription rebinding MUST be idempotent; repeated rebind must not stack duplicate listeners for the same target.
28. Persisted system-error artifacts MUST preserve their original timestamps when replayed into the transcript; historical rows must not be restamped as current-time rows.

## Required Behavioral Cases

1. Provider/config failure case: after a user sends a message and the turn fails with a provider-configuration error, the latest user message is editable.
2. Error-log case: if the transcript shows the user message followed by an error log row, the user message still shows the edit affordance.
3. No-assistant-reply case: if no assistant reply was successfully produced, the user can still edit the last prompt rather than being forced to retype it.
4. Same-chat isolation case: the editable recovery target belongs only to the chat where the error occurred.
5. Normal-turn case: when no error occurs, existing user-message edit behavior is unchanged.
6. Restore-after-terminal-error case: reopening or switching back to a chat whose last user turn already reached terminal SSE `error` must not auto-resume that old user turn.
7. Restore-after-interrupted-start case: reopening a chat whose last user turn only reached SSE `start` may recover and resume that in-flight turn.
8. Edit-after-terminal-error case: editing the failed last user message must not first auto-resume the old failed turn.
9. Queue-error case: a failed queue row may remain visible for diagnostics, but it must not block transcript editability of the latest user message.
10. Failed-restore case: reopening a chat with a terminal failed last turn must not resend that turn automatically.
11. Explicit-retry case: retrying a failed turn must require a user-selected recovery option.
12. Edit-queue-unification case: editing and resubmitting a failed turn must traverse the same queue-backed submit path as a new send.
13. No-auto-backoff-retry case: a dispatch/runtime failure must not silently replay the same user turn via queue backoff.
14. Restart-recovery case: after app restart, the failed turn still shows durable recovery state and explicit retry/edit options without depending on transient HITL runtime memory.
15. No-memory-resend case: reopening a chat whose last user turn exists only in persisted chat memory, with no queue-owned resumable row, must not resend that turn automatically.
16. Queue-boundary case: assistant/tool/system dispatch must continue to work without creating queue rows.
17. API-clarity case: callers that submit user turns must use a queue-only API name, while non-user dispatch uses a separate clearly named path.

## Non-Functional Requirements

- Determinism: the same failed chat state must produce the same editable recovery target every time.
- Maintainability: the failed-turn editability rule must be explicit and testable, not inferred indirectly from incidental UI ordering.
- Maintainability: queue-backed user submission and direct non-user dispatch must be distinguishable from API names alone.
- Safety: the fix must not weaken message identity, chat scoping, or event-contract guarantees.

## Acceptance Criteria

- After a failed send in Electron, the latest user message can be edited without retyping it.
- A trailing error row does not block the edit affordance for the latest user message.
- Editing still targets the correct chat and correct user message.
- Successful turns still behave as they do today.
- Targeted automated tests cover at least:
  - provider/config-style failed turn,
  - transcript error-row failed turn,
  - chat scoping for the editable recovery target.

## Architecture Review Notes (AR)

### High-Priority Issues Found

- Failed-turn dead end risk: the user can see the failed prompt but cannot reliably edit it, which makes recovery slower and inconsistent.
- Identity-gap risk: Electron edit affordance is tied to a canonical user-message target, but failed-turn paths are the most likely place for transcript state, queue state, and error-display state to disagree about that target.
- Chat-scoping risk: a failed-turn recovery shortcut must not infer the wrong chat or the wrong user message when multiple chats are active.

### New Issues Found (AR Pass 2, 2026-03-09 - code inspection)

- Transcript-only edit gating risk: `electron/renderer/src/components/MessageListPanel.tsx` only exposes edit controls from the rendered user message row, so any failed turn that is no longer represented as an editable canonical user row becomes unrecoverable from the transcript.
- Failed-send identity handoff risk: `electron/renderer/src/hooks/useMessageManagement.ts` send flow relies on backend/runtime event delivery rather than renderer-side optimistic transcript insertion, which makes failed pre-response turns the highest-risk path for losing an editable canonical target in the visible UI.
- Queue/transcript divergence risk: Electron maintains queue-backed failed-message state separately from transcript message rendering, so a send failure can preserve user content in one place while the transcript-side edit affordance depends on another.

### New Issues Found (AR Pass 3, 2026-03-10 - persisted chat inspection)

- Restore-before-edit race: `editMessageInChat(...)` restores the chat before mutation, and restore currently triggers pending-last-message auto-resume. On failed chats, this can replay the old user-last message immediately before the edited message is submitted.
- Over-broad auto-resume trigger: `triggerPendingLastMessageResume(...)` currently resumes any persisted user-last message without consulting queue state or terminal SSE state.
- Queue-state authority gap: the system has queue state for user-turn processing, but restore-time resume logic still treats persisted memory as the primary signal.
- Dual-resume-path risk: keeping both queue resume and memory-based restore resend creates two competing replay mechanisms for the same user turn.
- Duplicate persistence risk in failing chats: persisted inspection of `chat-1772819555736-rm4adolrr` showed the pre-edit failed user message surviving in `gpt5` memory while the edited user message was also submitted, which is consistent with restore-time replay of the old turn before edit removal/resubmission.
- Queue split-path risk: edit resubmission currently bypasses the queue, while normal send and restore-driven retry already depend on queue behavior. This makes retry semantics harder to control consistently.
- Queue-boundary ambiguity risk: `enqueueAndProcessUserMessage(...)` currently accepts non-user senders and direct-publishes them, so the API name no longer matches the actual behavior boundary.
- Auto-resend policy risk: even a guarded restore-time retry can still create surprising behavior for failed turns. Users should decide whether a failed turn is retried, edited, or left alone.
- Queue backoff policy risk: `queue-manager` currently re-queues dispatch failures automatically with exponential backoff, which conflicts with the desired explicit-retry policy for failed user turns.
- Durability gap for retry affordances: the existing HITL option runtime is process-local and replay-safe only while pending requests still exist in memory, so it cannot be the sole persistence mechanism for failed-turn recovery options across restart.

### Decision

- The Electron app must preserve or derive one deterministic editable target for the latest failed user turn, even when the visible end of the transcript is an error artifact rather than a normal assistant reply.
- Queue state must become the first-class authority for restore-time user-turn resume decisions.
- Queue state must remain strictly user-turn-only; assistant/tool/system dispatch must stay out of queue persistence and queue retry state.
- Restore-time resend from persisted chat memory must be removed; queue remains the only automatic resume authority.
- Terminal-SSE guard behavior must be narrowed to queue-owned interrupted-flight recovery only, so it cannot interfere with explicit retry/edit flows.
- Edit resubmission must be unified onto the queue-backed submit path.
- The mixed-send helper should be renamed or split so user-turn queue submission and non-user direct dispatch are explicit, separate concepts.
- Terminal failed turns must stop auto-resending and move to explicit user-controlled recovery.
- Explicit recovery state must be durable across restart; persisted queue/system-error state is the source of truth, not transient HITL runtime state.

### Tradeoffs

- Preserve/derive a failed-turn editable target in Electron (selected)
  - Pros: minimal user-facing recovery friction, keeps current edit semantics, likely limited to Electron renderer/main integration points.
  - Cons: requires explicit handling of queue/transcript failure states instead of relying on the happy-path message row.
- Require users to resend or retype after failures (rejected)
  - Pros: no implementation work.
  - Cons: poor UX, inconsistent with existing message-edit feature, wastes user input.

### AR Exit Condition

- No failed latest-turn state in Electron leaves the visible user prompt without a deterministic edit/retry path.
- The editable failed-turn target remains chat-scoped and canonical.
- Failed-turn recovery options remain available after restart from persisted state.
- Queue is the only automatic resume authority for user turns.
- Normal successful-turn edit semantics remain unchanged.
- Selected-chat refresh never drops live optimistic/streaming/error state that is still authoritative.
- Queue/preflight failures always surface a durable recovery artifact rather than a silent non-streaming turn.
