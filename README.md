# Agent World

A TypeScript-native AI agent simulation system with world-centric architecture for creating, managing, and orchestrating AI agents in virtual worlds with real-time communication and persistent memory.

## Features

- **World-Centric Architecture**: All agent operations mediated through World interface with clean separation
- **TypeScript-Native Execution**: Direct .ts execution with tsx - no compilation or build process required  
- **Multi-World Management**: Create and manage multiple isolated worlds for different simulation scenarios
- **Agent Lifecycle Management**: Create, configure, update, and remove AI agents with persistent storage
- **LLM Provider Support**: Integration with multiple LLM providers (OpenAI, Anthropic, Google, Azure, XAI, Ollama)
- **Event-Driven Architecture**: Per-world event bus with real-time message flow and SSE streaming
- **Persistent Memory System**: Agent conversation history stored per agent with automatic management
- **CLI & Server Separation**: Dedicated binaries for command-line interface and web server
- **Package Distribution**: npm package with clean public API for programmatic usage
- **Real-time Streaming**: Character-by-character streaming responses via Server-Sent Events
- **Mention-Based Communication**: Agents respond to @mentions to prevent infinite loops

## Architecture

The system follows a **world-centric function-based architecture** with TypeScript-native execution:

- **World-Mediated Access**: All agent operations go through World interface - no direct agent access
- **TypeScript-Native**: Direct .ts execution with tsx - no compilation step required
- **Function-Based Design**: Clean functional interfaces over class-based patterns  
- **Per-World Event Bus**: Each world has its own EventEmitter for isolated communication
- **Package Distribution**: Clean public API through main index.ts for npm usage
- **Modular Core**: Separate modules for world management, agent operations, and LLM integration

### Project Structure

```
agent-world/
├── index.ts                    # Main package entry - re-exports core API
├── package.json               # Package config with bin commands
├── bin/                       # Dedicated entry points  
│   ├── cli.ts                 # CLI binary (agent-world)
│   └── server.ts              # Server binary (agent-world-server)
├── core/                      # Core functionality modules
│   ├── index.ts               # Public API exports
│   ├── world-manager.ts       # World CRUD operations
│   ├── agent-manager.ts       # Agent operations within worlds
│   ├── agent-storage.ts       # Agent persistence layer
│   ├── world-storage.ts       # World persistence layer
│   ├── llm-manager.ts         # LLM provider abstraction
│   ├── types.ts               # TypeScript definitions
│   └── utils.ts               # Shared utilities
├── cli/                       # CLI implementation
│   ├── index.ts               # CLI main logic
│   └── commands/              # CLI command handlers
├── server/                    # Web server implementation  
│   ├── index.ts               # HTTP server
│   ├── api.ts                 # REST API routes
│   └── ws.ts                  # WebSocket server
└── data/worlds/               # World storage directory
```

### World-Centric Message Flow

1. **User Input** → CLI/API receives message
2. **World Resolution** → Message routed to specific world
3. **Event Publishing** → World's EventEmitter broadcasts to agents
4. **Agent Processing** → Agents in world process messages with memory context
5. **LLM Integration** → Provider handles streaming responses
6. **SSE Events** → Real-time streaming back to clients
7. **Memory Persistence** → Conversation history automatically saved

### File Structure Per World

Each world maintains organized storage with agent-specific directories:

```
data/worlds/{world-name}/
├── config.json                    # World configuration and metadata  
└── agents/{agent-name}/
    ├── config.json                # Agent configuration (name, model, provider)
    ├── system-prompt.md           # Editable system prompt 
    └── memory.json                # Conversation history and context
```

### Core Modules

- **World Manager** (`core/world-manager.ts`): World CRUD operations with EventEmitter integration
- **Agent Manager** (`core/agent-manager.ts`): Agent operations within world contexts
- **Agent Storage** (`core/agent-storage.ts`): Agent persistence and file operations
- **LLM Manager** (`core/llm-manager.ts`): Multi-provider LLM integration with streaming
- **Event Systems** (`core/world-events.ts`, `core/agent-events.ts`): Per-world event handling
- **CLI Interface** (`cli/`): Interactive command-line interface with streaming display
- **Web Server** (`server/`): REST API and WebSocket server for web integration

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd agent-world

# Install dependencies
npm install

# No build step required - TypeScript runs directly with tsx
```

## Usage

### Command Line Interface

```bash
# Start CLI (default)
npm start

# Or explicitly start CLI
npm run cli

# Or use global binary after npm link
agent-world
```

### Web Server

```bash
# Start web server 
npm run server

# Or use global binary after npm link  
agent-world-server
```

### Development

```bash
# TypeScript runs directly - no compilation needed
npx tsx bin/cli.ts
npx tsx bin/server.ts
```

## Web API

The web server provides REST API and WebSocket endpoints:

### REST Endpoints

- `GET /health` - Server health check
- `GET /worlds` - List all available worlds  
- `GET /worlds/{worldName}/agents` - List agents in a world
- `GET /worlds/{worldName}/agents/{agentName}` - Get agent details
- `PATCH /worlds/{worldName}/agents/{agentName}` - Update agent configuration
- `POST /worlds/{worldName}/chat` - Send message with SSE streaming response

### WebSocket Events

- **subscribe**: Subscribe to world events
- **unsubscribe**: Unsubscribe from world events  
- **chat**: Send chat message and receive real-time responses

### Example API Usage

```bash
# List all worlds
curl http://localhost:3000/worlds

# Get agents in a world
curl http://localhost:3000/worlds/default-world/agents

# Update agent status
curl -X PATCH http://localhost:3000/worlds/default-world/agents/agent1 \
  -H "Content-Type: application/json" \
  -d '{"status": "inactive"}'

# Chat with SSE streaming
curl -X POST http://localhost:3000/worlds/default-world/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello @assistant!", "sender": "API_USER"}' \
  --no-buffer
```

### CLI Commands

The CLI provides interactive commands for managing worlds and agents:

- `/add` - Create a new agent in the current world
- `/list` - List all agents in the current world  
- `/use` - Switch to a different agent or world
- `/show` - Display agent details and memory
- `/clear` - Clear agent memory
- `/stop` - Stop the current session
- `/quit` - Exit the CLI

The CLI automatically creates a default world if none exist and provides real-time streaming responses from agents.

## Package API

Agent World is distributed as an npm package with a clean public API:

### World Management

```typescript
import { createWorld, getWorld, listWorlds, LLMProvider } from 'agent-world';

// Create a new world
const world = await createWorld('./data/worlds', { 
  name: 'My Simulation',
  description: 'Test environment',
  turnLimit: 10 
});

// Get an existing world  
const world = await getWorld('./data/worlds', 'my-simulation');

// List all worlds
const worlds = await listWorlds('./data/worlds');

// Access world agents
const agents = Array.from(world.agents.values());
```

### Agent Operations (through World)

```typescript
// All agent operations go through the World interface
const agent = await world.createAgent({
  name: 'Assistant',
  personality: 'Helpful and friendly',
  instructions: 'You are a helpful assistant',
  provider: LLMProvider.OPENAI,
  model: 'gpt-4o'
});

// Update agent
const updatedAgent = await world.updateAgent('assistant', {
  status: 'active',
  model: 'gpt-4o-mini'
});

// Get agent
const agent = await world.getAgent('assistant');

// Clear agent memory
await world.clearAgentMemory('assistant');
```

### Event System

```typescript
import { subscribeToMessages, publishMessage } from 'agent-world';

// Subscribe to world messages
const unsubscribe = subscribeToMessages(world, (event) => {
  console.log('Message received:', event.content);
});

// Publish a message to the world
await publishMessage(world, 'Hello @assistant!', 'human');
```

## Data Structure

The system uses a hierarchical file structure with world-centric organization:

```
data/worlds/
└── {world-name}/
    ├── config.json                    # World configuration and metadata
    └── agents/
        └── {agent-name}/
            ├── config.json            # Agent configuration (name, model, provider)
            ├── system-prompt.md       # Editable system prompt in markdown
            └── memory.json            # Conversation history and memory context
```

### World Configuration

```json
{
  "id": "my-world",
  "name": "My World", 
  "description": "A test world for AI agents",
  "turnLimit": 10,
  "autoSave": true,
  "createdAt": "2025-06-29T10:30:00Z"
}
```

### Agent Configuration

```json
{
  "name": "Assistant",
  "personality": "Helpful and friendly",
  "instructions": "You are a helpful assistant",
  "provider": "openai",
  "model": "gpt-4o",
  "status": "active",
  "createdAt": "2025-06-29T10:35:00Z"
}
```

### Memory Structure

```json
{
  "messages": [
    {
      "role": "user",
      "content": "Hello @assistant", 
      "timestamp": "2025-06-29T10:40:00Z"
    },
    {
      "role": "assistant",
      "content": "Hello! How can I help you today?",
      "timestamp": "2025-06-29T10:40:05Z"
    }
  ]
}
```

## Environment Variables

```bash
# LLM API Keys
OPENAI_API_KEY=your_openai_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key  
GOOGLE_API_KEY=your_google_api_key
XAI_API_KEY=your_xai_api_key

# Azure OpenAI
AZURE_OPENAI_API_KEY=your_azure_key
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com

# Ollama (local)
OLLAMA_BASE_URL=http://localhost:11434/api

# Data path (optional - defaults to ./data/worlds)
AGENT_WORLD_DATA_PATH=./data/worlds

# Server configuration
PORT=3000
NODE_ENV=development
```

## Development

### TypeScript-Native Architecture

Agent World runs TypeScript directly without compilation:

- **tsx execution**: Direct .ts file execution with tsx
- **No build step**: Development and production use the same .ts files
- **ES modules**: Modern import/export syntax throughout
- **Type safety**: Full TypeScript coverage with strict typing

### Project Structure

```
agent-world/
├── index.ts                    # Main package entry point
├── package.json               # Package config with bin commands
├── tsconfig.json              # TypeScript configuration
├── bin/                       # Binary entry points
│   ├── cli.ts                 # CLI binary (npx tsx bin/cli.ts)
│   └── server.ts              # Server binary (npx tsx bin/server.ts)
├── core/                      # Core functionality modules
│   ├── index.ts               # Public API exports
│   ├── world-manager.ts       # World CRUD operations
│   ├── agent-manager.ts       # Agent operations  
│   ├── agent-storage.ts       # Agent persistence
│   ├── world-storage.ts       # World persistence
│   ├── llm-manager.ts         # LLM integration
│   ├── types.ts               # Type definitions
│   └── utils.ts               # Shared utilities
├── cli/                       # CLI implementation
│   ├── index.ts               # CLI main logic
│   ├── commands/              # Command handlers
│   └── ui/                    # Display components
├── server/                    # Web server implementation
│   ├── index.ts               # HTTP server
│   ├── api.ts                 # REST routes
│   └── ws.ts                  # WebSocket server
└── tests/                     # Test suites
    ├── core/                  # Core module tests
    └── integration/           # Integration tests
```

### Available Scripts

```bash
npm start                   # Start CLI (default)
npm run cli                 # Start CLI explicitly
npm run server              # Start web server
npm test                    # Run Jest tests
npm run test:watch          # Run tests in watch mode
```

### Development Workflow

```bash
# Direct TypeScript execution - no compilation
npx tsx bin/cli.ts          # Run CLI directly
npx tsx bin/server.ts       # Run server directly
npx tsx --test tests/       # Run tests directly

# Package development
npm link                    # Link for global testing
agent-world                 # Test global CLI binary
agent-world-server          # Test global server binary
```

### Testing

The project includes comprehensive Jest tests for core functionality:

```bash
# Run all tests
npm test

# Run tests in watch mode  
npm run test:watch

# Run specific test suites
npx tsx --test tests/core/
npx tsx --test tests/integration/
```

### Code Style

- **Function-based architecture**: Pure functions over classes
- **World-centric design**: All operations go through World interface
- **TypeScript-native**: Direct .ts execution, no build process
- **Event-driven**: Per-world EventEmitter for real-time communication
- **Clean separation**: CLI, server, and core modules are independent

## Agent Communication

Agents use a **mention-based system** with world-scoped communication:

- **@agentname**: Direct mention triggers specific agent response
- **No mentions**: Human messages trigger all active agents in the world
- **World isolation**: Agents only receive messages from their own world
- **Self-filtering**: Agents never respond to their own messages
- **Memory context**: All responses include recent conversation history

### Communication Flow Example

```
Human: @alice Can you help me with this task?
Alice: Of course! I'd be happy to help. What do you need assistance with?

Bob: I can also assist if needed.
Human: Thanks @bob, I think @alice has it covered.
Alice: Perfect! Let me know what specific help you need.
```

### Memory Management

Each agent maintains persistent conversation history:

- **Automatic persistence**: Memory saved after each interaction
- **Context window**: Recent messages included in LLM prompts
- **Memory clearing**: `/clear` command or API endpoint
- **Isolated storage**: Each agent has separate memory.json file

### Memory Operations

```typescript
// Memory is managed automatically by the World interface
const agent = await world.getAgent('assistant');

// Clear agent memory
await world.clearAgentMemory('assistant');

// Memory is automatically included in agent responses
await publishMessage(world, 'Hello @assistant!', 'human');
```

## Event System

The system implements a **per-world event architecture**:

### Event Types

- **MESSAGE Events**: Agent communication and user interactions within a world
- **WORLD Events**: World lifecycle events (creation, deletion, agent changes)  
- **SSE Events**: Server-sent events for real-time streaming responses

### Per-World Event Bus

Each world has its own EventEmitter providing:

- **Isolated communication**: Events only broadcast within the same world
- **Real-time streaming**: SSE events for live response streaming
- **Event subscription**: Subscribe to specific event types per world
- **Automatic cleanup**: Event listeners are cleaned up when worlds are deleted

### Event API

```typescript
// Subscribe to messages in a specific world
const unsubscribe = subscribeToMessages(world, (event) => {
  console.log(`Message in ${world.name}:`, event.content);
});

// Publish message to world
await publishMessage(world, 'Hello @assistant!', 'human');

// Subscribe to SSE events for streaming
const unsubSSE = subscribeToSSE(world, (event) => {
  console.log('SSE event:', event.type, event.data);
});
```


## Error Handling

The system includes comprehensive error handling with graceful degradation:

- **World isolation**: Errors in one world don't affect others
- **Transaction safety**: File operations are atomic where possible
- **Memory persistence**: Agent memory is saved before risky operations
- **Validation**: Input validation for all world and agent operations  
- **Clean recovery**: System continues running even after individual operation failures

## Package Distribution

Agent World is designed for npm distribution:

```bash
# Install from npm (when published)
npm install agent-world

# Use in your project
import { createWorld, LLMProvider } from 'agent-world';

# Use global binaries
npx agent-world              # CLI interface
npx agent-world-server       # Web server
```

The package exports a clean API from `index.ts` while keeping internal modules private.

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/new-feature`
3. Make your changes and add tests
4. Run the test suite: `npm test`
5. Commit your changes: `git commit -m 'Add new feature'`
6. Push to the branch: `git push origin feature/new-feature`
7. Submit a pull request

## License

This project is licensed under the MIT License.

## Support

For questions, issues, or contributions, please:

1. Check the existing issues in the GitHub repository
2. Create a new issue with detailed information
3. Include relevant code examples and error messages
4. Follow the project's coding standards and conventions


(C) 2025, Yiyi Sun. All rights reserved.