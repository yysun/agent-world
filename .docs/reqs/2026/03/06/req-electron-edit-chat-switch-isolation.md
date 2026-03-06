# REQ: Electron Edit and Chat Switch Isolation

**Last Updated:** 2026-03-06

## Summary
The Electron renderer must keep message editing, chat switching, message refresh, and HITL visibility strictly scoped to the active chat. A user must never be able to mutate chat A while the UI is presenting chat B, and chat-scoped UI state must not survive a switch in ways that hide or misroute follow-up prompts.

## Problem Statement
The current Electron chat surface can retain stale message rows, stale edit state, and stale async refresh completions across chat switches. That allows edit or delete actions that originated in one chat to continue affecting another visible UI state. It also allows backend chat activation and renderer chat selection to drift apart, which can prevent chat-scoped realtime artifacts such as HITL prompts from appearing in the active UI even when the prompt was created correctly for its owning chat.

## Goals
- Preserve strict chat isolation for Electron edit, delete, refresh, and switch flows.
- Ensure the visible transcript always matches the active selected chat.
- Prevent stale edit or delete completions from re-activating a previous chat behind the current UI.
- Ensure HITL prompt visibility remains consistent with the active chat after edit and chat-switch flows.
- Keep renderer-selected chat state and backend chat activation behavior aligned enough that follow-up UI state remains predictable.

## Non-Goals
- Redesigning the Electron chat layout or interaction model.
- Changing core HITL semantics or the options-only approval model.
- Changing server API contracts unless required by a later approved plan.
- Changing unrelated web, CLI, or non-chat Electron behaviors.

## Requirements (WHAT)
1. The Electron renderer MUST clear or hide stale transcript content immediately when the user switches chats so the previous chat's message actions are no longer available in the newly selected chat view.
2. Message rows displayed after a chat switch MUST belong only to the active selected chat.
3. Inline edit state MUST be scoped to the active chat and MUST NOT remain active after the user switches to a different chat.
4. Pending delete/edit UI state MUST NOT survive a chat switch in a way that allows actions from the previously visible chat to remain actionable in the new chat.
5. Async message-history loads started for one chat MUST NOT overwrite the currently visible transcript after the user has switched to another chat.
6. Async follow-up refreshes triggered by edit or delete flows MUST NOT re-activate or visually reload a chat that is no longer the active selected chat in the renderer.
7. Renderer-side message refresh behavior MUST distinguish between:
   - loading the currently selected chat for display, and
   - non-visible follow-up work for another chat.
8. The backend active chat for Electron session flows MUST NOT be changed by stale renderer refresh completions after the user has already switched to a different chat.
9. Edit and delete operations initiated from the active chat MAY continue to complete for their owning chat, but they MUST NOT contaminate the current visible chat state if the user has navigated away before completion.
10. The Electron renderer MUST preserve a single coherent active-chat model for the transcript, edit UI, and chat-scoped realtime subscriptions.
11. HITL prompt UI shown in Electron MUST remain chat-scoped.
12. If an edited message causes a new HITL prompt in chat A while the user is currently viewing chat B, the prompt MUST NOT appear in chat B.
13. If a HITL prompt belongs to chat A and the user later returns to chat A, the prompt MUST be recoverable and visible through the normal chat activation/replay path.
14. Chat switching MUST NOT silently discard a valid pending HITL prompt for the selected chat.
15. Editing a user message MUST continue to target the message's owning chat; however, the surrounding UI flow MUST prevent stale cross-chat context from making that target ambiguous to the user.
16. The Electron renderer MUST provide deterministic behavior when edit, delete, switch, and refresh operations overlap in time.
17. Existing same-chat edit and delete behavior MUST remain intact when no chat switch occurs during the operation.
18. The fix MUST include targeted automated coverage for the overlapping cases called out in this requirement.
19. All renderer paths that can asynchronously load or apply transcript data for a chat MUST obey the same selected-chat isolation rule; there MUST NOT be a second unguarded transcript-apply path that can bypass the primary fix.
20. Renderer-side follow-up work for a non-visible chat MUST be explicitly distinguished from visible active-chat refresh work so that background cleanup for chat A does not implicitly become active-chat selection for chat A.

## Required Behavioral Cases
1. Switch-chat loading case: when the user selects a new chat, the previous transcript disappears from the actionable view before the new chat history is interactable.
2. Stale async load case: if a prior chat history request resolves late, it does not overwrite the currently selected chat transcript.
3. Edit-then-switch case: if the user begins editing in chat A and switches to chat B, the edit UI from chat A is no longer active in chat B.
4. Edit-completes-after-switch case: if an edit request for chat A finishes after the user has moved to chat B, chat B remains the active visible chat and chat A does not get reloaded into chat B's transcript area.
5. Delete-completes-after-switch case: if a delete request for chat A finishes after the user has moved to chat B, chat B remains the active visible chat and chat A does not get reloaded into chat B's transcript area.
6. HITL-after-edit case: if an edit resubmission creates a HITL prompt for chat A while chat B is selected, chat B does not show that prompt.
7. HITL-return case: when the user switches back to chat A, the pending HITL prompt for chat A is visible again through the normal replay/restore flow.

## Non-Functional Requirements
- Determinism: overlapping async operations must resolve to the same visible state for the same final selected chat.
- Isolation: no cross-chat contamination of transcript rows, edit state, or HITL UI.
- Predictability: the user-visible active chat, the actionable transcript, and chat-scoped subscriptions should not drift apart.
- Maintainability: the rules for applying async chat results should be explicit and testable.

## Acceptance Criteria
- Switching chats immediately removes actionable stale rows from the previously visible transcript.
- A late history response for chat A does not replace the transcript for chat B after the user has switched to chat B.
- An edit or delete that finishes after a chat switch does not reload or reactivate the previous chat in the current transcript view.
- Inline edit state is cleared when the active chat changes.
- HITL prompts remain visible only for their owning chat.
- Returning to the owning chat restores the pending HITL prompt through the standard replay path.
- Same-chat edit and delete flows continue to work when no chat switch occurs mid-operation.
- Targeted automated tests cover at least:
  - late chat-history completion after switch,
  - edit completion after switch,
  - delete completion after switch,
  - edit-state clearing on switch,
  - HITL visibility for chat ownership and return-to-chat replay.
  - both renderer transcript-apply entry points following the same selected-chat guard behavior.

## Architecture Review Notes (AR)

### High-Priority Issues Found and Resolved
- Transcript/action drift risk: the renderer can expose actions for a previous chat after a new chat is selected.
  - Resolution: require stale transcript content to be cleared or hidden before the new chat becomes actionable.
- Async overwrite risk: late history or mutation refreshes can replace the active chat transcript after the user has moved on.
  - Resolution: require async results to be applied only when they still belong to the current selected chat.
- Backend/frontend activation drift risk: stale renderer follow-up refreshes can re-activate an older chat in backend session state.
  - Resolution: require non-current follow-up refreshes to avoid changing active backend chat selection.
- HITL invisibility risk: a valid prompt can exist for one chat while the renderer is subscribed to another, making the prompt appear missing.
  - Resolution: require strict chat-scoped visibility and reliable replay when the user returns to the owning chat.

### New Issues Found (AR Pass 2, 2026-03-06 post-plan review)
- Dual transcript-apply path risk: the renderer currently has at least two independent async message-apply paths (`useSessionManagement` switch-prefetch and the central `refreshMessages()` flow). Fixing only one would leave the race in the other path.
  - Resolution: require one shared selected-chat isolation rule to gate all async transcript apply paths.
- Hidden activation coupling risk: non-visible follow-up refresh work can still mutate backend active chat selection even if visible message apply is guarded.
  - Resolution: require visible active-chat refresh and non-visible follow-up work to be explicitly separated so background work cannot implicitly reactivate another chat.

### New Issues Found (AR Pass 3, 2026-03-06 — code inspection)
- `onSelectSession()` prefetch race (`useSessionManagement.ts:116–132`): the `void` async block calls `setMessages(history)` with no staleness check. A later chat switch cannot cancel it, so the stale response overwrites the next chat's transcript.
  - Resolution: REQ-5 and REQ-6 cover this; the implementation must add a counter guard to this path identical to the one used by `refreshMessages()`.
- `refreshMessages()` backend activation before guard (`App.tsx:579`): `api.selectSession()` executes before the `messageRefreshCounter` guard at line 586. Edit/delete follow-up calls `refreshMessages(worldId, targetChatId)` with the message's owning chat, activating the wrong backend session even when the visual apply is subsequently discarded.
  - Resolution: REQ-8 and REQ-20 cover this; the implementation must separate the activation call from the fetch or skip activation entirely when the target chat is not selected.
- `hitlPromptQueue` not cleared on switch (`App.tsx:229`): prompts carry a `chatId` field but the queue is never filtered when `selectedSessionId` changes, leaving prompts for the previous chat actionable in the new chat.
  - Resolution: REQ-11 and REQ-12 cover this; filtering must be added to the chat-switch path.
- `editingMessageId` / `deletingMessageId` not cleared on switch: these states in `useMessageManagement` have no cleanup on `selectedSessionId` change, leaving inline edit UI and delete spinners from the previous chat active in the new chat.
  - Resolution: REQ-3 and REQ-4 cover this; explicit clearing must be added to the session-switch flow.

### Decision
- The Electron renderer must treat current selected chat identity as the gate for what transcript data may be shown and what async refresh work may mutate the visible chat surface.

### Tradeoffs
- Strict selected-chat gating (selected)
  - Pros: predictable UI, no stale action leakage, better HITL visibility guarantees.
  - Cons: requires explicit handling for non-visible completions and slightly less aggressive optimistic preloading.
- Best-effort async preload without strict gating (rejected)
  - Pros: can reduce perceived switch latency in ideal cases.
  - Cons: creates transcript drift, stale edit actions, backend chat activation contamination, and missing HITL UI.

### AR Exit Condition
- No remaining high-priority path allows Electron transcript state, edit state, backend chat activation, and HITL prompt visibility to disagree about which chat is active after overlapping edit/delete/switch flows.
- All renderer transcript-apply entry points are covered by the same selected-chat isolation rule rather than a one-off fix in only one path.
