# REQ: Host MCP Apps

**Date:** 2026-02-28
**Status:** Reviewed
**Reference:** https://modelcontextprotocol.io/extensions/apps/overview

---

## Overview

Agent-world acts as an MCP host. This requirement defines what it means for
agent-world to **host MCP Apps** — interactive HTML UIs that MCP servers can
return as tool results, rendered in a sandboxed iframe within the agent-world
UI (Electron and/or web).

---

## Background

MCP Apps are an extension of the MCP protocol where a server can attach an
interactive HTML interface to a tool. When the LLM calls that tool, the host
(agent-world) renders the HTML in a sandboxed iframe alongside the conversation.
The app communicates with the host over `postMessage` using a JSON-RPC dialect
(methods prefixed with `ui/`). The app can call MCP tools, receive updated data,
and push context back into the conversation — all without the user leaving the
chat.

**Key spec facts:**
- Tool descriptions carry a `_meta.ui.resourceUri` field pointing to a `ui://`
  resource on the MCP server.
- The host fetches that resource (HTML + bundled JS/CSS) from the server before
  or after the tool call.
- The host renders the HTML in a sandboxed `<iframe>`.
- All host↔app communication uses `postMessage` JSON-RPC (`ui/initialize`,
  `ui/toolResult`, `tools/call`, context updates, etc.).
- The app may declare required permissions (camera, mic) and allowed external
  origins (`_meta.ui.csp`) in the resource metadata.
- SDK: `@modelcontextprotocol/ext-apps` provides `newAppBridge()` for the host
  side. It manages the full `postMessage` protocol via its internal
  `PostMessageTransport`, exposes typed callbacks (`onmessage`, `onopenlink`,
  `onupdatemodelcontext`, `onsizechange`, `onrequestdisplaymode`), and methods
  (`connect()`, `sendSandboxResourceReady()`, `sendToolInput()`,
  `sendToolResult()`, `sendToolCancelled()`, `sendHostContextChange()`).
- The SDK uses a **double-iframe** sandbox pattern: an outer "sandbox proxy"
  iframe (static HTML on a separate origin or inline) handles security
  validation; the inner `srcdoc` iframe holds the untrusted app HTML.

---

## Goals

1. Detect when a connected MCP server exposes a tool with `_meta.ui.resourceUri`.
2. Fetch and cache the UI resource (HTML bundle) from the server on demand.
3. Render the HTML bundle in a sandboxed `<iframe>` inside the chat UI in **both** the Electron renderer and the web app.
4. Use `@modelcontextprotocol/ext-apps` `newAppBridge()` to implement the full host-side `postMessage` protocol — no manual JSON-RPC wiring.
5. Enforce the security model: sandbox the iframe, apply declared CSP and permissions via the AppBridge `buildAllowAttribute()` helper.
6. Allow the user to dismiss or minimize an active MCP App panel within the conversation.
7. Each tool-call message that triggers a UI-capable tool shows its own independent panel.

---

## Non-Goals

- Building or authoring MCP App HTML bundles (that is the MCP server's concern).
- Supporting every possible framework inside the app (React, Vue, etc.) — the
  host only needs to render and communicate; frameworks are an app-side concern.
- Implementing app-to-app communication or multi-app panels in the same view.
- Implementing real-time server-push outside the MCP tool-call loop.

---

## User Stories

- **As a user**, when the LLM calls an MCP tool that has a UI component, I want
  to see an interactive panel appear in the chat so I can interact with the data
  without switching tabs.
- **As a user**, I want the app panel to stay in context with the conversation so
  I can reference earlier messages while using it.
- **As a user**, I want to dismiss the app panel when I am done, without losing
  the conversation.
- **As a developer connecting an MCP server**, I want agent-world to honor the
  `_meta.ui.resourceUri` field on my tool so my MCP App renders automatically.

---

## Functional Requirements

### F1 — Tool Capability Detection
- When an MCP server's tool list is loaded (or updated), inspect each tool
  description for a `_meta.ui.resourceUri` field.
- Mark those tools internally as "UI-capable."
- No user-visible change at this stage; detection is passive.

### F2 — UI Resource Fetching
- When the LLM calls a UI-capable tool, fetch the `ui://` resource from the MCP
  server using the existing MCP client connection.
- Cache the fetched HTML bundle per `resourceUri` within the session to avoid
  redundant fetches.
- On fetch failure, surface an error in the chat (do not crash the tool call).

### F3 — Sandboxed Rendering (via AppBridge double-iframe)
- Use `newAppBridge(serverInfo, outerIframeEl, callbacks, options)` from
  `@modelcontextprotocol/ext-apps`.
- The outer iframe is a static sandbox proxy page (bundled as an app asset)
  that relays messages to/from the inner `srcdoc` iframe holding the untrusted
  HTML. This provides double-origin isolation.
- Call `appBridge.connect()` then `appBridge.sendSandboxResourceReady()` to
  deliver the HTML bundle, CSP policy, and permissions metadata to the proxy.
- Use `buildAllowAttribute()` from the SDK to construct the iframe `allow`
  attribute from declared permissions.
- The inner iframe must not have access to the host page's DOM, cookies, or
  local storage.

### F4 — App Bridge (postMessage Protocol via SDK)
- Use `@modelcontextprotocol/ext-apps` `newAppBridge()` — no manual JSON-RPC
  wiring. Register SDK callbacks before `connect()`:
  - `onmessage` — receive custom app messages.
  - `onopenlink` — open links via host's default browser mechanism.
  - `onupdatemodelcontext` — update model's context string (MVP: log only).
  - `onsizechange` — resize panel to app-reported dimensions.
  - `onrequestdisplaymode` — honor inline/fullscreen switch requests.
- After `connect()`, call `sendToolInput()` with the original tool arguments
  and `sendToolResult()` when the MCP server returns a result.
- When the app proxies a `tools/call`, call `sendToolResult()` or
  `sendToolCancelled()` after forwarding through the host's MCP client.

### F5 — Permissions
- Read declared permissions from UI resource metadata (`_meta.ui.permissions`).
- Pass to `buildAllowAttribute()` from the SDK; apply to outer iframe `allow`.
- Default: no permissions granted.

### F6 — Chat UI Integration (both Electron and web)
- The MCP App panel renders inside the message list in **both** the Electron
  renderer (`electron/renderer/`) and the web app (`web/`), anchored to the
  tool-call message that triggered it.
- Each UI-capable tool-call message gets its own independent panel; multiple
  panels can be open simultaneously in the same chat.
- Each panel has a visible dismiss/close control. Closing destroys the
  AppBridge instance and removes the iframe from the DOM.
- Panel dimensions: default height min 200 px, max 60 vh; auto-resizes via
  AppBridge `onsizechange`.

### F7 — Tool-Call Proxy Authorization
- Any `tools/call` request from an app is subject to the same HITL approval
  rules already applied to direct tool calls.
- The approval prompt must identify the originating MCP App.

---

## Out-of-Scope Constraints

- This feature does not change how non-UI MCP tools behave.
- This feature does not modify the LLM prompt or skill system.
- `core/` changes are limited to resource-fetch support; all rendering logic
  lives in the frontend layers (Electron renderer and web app).

---

## Open Questions — Resolved

1. **Electron vs. web first?**
   **Both simultaneously.** The `McpAppPanel` component logic is identical for
   both; the only difference is framework (React in Electron, AppRun in web)
   and the tool-call proxy path (IPC in Electron, REST `/api` in web).

2. **AppBridge SDK vs. manual?**
   **Use `@modelcontextprotocol/ext-apps`** `newAppBridge()`. The SDK manages
   the full postMessage protocol, double-iframe sandboxing, and typed callbacks.
   Manual wiring would duplicate the SDK's work and drift from the spec.

3. **Inline vs. external bundle?**
   **Allow external origins** declared in `_meta.ui.csp`. The AppBridge SDK
   delivers this CSP to the sandbox proxy, which enforces it on the inner
   iframe. No additional host-side filtering needed.

4. **Multi-app?**
   **Each tool-call message gets its own panel.** All panels are independent and
   can be open simultaneously. User dismisses each individually.
