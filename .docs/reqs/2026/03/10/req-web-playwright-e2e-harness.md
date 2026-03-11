# REQ: Web Playwright E2E Harness

**Last Updated:** 2026-03-10
**Status:** Implemented — see `.docs/done/2026/03/10/web-playwright-e2e-harness.md`

## Summary

Add a Playwright-based browser E2E harness for the web app that provisions a real `e2e-test-web` world backed by Google `gemini-2.5-flash`, then runs the chat-flow scenario matrix across new-chat, loaded-current-chat, and switched-chat categories through the real web UI.

## Problem Statement

The repository currently has:

- lower-level unit and integration coverage under `tests/`
- runtime scenario scripts under `tests/e2e/`
- older manual web E2E notes under `web/e2e/`

It does not have an executable browser E2E harness for the web app that drives the actual browser UI against the real server API and SSE flow. That leaves the web app exposed to regressions that cross browser UI, REST APIs, SSE updates, queue recovery, and HITL replay boundaries.

## Goals

- Launch the real web app in a browser under Playwright.
- Keep the web UI, REST API, SSE transport, and server runtime on the real production path during E2E execution.
- Provision or reset a real `e2e-test-web` world before web E2E execution.
- Use a real Google agent (`google` / `gemini-2.5-flash`) for web E2E chat flows.
- Cover the critical web user journeys with executable E2E tests.
- Group scenario coverage by chat context category so the same lifecycle behaviors are validated in:
  - newly created chat
  - loaded default/current chat
  - switched chat
- Preserve the same matrix shape already being used for the Electron E2E story.

## Non-Goals

- Replacing the existing `tests/e2e/*.ts` runtime scenario scripts.
- Replacing the existing lower-level unit or integration tests.
- Building a mocked browser-only API harness that bypasses the real server.
- Exhaustively covering every secondary web settings permutation in the first pass.
- Automating third-party auth or unrelated browser features outside the chat/session lifecycle.

## Requirements

1. The project MUST gain a Playwright-based browser GUI E2E harness for the web app.
2. The harness MUST launch the actual web app in a browser and talk to the real local server runtime.
3. The harness MUST use the real REST API, real SSE flow, and real web UI behavior.
4. The harness MUST NOT replace the browser app’s API/SSE path with a mocked client-only test shell.
5. Before test execution, the harness MUST:
   - check whether world `e2e-test-web` exists
   - delete it if it exists
   - create a fresh `e2e-test-web` world
   - add at least one assistant agent using provider `google` and model `gemini-2.5-flash`
6. The web UI MUST expose stable selectors or semantics sufficient for Playwright to drive the critical workflows reliably.
7. The scenario matrix MUST be grouped by these chat categories:
   - create new chat
   - loaded default/current chat
   - switch chat
8. The following behaviors MUST be exercised across the categories above wherever applicable:
   - send message
   - edit message
   - queue resume / queue recovery controls
   - HITL prompt display and response
   - error handling
9. The harness MUST cover at least one visible error-path assertion for each major lifecycle where the product exposes one.
10. The harness MUST avoid depending on pre-existing developer-local world state other than valid Google provider credentials/configuration.
11. Test helpers MAY prepare world/session state before browser launch, but they MUST NOT replace the production web runtime after launch.

## Required E2E Journey Coverage

### App Bootstrap and World Selection
1. Web app loads successfully.
2. Existing worlds can be listed and selected.
3. Empty-state and no-world-state behavior is testable and deterministic.

### Session Lifecycle
4. Create new chat.
5. Load existing current chat.
6. Switch from one chat to another.
7. Delete a chat.
8. Branch a chat from an assistant message if the web UI exposes that path.

### Category Matrix
9. New chat category:
   - create a new chat and validate the required applicable flows there.
10. Loaded default/current chat category:
   - load the default/current chat and validate the required applicable flows there.
11. Switched chat category:
   - switch between chats and validate the required applicable flows there.

### HITL Lifecycle
12. Respond to a HITL prompt successfully.
13. HITL prompt UI remains scoped to the owning chat and does not leak to another selected chat.
14. Returning to a chat with a pending HITL prompt replays and displays that prompt.

### Edit/Delete Lifecycle
15. Edit a user message successfully.
16. Edit a user message with failure outcome.
17. Edit leading to HITL/pending replay keeps prompt/chat ownership correct.
18. Delete a message chain successfully.
19. Edit/delete completion after switching away MUST NOT contaminate the currently visible chat.

### Queue Lifecycle
20. Queue panel reflects queued/sending/error states.
21. Retry failed queued message works.
22. Resume/recover queued message flows work where the UI exposes them.
23. Remove/skip failed queued message works.
24. Pause/resume/stop/clear queue controls remain functional in the web UI.

### Shell Smoke Coverage
25. Main chat view remains functional under the harness.
26. Any web-accessible logs/settings/world-management affordances remain reachable under the harness.
27. World bootstrap/setup failure is reported clearly when Google credential/model prerequisites are missing.

## Existing Foundation

The repository already has:

- `tests/e2e/` runtime scenario scripts for real-provider behavior
- `web/e2e/test-world.md` and `web/e2e/test-chat.md` as older manual browser-check notes

The new Playwright web E2E story MUST build on that foundation rather than create a disconnected duplicate story.

## Acceptance Criteria

- A Playwright web harness exists in the repo and can launch the real web app.
- The harness provisions `e2e-test-web` world state automatically at test start.
- The first-pass web E2E suite covers the critical workflows above across:
  - new chat
  - loaded default/current chat
  - switched chat
- The suite is runnable through documented npm scripts.
- Local prerequisite failures such as missing Google credentials or missing model setup fail fast with clear messaging.

## Constraints

- Existing API/SSE behavior and chat isolation rules must remain authoritative.
- The first implementation pass should prefer stable selectors and explicit test hooks over broad UI refactors.
- Because this flow uses a real provider, the harness must explicitly document that this is a local-real-runtime suite rather than a CI-safe deterministic suite.
- The web E2E harness must not depend on a mocked API layer after the browser session starts.
