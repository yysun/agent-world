# Agent World WebSocket Server

WebSocket server for Agent World with async message processing, real-time event streaming, and queue-based agent orchestration.

## Features

- **Real-time Event Streaming**: Subscribe to world events with automatic reconnection and missed event replay
- **Async Message Processing**: Queue-based message processing with per-world sequential execution
- **Heartbeat Monitoring**: Automatic connection health monitoring for both clients and message processing
- **Graceful Shutdown**: Proper cleanup of in-flight operations during shutdown
- **Structured Logging**: Hierarchical logging with configurable levels per category

## Architecture

```
┌─────────────┐         WebSocket         ┌──────────────┐
│   Clients   │ ◄────────────────────────► │  WS Server   │
└─────────────┘                            └──────┬───────┘
                                                  │
                                           ┌──────▼───────┐
                                           │ Event Stream │
                                           │  + Queue     │
                                           └──────┬───────┘
                                                  │
                                           ┌──────▼───────┐
                                           │    Queue     │
                                           │  Processor   │
                                           └──────┬───────┘
                                                  │
                                           ┌──────▼───────┐
                                           │    World     │
                                           │   Instances  │
                                           └──────────────┘
```

## Configuration

All configuration is done through environment variables. See the root `.env.example` file for all available options.

### Server Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `WS_PORT` | `3001` | WebSocket server port |
| `AGENT_WORLD_STORAGE_TYPE` | `sqlite` | Storage backend: 'sqlite' or 'memory' |
| `AGENT_WORLD_SQLITE_DATABASE` | `./data/agent-world.db` | SQLite database path |
| `AGENT_WORLD_DATA_PATH` | `./data` | Base directory for world data |

### Heartbeat Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `WS_HEARTBEAT_INTERVAL` | `30000` | Client ping interval (ms) |
| `WS_HEARTBEAT_TIMEOUT` | `60000` | Client timeout threshold (ms) |
| `WS_PROCESSOR_HEARTBEAT` | `5000` | Processor heartbeat update interval (ms) |

### Queue Processor Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `WS_POLL_INTERVAL` | `1000` | Queue polling interval (ms) |
| `WS_MAX_CONCURRENT` | `5` | Max concurrent world processing |

### Logging Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `error` | Global log level: trace, debug, info, warn, error |
| `LOG_WS` | - | Override log level for all ws.* categories |
| `LOG_WS_SERVER` | - | WebSocket server operations |
| `LOG_WS_PROCESSOR` | - | Queue processor operations |
| `LOG_WS_STORAGE` | - | Storage initialization |
| `LOG_WS_CONFIG` | - | Configuration logging |

**Example**: To enable debug logging for the WebSocket server:
```bash
LOG_WS_SERVER=debug npm start
```

## Usage

### Development

```bash
# Start in watch mode
npm run dev

# Or with custom configuration
WS_PORT=8080 LOG_WS=debug npm run dev
```

### Production

```bash
# Build
npm run build

# Start
npm start

# Or with custom configuration
WS_PORT=8080 LOG_LEVEL=info npm start
```

## WebSocket Protocol

### Client Messages

#### Subscribe to World Events
```json
{
  "type": "subscribe",
  "worldId": "my-world",
  "chatId": "chat-123",  // optional
  "seq": 42              // optional, for reconnection
}
```

#### Unsubscribe
```json
{
  "type": "unsubscribe",
  "worldId": "my-world"
}
```

#### Send Message
```json
{
  "type": "message",
  "worldId": "my-world",
  "messageId": "msg-123",
  "chatId": "chat-123",  // optional
  "payload": {
    "content": "Hello, agents!",
    "sender": "human",
    "priority": 0
  }
}
```

#### Heartbeat
```json
{
  "type": "ping",
  "timestamp": 1234567890
}
```

### Server Messages

#### Event Update
```json
{
  "type": "event",
  "worldId": "my-world",
  "chatId": "chat-123",
  "seq": 43,
  "payload": {
    "id": "evt-123",
    "type": "agent-response",
    "payload": { ... },
    "meta": { ... },
    "createdAt": "2025-11-01T12:00:00Z"
  },
  "timestamp": 1234567890
}
```

#### Status Update
```json
{
  "type": "status",
  "worldId": "my-world",
  "messageId": "msg-123",
  "payload": {
    "status": "processing" // or "queued", "completed", "failed"
  },
  "timestamp": 1234567890
}
```

#### Error
```json
{
  "type": "error",
  "error": "Error message",
  "timestamp": 1234567890
}
```

#### Heartbeat Response
```json
{
  "type": "pong",
  "timestamp": 1234567890
}
```

## Health Check

The server exposes a health check endpoint:

```bash
curl http://localhost:3001/health
```

Response:
```json
{
  "status": "ok",
  "connections": 5,
  "worlds": 3
}
```

## Error Handling

- **Connection Errors**: Clients are automatically disconnected on errors
- **Processing Failures**: Messages are retried up to `maxRetries` (default: 3)
- **Stuck Messages**: Heartbeat monitoring detects and resets stalled processing
- **Graceful Shutdown**: In-flight messages complete before server stops

## Logging

The WebSocket server uses structured logging with hierarchical categories:

- `ws.server`: WebSocket server operations
- `ws.processor`: Queue processor operations
- `ws.storage`: Storage initialization
- `ws.config`: Configuration logging

Enable debug logging for specific categories:

```bash
# Debug all WS operations
LOG_WS=debug npm start

# Debug only processor
LOG_WS_PROCESSOR=debug npm start

# Debug multiple categories
LOG_WS_SERVER=debug LOG_WS_PROCESSOR=debug npm start
```

## Development

### Project Structure

```
ws/
├── index.ts              # Entry point with configuration
├── ws-server.ts          # WebSocket server implementation
├── queue-processor.ts    # Message queue processor
├── client.ts             # WebSocket client utility
├── .env.example          # Environment variable template
└── README.md             # This file
```

### Testing

```bash
# Run tests
npm test

# With debug logging
LOG_WS=debug npm test
```

## License

See main project LICENSE.
