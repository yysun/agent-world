# Done: Host MCP Apps

**Date:** 2026-02-28
**Plan:** `.docs/plans/2026/02/28/plan-host-mcp-apps.md`
**REQ:** `.docs/reqs/2026/02/28/req-host-mcp-apps.md`

---

## What Was Built

Full end-to-end support for hosting MCP App UIs (interactive HTML panels) in both the Electron desktop client and the web app.

When an LLM calls a UI-capable MCP tool (one whose definition carries `_meta.ui.resourceUri`), the chat transcript automatically shows a sandboxed interactive HTML panel alongside the tool-result row. The panel communicates with the MCP server through the existing tool infrastructure (IPC in Electron, REST in the web app).

---

## Phases Completed

### Phase 1 — Dependency
- Added `@modelcontextprotocol/ext-apps` to root `package.json`.

### Phase 2 — Core: UI Resource Support
- `isUiCapableTool(tool)`, `getMcpUiResourceUri(tool)`, `readMcpUiResource(serverKey, uri)`, `getMcpServerInfo(serverKey)` added to `core/mcp-server-registry.ts` and exported from `core/index.ts`.
- Unit tests: 6 cases covering both `_meta.ui.resourceUri` (nested) and `_meta["ui/resourceUri"]` (flat) formats.

### Phase 3 — Sandbox Proxy Asset
- `electron/assets/mcp-sandbox-proxy.html` — static outer iframe that relays postMessages between the parent frame and the untrusted inner `srcdoc` iframe. Follows the double-iframe sandboxing pattern from the `@modelcontextprotocol/ext-apps` reference implementation.
- Symlinked into `web/public/mcp-sandbox-proxy.html`.
- Electron `vite.config.js` updated to copy the asset to the renderer dist.
- Electron main process registers a custom `app://` protocol handler (`electron/main-process/lifecycle.ts`) serving the proxy page at `app://host/mcp-sandbox-proxy.html`.

### Phase 4 — Electron IPC Channels
- `MCP_READ_UI_RESOURCE` and `MCP_PROXY_TOOL_CALL` channels added to `electron/shared/ipc-contracts.ts`.
- `handleMcpReadUiResource` and `handleMcpProxyToolCall` added to `electron/main-process/ipc-handlers.ts` and wired in `ipc-routes.ts`.
- `mcpReadUiResource` and `mcpProxyToolCall` exposed in `electron/preload/bridge.ts`.
- Unit tests: both handlers tested with mocked core functions.

### Phase 5 — Web Server Proxy Endpoints
- `POST /api/worlds/:worldName/mcp/ui-resource` — fetches HTML bundle via `readMcpUiResource`.
- `POST /api/worlds/:worldName/mcp/tool-proxy` — executes a tool via `callMcpTool`.
- Both endpoints wired in `server/api.ts`.

### Phase 6 — Shared AppBridge Lifecycle Helpers
- `web/src/domain/mcp-app-host.ts`:
  - `createAppBridgeHost(iframe, callbacks, options): AppBridge` — instantiates `AppBridge` (client=null), sets up `onsandboxready`/`oninitialized`/`oncalltool`/`onopenlink`/`onsizechange` callbacks, connects via `PostMessageTransport`.
  - `destroyAppBridgeHost(bridge): Promise<void>` — calls `teardownResource` then `close`; safe to call repeatedly.
  - `buildProxySrc(): string` — checks `__MCP_PROXY_SRC` override (Electron), falls back to `/mcp-sandbox-proxy.html` (web).
  - `sessionUiResourceCache: Map<string, string>` — module-level HTML bundle cache.

### Phase 7 — Electron: McpAppPanel Component
- `electron/renderer/src/components/McpAppPanel.tsx`:
  - React functional component; `useEffect` on mount sets `iframe.src = ELECTRON_PROXY_SRC`, listens for `load`, calls `createAppBridgeHost`.
  - `oncalltool` → `window.agentWorldDesktop.mcpProxyToolCall(...)`.
  - `onsizechange` → updates `panelHeight` state.
  - Dismiss button: `destroyAppBridgeHost` then `onClose()`.
  - Cleanup on unmount via `useEffect` return.

### Phase 8 — Electron: MessageListPanel Integration
- `electron/renderer/src/components/MessageListPanel.tsx` extended with:
  - `worldId?: string` prop.
  - `dismissedPanels: Set<string>`, `htmlBundleCache: Map<string, string>` state.
  - `pendingFetchesRef: React.useRef<Set<string>>` to prevent duplicate in-flight fetches.
  - `fetchHtmlBundle` callback triggers `mcpReadUiResource` IPC on first encounter.
  - `dismissMcpPanel` callback.
  - Message map returns wrapped in `React.Fragment` with McpAppPanel rendered after tool-result messages that have `uiResourceUri`.
- `core/mcp-server-registry.ts`: `serverKey: serverName` added to AI tool definitions.
- `core/events/memory-manager.ts`: tool result `AgentMessage` annotated with `uiResourceUri`/`serverKey` when the tool is UI-capable.
- `electron/main-process/message-serialization.ts`: `serializeMessage` forwards `uiResourceUri`/`serverKey`.
- `electron/renderer/src/utils/app-layout-props.ts` and `App.tsx`: `worldId` wired to message list props.

### Phase 9 — Web: mcp-app-panel AppRun Component
- `web/src/components/mcp-app-panel.tsx`:
  - AppRun `Component` subclass with `rendered` hook for one-time bridge init.
  - `this.element.querySelector('iframe')` to locate the proxy iframe.
  - Tool-call proxy: `POST /api/worlds/:id/mcp/tool-proxy`.
  - `onsizechange` → `this.setState({ panelHeight })`.
  - `unload` → `destroyAppBridgeHost`.
  - Dismiss via `'mcp-panel-dismiss'` update handler.

### Phase 10 — Web: World Page Integration
- `web/src/types/index.ts`: `uiResourceUri?`, `serverKey?` added to `Message`; `worldId?`, `mcpUiBundles?`, `dismissedMcpPanelIds?` added to `WorldChatProps`; `mcpUiBundles`, `dismissedMcpPanelIds` added to `WorldComponentState`.
- `web/src/types/events.ts`: `mcp-ui-bundle-loaded` and `mcp-ui-panel-dismiss` events added to `WorldEvents`.
- `web/src/pages/World.update.ts`: `uiResourceUri`/`serverKey` passed through in `createMessageFromMemory` and SSE message handler; `mcp-ui-bundle-loaded` and `mcp-ui-panel-dismiss` update handlers added.
- `web/src/pages/World.tsx`: initial `mcpUiBundles`/`dismissedMcpPanelIds` state; `worldId` and new props passed to `<WorldChat>`.
- `web/src/components/world-chat.tsx`: `triggerMcpBundleFetch` (module-level, guarded by `mcpBundleFetchPending` set) fires `/api/worlds/:id/mcp/ui-resource` on first encounter; `<McpAppPanel>` rendered inside `display:contents` wrapper after tool-result messages with a loaded bundle.

---

## Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Import path for AppBridge | `@modelcontextprotocol/ext-apps/app-bridge` | Only path in package `exports`; the `/dist/src/app-bridge` path was not exported and broke Vite's module resolver. |
| AppRun bridge init timing | `rendered` hook + `initialized` flag | `mounted` fires before DOM; `rendered` fires after each view call; flag prevents re-init on state updates. |
| Fetch trigger in WorldChat | Module-level `mcpBundleFetchPending` Set | Guards against duplicate API calls across React/AppRun re-renders without requiring extra component state. |
| display:contents wrapper | Wraps message-row + McpAppPanel | Preserves flat flex layout in conversation-area without breaking existing CSS selectors. |
| `uiResourceUri`/`serverKey` annotation | In-memory on `AgentMessage` at call time | Avoids SQLite schema changes; fields flow through `serializeMessage` to renderer for the current session. |

---

## Test Results

All 1128 tests pass after implementation.
