v0.11.0

**Desktop & Workspace Experience**
- Added Electron desktop app workspace flow with recents, folder-based world loading, and improved world info refresh behavior
- Improved Electron chat UX with markdown rendering, better modal styling, streamlined stream display, and active-agent/working indicators
- Added full user message edit/delete support in Electron with safer processing guards and resend routing through core
- Modularized Electron runtime into TypeScript main/preload modules and reorganized related runtime/testing structure

**Chat Sessions, Routing & Runtime Controls**
- Added concurrent chat session isolation with `chatId`-based event routing and session-scoped stop processing
- Added world-level `mainAgent` routing and agent-level `autoReply` controls across core, web, and Electron
- Centralized chat title and edit behavior in core for consistent cross-client behavior
- Added world variable (`.env` text) support with runtime interpolation and UI integration

**Skills, HITL & Tooling**
- Added progressive skill loading via `load_skill` with compact prompt summaries and on-demand `SKILL.md` retrieval
- Added singleton skill registry sync with metadata/front-matter parsing and project-over-user precedence
- Added HITL option flow for skill script execution across core, web, Electron, and CLI, plus related docs
- Hardened shell command execution with trusted CWD enforcement, path-scope validation, and lifecycle control APIs

**CLI, Streaming & Reliability**
- Improved CLI streaming UX with richer status-line feedback and real-time tool stream visibility
- Extended SSE/tool-stream timeout behavior to reduce premature idle timeouts on long-running commands
- Improved tool-call/result rendering consistency across web and Electron, including argument parsing and deduplication cleanup
- Added side-effect-free world deletion behavior and improved subscription refresh warning handling

**Docs & Developer Experience**
- Expanded architecture and implementation docs for concurrent chat, HITL approval flow, and event channel rules
- Updated scripts/dependencies for Electron and web development workflow consistency

v0.10.0

**Streaming & Tooling**
- Added end-to-end tool streaming support across Web, React, and CLI clients
- Added shell command output streaming via SSE and streaming callback support in tools
- Added structured `ToolResultData` publishing and explicit `--streaming` control
- Removed legacy manual tool-intervention request/response handling paths

**Approval/HITL Removal**
- Removed approval and human-in-the-loop handling from core orchestration and CLI stream processing
- Completed cleanup of approval/HITL related code paths and aligned docs

**React/Web Experience**
- Added a responsive React World page with a side settings panel
- Improved chat components with enhanced styling, search, new input features, and select dropdown support
- Improved message bubbles with sender avatars/alignment and better auto-scroll behavior

**Reliability & Tests**
- Improved `FileEventStorage` reliability with atomic writes and recovery for trailing data
- Prevented duplicate streamed `MESSAGE` events via last-message tracking
- Added comprehensive tests for orphaned tool-message filtering/formatting and new end-to-end coverage

**Docs & Developer Experience**
- Added npm usage documentation for the `@agent-world/core` package
- Updated shell command tool docs for streaming behavior
- Updated development scripts and dependencies (including React dev/watch workflow improvements)

v0.9.0

**Frontend & Architecture**
- New React frontend with Vite replacing Next.js and WebSocket migration to REST API + SSE
- Workspace optimization with hoisted dependencies and standardized versions

**Tool Approval System**
- Comprehensive tool approval system with structured protocol and session-based approvals
- Approval flow refactoring with toolCallStatus tracking and completion status
- Tool result message filtering to hide non-approval results while preserving approval flow

**Events & Storage**
- Enhanced event metadata with ownership, recipients, threading, and JSON indexes
- SQL-based migration system with strict linear path and atomic execution
- Fixed SQLite SQLITE_BUSY race conditions and tool_calls JSON parsing
- Fixed tool results display in web frontend with proper subscription pattern

**Shell Commands & Tools**
- AI command bypass for shell_cmd tool (gemini, copilot, codex) eliminating unnecessary LLM calls
- Enhanced shell command execution with PATH resolution and parameter quoting
- Improved tool call and result display with detailed argument formatting

**Chat & UI**
- Message loading from agent memory with auto-select default chat
- Chat functionality enhancements with better state management and scroll handling

**Testing**
- Comprehensive E2E and manual test scenarios for agent interactions and tool approval

v0.8.0
- Complete test suite migration from Jest to Vitest (547+ tests passing)
- Comprehensive world chat session management with auto-save and title generation
- Persistent event storage with automatic world event persistence and markdown export
- Interactive CLI world management: load/import and save (file/sqlite)
- Event-driven CLI and API using world activity events instead of timers
- TypedEventBridge enhancement with discriminated union pattern across all layers
- Added `/chat select` command with formatted chat history display
- Cascade delete agent memory on chat deletion
- Preserve replyToMessageId through publish->DB->SSE->UI pipeline
- Structured logging with migration diagnostics and scenario-based MCP debug guide
- Expanded project documentation and contribution guidelines
v0.7.0
- Added end-to-end message editing and deletion flows.
- Added per-agent badge toggles for chat filtering.
- Add `messageId` and `replyToMessageId` with validation, migrations, export handling, and frontend support.
- Revamped chat export formatting with O(n) dedupe and tool-call summarization.
- Excluded memory-only agent messages from LLM context and conversation display.
- Typed AppRun events, hierarchical logger namespaces, domain module refactors, and extensive automated tests.

v0.6.0
- Support MCP server in the world configuration (experimental)
- Support stop word '<world>pass</world>'
- Show server logging in chat
- Improved world export format

v0.5.0
- Support chat history
- Allow export world state, including agents and current chat

v0.4.3
- Launched CLI interface from `npx agent-world`: pipeline, command and interaction modes
- Launched Web interface from `npx agent-world-server`
- Use user's home directory for database: `~/agent-world/database.db`
- Bug fixes and performance improvements

v0.4
- Use SQLite storage by default

v0.3
- Improved Web UI

v0.2
- Simple Web UI

v0.1
- Initial Setup
- CORE - Agent Worlds core library
- CLI
