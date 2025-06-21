# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- `npm run dev` - Start the CLI in development mode with hot reload using tsx watch
- `npm run build` - Build the CLI for production using esbuild (outputs to dist/cli.js)
- `npm run start` - Run the built CLI from dist/cli.js
- `npm run test` - Run Jest tests with jest.config.js configuration

## Architecture Overview

This is an AI agent simulation system with a CLI interface. The architecture follows a function-based approach rather than class-based patterns.

### Core Components

**CLI Interface (`src/cli/`)**
- Command-based interface with commands like `/add`, `/list`, `/use`, `/stop`
- Built around a simple command pattern in `src/cli/commands/`
- Entry point is `src/cli/index.ts`

**Agent System (`src/agent.ts`)**
- Function-based agent implementation using `processAgentMessage()` as the main entry point
- Integrates with existing `llm.ts`, `event-bus.ts`, and `storage.ts` modules
- Uses mention-based message filtering to prevent loops
- Supports multiple LLM providers (OpenAI, Anthropic, Azure, Google, XAI, Ollama)

**World Management (`src/world.ts`)**
- Function-based world state management with Map-based in-memory storage
- Core functions: `createWorld()`, `createAgent()`, `getAgents()`, `removeAgent()`
- Integrates with event-bus for publishing world events
- Supports basic persistence via JSON file storage

**Event System (`src/event-bus.ts`)**
- Centralized event handling for messages, world events, and SSE
- Functions: `publishMessage()`, `publishWorld()`, `subscribeToMessages()`

**Storage (`src/storage.ts`)**
- Function-based persistence for agent memory and data
- Functions: `loadAgentMemory()`, `saveAgentMemory()`

### Key Integration Points

- All modules use function-based architecture, avoiding classes and inheritance
- Agent processing relies on `llm.ts` for LLM operations and `storage.ts` for memory persistence
- World events are published through `event-bus.ts` for real-time updates
- The CLI loads and manages agents through the world system functions

### Type System

Central type definitions in `src/types.ts` include:
- `AgentConfig` - Agent configuration with LLM provider settings
- `WorldState` - World state with Map-based agent storage
- `MessageData` - Message structure for agent communication
- `AgentMemory` - Agent memory structure with conversation history

### Data Flow

1. CLI commands trigger world management functions
2. Agent messages are processed through `processAgentMessage()`
3. LLM responses are generated via `llm.ts` and stored via `storage.ts`
4. Events are published through `event-bus.ts` for real-time updates
5. World state is maintained in memory with optional JSON persistence

### Development Notes

- Uses TypeScript with Node.js 20+ requirement
- Memory management keeps only last 20 conversation messages per agent
- Agent responses use mention-based filtering (`@agentname`) to determine when to respond
- LLM provider configuration supports multiple providers with fallback handling