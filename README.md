# Agent World

A TypeScript-based AI agent world application that allows you to create, manage, and interact with multiple AI agents powered by OpenAI and Anthropic.

## Features

### Agents
- ✅ AI agents using TypeScript and Node.js
- ✅ Multiple agent instances with unique configurations
- ✅ OpenAI, Anthropic, Ollama API integration
- ✅ Streaming support for real-time responses
- ✅ Short-term and long-term memory management
- ✅ Function calling capabilities
- ✅ Built-in retry mechanisms for error handling

### World
- ✅ Agent lifecycle management (spawn/kill)
- ✅ Persistent agent configurations
- ✅ Concurrent agent execution
- ✅ Asynchronous operation handling
- ✅ Worker thread implementation for heavy tasks
- ✅ Event-based communication system
- ✅ Structured logging with Winston
- ✅ Interactive CLI interface

## Prerequisites

- Node.js (v16 or higher)
- OpenAI API key
- Anthropic API key

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd agent-world
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
```
Edit the `.env` file with your API keys and configuration.

## Usage

### Development Mode

Run the application in development mode with hot reloading:
```bash
npm run dev
```

### Production Mode

Build and run the application:
```bash
npm run build
npm start
```

### CLI Commands

Once the application is running, you can use the following commands:

- Spawn a new agent:
```
agent-world> spawn agent1 openai
```

- List all agents:
```
agent-world> list
```

- Interact with an agent:
```
agent-world> interact <agent-id> What is the weather like today?
```

- Check agent status:
```
agent-world> status <agent-id>
```

- Kill an agent:
```
agent-world> kill <agent-id>
```

- Show help:
```
agent-world> help
```

- Exit the application:
```
agent-world> exit
```

## Project Structure

```
agent-world/
├── src/
│   ├── agent/
│   │   └── base.ts         # Base agent implementation
│   ├── world/
│   │   ├── index.ts        # World management
│   │   └── worker.ts       # Worker thread implementation
│   ├── cli/
│   │   └── index.ts        # CLI interface
│   ├── config/
│   │   └── index.ts        # Configuration management
│   ├── types/
│   │   └── index.ts        # TypeScript type definitions
│   └── index.ts            # Main entry point
├── .env.example            # Example environment variables
├── package.json            # Project dependencies
└── tsconfig.json           # TypeScript configuration
```

## Configuration

The application can be configured through environment variables:

- `OPENAI_API_KEY`: Your OpenAI API key
- `ANTHROPIC_API_KEY`: Your Anthropic API key
- `OPENAI_MODEL`: OpenAI model to use (default: gpt-4-1106-preview)
- `ANTHROPIC_MODEL`: Anthropic model to use (default: claude-2.1)
- `MAX_AGENTS`: Maximum number of concurrent agents (default: 10)
- `PERSIST_PATH`: Path for persisting agent data (default: ./data)
- `LOG_LEVEL`: Logging level (default: info)

## Development

### Building

```bash
npm run build
```

### Watching for Changes

```bash
npm run watch
```

### Cleaning Build Files

```bash
npm run clean
```

## Features in Detail

### Agent Memory
Each agent maintains both short-term and long-term memory:
- Short-term memory: Temporary storage for ongoing conversations
- Long-term memory: Persistent storage for important information

### Tool Support
Agents can be equipped with custom tools:
```typescript
agent.registerTool({
  name: 'calculator',
  description: 'Perform calculations',
  execute: async (expression) => eval(expression)
});
```

### Error Handling
Built-in retry mechanism for handling transient API errors with exponential backoff.

### Worker Threads
Heavy computations are offloaded to worker threads to maintain responsiveness.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

ISC
