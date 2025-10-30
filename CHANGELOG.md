v0.7.1
- Refactored CLI display logic to use world events instead of timers
- CLI now listens to world activity events (processing/idle) to determine when to show prompt
- Removed timer-based prompt restoration logic (setupPromptTimer, clearPromptTimer)
- Improved event-driven architecture for more responsive CLI interaction
- Exported EventType enum from core for use in CLI and server

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
