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
- ✅ Progressive Agent Skills - Skills are discovered and loaded on demand
- ✅ Multiple AI Providers - Use different models for different agents
- ✅ Modern Web Interface - Clean, responsive UI with real-time chat

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
| **Mid-text mention** | `I think @alice should help` | Nobody (event is persisted; no agent-memory save) |
| **Stop World** | `<world>pass</world>` | No agents |

### Agent Behavior

**Agents always respond to:**
- Human messages (unless mentioned agents exist)
- Direct @mentions at paragraph start
- World messages

**Agents never respond to:**
- Their own messages
- Other agents (unless @mentioned at paragraph start)
- Mid-text mentions (not at paragraph start)

**When messages are saved to agent memory:**
- Incoming messages are saved only for agents that will respond
- Non-responding agents skip agent-memory save (message events are still persisted)

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

## Development Scripts

Agent World provides simple, consistent npm scripts for three main applications:

### Development (hot reload)
```bash
npm run dev              # Web app with server (default)
npm run web:dev          # Web app with server (explicit)
npm run cli:dev          # CLI with watch mode
npm run electron:dev     # Electron app
```

### Production
```bash
npm start                # Web server (default)
npm run web:start        # Web server (explicit)
npm run cli:start        # CLI (built)
npm run electron:start   # Electron app
```

### Behind the Scenes
The scripts handle dependencies automatically:
- **Web**: Builds core, starts server in watch mode, launches Vite dev server
- **CLI**: Runs with tsx watch mode for instant feedback
- **Electron**: Builds core, launches Electron with Vite HMR

### Other Useful Scripts
```bash
npm run build            # Build all (core + root + web)
npm run check            # TypeScript type checking
npm test                 # Run unit tests
npm run test:watch       # Watch mode
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
LOG_STORAGE_MIGRATION=info npm run web:dev

# MCP server problems  
LOG_MCP=debug npm run web:dev

# Agent response debugging
LOG_EVENTS_AGENT=debug LOG_LLM=debug npm run web:dev
```

**For complete logging documentation**, see [Logging Guide](docs/logging-guide.md).

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
- **[HITL Approval Flow](docs/hitl-approval-flow.md)** - Option-based approval flow across Core/Electron/Web/CLI
- **[Using Core from npm](docs/core-npm-usage.md)** - Integration guide for server and browser apps
- **[Electron Desktop App](docs/electron-desktop.md)** - Open-folder workflow and local world creation


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

### load_skill (Agent Skills)

Agent World includes progressive skill loading through the `load_skill` built-in tool.

- Skills are discovered from `SKILL.md` files in:
  - Project roots: `.agents/skills`, `skills`
  - User roots: `~/.agents/skills`, `~/.codex/skills`
- The model receives compact skill summaries first, then calls `load_skill` only when full instructions are needed.
- Skill activation in interactive runtimes is HITL-gated.

Minimal `SKILL.md` example:

```md
---
name: sql-review
description: Review SQL migrations for safety and rollback compatibility.
---

# SQL Review Skill

1. Check for destructive DDL.
2. Verify index and lock impact.
3. Validate rollback path.
```

HITL options for skill activation:

- `yes_once`: approve this call only
- `yes_in_session`: approve this `skill_id` in the current world/chat session
- `no`: decline

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
