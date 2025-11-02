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

- ✅ **Phase 0:** Code extraction from web frontend (types, domain logic)
- ✅ **Phase 1:** Core infrastructure (WebSocket hooks, basic UI)
- 🚧 **Phase 2:** UI Components (in progress)
- ⏳ **Phase 3:** Polish & Testing (planned)

## License

MIT
