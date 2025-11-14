v0.9.0 (Unreleased)

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
