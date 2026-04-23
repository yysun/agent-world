# Coding Agent

You are a coding assistant. You write, debug, refactor, and review code, using available tools when helpful.

When MCP tools are available, call them directly without asking for confirmation.
For browser-side debugging, prefer the `chrome-devtools` MCP server.

## Project Context (Read Before Writing Code)

These rules apply to ALL code you write in this project. If any user request conflicts with these rules, follow these rules unless the user explicitly overrides them.

- **Tech Stack:** TypeScript, Node.js, vitest, SQLite, Electron.
- **Monorepo:**
  - `core/` (business logic)
  - `server/` (REST API)
  - `cli/`
  - `web/` (AppRun frontend)
  - `electron/` (desktop app: main/preload/renderer, renderer uses React)
- **Frontend Convention:** For code inside `web/src`, use the agent skill from `yysun/apprun-skills`.
- **Development Workflow:** Use the RPD skill from `yysun/rpd` for all feature and bug-fix work. Follow the RPD workflow (`REQ → AP → AR → AT → SS → TT → CR → ET → DD → GC`).
- **Default Local Storage:** SQLite → `~/agent-world/database.db`
- **Debug Tests:** Simple debug tests may be written as `.ts` files and run using `npx tsx`.
- **Web Search Note:** Agent World currently does not expose provider-native `webSearch` through the `llm-runtime` host boundary. Do not document or assume built-in provider web-search support in repo changes; use `web_fetch` or MCP search/browser tools instead.

---

## Unit Test Requirements (Strict)

These rules override all other testing instructions unless the user explicitly overrides them.

1. **Every change MUST add or update at least one targeted unit test** (1–3 cases):
   - **Bug fix:** regression test that fails before the fix, passes after.
   - **New feature:** happy-path test, plus one edge case if meaningful.

2. **Assert production-path outcomes** (return values, state transitions, events, HTTP responses) — not implementation details.

3. **Test at the unit boundary** (black-box): `core/` via public exports; `server/` at request/response with mocked deps; `web/` via public components/functions; `electron/` via exported IPC/event boundaries.

4. **ALWAYS use in-memory storage; ALWAYS mock LLM calls.** NEVER use the real filesystem, real SQLite file, or a real LLM provider.

5. **Tests MUST be deterministic.** No real network or time dependencies; use fake timers when needed.

6. Use vitest conventions: `describe`, `it`, `expect`, mock functions. Follow existing naming and folder conventions.

7. For changes touching API transport/runtime paths, also run: `npm run integration`.

8. Do not expose local directory paths, secrets, or internal-only debug logs in test code.

---

## App Boundary Rules (Strict)

1. **Keep web app and Electron separated.**
   - Do not create cross-app shared modules between the web app and the Electron app.
2. **Keep Electron-specific UI/runtime rules in `electron/AGENTS.md`.**
   - Lift only genuinely cross-app queue/restore/tool/HITL lifecycle rules into this root doc.
   - Renderer hook, optimistic transcript, refresh merge, and Electron IPC subscription rules remain in `electron/AGENTS.md`.

---

## Event and Message Rules (Strict)

These rules apply to any change touching `core/events.ts`, `core/managers.ts`, `server/api.ts`, chat/session flows, or SSE client handling in `web/src/utils/sse-client.ts`.

1. **Preserve world-level event isolation.**
   - Keep event emitters scoped per world instance.
   - Never introduce cross-world event leakage or shared mutable event state.

2. **Use canonical event contracts.**
   - Message events must follow `WorldMessageEvent` semantics (`content`, `sender`, `timestamp`, `messageId`).
   - SSE events must follow `WorldSSEEvent` semantics (`agentName`, `type`, `content`, `error`, `messageId`, `usage`).
   - System events should continue through `publishEvent(world, type, content)`.

3. **Maintain strict streaming lifecycle ordering.**
   - Preserve `start -> chunk -> end` sequencing.
   - Emit `error` events explicitly for failures.
   - Do not collapse or reorder stream events in ways that break client state updates.

4. **Keep API and SSE behavior consistent.**
   - `server/api.ts` must keep schema validation and stable serialization.
   - Changes to streaming payload shape require matching updates in SSE client handlers.
   - Support both streaming (SSE) and non-streaming paths without behavior drift.

5. **Prevent agent-loop regressions.**
   - Preserve safeguards in agent subscription/auto-mention flows to avoid self-trigger loops.
   - Keep reply/message routing deterministic across chat session updates.

6. **Preserve chat/session integrity side effects.**
   - Do not break message ID/timestamp generation, chat title updates, or autosave behavior tied to message publication.
   - Keep event emission aligned with persisted chat/session state transitions.

7. **Test event-path changes at boundaries.**
   - Add targeted unit tests for event sequencing/shape changes.
   - For API transport/runtime path updates, run `npm run integration` per project policy.

8. **Queue is the only automatic resume authority for user turns.**
   - Persisted chat memory may rebuild transcript state, but it must never directly resend or enqueue a user turn.
   - Automatic resume is limited to queue-owned `queued` rows and recoverable interrupted `sending` rows.
   - `error` and `cancelled` rows must not auto-resume.

9. **Queue APIs are user-turn-only.**
   - Only human/user-authored turns may enter `message_queue`.
   - Assistant/tool/system/non-user messages must use immediate dispatch and must not create queue rows.

10. **Failed user turns do not auto-retry.**
   - Queue dispatch/runtime failures must transition to durable explicit recovery state.
   - Retry is an explicit user action; do not reintroduce automatic backoff replay for failed user turns.

11. **Restore/edit flows must not replay replaced or superseded turns.**
   - Edit/delete restore paths must suppress restore-time auto-resume.
   - Stale `sending` rows must move to durable `error` when terminal SSE, a newer message, or a persisted pending HITL boundary shows the turn should not resume.

12. **Tool/HITL state remains part of the owning user turn lifecycle.**
   - A user turn is not complete just because assistant text or `tool-start` was emitted.
   - Tool calls, `load_skill`, approval prompts, and continuation after approval are part of the same turn lifecycle.

13. **Pending HITL/approval state must be reconstructable from persisted messages.**
   - Process-local runtime maps are not sufficient.
   - Persisted approval prompts and responses must keep stable `chatId`, `requestId`, `toolCallId`, and relevant metadata so restore/replay can recover the same pending state.

14. **Every persisted `tool-start` must reach a terminal partner or explicit durable wait/recovery artifact.**
   - Acceptable follow-ups are `tool-result`, `tool-error`, a durable pending HITL/approval artifact, or explicit durable failed-turn recovery state.
   - A raw `tool-start` with no terminal partner and no durable wait/recovery artifact is a bug.

15. **Durable failed-turn artifacts must have stable identity and cleanup semantics.**
   - Persist at most one canonical durable failed-turn artifact per turn when possible.
   - Failed-turn artifacts should keep a stable link to the triggering user turn whenever the schema allows it.
   - Edit/delete trim must remove post-cutoff and orphaned failed-turn/tool/HITL artifacts for the removed tail.

---

## Code Style Rules (Strict)

These rules apply to every file you create or modify:

1. **ALWAYS use function-based architecture.**
   - NEVER use classes unless the user explicitly requires object-oriented design.

2. **ALWAYS include a file-header comment block** at the top of every source file.
   It must include:
   - Purpose of the file
   - Key features
   - Notes on implementation
   - Summary of recent changes (if applicable)

---

## RPD Workflow (Strict)

Use the `yysun/rpd` skill for all feature and bug-fix work. Follow these rules:

- **Always follow the RPD keyword workflow.** Recognize `RPD`, `REQ`, `AP`, `AR`, `AT`, `SS`, `CC`, `DF`, `DD`, `ET`, `TT`, `CR`, `GC`, `WT`, `!!` as workflow commands (case-insensitive).
- **Full workflow sequence:** `REQ → AP → AR (loop) → AT → SS → TT → CR (loop) → ET (if any) → DD → GC`.
- **Stop for approval** after `REQ/AP/AR` before proceeding to implementation.
- **Docs live under `.docs/`:** reqs in `.docs/reqs/`, plans in `.docs/plans/`, tests in `.docs/tests/`, done in `.docs/done/`.

---

## Worktree Rules (Strict)

For large features and significant bug fixes, use a git worktree to isolate implementation:

1. **Trigger:** Use the `WT` RPD keyword to create a worktree after planning (`AP/AR`) is approved.
2. **Canonical command:**
   ```sh
   git worktree add ../feature-{name} -b feature/{name} main
   ```
3. **Move docs** (not copy) — move the matching REQ and AP docs into the new worktree.
4. **Initialize the worktree** after creation:
   ```sh
   cd ../feature-{name}
   export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
   nvm use
   npm install
   ```
5. **Continue all implementation** (`SS → TT → CR → DD → GC`) inside the worktree.

---

## Behavior Guarantees

- Read documentation under the `.docs/` directory to understand existing implementations.
- When in doubt, follow these rules literally.
- Do not invent new patterns.
- Do not refactor unrelated files unless explicitly told.
- Always match the project’s established folder and naming conventions.
- A change is **not done** until:
  - the code compiles, and
  - the new/updated unit tests pass.
