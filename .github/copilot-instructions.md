# AGENTS.md – Agent World Project

## Project Overview  
**Agent World** is a framework for creating and managing teams of AI agents using natural language. It allows users to define agent behaviors and interactions through prompts (without writing code). The core is an event-driven system where agents communicate in a shared “world”.

## Tech Stack  
- Language: TypeScript  
- Backend/Core: Node.js  
- Frontend : AppRun (in `web/`)
- Frontend (Future): Next.js + React + Tailwind CSS (in `next/`)  
- Testing: vitest  
- Linting & Formatting: ESLint + Prettier (`npm run check`)

## Project Structure  
This is a monorepo (npm workspaces) with key packages:  
- `core/` — main library for agent & world management (business-logic)  
- `cli/` — command-line interface for interacting with Agent World  
- `server/` — Express-based REST API  
- `next/` — modern Next.js web application (primary UI)  
- `web/` — legacy AppRun UI

## Development Commands  

**Script Naming Convention:**
- `<module>` → Shorthand for `<module>:start` (runs from `dist/`)
- `<module>:start` → Production execution from compiled code
- `<module>:dev` → Development mode with tsx (no build)
- `<module>:watch` → Watch mode with auto-restart on changes

**Available modules:** `server`, `cli`, `ws`, `tui`

**Module Dependencies:**
- `web:dev` / `web:watch` → Depends on `server` (waits/runs with server)
- `tui:dev` / `tui:watch` → Depends on `ws` (waits/runs with ws)

**Common Commands:**
- `npm run test` — Run the full test suite  
- `npm run test:watch` — Run tests in watch mode
- `npm run check` — Syntax, linting & formatting check  
- `npm run server:watch` — Start API server with auto-reload
- `npm run cli:watch` — Start CLI with auto-reload
- `npm run ws:watch` — Start WebSocket server with auto-reload
- `npm run web:watch` — Start server + web with auto-reload
- `npm run tui:watch` — Start ws + tui with auto-reload
- `npm run dev` — Start API + frontend dev mode  

**Important:** DO NOT run `npm run server` and then test in the **same terminal**. Always ask the user (developer) to start the server first before testing.

## Code & Implementation Guidelines  
- Use a **function-based approach** rather than class-based unless a compelling reason exists.  
- When editing the `core/` package (business logic), always update the relevant unit tests in `tests/core/`.  
- Use **in-memory storage** for unit tests (unless specifically testing the storage layer).  
- Maintain comment blocks at the top of each source file: summarise the file’s purpose, features implemented, and any changes made. If the file lacks a comment block, create one *before* editing; if changes are made, update the block *after*.  
- For the frontend in `web/src`, use `prompts/apprun.prompt.md` as a reference for frontend patterns.

## Contribution & Commit Guidelines  
- Before submitting code, ensure all tests pass and lint/format checks succeed.  
- Follow the existing coding style; new code should blend into existing patterns (especially function-based style, TypeScript, React hooks, etc).  
- Add or update documentation in `.docs/` when you introduce significant features or changes.  
- Comment blocks and updates (per above) are mandatory.

