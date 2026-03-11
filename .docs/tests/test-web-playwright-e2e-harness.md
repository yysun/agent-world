# Web App E2E Scenarios

## Harness Rules

1. Launch the real web app in a browser.
2. Use the real local server runtime.
3. Use the real REST API and real SSE flow.
4. Do not use a mocked browser-only API shell.

## Bootstrap

1. Check whether `e2e-test-web` world exists.
2. Delete `e2e-test-web` if it exists.
3. Create fresh `e2e-test-web`.
4. Add assistant agent using `google` + `gemini-2.5-flash`.
5. Launch the web app and load the test world.

## Categories

1. New chat
2. Loaded default/current chat
3. Switched chat

## Existing Lower-Level Coverage

1. `tests/e2e/` already covers real-provider runtime behavior outside the browser UI.
2. Playwright web E2E should validate the same category model through the actual browser path.

## World and Chat

1. Select seeded world from the world list.
2. Create new chat.
3. Load current chat.
4. Switch chat.
5. Delete chat.
6. Branch chat from assistant message if the web UI exposes that path.

## Send Message

Apply to all applicable categories above:

1. Send -> success.
2. Send -> error.
3. Send -> pending HITL prompt.

## HITL

1. Prompt appears inline in the owning chat.
2. Respond with a valid option.
3. Prompt remains scoped to the owning chat.
4. Return to chat replays pending prompt.

## Edit/Delete

Apply to all applicable categories above:

1. Edit latest user message -> success.
2. Edit latest user message -> error.
3. Edit latest user message -> pending HITL prompt.
4. Delete message chain -> success.
5. Edit/delete completion after switching away does not contaminate the visible chat.

## Queue

Apply to all applicable categories above:

1. Queued item is shown.
2. Failed item is shown.
3. Retry failed queued item.
4. Resume/recover queued item when the UI exposes it.
5. Remove/skip failed queued item.
6. Pause/resume/stop/clear queue.

## Web Shell Smoke

1. Browser app loads successfully.
2. World selection remains functional.
3. Any web-accessible logs/settings/world-management affordances remain reachable.
4. Fail fast with clear message when Google credentials or `gemini-2.5-flash` setup is unavailable.
