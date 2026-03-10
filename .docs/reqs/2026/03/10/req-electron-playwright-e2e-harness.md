# REQ: Electron Playwright E2E Harness

**Last Updated:** 2026-03-10
**Status:** Implemented

## Summary

Add a Playwright-based Electron end-to-end harness for the desktop app that can provision a real `e2e-test` world backed by Google `gemini-2.5-flash`, then run the desktop scenario matrix across new-chat, loaded-default-chat, and switched-chat categories.

## Problem Statement

The repository currently has:

- Electron unit/integration-style tests under `tests/electron/`
- Runtime scenario scripts under `tests/e2e/` that exercise real providers and server behavior

It does not have a true GUI E2E harness that launches the Electron app, drives the renderer through the preload bridge, and validates visible desktop behavior end-to-end. That leaves the desktop app vulnerable to regressions that cross renderer, preload, and main-process boundaries but are not caught by unit tests alone.

## Goals

- Launch the real Electron desktop app under Playwright.
- Keep the main process, preload bridge, IPC routes, and renderer all on the real production path during E2E execution.
- Provision or reset a real `e2e-test` world before desktop E2E execution.
- Use a real Google agent (`google` / `gemini-2.5-flash`) for desktop E2E chat flows.
- Preserve and extend the already-added IPC chat-flow scenario matrix instead of creating a disconnected second coverage story.
- Cover the critical desktop user journeys with executable E2E tests.
- Group scenario coverage by chat context category so the same lifecycle behaviors are validated in:
  - newly created chat
  - loaded default/current chat
  - switched chat
- Keep the harness repeatable for local use and capable of a reduced deterministic mode later if needed for CI.

## Non-Goals

- Replacing the existing `tests/e2e/*.ts` real-runtime scenario scripts.
- Exhaustively covering every secondary desktop settings permutation in the first pass.
- Testing native OS dialogs through real filesystem selection UIs.
- Introducing a second, duplicate automation stack alongside Playwright.
- Making the first pass fully provider-free if that blocks the requested real-Ollama desktop flow.
- Building a mocked Electron-shell E2E harness that bypasses the real main/preload/renderer integration path.

## Requirements

1. The project MUST gain a Playwright-based Electron GUI E2E harness.
2. The harness MUST launch the actual Electron app process, not just renderer components in isolation.
3. The harness MUST use the real Electron main process, real preload bridge, real IPC routing, and real renderer application.
4. The harness MUST NOT replace the desktop bridge or runtime behavior with a mocked renderer-only test shell.
5. Before test execution, the harness MUST:
   - check whether world `e2e-test` exists
   - delete it if it exists
   - create a fresh `e2e-test` world
   - add at least one assistant agent using provider `google` and model `gemini-2.5-flash`
6. The desktop renderer MUST expose stable selectors or semantics sufficient for Playwright to drive the critical workflows reliably.
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
11. Test helpers MAY prepare world/session state before launch, but they MUST NOT replace the production desktop runtime after launch.

## Required E2E Journey Coverage

### App Bootstrap and Workspace
1. App launches successfully and mounts the desktop shell.
2. Existing worlds can be listed and selected.
3. Empty-state and no-world-state desktop behavior is testable and deterministic.

### Session Lifecycle
4. Create new session.
5. Load existing current session.
6. Switch from one session to another.
7. Delete a session.
8. Branch a session from an assistant message.

### Category Matrix
9. New chat category:
   - create a new chat and validate the required applicable flows there.
10. Loaded default/current chat category:
   - load the default/current chat and validate the required applicable flows there.
11. Switched chat category:
   - switch between chats and validate the required applicable flows there.

### HITL Lifecycle
12. Respond to a HITL prompt successfully.
13. HITL prompt UI remains scoped to the owning session and does not leak to another selected session.
14. Returning to a session with a pending HITL prompt replays and displays that prompt.

### Edit/Delete Lifecycle
15. Edit a user message successfully.
16. Edit a user message with failure outcome.
17. Edit leading to HITL/pending replay keeps prompt/session ownership correct.
18. Delete a message chain successfully.
19. Edit/delete completion after switching away MUST NOT contaminate the currently visible session.

### Queue Lifecycle
20. Queue panel reflects queued/sending/error states.
21. Retry failed queued message works.
22. Resume/recover queued message flows work where the UI exposes them.
23. Remove/skip failed queued message works.
24. Pause/resume/stop/clear queue controls remain functional in desktop UI.

### View and Shell Smoke Coverage
25. Chat view remains functional under the harness.
26. At least one non-chat world view selector path (board/grid/canvas) is covered as a smoke test.
27. Logs/settings side-panel toggles remain reachable under the harness.
28. World bootstrap/setup failure is reported clearly when Google credential/model prerequisites are missing.

## Existing Foundation

The Electron main IPC boundary already has targeted scenario-matrix coverage for:

- new chat -> send
- current chat -> send
- current chat -> edit
- switched chat -> send
- switched chat -> edit

The Electron Playwright E2E story MUST build on that foundation rather than duplicate it in a separate documentation track. GUI E2E should validate the same lifecycle categories at the desktop-window level.

## Acceptance Criteria

- ✅ A Playwright Electron harness exists in the repo and can launch the real desktop app.
- ✅ The harness provisions `e2e-test` world state automatically at test start.
- ✅ The first-pass desktop E2E suite covers the critical workflows above across:
  - new chat
  - loaded default/current chat
  - switched chat
- ✅ The suite is runnable through documented npm scripts (`npm run test:electron:e2e`, `npm run test:electron:e2e:run`).
- ✅ Local prerequisite failures such as missing Google API key fail fast with clear messaging.

## Implementation Notes

- Harness lives under `tests/electron-e2e/` with specs `app-shell.spec.ts` and `chat-flow-matrix.spec.ts`.
- Support files: `support/bootstrap-real-world.ts`, `support/fixtures.ts`, `support/electron-harness.ts`.
- Playwright config at `playwright.electron.config.ts`.
- Each test boots a fully isolated workspace under `.tmp/electron-playwright-workspace/run-<timestamp>-<uuid>/`.
- HITL flows use a deterministic `shell_cmd` approval path against a disposable workspace file.
- HITL scope/replay (switched-chat HITL scoped to owning session, replays on return) fixed 2026-03-10: session-scoped `activeHitlPrompt`/`hasActiveHitlPrompt` derivation via `electron/renderer/src/domain/hitl-scope.ts`. Both tests are now active.
