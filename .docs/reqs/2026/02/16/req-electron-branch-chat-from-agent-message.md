# Requirement: Electron branch chat from an agent message

## Overview
Add a chat-branching action in the Electron app so users can create an alternative chat timeline from a specific agent message.

## Goals
- Let users branch a conversation from any eligible agent message.
- Preserve conversation context in the branched chat by copying message history up to the selected agent message.
- Move the user directly into the newly created chat after branching.

## Functional Requirements
1. The Electron chat message UI must expose a `branch` action button on agent messages.
2. The `branch` action must create a new chat session in the same world.
3. The new chat session must include a copy of all messages from the source chat, starting from the first message and ending at the selected agent message (inclusive).
4. Messages after the selected agent message in the source chat must not be copied into the new chat.
5. After branch creation succeeds, the UI must select and display the new chat session automatically.
6. If branch creation fails, the source chat must remain selected and the user must receive an error status.

## Non-Functional Requirements
- Branch action must complete using existing Electron app architecture (renderer → preload bridge → IPC route → main-process handler/core runtime).
- Behavior must be deterministic and scoped to the selected world and source chat.
- Existing edit/delete/send chat behaviors must remain unchanged.

## Constraints
- Scope is Electron app only.
- Scope is limited to branching from agent messages (not user messages).
- Use current message and chat persistence semantics; do not introduce unrelated UX features.

## Acceptance Criteria
- [ ] Agent message cards show a `branch` icon action.
- [ ] Triggering `branch` on an agent message creates a new chat in the same world.
- [ ] New chat contains all source-chat messages up to and including the chosen agent message.
- [ ] New chat excludes all source-chat messages after the chosen message.
- [ ] Newly created branch chat becomes the selected session immediately.
- [ ] On failure, no session switch occurs and an error status is shown.
