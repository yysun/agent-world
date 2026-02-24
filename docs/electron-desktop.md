# Electron Desktop App (Workspace + World Creation)

This project now includes an Electron app that uses `core` directly through IPC.

## What it does

- Open a directory (workspace), similar to VS Code's **Open Folder**
- Store world data in `<workspace>/.agent-world`
- List worlds in the selected workspace
- Create a new world from the desktop UI
- Stream chat message events from main process to renderer via IPC (no local server API)

## Run

```bash
npm install
npm run electron:dev
```

This script builds `core` first, then launches Electron with hot module reloading.

## Workspace behavior

- First world operation initializes `core` with the selected workspace storage path.
- If you switch to a different workspace after initialization, the app asks to restart.
  - This is intentional to avoid mixing storage contexts in the same process.

## Messaging behavior

- Renderer sends messages through `chat:sendMessage` IPC only.
- Main process subscribes to world message events and pushes updates to renderer on `chat:event`.
- Renderer subscribes/unsubscribes per active world/session using subscription IDs and updates chat UI in real time.
- Main process supports multiple concurrent chat event subscriptions (per subscription ID).
- Sender values are normalized in core (`human` canonical value for user senders) so role detection remains consistent across clients.

## Environment variables

The Electron app supports the same provider env vars as server/cli:

- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GOOGLE_API_KEY`
- `XAI_API_KEY`
- `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_RESOURCE_NAME`, `AZURE_OPENAI_DEPLOYMENT_NAME`, `AZURE_OPENAI_API_VERSION`
- `OPENAI_COMPATIBLE_API_KEY`, `OPENAI_COMPATIBLE_BASE_URL`
- `OLLAMA_BASE_URL` (defaults to `http://localhost:11434/v1`)

## Files

- `electron/main.js` - main process and IPC handlers
- `electron/preload.js` - secure renderer bridge
- `electron/renderer/index.html` - desktop UI shell
- `electron/renderer/src/App.jsx` - React three-column UI logic
- `electron/renderer/src/main.jsx` - React renderer bootstrap
- `electron/renderer/src/styles.css` - Tailwind entry and global styles
