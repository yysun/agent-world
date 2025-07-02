# WebSocket Events and Commands Architecture

## Overview

The Agent World WebSocket system provides real-time communication between clients and the server through a stateful connection management layer that handles world subscriptions and stateless event processing for commands and messages.

## Architecture Components

### Core Components
- **ws.ts**: Stateful WebSocket connection and subscription lifecycle management
- **events.ts**: Stateless command execution and message publishing
- **index.ts**: Command registry and execution logic

### Key Features
- Transport-agnostic event handling
- Per-connection world subscription with automatic cleanup
- Real-time event forwarding with echo prevention
- Comprehensive logging and error handling

## WebSocket Message Flow

### Connection Lifecycle

```mermaid
sequenceDiagram
    participant Client
    participant ws.ts as WebSocket Server
    participant events.ts as Event Handler
    participant World as World Manager
    participant Agent as Agent System

    Client->>ws.ts: WebSocket Connection
    ws.ts->>Client: Connected Message
    
    Note over ws.ts: Connection established with cleanup handlers
    
    Client->>ws.ts: Disconnect
    ws.ts->>World: Cleanup subscriptions
    ws.ts->>ws.ts: Remove event listeners
```

### World Subscription Flow

```mermaid
sequenceDiagram
    participant Client
    participant ws.ts as WebSocket Server
    participant World as World Manager
    participant EventEmitter as World Events

    Client->>ws.ts: Subscribe {worldName}
    ws.ts->>World: getWorld(worldId)
    World-->>ws.ts: World Instance
    ws.ts->>ws.ts: setupWorldEventListeners()
    ws.ts->>EventEmitter: Register event handlers
    ws.ts->>Client: Success Response
    
    Note over ws.ts: World events forwarded to client
    
    EventEmitter->>ws.ts: Event (system/world/message/sse)
    ws.ts->>ws.ts: Filter echo messages
    ws.ts->>Client: Forward Event
    
    Client->>ws.ts: Unsubscribe
    ws.ts->>EventEmitter: Remove all listeners
    ws.ts->>ws.ts: Clear world reference
    ws.ts->>Client: Success Response
```

## Message Types and Processing

### Message Type Architecture

```mermaid
graph TD
    A[Incoming WebSocket Message] --> B{Message Type}
    
    B -->|subscribe| C[World Subscription]
    B -->|unsubscribe| D[World Cleanup]
    B -->|system/world| E[Command Processing]
    B -->|message| F[Message/Command Routing]
    
    C --> C1[Load World]
    C1 --> C2[Setup Event Listeners]
    C2 --> C3[Send Success Response]
    
    D --> D1[Remove Event Listeners]
    D1 --> D2[Clear World Reference]
    D2 --> D3[Send Success Response]
    
    E --> E1{Starts with '/'}
    E1 -->|Yes| E2[Route to Command Handler]
    E1 -->|No| E3[Return Error]
    
    F --> F1{Starts with '/'}
    F1 -->|Yes| F2[Route to Command Handler]
    F1 -->|No| F3[Publish Message to World]
    
    E2 --> G[events.ts: handleCommand]
    F2 --> G
    F3 --> H[events.ts: handleMessagePublish]
```

### Command Processing Flow

```mermaid
sequenceDiagram
    participant Client
    participant ws.ts as WebSocket Server
    participant events.ts as Event Handler
    participant commands as Command Registry
    participant World as World Manager

    Client->>ws.ts: {type: "system", payload: {message: "/clear agent1"}}
    ws.ts->>ws.ts: Validate message format
    ws.ts->>events.ts: handleCommand(world, "/clear agent1", rootPath)
    events.ts->>events.ts: prepareCommandWithRootPath()
    events.ts->>commands: executeCommand("/clear agent1", world)
    commands->>commands: Parse command and args
    commands->>commands: Route to clearCommand()
    commands->>World: clearAgentMemory("agent1")
    World-->>commands: Success/Error result
    commands-->>events.ts: Command Result {refreshWorld: false}
    events.ts-->>ws.ts: Command Result
    ws.ts->>ws.ts: sendCommandResult()
    ws.ts->>Client: Success Response with data
    
    Note over ws.ts: If refreshWorld: true
    alt Command requires world refresh
        ws.ts->>ws.ts: refreshWorldSubscription()
        ws.ts->>World: getWorld() - reload
        ws.ts->>ws.ts: setupWorldEventListeners() - resubscribe
    end
```

## Command Categories

### Global Commands (No World Context Required)
- `/getWorlds` - List all available worlds
- `/addWorld` - Create new world

### World Commands (Require Active Subscription)
- `/clear [agentName]` - Clear agent memory
- `/getWorld` - Get current world info
- `/updateWorld` - Update world properties
- `/addAgent` - Add new agent
- `/updateAgentConfig` - Update agent configuration
- `/updateAgentPrompt` - Update agent system prompt
- `/updateAgentMemory` - Modify agent memory

### Message Flow for Non-Commands

```mermaid
sequenceDiagram
    participant Client
    participant ws.ts as WebSocket Server
    participant events.ts as Event Handler
    participant World as World Events
    participant Agent as Agent System

    Client->>ws.ts: {type: "message", payload: {message: "Hello world", sender: "user1"}}
    ws.ts->>events.ts: handleMessagePublish(world, "Hello world", "user1")
    events.ts->>events.ts: Normalize sender to "HUMAN"
    events.ts->>World: publishMessage(world, "Hello world", "HUMAN")
    World->>Agent: Trigger agent processing
    Agent->>World: Emit response event
    World->>ws.ts: Forward event to subscribers
    ws.ts->>ws.ts: Filter echo (skip HUMAN messages)
    ws.ts->>Client: Agent response event
```

## Event Filtering and Echo Prevention

### Echo Prevention Logic

```mermaid
graph TD
    A[World Event Received] --> B{Check Sender}
    B -->|sender = 'HUMAN'| C[Skip Echo]
    B -->|sender starts with 'user'| C
    B -->|sender = agent name| D[Forward to Client]
    B -->|sender = system| D
    B -->|no sender| D
    
    C --> E[Log Skip Message]
    D --> F[Send to WebSocket Client]
```

## Error Handling and Logging

### Comprehensive Logging Strategy

```mermaid
graph TD
    A[WebSocket Operation] --> B[Pino Logger]
    
    B --> C[Connection Events]
    B --> D[Message Flow]
    B --> E[Command Execution]
    B --> F[World Subscription]
    B --> G[Error Tracking]
    
    C --> C1[Client connect/disconnect]
    D --> D1[Incoming/outgoing messages]
    E --> E1[Command start/end/results]
    F --> F1[Subscribe/unsubscribe/refresh]
    G --> G1[Validation/processing errors]
```

### Error Response Structure

```json
{
  "type": "error",
  "error": "Error message",
  "details": "Optional additional details",
  "timestamp": "2025-07-01T12:00:00.000Z"
}
```

## Data Response Formats

### Success Response Structure

```json
{
  "type": "success",
  "message": "Operation completed successfully",
  "data": "Optional result data",
  "refreshWorld": false,
  "timestamp": "2025-07-01T12:00:00.000Z"
}
```

### Event Forwarding Structure

```json
{
  "eventType": "message",
  "sender": "agent1",
  "message": "Agent response text",
  "timestamp": "2025-07-01T12:00:00.000Z"
}
```

## Configuration and Environment

### Key Environment Variables
- `LOG_LEVEL`: Controls logging verbosity (debug, info, warn, error)
- `NODE_ENV`: Determines log formatting (pretty in dev, JSON in prod)
- `AGENT_WORLD_DATA_PATH`: Root path for world data storage

### WebSocket Server Configuration
- Attached to existing HTTP server
- Per-connection state management
- Automatic cleanup on disconnect
- Structured error handling with client feedback

## State Management

### Connection State per WebSocket

```typescript
interface WorldSocket extends WebSocket {
  world?: World;                                    // Current subscribed world
  worldEventListeners?: Map<string, Function>;     // Event listener cleanup map
}
```

### Lifecycle Management

1. **Connection**: Initialize empty state
2. **Subscribe**: Load world, setup listeners, store references
3. **Command/Message**: Process with current world context
4. **Refresh**: Reload world, resubscribe to events
5. **Unsubscribe/Disconnect**: Clean up listeners, clear references

## Integration Points

### With Core System
- **World Manager**: World loading and management
- **Agent System**: Command execution and message processing
- **Event System**: Real-time event publishing and subscription

### With Client Applications
- **Web UI**: Real-time updates and command execution
- **CLI Tools**: WebSocket-based remote operations
- **API Integration**: Programmatic access to world operations

## Performance Considerations

### Memory Management
- Automatic event listener cleanup prevents memory leaks
- Per-connection world references with proper disposal
- Efficient message filtering to reduce unnecessary network traffic

### Scalability Features
- Stateless command processing enables horizontal scaling
- Per-connection isolation prevents cross-contamination
- Structured logging enables monitoring and debugging at scale

---

*This architecture enables real-time, bidirectional communication between clients and the Agent World system while maintaining clean separation of concerns and robust error handling.*
