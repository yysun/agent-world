# Test Spec: Electron Non-Chat Human Panel Layout

## Purpose

Verify that switching from chat view to non-chat views preserves the latest human input panel and keeps lower content scrollable.

## Scenarios

### Scenario 1: Chat -> Board preserves human panel

1. Open an Electron world with at least one human message and at least one assistant reply.
2. Start in chat view.
3. Switch to board view.
4. Confirm the latest human input panel is visible at the top of the non-chat surface.
5. Confirm board content is visible below it.
6. Scroll the lower content area.
7. Confirm the human input panel remains visible and is not overlapped by board content.

### Scenario 2: Chat -> Grid preserves human panel

1. Open the same world in chat view.
2. Switch to grid view.
3. Confirm the latest human input panel is visible at the top.
4. Confirm grid content appears below it.
5. Scroll the lower content area.
6. Confirm the human input panel remains visible and grid content remains reachable.

### Scenario 3: Chat -> Canvas preserves human panel

1. Open the same world in chat view.
2. Switch to canvas view.
3. Confirm the latest human input panel is visible at the top.
4. Confirm canvas content appears below it.
5. Scroll the lower content area.
6. Confirm the human input panel remains visible and canvas content remains reachable.

### Scenario 4: Canonical persisted sender variants still produce the human panel

1. Load a session whose latest persisted human message uses canonical sender metadata such as `human`, `user`, or `you`.
2. Switch from chat to each non-chat view.
3. Confirm the latest human input panel still appears.

## Expected Outcome

- The human input panel is always present when a latest human message exists.
- Lower non-chat content remains scrollable.
- No non-chat switch hides the human input panel.