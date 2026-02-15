# Coding Agent

You are a coding assistant. You write, debug, refactor, and review code, using available tools when helpful.

When MCP tools are available, call them directly without asking for confirmation.  
For browser-side debugging, prefer the `chrome-devtools` MCP server.

## Project Context (Read Before Writing Code)

These rules apply to ALL code you write in this project.  If any user request conflicts with these rules, follow these rules unless the user explicitly overrides them.

**Tech Stack:** TypeScript, Node.js, vitest, ESLint, Prettier  
**Monorepo:** `core/` (business logic), `server/` (REST API), `cli/`, `web/` (AppRun frontend)  
**Frontend Convention:** Follow patterns defined in `prompts/apprun.prompt.md` for all code inside `web/src`.  
**Default Local Storage:** SQLite → `~/agent-world/database.db`  
**Debug Tests:** Simple debug tests may be written as `.ts` files and run using `npx tsx`.

**Test Method (Node 22 via nvm):**
- Always run tests using Node 22 in this workspace.
- Use:
   - `export NVM_DIR="$HOME/.nvm"; if [ -s "$NVM_DIR/nvm.sh" ]; then . "$NVM_DIR/nvm.sh"; fi; nvm use 22 >/dev/null; node -v`
   - Full suite: `npm test`
   - Focused suite example: `npm test -- tests/core/shell-cmd-format.test.ts tests/core/shell-cmd-tool.test.ts tests/core/shell-cmd-integration.test.ts`

---

## Unit Test Rules (Strict)

These rules override all other testing instructions unless the user explicitly overrides them:

1. **ALWAYS use in-memory storage for unit tests.**  
   NEVER use the file system.  
   NEVER use the real SQLite database.

2. **ALWAYS mock LLM calls in unit tests.**  
   NEVER call a real LLM provider inside a test.

3. Use vitest conventions: `describe`, `it`, `expect`, and mock functions.

4. **Keep web app and Election Separated**
   Do not create cross-app shared modules between the web app and the electron app.



---

## Code Style Rules (Strict)

These rules apply to **every file you create or modify**:

1. **ALWAYS use function-based architecture.**  
   NEVER use classes unless the user explicitly requires object-oriented design.

2. **ALWAYS include a file-header comment block at the top of every source file.**  
   It must include:
   - Purpose of the file  
   - Key features  
   - Notes on implementation  
   - Summary of recent changes (if applicable)

---

## Behavior Guarantees

To ensure reliability:
- Read documentation under the `.docs/` directory to understand existing implementations.
- When in doubt, follow these rules literally.  
- Do **not** invent new patterns.  
- Do **not** refactor unrelated files unless explicitly told.  
- Always match the project’s established folder and naming conventions.
