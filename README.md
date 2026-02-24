# Agent World

*Build AI agent teams with just words—no coding required.*

## Why Agent World?

Traditional AI frameworks force you to write hundreds of lines of code just to make agents talk to each other. Agent World lets you create intelligent agent teams using nothing but plain natural language.

https://github.com/user-attachments/assets/cc507c95-01a4-4c27-975a-f8f67d8cf0d7

Audio introduction: [Listen here](https://yysun.github.io/agent-world)

**Other frameworks:**
- Install SDKs → write code → handle loops → deploy containers
- Learn Python/TypeScript before "Hello, world"

**Agent World:**
- Write prompts → for multiple agents → communicating in a shared world
```text
You are @moderator. When someone says "start debate", 
ask for a topic, then tag @pro and @con to argue.
```
Paste that prompt. Agents come alive instantly.

![GitHub](docs/Screenshot-agents.png)

## Why It Works

- ✅ No Code Required - Agents are defined entirely in natural language
- ✅ Natural Communication - Agents understand context and conversations
- ✅ Built-in Rules for Messages - Turn limits to prevent loops
- ✅ Multiple AI Providers - Use different models for different agents
- ✅ Modern Web Interface - React + Next.js frontend with real-time chat

## What You Can Build

- Debate Club
```text
@moderator: Manages rounds, keeps time
@pro: Argues for the topic  
@con: Argues against the topic
```

- Editorial Pipeline
```text
@planner: Assigns articles
@author: Writes drafts
@editor: Reviews and edits
@publisher: Formats and publishes
```

- Game Master
```text
@gm: Runs the game, manages state
@player1, @player2: Take turns
@assistant: Helps with rules
```

- Social Simulation
```text
@alice: Friendly neighbor
@bob: Practical problem-solver  
@charlie: Creative dreamer
```

- Customer Support
```text
@triage: Categorizes requests
@specialist: Handles technical issues
@manager: Escalates complaints
```

## How Agents Communicate

Each Agent World has a collection of agents that can communicate through a shared event system. Agents follow simple rules:

### Message Rules

| Message Type | Example | Who Responds |
|--------------|---------|--------------|
| **Human message** | `Hello everyone!` | All active agents |
| **Direct mention** | `@alice Can you help?` | Only @alice |
| **Paragraph mention** | `Please review this:\n@alice` | Only @alice |
| **Mid-text mention** | `I think @alice should help` | Nobody (saved to memory) |
| **Stop World** | `<world>pass</world>` | No agents |

### Agent Behavior

**Agents always respond to:**
- Human messages (unless mentioned agents exist)
- Direct @mentions at paragraph start
- World messages

**Agents never respond to:**
- Their own messages
- Other agents (unless @mentioned), but will save message to memory
- Mid-text mentions (will save message to memory)

**Turn limits prevent loops:**
- Default: 5 responses per conversation thread
- Agents automatically pass control back to humans
- Configurable per world


## Installation & Setup

### Prerequisites
- Node.js 20+ 
- An API key for your preferred LLM provider

### Quick Start

**Option 1: Web Interface**
```bash
npx agent-world-server
```

**Option 2: CLI Interface**
1. Interactive Mode
```bash
npx agent-world
```
2. Command Mode
```bash
npx agent-world -w default-world "hi" 
```
3. Pipeline Mode
```bash
echo "hi" | npx agent-world -w default-world
```

## Project Structure

See [Project Structure Documentation](project.md)

## Development Scripts Convention

Agent World follows a consistent naming convention for all npm scripts:

| Script Pattern | Description | Example |
|---------------|-------------|---------|
| `<module>` | Shorthand for `<module>:start` | `npm run server` |
| `<module>:start` | Run compiled code from `dist/` | `npm run server:start` |
| `<module>:dev` | Run with tsx (no build needed) | `npm run server:dev` |
| `<module>:watch` | Run with tsx in watch mode | `npm run server:watch` |

**Available modules:** `server`, `cli`, `ws`, `tui`

**Module Dependencies:**
- `web:dev` / `web:watch` → Depends on `server` (waits for server to be ready)
- `tui:dev` / `tui:watch` → Depends on `ws` (waits for WebSocket server)

**Examples:**
```bash
# Production execution (requires build)
npm run server        # Runs: node dist/server/index.js
npm run cli           # Runs: node dist/cli/index.js

# Development (no build needed)
npm run server:dev    # Runs: npx tsx server/index.ts
npm run ws:dev        # Runs: npx tsx ws/index.ts

# Watch mode (auto-restart on changes)
npm run server:watch  # Runs: npx tsx --watch server/index.ts
npm run cli:watch     # Runs: npx tsx --watch cli/index.ts

# With dependencies (auto-start required services)
npm run web:dev       # Waits for server, then starts web
npm run web:watch     # Runs server:watch + web in parallel
npm run tui:dev       # Waits for ws, then starts tui
npm run tui:watch     # Runs ws:watch + tui in parallel
```

### Environment Setup

Export your API keys as environment variables 

```bash
# Required if Choose one or more
export OPENAI_API_KEY="your-key-here"
export ANTHROPIC_API_KEY="your-key-here"  
export GOOGLE_API_KEY="your-key-here"

# Default: For local models
export OLLAMA_BASE_URL="http://localhost:11434"
```

Or create a `.env` file in your working directory with:

## Testing

**Run all tests:**
```bash
npm test              # Run all unit tests
npm run test:watch    # Watch mode with hot reload
npm run test:ui       # Visual test UI
npm run test:coverage # Generate coverage report
```

**Run specific tests:**
```bash
npm test -- tests/core/events/  # Test a directory
npm test -- message-saving      # Test files matching pattern
```

**Integration tests:**
```bash
npm run test:integration  # Run integration tests with real filesystem
```

Agent World uses Vitest for fast, modern testing with native TypeScript support.

## Logging and Debugging

Agent World uses **scenario-based logging** to help you debug specific issues without noise. Enable only the logs you need for your current task.

### Quick Examples

```bash
# Database migration issues
LOG_STORAGE_MIGRATION=info npm run server

# MCP server problems  
LOG_MCP=debug npm run server

# Agent response debugging
LOG_EVENTS_AGENT=debug LOG_LLM=debug npm run server
```

**For complete logging documentation**, see [Logging Guide](docs/logging-guide.md).

## Opik Integration (Observability)

Agent World integrates with [Opik](https://www.comet.com/opik) to provide detailed tracing of agent executions, LLM calls, and tool usage.

### Setup

1.  **Sign Up**: Create an account at [Comet Opik](https://www.comet.com/signup).
2.  **Get API Key**: Navigate to your Opik settings to generate an API Key.
3.  **Configure Environment**:
    Add the following to your `.env` file or export them in your shell:

    ```bash
    export OPIK_API_KEY="your-api-key"
    export OPIK_WORKSPACE="your-workspace-name"  # Optional (default: default)
    export OPIK_PROJECT="agent-world"            # Optional (default: agent-world-default)
    ```

Once configured, the CLI will automatically detect the key and start tracing your sessions. You can view traces in your Opik dashboard to debug agent reasoning and performance.

## Learn More

### World Database Setup

The worlds are stored in the SQLite database under the `~/agent-world` directory. You can change the database path by setting the environment variable `AGENT_WORLD_SQLITE_DATABASE`.

Or, you can change the storage type to file-based by setting the environment variable `AGENT_WORLD_STORAGE_TYPE` to `file`. And set the `AGENT_WORLD_DATA_PATH` to your desired directory.

```bash
# Use file storage
export AGENT_WORLD_STORAGE_TYPE=file
export AGENT_WORLD_DATA_PATH=./data/worlds
```

## Learn More

- **[Building Agents with Just Words](docs/Building%20Agents%20with%20Just%20Words.md)** - Complete guide with examples
- **[Shell Command Tool (shell_cmd)](docs/shell-cmd-tool.md)** - Built-in tool for executing shell commands


## Built-in Tools

Agent World includes built-in tools that are automatically available to all agents:

### shell_cmd
Execute shell commands with full output capture and execution history. Perfect for file operations, system information, and automation tasks.

```typescript
// Available to LLMs as 'shell_cmd' tool
{
  "command": "ls",
  "parameters": ["-la", "/tmp"]
}
```

See [Shell Command Tool Documentation](docs/shell-cmd-tool.md) for complete details.

## Experimental Features

- **MCP Support** - *Currently in experiment* - Model Context Protocol integration for tools like search and code execution. e.g.,

```json
{
	"servers": {
		"playwright": {
			"command": "npx",
			"args": [
				"@playwright/mcp@latest"
			]
		}
	}
}
```

It supports transport types `stdio` and `http`.


## Future Plans

- **Long Run Worlds** - Worlds can run for days or weeks, with agents evolving over time
- **Dynamic Worlds** - Worlds can provide real-time data to agents, e.g. date and time
- **Agent Learning** - Agents will evolve based on interactions
- **Agent Replication** - Agents can create new agents

## Contributing

Agent World thrives on community examples and improvements:

1. **Share your agent teams** - Submit interesting prompt combinations
2. **Report bugs** - Help us improve the core system  
3. **Suggest features** - What would make agents more useful?
4. **Write docs** - Help others learn faster

## License

MIT License - Build amazing things and share them with the world!

Copyright © 2025 Yiyi Sun


