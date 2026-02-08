# Requirement: Electron Desktop App with Three-Column Workspace and Chat UI

**Date**: 2026-02-08  
**Type**: Desktop Feature  
**Status**: Requirements Phase

## Overview

Provide a desktop Electron app that uses Agent World core APIs and presents a Codex Desktop-like three-column experience:
- Left column: project folder context and chat sessions
- Middle column: primary chat area
- Right side: slide-in panel for contextual settings/details

The app must support opening a directory as workspace and creating/managing worlds in that workspace.

## Goals

- Enable desktop users to work with Agent World in a desktop-native, chat-first interface.
- Make world data workspace-scoped (per opened directory).
- Provide a familiar Open Folder workflow for selecting active project context.
- Provide a three-column interaction model with clear role separation (navigation, chat, side panel).
- Ensure safe and predictable behavior when switching workspace contexts.
- Use a Vite + React renderer UI with Tailwind CSS styling for consistent component composition and theming.
- Keep renderer data flow IPC-driven, without direct HTTP calls to local server APIs.
- Ensure sender identity normalization is handled in core so renderer/client casing differences do not break role classification.

## Functional Requirements

- **REQ-1**: The system must provide a desktop Electron application entrypoint.
- **REQ-2**: The app must support selecting a directory using an "Open Folder" flow.
- **REQ-3**: The selected directory must become the active workspace context for world operations.
- **REQ-4**: World data must be stored under the selected workspace (workspace-scoped storage).
- **REQ-5**: The desktop shell must provide three primary regions:
  - Left column for workspace/session navigation
  - Middle column for chat interaction
  - Right-side slide-in panel for contextual controls/details
- **REQ-6**: The left column must show active project folder context and allow chat session management actions.
- **REQ-7**: The middle column must be the default focus area for chat messages and message input.
- **REQ-8**: The right-side panel must support slide-in and slide-out behavior and remain context-aware to current workspace/session/chat state.
- **REQ-9**: Users must be able to create a world in the active workspace by providing at least a world name.
- **REQ-10**: World creation must support optional world metadata (for example description and turn limit).
- **REQ-11**: Users must be able to view a list of worlds that exist in the active workspace.
- **REQ-12**: The app must preserve the last selected workspace so the context can be restored on next launch.
- **REQ-13**: The app must prevent unsafe mixed-context behavior when attempting to switch to a different workspace after the runtime storage context is already initialized.
- **REQ-14**: The app must provide clear user-facing error feedback for invalid or failed workspace/world/chat-session operations.
- **REQ-15**: The desktop UI must use a secure renderer boundary (no unrestricted Node API exposure to renderer content).
- **REQ-16**: The app must allow core provider configuration through environment variables so downstream agent operations can use configured providers.
- **REQ-17**: The renderer layer must be implemented with a Vite + React component architecture.
- **REQ-18**: Tailwind CSS must be used for renderer styling and layout composition.
- **REQ-19**: Renderer operations for workspace/world/session/chat must call preload-exposed IPC methods only.
- **REQ-20**: Renderer must not call local server HTTP APIs (for example `/api/*`) for desktop core workflows.
- **REQ-21**: Core message publishing must normalize sender values to canonical identifiers for user/system/world categories.
- **REQ-22**: Electron main process must provide renderer-facing push events for world chat messages over IPC.
- **REQ-23**: Electron main process must support multiple concurrent chat event subscriptions, each isolated by a subscription identifier.

## Non-Functional Requirements

- **NFR-1 (Usability)**: Workspace navigation, session navigation, and chat actions should be discoverable from the three-column layout without hidden navigation.
- **NFR-2 (Reliability)**: Workspace selection and world creation must behave consistently across app restarts.
- **NFR-3 (Data Isolation)**: Worlds from one workspace must not appear in another workspace context.
- **NFR-4 (Security)**: Sensitive provider credentials must remain outside renderer UI logic.
- **NFR-5 (Performance)**: Listing and creating worlds should complete with desktop-interactive latency for normal local workspace sizes.
- **NFR-6 (Layout Stability)**: Left and middle columns must remain usable when the right panel slides in/out.
- **NFR-7 (Architecture Consistency)**: Renderer implementation should follow a component/state pattern compatible with project Vite + React conventions.

## Constraints

- Must use existing Agent World core APIs as the source of truth for world operations.
- Must not require manual direct database editing by end users.
- Must preserve compatibility with existing environment variable configuration patterns in this repository.
- Must run in local desktop environment without requiring cloud services for baseline folder/world actions.
- Must keep desktop world/session/chat workflows independent from web server route contracts.

## Out of Scope

- Full parity with the existing web chat UI and SSE streaming UX.
- Packaging/distribution pipeline details (installers, signing, auto-updates).
- Advanced multi-root workspace support.
- Rich file explorer/editor integration beyond folder selection.

## Acceptance Criteria

- [ ] Launching the Electron app opens a three-column desktop shell.
- [ ] User can choose a directory via Open Folder.
- [ ] After folder selection, workspace path is visible in the app.
- [ ] Left column exposes workspace context and chat session management controls.
- [ ] Middle column presents the primary chat area and input flow.
- [ ] Right panel slides in/out and reflects active context.
- [ ] Creating a world stores it in the selected workspace context.
- [ ] World list reflects worlds from the selected workspace only.
- [ ] Reopening the app restores the previously selected workspace.
- [ ] Attempting to switch workspace after runtime storage initialization is handled safely (no silent cross-workspace mixing).
- [ ] Validation and runtime errors are shown with clear messages.
- [ ] Renderer access to privileged operations is mediated by explicit IPC APIs.
- [ ] Environment-based provider configuration remains available for future agent usage.
- [ ] Renderer implementation is Vite + React-based.
- [ ] Renderer styling/layout uses Tailwind CSS.
- [ ] Desktop world/session/chat flows execute through IPC calls only.
- [ ] Renderer has no direct dependency on local server `/api` endpoints for desktop core operations.
- [ ] Sender casing/input variants from clients are normalized in core and still produce correct user-role classification.
- [ ] Chat messages from active sessions are pushed from main process to renderer over IPC without polling local server routes.
- [ ] Concurrent chat subscriptions in main process are independently managed and can be subscribed/unsubscribed without cross-canceling each other.

---

## Architecture Review Summary (AR)

**Review Date**: 2026-02-08  
**Status**: Approved with clarifications

### Validated Assumptions

- Core APIs are sufficient for initial folder-scoped world creation/listing without backend server dependency.
- Workspace identity can be represented as an opened directory path and persisted for relaunch continuity.
- A preload-mediated IPC boundary can satisfy desktop requirements while preserving renderer security.

### Clarifications Added

- Workspace switching after runtime storage initialization must be explicitly guarded (safe restart or equivalent controlled transition).
- World data isolation requirement is strict: no cross-workspace listing or creation side effects.
- Error handling must be user-facing and actionable for missing workspace, invalid world payloads, and operation failures.
- Three-column layout behavior must define clear ownership of interactions across left navigation, middle chat, and right slide-in panel.
- Desktop renderer implementation standard is Vite + React + Tailwind with IPC-mediated data access, not server-route coupling.

### Options Reviewed

1. **Main-process core operations (selected)**  
   - Pros: safer credential handling, simpler runtime model, cleaner IPC contract.  
   - Cons: requires explicit IPC design and state boundaries.
2. **Renderer-process core operations (not selected)**  
   - Pros: fewer IPC calls for prototype.  
   - Cons: weaker security posture, harder to enforce privileged boundaries.
3. **Embedded local HTTP server + renderer web UI (deferred for this requirement)**  
   - Pros: alignment with existing web stack.  
   - Cons: extra runtime surface not required for baseline folder/world workflow.
