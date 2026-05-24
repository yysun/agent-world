# Requirement: HITL Must Not Block User Input

## Story

`hitl-non-blocking-user-input`

## Overview

Pending HITL approval or option prompts must not block the user from continuing to interact with the chat. A user may change direction, provide a different instruction, or abandon the line of thought that produced the pending HITL request. The product must treat that as normal behavior rather than forcing the user to resolve the old prompt first.

This requirement changes the current UX contract for HITL in user-facing clients: pending HITL remains visible and recoverable, but it must no longer disable normal user input.

## Background

Current documented behavior says that while a HITL prompt is pending in UI, sending a new chat message is blocked until the prompt is resolved. That creates a poor interaction model when:

- the user changes their mind after seeing the approval request,
- the user wants to redirect the agent to a different idea,
- the user wants to clarify intent instead of answering the exact pending prompt,
- the user decides the blocked action is no longer relevant.

The result is that HITL behaves like a modal lock on the chat, even though the user may want to continue the conversation without resolving the prior approval path.

## Goals

- Allow the user to continue entering and submitting new chat input while a HITL prompt is pending.
- Preserve pending HITL prompts as explicit, recoverable state instead of silently losing them.
- Prevent ambiguous ownership between a pending HITL request and later user turns.
- Keep chat/session isolation and durable recovery semantics intact.

## Functional Requirements

### FR-1: Pending HITL must not disable normal user input

In user-facing chat clients, a pending HITL prompt must not disable the composer or otherwise prevent the user from typing and submitting a new user turn.

### FR-2: New user turns must be accepted while HITL is pending

If a HITL prompt is pending for a chat, the user must still be able to submit a new message in that same chat without first resolving the pending prompt.

### FR-3: Pending HITL must remain attributable to the originating turn

The system must preserve a stable association between a pending HITL request and the user turn or agent action that created it. Later user turns must not cause the prompt to become misattributed to newer work.

### FR-4: The system must handle superseded HITL state deterministically

If later user input makes an older pending HITL prompt obsolete, the resulting behavior must be deterministic and visible. The product must not leave stale prompts in an ambiguous state or require hidden internal recovery.

Acceptable product behavior may include one of the following, as long as it is applied consistently and is visible in the UI/state model:

- keeping the older prompt pending until the user explicitly resolves or dismisses it,
- marking the older prompt as superseded or stale,
- converting the older prompt into an explicit non-resumable recovery state.

What is not acceptable:

- silently dropping the prompt with no visible state transition,
- resuming the wrong turn after the user answers a stale prompt,
- blocking the new turn until the old prompt is answered.

### FR-5: HITL response must remain scoped to the intended request

When the user answers a HITL prompt, the response must apply only to the specific pending request identified by that prompt. Later user turns must not cause the response to resolve a different request.

### FR-6: Chat/session isolation must remain intact

Pending HITL state and any follow-up user turns must remain isolated to the owning chat/session. A pending prompt in one chat must not block input in another chat, and responding to a prompt in one chat must not affect another chat.

### FR-7: Existing non-HITL chat behavior must remain unchanged

When no HITL prompt is pending, normal chat input, queue behavior, and send flows must continue to behave as they do today.

## User Experience Requirements

- The composer stays available while HITL is pending.
- The pending HITL prompt remains visible or otherwise recoverable.
- The user can choose to continue the conversation without being forced into the old approval path.
- If a pending prompt becomes stale, the product must communicate that state explicitly rather than failing implicitly.

## Non-Functional Requirements

- The change must preserve durable request identity for pending HITL prompts.
- The change must not reintroduce cross-chat leakage, replay ambiguity, or auto-resume bugs.
- The resulting behavior must be testable at the core/runtime boundary and at client interaction boundaries.

## Constraints

- Queue and HITL lifecycle rules remain in force: HITL state remains part of the owning user turn lifecycle until it reaches explicit resolution, supersession, or durable recovery.
- The system must not silently auto-resume a superseded or stale turn.
- The system must not require a hidden global lock to coordinate user input while HITL is pending.
- Web, Electron, and any other interactive clients must follow the same product-level non-blocking rule unless a client has an explicit documented limitation.

## Out of Scope

- Redesigning the visual styling of HITL prompts.
- Changing the underlying structured HITL schema.
- Defining a brand-new queue model unrelated to pending HITL ownership.

## Acceptance Criteria

- [ ] In an interactive client, a pending HITL prompt does not disable the chat composer.
- [ ] A user can submit a new message while an older HITL prompt is pending in the same chat.
- [ ] The older pending HITL prompt remains explicitly attributable to its original request.
- [ ] If a later user turn supersedes the older prompt, the older prompt transitions into a deterministic visible state instead of silently disappearing.
- [ ] Responding to a pending HITL prompt resolves only that specific request.
- [ ] A pending HITL prompt in one chat does not block sending a new message in another chat.
- [ ] No stale HITL response can resume or mutate the wrong turn after later user input.
- [ ] Focused tests can verify both non-blocking input behavior and stable request scoping.