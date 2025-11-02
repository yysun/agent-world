# Agent Instructions for Agent World

This document provides essential information for an AI coding agent to effectively contribute to the Agent World project.

## Project Overview

Agent World is a framework for creating and managing teams of AI agents using natural language. It allows users to define agent behaviors and interactions through prompts, without writing any code. The core of the project is an event-driven system where agents communicate in a shared "world."

## Tech Stack

- **Language:** TypeScript
- **Frameworks:**
    - **Backend/Core:** Node.js
    - **Frontend (Legacy):** AppRun
    - **Frontend (Modern):** Next.js with React and Tailwind CSS
- **Testing:** Jest
- **Linting/Formatting:** ESLint, Prettier (run with `npm run check`)

## Project Structure

The project is a monorepo using npm workspaces. Key packages include:

- `core/`: The main library for agent and world management. Contains the core logic.
- `cli/`: The command-line interface for interacting with Agent World.
- `server/`: An Express-based server providing a REST API.
- `next/`: The modern Next.js web application, which is the primary user interface.
- `web/`: A legacy web interface using AppRun.

## Key Development Tasks & Commands

**Script Naming Convention:**

Agent World follows a consistent pattern for all module scripts:
- `<module>` → Shorthand for `<module>:start` (runs compiled code)
- `<module>:start` → Run from `dist/` directory (production)
- `<module>:dev` → Run with tsx (development, no build)
- `<module>:watch` → Run with tsx in watch mode (auto-restart)

**Available modules:** `server`, `cli`, `ws`, `tui`

**Module Dependencies:**
- `web` depends on `server` (web:dev waits for server, web:watch runs both)
- `tui` depends on `ws` (tui:dev waits for ws, tui:watch runs both)

**Testing:**
- `npm run test` — Run all unit tests
- `npm run test:watch` — Run tests in watch mode
- `npm run test:coverage` — Generate coverage report

**Development:**
- `npm run server:watch` — Start API server with auto-reload
- `npm run cli:watch` — Start CLI with auto-reload
- `npm run ws:watch` — Start WebSocket server with auto-reload
- `npm run web:watch` — Start server + web with auto-reload
- `npm run tui:watch` — Start ws + tui with auto-reload
- `npm run dev` — Start API + frontend dev mode

**Quality Checks:**
- `npm run check` — Linting, syntax & formatting check across all packages

## How to Contribute

1.  **Understand the Core Logic:** The `core/` package is central. Changes here will likely require updates to unit tests in `tests/core/`.
2.  **Follow Existing Patterns:** Adhere to the existing coding style, which favors a functional approach over classes.
3.  **Update Documentation:** When adding features, update relevant documentation in the `docs/` directory.
4.  **File Comment Blocks:** Add or update comment blocks at the top of source files to summarize their purpose and any changes made.

## Agent Communication Rules

- Agents respond to human messages and direct @mentions.
- Agents do *not* respond to messages from other agents unless explicitly @mentioned.
- Agents do not respond to their own messages.
- There is a turn limit (default 5) to prevent infinite loops.

For more details, refer to the main `README.md` file.
