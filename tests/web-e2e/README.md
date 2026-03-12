# Web Browser E2E Tests

Real-browser Playwright tests that exercise the Agent World web UI end-to-end, using the live REST API, SSE streaming, and a real Google Gemini model.

## Overview

These tests run against an actual Chromium browser, a running Express API server (port 3000), and a Vite dev server (port 8080). Each test bootstraps an isolated `e2e-test-web` world through the live HTTP API before navigating through the real UI.

**Test files:**

| File | Description |
|------|-------------|
| `app-shell.spec.ts` | Smoke test — loads home page, navigates into the seeded world |
| `chat-flow-matrix.spec.ts` | Chat lifecycle matrix across Loaded Current Chat, Switched Chat, and New Chat categories |
| `queue.spec.ts` | Queue and processing lifecycle — in-progress indicator, stop, failed item, error overlay |
| `shell-stream-parity.spec.ts` | Live shell tool card status transition — running tool summary flips to done without refresh |
| `tool-permissions.spec.ts` | Tool-permission dropdown UI affordances and `read` enforcement — select presence, default value, PATCH persistence, and real-LLM block verification |
| `world-smoke.spec.ts` | World and chat management affordances — create, delete, search, settings |

### 5. Tool Permission Controls (`tool-permissions.spec.ts`)

**Validates the world-level tool-permission dropdown in the composer bar and enforces the `read` level.**

| Test | LLM | What it checks |
|---|---|---|
| Select element is visible | No | `aria-label="Tool permission level"` present on the world page |
| Default value is auto | No | Fresh world with no `tool_permission` key shows `auto` in the select |
| All three options present | No | `read`, `ask`, `auto` option elements all exist |
| Change to read fires PATCH + persists | No | UI select change intercepts PATCH `/worlds/:name`; reload reflects `read` |
| Select reflects ask set via API | No | `setWorldToolPermission('ask')` → navigate → UI shows `ask` |
| Select reflects read set via API | No | `setWorldToolPermission('read')` → navigate → UI shows `read` |
| read blocks shell_cmd (agent response) | **Yes** | Tool returns blocked error; agent response includes `"permission level"` |

---

### 2. Chat Flow Matrix (`chat-flow-matrix.spec.ts`)

**Exercises the approved web chat categories and lifecycle paths.**

| Scenario | Current Chat | Switched Chat | New Chat |
|---|---|---|---|
| Send → success | ✅ | ✅ | ✅ |
| Send → error | ✅ | ✅ | ✅ |
| Send → HITL | ✅ | ✅ | ✅ |
| Edit → success | ✅ | ✅ | ✅ |
| Edit → error | ✅ | ✅ | ✅ |
| Edit → HITL | ✅ | ✅ | ✅ |
| Queue: failed item shown | ✅ (via send error) | ✅ (via send error) | ✅ (via send error) |
| Queue: retry failed | ⏳ pending web UI | ⏳ pending web UI | ⏳ pending web UI |
| Queue: skip/remove failed | ⏳ pending web UI | ⏳ pending web UI | ⏳ pending web UI |
| Queue: clear | ⏳ pending web UI | ⏳ pending web UI | ⏳ pending web UI |
| Delete message chain | ✅ | ✅ | ✅ |
| Edit/delete doesn't contaminate other session | ✅ | — | — |
| HITL scoped to owning session | — | ✅ | — |
| HITL replays on return | — | ✅ | — |

> ⏳ = test written with correct expected test IDs; will fail until the queue management panel ships in the web UI.

---

## Prerequisites

1. **Node.js** — version managed by `.nvmrc`. Install with `nvm use`.

2. **Google API Key** — tests use `gemini-2.5-flash` via the `e2e-google` agent:
   ```bash
   export GOOGLE_API_KEY=your_key_here
   ```
   Or put it in a `.env` file at the project root:
   ```
   GOOGLE_API_KEY=your_key_here
   ```

3. **Playwright Chromium** — install the browser binaries once:
   ```bash
   npx playwright install chromium
   ```

4. **Dependencies** — install from the project root:
   ```bash
   npm install
   ```

---

## Running the tests

```bash
npm run test:web:e2e
```

This command:
1. Starts the Express API server (`npm run server:dev`) on port 3000
2. Starts the Vite web app (`npm run web:vite:e2e`) on port 8080
3. Runs all Playwright specs serially in a real Chromium browser

**Note:** Set `reuseExistingServer: false` in `playwright.web.config.ts` (or set `CI=true`) to force fresh server startup every run. By default (`reuseExistingServer: !process.env.CI`) an already-running server on port 8080 is reused.

---

## Isolated workspace

All server data for these tests is written to `.tmp/web-playwright-workspace/` (a SQLite database and workspace files), separate from your development data. The directory is created automatically at test start.

A disposable file `.e2e-hitl-delete-me.txt` is created inside the workspace before each run; the `shell_cmd` HITL approval test deletes it via the agent to confirm the shell command executed successfully.

---

## Environment variables passed to the servers

| Variable | Value | Purpose |
|----------|-------|---------|
| `AGENT_WORLD_DATA_PATH` | `.tmp/web-playwright-workspace` | Isolated SQLite storage |
| `AGENT_WORLD_WORKSPACE_PATH` | `.tmp/web-playwright-workspace` | Isolated file workspace |
| `AGENT_WORLD_QUEUE_NO_RESPONSE_FALLBACK_MS` | `250` | Faster error-path trigger |
| `AGENT_WORLD_AUTO_OPEN` | `false` | Disable auto browser launch |
| `AGENT_WORLD_STORAGE_TYPE` | `sqlite` | Explicit storage backend |
| `GOOGLE_API_KEY` | _(from environment)_ | Gemini model authentication |

---

## Test world setup

`bootstrapWorldState()` (in `support/web-harness.ts`) runs before each test and:

1. Checks that `GOOGLE_API_KEY` is present
2. Waits for the API server to be healthy
3. Creates the workspace directory and the disposable HITL file
4. Deletes any existing `e2e-test-web` world and re-creates it fresh
5. Creates the `e2e-google` agent with a system prompt that:
   - Echoes back any token wrapped in `<<<...>>>` for assertion
   - Approves the HITL shell command to delete `.e2e-hitl-delete-me.txt` when asked
6. Seeds two chats (`chat-alpha`, `chat-beta`) so the switched-chat category has a ready second chat

---

## Fixtures and helpers

| Export | Source | Purpose |
|--------|--------|---------|
| `test` (fixture) | `support/fixtures.ts` | Extends Playwright `test` with `bootstrapState` |
| `bootstrapWorldState` | `support/web-harness.ts` | Full world reset and seeding |
| `gotoHome` | `support/web-harness.ts` | Navigate to the home page |
| `gotoWorld` | `support/web-harness.ts` | Navigate into the e2e-test-web world |
| `createNewChat` | `support/web-harness.ts` | Click the create-chat button |
| `selectChatById` | `support/web-harness.ts` | Click a chat by ID in the sidebar |
| `getCurrentChatId` | `support/web-harness.ts` | Read the current active chat ID from the DOM |
| `sendComposerMessage` | `support/web-harness.ts` | Type and submit a message from the composer |
| `waitForAssistantToken` | `support/web-harness.ts` | Wait until a specific echo token appears in the chat |
| `waitForHitlPrompt` | `support/web-harness.ts` | Wait for the HITL approval prompt to appear |
| `respondToHitlPrompt` | `support/web-harness.ts` | Click a HITL option button by option ID |
| `editLatestUserMessage` | `support/web-harness.ts` | Open the edit input on the most recent user message and submit |
| `waitForErrorState` | `support/web-harness.ts` | Wait for the visible world-error-state overlay |
| `deleteAllAgents` | `support/web-harness.ts` | Delete all agents via the API (triggers error path) |
| `buildShellHitlPrompt` | `support/web-harness.ts` | Build the prompt text that triggers the shell HITL flow |
| `setWorldToolPermission` | `support/web-harness.ts` | PATCH the world variables to set or clear the `tool_permission` env key |

---

## Key test IDs in the web UI

| `data-testid` | Component | Used by |
|---------------|-----------|---------|
| `home-page` | Home.tsx | `gotoHome()` |
| `world-carousel` | swipe-carousel.tsx | app-shell smoke test |
| `world-search` | swipe-carousel.tsx | home-page world search coverage |
| `world-page` | World.tsx | `gotoWorld()` |
| `world-error-state` | World.tsx | `waitForErrorState()` |
| `chat-history` | world-chat-history.tsx | `gotoWorld()` |
| `chat-create` | world-chat-history.tsx | `createNewChat()` |
| `chat-item-{id}` | world-chat-history.tsx | `selectChatById()` |
| `composer-input` | world-chat.tsx | `sendComposerMessage()` |
| `composer-action` | world-chat.tsx | `sendComposerMessage()`, `waitForAssistantToken()` |
| `hitl-waiting` | world-chat.tsx | _(waiting indicator while agent processes)_ |
| `hitl-prompt` | world-chat.tsx | `waitForHitlPrompt()` |
| `hitl-option-{optionId}` | world-chat.tsx | `respondToHitlPrompt(optionId)` |
| `message-edit-{id}` | world-chat.tsx | `editLatestUserMessage()` |
| `message-edit-input` | world-chat.tsx | `editLatestUserMessage()` |
| `message-edit-save` | world-chat.tsx | `editLatestUserMessage()` |
| _(aria-label)_ `Tool permission level` | world-chat.tsx | `tool-permissions.spec.ts` — select affordance and value assertions |

---

## Limitations

- **Local only** — these tests make real LLM API calls to Google Gemini; they are not suitable for CI without a secret-managed `GOOGLE_API_KEY` and a tolerant timeout budget.
- **Serial execution** — `workers: 1` and `fullyParallel: false` are required because world/chat state is shared across the test run.
- **Test duration** — each test waits on real LLM responses; full suite takes several minutes.
- **Flakiness risk** — network latency variability, LLM response times, or Vite HMR delays can affect timing; the current 5 s per-test timeout is intentionally strict.
