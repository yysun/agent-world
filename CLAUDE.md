# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Core Commands
- `npm run dev` - Start the CLI in development mode with hot reload using tsx watch
- `npm run build` - Build the CLI for production using esbuild (outputs to dist/cli.js)
- `npm run start` - Run the built CLI from dist/cli.js
- `npm run test` - Run Jest tests with jest.config.js configuration

### Code Quality
- `npm run check` - Run TypeScript type checking without emitting files

## Project Structure

```
agent-world/
├── cli/                    # CLI interface and commands
│   ├── commands/          # Individual CLI command implementations
│   ├── index.ts          # CLI entry point
│   └── utils/            # CLI utilities (colors, etc.)
├── src/                   # Core application source
│   ├── providers/        # Storage and service providers
│   ├── agent.ts          # Agent processing logic
│   ├── event-bus.ts      # Event system
│   ├── llm.ts            # LLM provider integrations
│   ├── storage.ts        # Data persistence
│   ├── types.ts          # Type definitions
│   ├── utils.ts          # Utility functions
│   └── world.ts          # World management
├── data/                 # Application data
│   └── worlds/           # World configurations and agent data
├── tests/                # Test files
├── dist/                 # Built output
└── docs/                 # Documentation and planning
```

## Architecture Overview

This is an AI agent simulation system with a CLI interface. The architecture follows a function-based approach rather than class-based patterns.

### Core Components

**CLI Interface (`src/cli/`)**
- Command-based interface with commands like `/add`, `/list`, `/use`, `/stop`
- Built around a simple command pattern in `src/cli/commands/`
- Entry point is `src/cli/index.ts`

**Agent System (`src/agent.ts`)**
- Function-based agent implementation using `processAgentMessage()` as the main entry point
- Integrates with existing `llm.ts`, `event-bus.ts`, and `world.ts` modules
- Uses mention-based message filtering to prevent loops
- **Agent Memory System**: Conversation history stored in separate `memory.json` files per agent
- **System Prompt Separation**: System prompts stored as editable `system-prompt.md` files
- **Complete Event-Driven Flow**: CLI → MESSAGE → Agent → LLM → SSE → CLI with real-time streaming
- Supports multiple LLM providers (OpenAI, Anthropic, Azure, Google, XAI, Ollama)

**World Management (`src/world.ts`)**
- Function-based world state management with Map-based in-memory storage
- Core functions: `createWorld()`, `createAgent()`, `getAgents()`, `removeAgent()`
- **Agent Memory Functions**: `addToAgentMemory()`, `getAgentConversationHistory()` for context management
- **File Organization**: Agents stored with separate config.json, system-prompt.md, and memory.json files
- Integrates with event-bus for publishing world events
- Supports persistence via JSON file storage with name-based (kebab-case) folder structure

**Event System (`src/event-bus.ts`)**
- Centralized event handling for messages, world events, and SSE
- Functions: `publishMessageEvent()`, `subscribeToMessages()`, `publishSSE()` for real-time streaming
- **Complete Message Flow**: USER → MESSAGE events → Agent handling → LLM processing → SSE events → CLI display

**Storage (`src/storage.ts`)**
- Function-based persistence for event data and file operations
- **Separate File Architecture**: System prompts and memory stored in individual files
- Functions: `saveEventData()`, `loadEventData()` for unified event/message storage

### Key Integration Points

- All modules use function-based architecture, avoiding classes and inheritance
- **Agent Memory Integration**: Agents load conversation history from `memory.json` files for LLM context
- **System Prompt Management**: Agents load system prompts from separate `system-prompt.md` files for easy editing
- **Complete Event Flow**: CLI input → MESSAGE events → Agent subscription → LLM processing → SSE events → CLI streaming display
- Agent processing relies on `llm.ts` for LLM operations and `world.ts` for memory management
- World events are published through `event-bus.ts` for real-time updates
- The CLI loads and manages agents through the world system functions with real-time streaming responses

### Type System

Central type definitions in `src/types.ts` include:
- `AgentConfig` - Agent configuration with LLM provider settings and `systemPrompt` field
- `WorldState` - World state with Map-based agent storage
- `MessageData` - Message structure for agent communication
- `AgentMemory` - Agent memory structure with conversation history (stored separately)

### Data Flow

1. **User Input**: CLI commands trigger world management functions
2. **Message Broadcasting**: User messages published as MESSAGE events with worldId for routing
3. **Agent Processing**: Agents subscribe to and filter MESSAGE events, load conversation history for context
4. **LLM Integration**: Messages processed with conversation history through `processAgentMessage()`
5. **Memory Persistence**: Conversation history stored in separate `memory.json` files per agent
6. **Streaming Responses**: LLM responses generate SSE events for real-time CLI display
7. **World State**: Maintained in memory with persistent file storage

### Agent File Structure

Each agent uses a clean, organized file structure:
```
data/worlds/{world-name}/agents/{agent-name}/
├── config.json          # Agent configuration (without prompts/memory)
├── system-prompt.md     # System prompt as editable markdown
└── memory.json          # Conversation history and agent memory
```

### Development Workflow

**Quick Start:**
```bash
npm install
npm run dev
```

**Development Process:**
1. Run `npm run dev` for hot reload during development
2. Use `npm run check` to verify TypeScript types
3. Run `npm run test` to execute Jest test suite
4. Build with `npm run build` before deployment
5. Use `npm run start` to run the production build

**Testing:**
- Tests are located in `tests/` directory
- Jest configuration in `jest.config.js`
- Run specific tests: `npm test -- --testNamePattern="pattern"`
- Coverage reports available via Jest
- Global teardown automatically cleans up test data after test runs
- Test cleanup removes `test-data/` directory and any test-generated world folders
- World tests use mocked file system, so no actual world folders are created during testing
- Cleanup targets test-generated world folders matching UUID pattern: `world_[uuid]`

### Configuration

**Environment Requirements:**
- Node.js 20+ required
- TypeScript project with ES modules (`"type": "module"`)

**LLM Provider Setup:**
The system supports multiple LLM providers. Configure via environment variables:
- OpenAI: `OPENAI_API_KEY`
- Anthropic: `ANTHROPIC_API_KEY`
- Azure: `AZURE_API_KEY`, `AZURE_ENDPOINT`
- Google: `GOOGLE_API_KEY`
- XAI: `XAI_API_KEY`
- Ollama: Local installation required

**Data Storage:**
- World configurations stored in `data/worlds/` with name-based (kebab-case) folder structure
- Each world has its own directory with `config.json` and `agents/` folder
- **Agent File Separation**: Each agent has separate config.json, system-prompt.md, and memory.json files
- **Memory Management**: Conversation history limited to 50 messages, with last 10 used for LLM context
- **System Prompts**: Stored as editable markdown files for easy prompt management

### Development Notes

- Uses TypeScript with Node.js 20+ requirement
- **Complete Event-Driven Architecture**: Full message flow from CLI → MESSAGE → Agent → LLM → SSE → CLI
- **Real-time Streaming**: Character-by-character streaming responses via SSE events
- **Memory Persistence**: Conversation history maintained across agent restarts
- Agent responses use mention-based filtering (`@agentname`) to determine when to respond
- LLM provider configuration supports multiple providers with fallback handling
- Hot reload enabled in development mode via tsx watch
- Built using esbuild for fast compilation