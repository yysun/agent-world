# Electron Desktop E2E Scenarios

## Harness Rules

1. Launch the real Electron app.
2. Use the real preload bridge and real IPC routes.
3. Do not use a mocked renderer-only desktop shell.

## Bootstrap

1. Check whether `e2e-test` world exists.
2. Delete `e2e-test` if it exists.
3. Create fresh `e2e-test`.
4. Add assistant agent using `google` + `gemini-2.5-flash`.
5. Launch desktop app and load the test world.

## Categories

1. New chat
2. Loaded default/current chat
3. Switched chat

## Existing Lower-Level Coverage

1. Electron main IPC matrix already covers:
   - new chat -> send success / HITL-adjacent / error
   - current chat -> send success / HITL-adjacent / error
   - current chat -> edit success / HITL-adjacent / error
   - switched chat -> send success / HITL-adjacent / error
   - switched chat -> edit success / HITL-adjacent / error
2. Playwright desktop E2E should validate the same category model through the actual window/UI path.

## World and Session

1. Select seeded world from world list.
2. Create new session.
3. Load current session.
4. Switch session.
5. Delete session.
6. Branch session from assistant message.

## Send Message

Apply to all applicable categories above:

1. Send -> success.
2. Send -> error.
3. Send -> pending HITL prompt.

## HITL

1. Prompt appears inline in owning session.
2. Respond with valid option.
3. Prompt remains scoped to owning session.
4. Return to session replays pending prompt.

## Edit/Delete

Apply to all applicable categories above:

1. Edit latest user message -> success.
2. Edit latest user message -> error.
3. Edit latest user message -> pending HITL prompt.
4. Delete message chain -> success.
5. Edit/delete completion after switching away does not contaminate visible session.

## Queue

Apply to all applicable categories above:

1. Queued item is shown.
2. Failed item is shown.
3. Retry failed queued item.
4. Resume/recover queued item when the UI exposes it.
5. Remove/skip failed queued item.
6. Pause/resume/stop/clear queue.

## Shell Smoke

1. Open logs panel.
2. Open settings panel.
3. Toggle at least one non-chat world view.
4. Fail fast with clear message when Google credentials or `gemini-2.5-flash` setup is unavailable.
