# Electron Workspace Desktop App (Three-Column + IPC)

**Date**: 2026-02-08  
**Type**: New Feature  
**Related Requirement**: `/Users/esun/Documents/Projects/agent-world/.docs/reqs/2026-02-08/req-electron-workspace-worlds.md`  
**Related Plan**: `/Users/esun/Documents/Projects/agent-world/.docs/plans/2026-02-08/plan-electron-workspace-worlds.md`

## Overview

Implemented a new Electron desktop experience that uses Agent World core directly in the main process and exposes functionality to the renderer through a preload IPC bridge.  
The renderer was implemented with Vite + React and styled with Tailwind CSS in a three-column layout:
- Left: workspace + world/session management
- Middle: chat thread and composer
- Right: slide-in contextual panel

## Completed Scope

1. Workspace-scoped desktop runtime
- Added VS Code-style folder selection in Electron main process.
- Persisted selected workspace across launches.
- Scoped storage to `<workspace>/.agent-world`.
- Added safe workspace switch behavior requiring relaunch after core initialization.

2. IPC-first desktop architecture
- Added IPC handlers for workspace, worlds, sessions, chat retrieval, chat send, and chat event subscription.
- Kept renderer data flow strictly IPC-based through preload APIs.
- Avoided renderer dependency on server `/api` routes for desktop workflows.

3. Vite + React + Tailwind renderer
- Added dedicated Electron renderer build/dev setup with Vite and React.
- Added Tailwind-based three-column desktop UI with contextual status and empty states.
- Added world creation UI and session selection/creation interactions in the renderer.

4. Main-to-renderer chat event push
- Added push channel (`chat:event`) from Electron main to renderer.
- Added renderer lifecycle-based subscribe/unsubscribe behavior for active world/session.
- Added support for multiple concurrent subscriptions in main process via subscription IDs.

5. Core sender normalization
- Added sender normalization in core event publisher logic.
- Canonicalized user-like sender values (for example `user`, `User123`, `HUMAN`) to `human`.
- Preserved stable role classification for message rendering and downstream processing.

## Primary Files Added or Updated

- `/Users/esun/Documents/Projects/agent-world/electron/main.js`
- `/Users/esun/Documents/Projects/agent-world/electron/preload.js`
- `/Users/esun/Documents/Projects/agent-world/electron/package.json`
- `/Users/esun/Documents/Projects/agent-world/electron/vite.config.js`
- `/Users/esun/Documents/Projects/agent-world/electron/postcss.config.js`
- `/Users/esun/Documents/Projects/agent-world/electron/renderer/index.html`
- `/Users/esun/Documents/Projects/agent-world/electron/renderer/src/main.jsx`
- `/Users/esun/Documents/Projects/agent-world/electron/renderer/src/App.jsx`
- `/Users/esun/Documents/Projects/agent-world/electron/renderer/src/styles.css`
- `/Users/esun/Documents/Projects/agent-world/core/events/publishers.ts`
- `/Users/esun/Documents/Projects/agent-world/docs/electron-desktop.md`
- `/Users/esun/Documents/Projects/agent-world/package.json`

## Runtime Commands

- Dev: `npm run electron:dev`
- Start (build renderer + open Electron): `npm run electron:start`

## Validation Status

- Implemented and wired end-to-end in code for workspace, world/session, and chat event paths.
- Manual UX validation checklist items in the architecture plan remain to be fully completed and recorded.

## Notes

- Electron main and preload are intentionally plain JavaScript to keep runtime packaging simple for a thin boundary layer.
- Core remains the source of truth for world/session/message behavior; renderer is a UI consumer through IPC.
