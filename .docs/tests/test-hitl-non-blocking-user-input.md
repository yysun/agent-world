# Test Spec: HITL Non-Blocking User Input

## Purpose

Verify that pending HITL prompts no longer block user input, while stale or superseded prompt handling remains deterministic and scoped to the correct request and chat.

## Scenarios

### Scenario 1: Electron composer stays usable while HITL is pending

1. Open an Electron chat.
2. Trigger a HITL prompt in that chat.
3. Confirm the HITL prompt is visible.
4. Confirm the composer remains enabled.
5. Type a new user message without answering the HITL prompt.
6. Submit the message.
7. Confirm the new user turn is accepted.
8. Confirm the older HITL prompt transitions into a deterministic non-pending state instead of silently disappearing.

### Scenario 2: Web composer stays usable while HITL is pending

1. Open a web chat.
2. Trigger a HITL prompt in that chat.
3. Confirm the HITL prompt is visible.
4. Confirm the composer remains enabled.
5. Submit a new user message without answering the pending prompt.
6. Confirm the new user turn is accepted.
7. Confirm the older prompt is no longer treated as an active resumable prompt.

### Scenario 3: Superseded HITL response is rejected safely

1. Trigger a HITL prompt in a chat.
2. Submit a newer user turn in the same chat so the older prompt becomes superseded.
3. Attempt to answer the older HITL prompt using its original `requestId`.
4. Confirm the response is rejected deterministically as stale or superseded.
5. Confirm no obsolete turn resumes and no newer turn is mutated by the old response.

### Scenario 4: Cross-chat isolation remains intact

1. Trigger a HITL prompt in chat A.
2. Switch to chat B.
3. Confirm chat B input is usable immediately.
4. Send a new user message in chat B.
5. Confirm chat A's pending HITL prompt does not block chat B input.
6. Confirm chat A's prompt remains scoped to chat A only.

### Scenario 5: Restore does not replay superseded prompts as active pending prompts

1. Trigger a HITL prompt in a chat.
2. Submit a newer user turn in that same chat so the older prompt becomes superseded.
3. Refresh, restore, or reload the chat/client.
4. Confirm the superseded prompt does not reappear as an active pending HITL prompt.
5. Confirm any visible historical artifact still reflects superseded state accurately.

### Scenario 6: Edit/resubmit remains deterministic

1. Trigger a HITL prompt from a user turn.
2. Edit or otherwise replace that user turn using the product's supported edit flow.
3. Confirm any prior pending HITL prompt tied to the removed turn does not remain active ambiguously.
4. Confirm the resulting state is explicit and replay-safe.

## Expected Outcome

- Pending HITL no longer blocks normal user input.
- Newer user turns can be accepted while older HITL requests exist.
- Older HITL requests transition into deterministic visible superseded state when appropriate.
- Stale responses never resume or mutate the wrong turn.
- Replay and chat switching preserve request scoping and do not revive superseded prompts as active pending state.