# Electron Desktop E2E Tests

This directory contains Playwright E2E tests that launch the real compiled Electron application and exercise desktop flows with actual LLM API calls.

## Prerequisites

1. **Environment Setup**: Create a `.env` file in the project root with a Google API key:
   ```bash
   GOOGLE_API_KEY=your_key_here
   ```
   > The Electron E2E suite uses `gemini-2.5-flash` via the Google provider. The `GOOGLE_API_KEY` is required.

2. **Built Electron App**: The suite runs against the compiled app. The full `npm run test:electron:e2e` script builds everything automatically, but if running the suite directly you must build first:
   ```bash
   npm run build:core
   npm run electron:main:build
   npm run electron:renderer:build
   ```

## Available Tests

### 1. App Shell Smoke (`app-shell.spec.ts`)

**Validates the real Electron app launches and shell controls are reachable:**

- ✅ **App Launch**: Electron window opens and settles on the chat view
- ✅ **Session List**: Seeded chat sessions are visible in the sidebar
- ✅ **Board / Grid / Canvas Views**: View-selector toggles reflect state correctly
- ✅ **Logs / Settings Panels**: Side panels open and close via toolbar buttons

### 2. Chat Flow Matrix (`chat-flow-matrix.spec.ts`)

**Exercises the approved desktop chat categories and lifecycle paths.**

| Scenario | Current Chat | Switched Chat | New Chat |
|---|---|---|---|
| Send → success | ✅ | ✅ | ✅ |
| Send → error | ✅ | ✅ | ✅ |
| Send → HITL | ✅ | ✅ | ✅ |
| Edit → success | ✅ | ✅ | ✅ |
| Edit → error | ✅ | ✅ | ✅ |
| Edit → HITL | ✅ | ✅ | ✅ |
| Queue: failed item shown | ✅ (via send error) | ✅ (via send error) | ✅ (via send error) |
| Queue: retry failed | ✅ | ✅ | ✅ |
| Queue: skip/remove failed | ✅ | ✅ | ✅ |
| Queue: clear | ✅ | ✅ | ✅ |
| Delete message chain | ✅ | ✅ | ✅ |
| Edit/delete doesn't contaminate other session | ✅ | — | — |
| HITL scoped to owning session | — | ✅ | — |
| HITL replays on return | — | ✅ | — |

### 3. Tool Permission Controls (`tool-permissions.spec.ts`)

**Validates the world-level tool-permission dropdown in the ComposerBar and enforces the `read` level.**

| Test | LLM | What it checks |
|---|---|---|
| Select element is visible | No | `aria-label="Tool permission level"` present in ComposerBar |
| Default value is auto | No | Fresh bootstrapped world shows `auto` in the select |
| All three options present | No | `read`, `ask`, `auto` option elements all exist |
| Change to read updates world variables | No | `selectOption('read')` → bridge `loadWorld` returns variables with `tool_permission=read` |
| Select reflects read set via bridge | No | `setDesktopToolPermission('read')` → world reload → UI shows `read` |
| read blocks shell_cmd (agent response) | **Yes** | Tool returns blocked error; agent response includes `"permission level"` |

## Running the Tests

### Full build + run (recommended)
```bash
npm run test:electron:e2e
```

### Run only (skip rebuilds)
```bash
npm run test:electron:e2e:run
```

### Run a specific spec
```bash
npx playwright test --config playwright.electron.config.ts tests/electron-e2e/app-shell.spec.ts
```

## Test Infrastructure

### Workspace Isolation
Each test boots a fresh isolated workspace under `.tmp/electron-playwright-workspace/run-<timestamp>-<uuid>/` so SQLite locks and agent state never bleed between test runs.

### Bootstrap Script (`support/bootstrap-real-world.ts`)
Executed in a child Node process before Electron launches. It:
- Deletes any existing `e2e-test` world in the target workspace
- Creates a fresh Google-backed world with agent `E2E Google` (`gemini-2.5-flash`)
- Seeds named chat sessions (`Loaded Current Chat`, `Switched Chat`) with stable history
- Writes a disposable shell-command target file for deterministic HITL approval tests

### Playwright Fixtures (`support/fixtures.ts`)
- Calls the bootstrap before each test
- Launches the compiled Electron app with the isolated workspace path
- Exposes the first app window as the standard Playwright `page` fixture

### Electron Harness (`support/electron-harness.ts`)
High-level desktop helpers used by spec files:
- `launchAndPrepare` — selects the `e2e-test` world and waits for the shell to settle
- `sendComposerMessage` — types and submits a message via the chat composer
- `waitForAssistantToken` — polls transcript until a token appears in an assistant bubble
- `editLatestUserMessage` — triggers inline edit on the most recent user turn
- `deleteLatestUserMessage` — accepts the confirm dialog and deletes the most recent user turn and its chain
- `waitForHitlPrompt` / `respondToHitlPrompt` — locates and responds to an approval dialog
- `waitForQueuePanel` / `waitForQueueStatus` — asserts queue panel state
- `pauseCurrentChatQueue` / `addQueueMessageToCurrentChat` — sets up queue scenarios
- `selectSessionByName` — switches to a named session in the sidebar
- `deleteAllAgents` — removes all agents from the current world (for error-path tests)
- `createNewSession` — creates a fresh chat session via the UI
- `setDesktopToolPermission` — sets the `tool_permission` env key on the current world via the preload bridge `updateWorld` call

## Configuration

The Playwright Electron config lives at [`playwright.electron.config.ts`](../../playwright.electron.config.ts):
- `testDir`: `tests/electron-e2e`
- `workers: 1` — serial execution (one Electron instance at a time)
- `timeout: 180 000 ms` per test (real LLM calls can be slow)
- `expect.timeout: 30 000 ms`
- Traces, screenshots, and video retained on failure

## Debugging Failures

- **Traces**: Open `test-results/` with `npx playwright show-report` to inspect step-by-step traces.
- **Screenshots / Video**: Retained automatically on failure; check `test-results/` after a failed run.
- **API Key missing**: The suite throws `GOOGLE_API_KEY is required` at bootstrap time if the key is absent. Set it in `.env` before running.
- **SQLite busy errors**: Already handled by per-run workspace isolation. If they recur, ensure no stale Electron process is holding the database open.
- **Stale build**: If UI selectors stop matching, rebuild with `npm run electron:renderer:build` before re-running.
