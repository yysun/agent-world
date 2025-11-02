# Agent World TUI

Terminal User Interface for Agent World using Ink (React for CLIs).

## Features

- 🔌 Real-time WebSocket connection to Agent World server
- 💬 Live message streaming and chat history
- 🤖 Agent status monitoring (active, streaming, last activity)
- ⚡ Event replay for catching up on history
- 🎨 Professional terminal UI with React patterns
- ⌨️ Interactive command execution
- 🔄 Automatic reconnection on disconnect

## Installation

```bash
cd tui
npm install
```

## Development

```bash
# Run in development mode
npm run dev

# Build for production
npm run build

# Run built version
npm start

# Run tests
npm test
```

## Usage

### Basic Usage

```bash
agent-world-tui --server ws://localhost:3001 --world my-world
```

### With Chat ID

```bash
agent-world-tui --world my-world --chat chat-123
```

### Replay from Specific Sequence

```bash
agent-world-tui --world my-world --replay 1500
```

## Options

- `--server, -s` - WebSocket server URL (default: `ws://localhost:3001`)
- `--world, -w` - World name or ID (required)
- `--chat, -c` - Chat ID to load (optional)
- `--replay` - Replay from sequence number or 'beginning' (default: 'beginning')
- `--help` - Show help message

## Keyboard Shortcuts

- `Ctrl+C` - Exit application
- `Enter` - Send message or execute command (Phase 2)

## Commands (Phase 3)

Commands start with `/`:

- `/world list` - List all worlds
- `/agent list` - List agents in current world
- `/chat list` - List chat history
- `/help` - Show help

Regular messages (without `/`) are sent as user messages to the world.

## Architecture

The TUI connects directly to the WebSocket server (`ws://localhost:3001`) for real-time communication:

```
TUI Client (tui/)
      ↓
WebSocket Protocol (ws://)
      ↓
WebSocket Server (ws/)
      ↓
Core & Storage
```

**Note:** The TUI does NOT use the REST API server. All operations (subscribe, enqueue messages, execute commands) are done via WebSocket messages.

## Implementation Status

- ✅ **Phase 0:** Code extraction from web frontend (types, domain logic) - 84% code reuse
- ✅ **Phase 1:** Core infrastructure (WebSocket hooks, basic UI)
- ✅ **Phase 2:** UI Components (ChatView, AgentSidebar, InputBox, split-pane layout)
- ✅ **Phase 3:** Polish (ConnectionStatus, CommandResult, error handling)
- ⏳ **Testing:** Unit tests and integration tests (planned)

## Development Guide

### Prerequisites

Make sure the WebSocket server is running:

```bash
# In the main project root
npm run ws:start
# Or check if it's running on ws://localhost:3001
```

### Running the TUI

```bash
cd tui
npm install
npm run dev
```

### Testing Manually

1. Start WebSocket server: `npm run ws:start` (from project root)
2. Run TUI: `npm run dev` (from tui/)
3. Expected behavior:
   - Should connect to ws://localhost:3001
   - Should load default-world
   - Should replay historical events
   - Should show agents in sidebar
   - Should display messages in chat
   - Type messages and see agent responses

### Troubleshooting

**Connection Failed:**
- Ensure WebSocket server is running on port 3001
- Check server logs for errors
- Verify world name exists

**No Messages Showing:**
- Check if world has a current chat ID set
- Verify events are being streamed from server
- Check browser console for WebSocket errors

**TypeScript Errors:**
- Run `npm install` to ensure all dependencies are installed
- Run `npx tsc --noEmit` to check for compilation errors

## License

MIT
