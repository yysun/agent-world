# Agent World

A TypeScript-based AI agent world application that allows you to create, manage, and interact with multiple AI agents powered by OpenAI and Anthropic.

## Features

### Agents
- ✅ AI agents using TypeScript and Node.js
- ✅ Multiple agent instances with unique configurations
- ✅ OpenAI, Anthropic, and Ollama API integration
- ✅ Streaming support for real-time responses
- ✅ Knowledge and chat history management
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
- Local Ollama

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

```
Available commands:
  /new <name> [provider]    - Create a new agent (provider: openai|anthropic|ollama, defaults to ollama)
  /list                     - List all active agents
  /kill <name>             - Terminate an agent by name
  /ask [name] <msg>        - Ask a question to an agent (or all agents if no name specified)
  /status [name]           - Show agent status and memory (or all agents if no name specified)
  /clear [name]            - Clear agent's chat history (or all agents if no name specified)
  /help                    - Show this help message
  /exit                    - Exit the program
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
- `OPENAI_MODEL`: OpenAI model to use (default: gpt-4o)
- `ANTHROPIC_API_KEY`: Your Anthropic API key
- `ANTHROPIC_MODEL`: Anthropic model to use (default: claude-3.5)
- `OLLAMA_URL`: URL for the local Ollama instance (default: http://localhost:11434)
- `OLLAMA_MODEL`: Ollama model to use (default: llama3)
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
npm run dev
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
