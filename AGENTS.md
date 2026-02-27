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
  - `electron/` (desktop app: main/preload/renderer)
- **Frontend Convention:** For code inside `web/src`, use the agent skill from `yysun/apprun-skills`.
- **Default Local Storage:** SQLite → `~/agent-world/database.db`
- **Debug Tests:** Simple debug tests may be written as `.ts` files and run using `npx tsx`.

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

---

## App Boundary Rules (Strict)

1. **Keep web app and Electron separated.**
   - Do not create cross-app shared modules between the web app and the Electron app.

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

## Behavior Guarantees

- Read documentation under the `.docs/` directory to understand existing implementations.
- When in doubt, follow these rules literally.
- Do not invent new patterns.
- Do not refactor unrelated files unless explicitly told.
- Always match the project’s established folder and naming conventions.
- A change is **not done** until:
  - the code compiles, and
  - the new/updated unit tests pass.
