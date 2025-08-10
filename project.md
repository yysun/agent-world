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

- **Running Tests:** `npm run test`
- **Linting and Syntax Check:** `npm run check`
- **Running the Server (API):** `npm run server`
- **Running the Next.js Frontend (Dev Mode):** `npm run dev`

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
