# Agent World

A flexible AI agent simulation system with a CLI interface for creating, managing, and orchestrating AI agents in virtual worlds with real-time streaming responses and persistent memory.

## Features

- **Multi-World Management**: Create and manage multiple isolated worlds for different simulation scenarios
- **Agent Lifecycle Management**: Create, configure, update, and remove AI agents with persistent storage
- **LLM Provider Support**: Integration with multiple LLM providers (OpenAI, Anthropic, Google, Azure, XAI, Ollama)
- **Event-Driven Architecture**: Complete real-time event flow: CLI → MESSAGE → Agent → LLM → SSE → CLI
- **Persistent Memory System**: Agent conversation history stored in separate `memory.json` files per agent
- **System Prompt Management**: Editable system prompts stored as separate `system-prompt.md` files
- **Real-time Streaming**: Character-by-character streaming responses via SSE events
- **CLI Interface**: Command-based interface with real-time agent response streaming
- **Web API Server**: REST API with Server-Sent Events for web integration
- **Mention-Based Communication**: Agents respond to @mentions to prevent infinite loops
- **Organized File Structure**: Clean separation of configuration, prompts, and memory data

## Architecture

The system follows a **function-based architecture** rather than class-based patterns, providing:

- **Simplified API**: Clean functional interfaces for all operations
- **Event Bus**: Centralized event handling for messages, world events, and SSE
- **Modular Design**: Separate modules for worlds, agents, LLM operations, and storage
- **Type Safety**: Comprehensive TypeScript types for all components

### Event-Driven Message Flow

The system implements a complete real-time message processing flow:

1. **User Input** → CLI receives message (`cli/index.ts`)
2. **MESSAGE Event** → EventBus broadcasts with worldId (`src/event-bus.ts`)
3. **Agent Processing** → Agents filter by worldId/mention (`src/agent.ts`)
4. **Memory Integration** → Loads conversation history from `memory.json`
5. **LLM Request** → Provider receives prompt with full context (`src/llm.ts`)
6. **SSE Events** → Real-time streaming response via EventBus
7. **CLI Display** → Character-by-character streaming output to user

### File Structure Per Agent

Each agent maintains separate files for clean organization:

```
data/worlds/{worldId}/agents/{agentId}/
├── config.json         # Agent configuration (name, model, provider, etc.)
├── system-prompt.md     # Editable system prompt for the agent
└── memory.json         # Conversation history and memory context
```

### Core Components

- **World Management** (`src/world.ts`): World creation, persistence, and agent management
- **Agent System** (`src/agent.ts`): AI agent processing with LLM integration and memory management
- **Event Bus** (`src/event-bus.ts`): Real-time event publishing and subscription with SSE support
- **LLM Integration** (`src/llm.ts`): Multi-provider LLM support with streaming and context management
- **Storage** (`src/storage.ts`): Unified file operations for configuration, prompts, and memory
- **CLI Interface** (`src/cli/`): Interactive command-line interface with real-time streaming
- **Web Server** (`server.ts`): REST API with SSE endpoints for web integration

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd agent-world

# Install dependencies
npm install

# Build the project
npm run build
```

## Usage

### Quick Start

```bash
# Start full system (web server + CLI)
npm start

# Start individual components
npm run cli                 # CLI only (interactive terminal)
npm run server              # Web server only (http://localhost:3000)
```

### Development Mode

```bash
# Development with hot reload (both server + CLI)
npm run dev
```

## Web API

The system includes a REST API server with the following endpoints:

### World Management
- `GET /worlds` - List all available worlds
- `GET /worlds/{worldName}/agents` - List all agents in a specific world
- `GET /worlds/{worldName}/agents/{agentName}` - Get details of a specific agent

### Agent Management
- `POST /worlds/{worldName}/agents` - Create a new agent (coming soon)
- `PATCH /worlds/{worldName}/agents/{agentName}` - Update agent (status, config, memory)

### Real-time Communication
- `POST /worlds/{worldName}/chat` - Send message and receive SSE stream of events

The web server automatically starts when running the CLI and is available at `http://localhost:3000`.

#### Example API Usage

```bash
# List all worlds
curl http://localhost:3000/worlds

# Get agents in a world
curl http://localhost:3000/worlds/default-world/agents

# Update agent status
curl -X PATCH http://localhost:3000/worlds/default-world/agents/agent1 \
  -H "Content-Type: application/json" \
  -d '{"status": "inactive"}'

# Clear agent memory
curl -X PATCH http://localhost:3000/worlds/default-world/agents/agent1 \
  -H "Content-Type: application/json" \
  -d '{"clearMemory": true}'

# Chat with SSE streaming
curl -X POST http://localhost:3000/worlds/default-world/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello world!", "sender": "API_USER"}' \
  --no-buffer
```

### CLI Commands

The CLI provides several commands for managing worlds and agents:

- `/add` - Create a new agent
- `/list` - List all agents in the current world
- `/use` - Switch to a different agent or world
- `/stop` - Stop the current session

### Programming API

#### World Management

```typescript
import { createWorld, createAgent, getAgents } from './src/world';

// Create a new world
const worldId = await createWorld({ 
  name: 'My Simulation',
  metadata: { description: 'Test environment' }
});

// Create an agent in the world
const agent = await createAgent(worldId, {
  id: 'agent-1',
  name: 'Assistant',
  type: 'ai',
  provider: LLMProvider.OPENAI,
  model: 'gpt-4',
  personality: 'Helpful and friendly',
  instructions: 'You are a helpful assistant'
});

// Get all agents in the world
const agents = getAgents(worldId);
```

#### Agent Communication

```typescript
import { processAgentMessage } from './src/agent';
import { loadAgentConfig } from './src/storage';

// Load agent configuration
const agentConfig = await loadAgentConfig(worldId, agentId);

// Send a message to an agent (triggers full event flow)
await processAgentMessage(agentConfig, {
  worldId,
  sender: 'human',
  content: '@assistant Hello there!'
});
```

#### Event System

```typescript
import { subscribeToMessages, publishMessageEvent, subscribeToSSE } from './src/event-bus';

// Subscribe to messages
const unsubscribe = subscribeToMessages((event) => {
  console.log('New message:', event.payload);
});

// Subscribe to SSE events for streaming responses
const unsubscribeSSE = subscribeToSSE((chunk) => {
  process.stdout.write(chunk.data);
});

// Publish a message
await publishMessageEvent({
  worldId: 'my-world',
  sender: 'human',
  content: '@assistant Hello world!'
});
```

#### Memory and Context Management

```typescript
import { addToAgentMemory, getAgentMemory } from './src/agent';

// Add to agent memory
await addToAgentMemory(worldId, agentId, {
  role: 'user',
  content: 'Remember this important detail'
});

// Get conversation history for context
const memory = await getAgentMemory(worldId, agentId);
console.log('Recent messages:', memory.slice(-5));
```

## Data Structure

The system uses a hierarchical file structure with clear separation of concerns:

```
data/
└── worlds/
    └── {worldName}/
        ├── config.json                    # World metadata and configuration
        └── agents/
            └── {agentName}/
                ├── config.json            # Agent configuration
                ├── system-prompt.md       # Editable system prompt
                └── memory.json            # Conversation history
```

### Agent File Organization

Each agent maintains three separate files:

- **`config.json`**: Core agent settings (name, model, provider, personality)
- **`system-prompt.md`**: Full system prompt in markdown format (editable)
- **`memory.json`**: Conversation history and memory context for LLM

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

# Ollama
OLLAMA_BASE_URL=http://localhost:11434/api

# Development
NODE_ENV=development
```

## Development

### Project Structure

```
src/
├── cli/                 # CLI interface and commands
├── agent.ts            # Agent processing and LLM integration
├── event-bus.ts        # Event system for real-time communication
├── llm.ts             # LLM provider abstraction and utilities
├── logger.ts          # Structured logging with Pino
├── storage.ts         # File-based persistence utilities
├── types.ts           # TypeScript type definitions
├── world.ts           # World and agent management
└── providers/         # Event bus provider implementations
    ├── local-provider.ts
    └── dapr-provider.ts
```

### Available Scripts

```bash
npm run cli         # Start CLI interface only
npm run server      # Start web server only
npm start           # Start both server and CLI
npm run dev         # Development mode with hot reload (both server + CLI)
npm run build       # Build for production
npm test            # Run Jest tests
```

### Testing

The project includes comprehensive unit tests using Jest:

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Code Style

- **Function-based architecture**: Prefer pure functions over classes
- **TypeScript**: Full type coverage for all components
- **ESM modules**: Modern JavaScript module system
- **Structured logging**: Use Pino logger for all output

## Agent Communication

Agents use a **mention-based system** to determine when to respond:

- **@agentname**: Direct mention triggers response
- **No mentions**: Human messages trigger all agents
- **Self-messages**: Agents never respond to their own messages
- **System messages**: All agents respond to system messages

### Example Communication Flow

```
Human: @alice Can you help me with this task?
Alice: Of course! I'd be happy to help. What do you need assistance with?

Bob: I can also assist if needed.
Human: Thanks @bob, I think @alice has it covered.
```

## Memory Management

Each agent maintains persistent conversation history in separate `memory.json` files:

### Memory Structure

```json
{
  "messages": [
    {
      "role": "user", 
      "content": "Hello @assistant",
      "timestamp": "2024-01-15T10:30:00Z"
    },
    {
      "role": "assistant",
      "content": "Hello! How can I help you today?",
      "timestamp": "2024-01-15T10:30:05Z"
    }
  ]
}
```

### Features

- **Persistent Storage**: All conversations saved to `memory.json` per agent
- **LLM Context**: Recent messages automatically included in LLM prompts
- **Memory Management**: Automatic trimming to stay within token limits
- **Timestamp Tracking**: All messages include creation timestamps

### Memory Operations

```typescript
// Add message to agent memory
await addToAgentMemory(worldId, agentId, {
  role: 'user',
  content: 'Important information to remember'
});

// Retrieve conversation history
const history = await getAgentMemory(worldId, agentId);
const recentMessages = history.slice(-10); // Last 10 messages
```

Agents automatically manage conversation history:

- **Conversation Limit**: Last 20 messages per agent
- **Automatic Cleanup**: Older messages are removed automatically
- **Persistent Storage**: Memory is saved to disk after each interaction
- **Context Preservation**: Recent conversation context is included in agent prompts

## Event Types

The system supports three main event types:

### MESSAGE Events
Real-time agent communication and user interactions

### WORLD Events
World lifecycle events (creation, deletion, agent changes)

### SSE Events
Server-sent events for streaming responses and real-time updates


## Error Handling

The system includes comprehensive error handling:

- **Graceful Degradation**: Failed operations don't crash the system
- **Automatic Rollback**: Memory changes are reverted on disk operation failures
- **Structured Logging**: All errors are logged with context
- **Validation**: Input validation for all operations

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