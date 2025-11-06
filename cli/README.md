# Agent World CLI

Command-line interface for creating and managing AI agent teams using natural language.

## Getting Started

Start the CLI in watch mode for development:
```bash
npm run cli:watch
```

Or run the compiled version:
```bash
npm run cli
```

## Command Structure

Commands are organized into domains:
- `/world ...` - World management commands
- `/agent ...` - Agent management commands  
- `/chat ...` - Chat history management commands
- System commands - Help, quit, exit

## Available Commands

### World Management

| Command | Aliases | Description |
|---------|---------|-------------|
| `/world list` | `/list worlds`, `/list-worlds`, `/lsw` | List all worlds with details (ID, name, description, agents count) |
| `/world show <name>` | `/show world`, `/show-world` | Show details for a specific world |
| `/world create [name] [description] [turnLimit]` | `/create world`, `/new`, `/create-world` | Create a new world (interactive if no args provided) |
| `/world update <name>` | `/update world`, `/update-world` | Update world properties interactively |
| `/world delete <name>` | `/delete world`, `/delete-world` | Delete a world after confirmation |
| `/world select` | `/select world`, `/select`, `/sel` | Show world selection menu to pick a world |
| `/world export [file]` | `/export world`, `/export` | Export the current world and agents to a markdown file |
| `/world save` | `/save world`, `/save` | Save world data to File Storage or SQL Storage with folder selection |

### Agent Management

| Command | Aliases | Description |
|---------|---------|-------------|
| `/agent list` | `/list agents`, `/list-agents`, `/lsa` | List all agents in the current world with details |
| `/agent show <name>` | `/show agent`, `/show-agent` | Show agent details including configuration and memory statistics |
| `/agent create [name] [prompt]` | `/create agent`, `/agent new`, `/add agent`, `/agent add`, `/add`, `/add-agent` | Create a new agent (interactive if no args provided) |
| `/agent update <name>` | `/update agent`, `/update-agent` | Update agent properties interactively |
| `/agent delete <name>` | `/delete agent`, `/delete-agent` | Delete an agent after confirmation |
| `/agent clear <agentName\|all>` | `/clear` | Clear agent memory or all agents |

### Chat Management

| Command | Aliases | Description |
|---------|---------|-------------|
| `/chat list [--active]` | `/list chats`, `/list-chats` | List chat history for the current world |
| `/chat create` | `/create chat`, `/chat new`, `/new chat`, `/new-chat` | Create a new chat history entry and make it current |
| `/chat select` | `/select chat`, `/select-chat` | Show chat selection menu and display messages from selected chat |
| `/chat switch <chatId>` | `/switch chat`, `/load chat`, `/load-chat` | Load and restore state from a chat history entry |
| `/chat delete <chatId>` | `/delete chat`, `/delete-chat` | Delete a chat history entry after confirmation |
| `/chat rename <chatId> <name> [description]` | `/rename chat`, `/rename-chat` | Rename a chat history entry and optionally update its description |
| `/chat export [chatId] [file]` | `/export chat`, `/export-chat` | Export a chat history to markdown (defaults to current chat) |

### System Commands

| Command | Description |
|---------|-------------|
| `/help [command\|category]` | Show available commands or category-specific help |
| `/quit` | Exit the CLI |
| `/exit` | Exit the CLI |

## Examples

### Creating a World and Agents

```bash
# Create a new world interactively
/world create

# Or create with parameters
/world create "Sales Team" "A team of sales agents" 10

# Select a world to work with
/world select

# Add an agent interactively
/agent create

# Or add with parameters
/agent create Ava "You are a helpful sales assistant"
```

### Managing Chats

```bash
# List all chat history
/chat list

# Show only the current active chat
/chat list --active

# Create a new chat
/chat create

# Select and load a different chat
/chat select

# Rename a chat
/chat rename chat-123 "Customer Inquiry" "Q&A about product features"

# Export current chat to markdown
/chat export

# Export specific chat
/chat export chat-123 ./exports/sales-conversation.md
```

### Working with Agents

```bash
# List all agents in current world
/agent list

# Show detailed agent information
/agent show Ava

# Update agent configuration
/agent update Ava

# Clear an agent's memory
/agent clear Ava

# Clear all agents' memory
/agent clear all
```

### Exporting and Saving

```bash
# Export world to markdown
/world export

# Export to specific file
/world export ./exports/my-world.md

# Save world to different storage (File or SQLite)
/world save
```

## Command Features

### Command Aliases

The CLI now supports multiple alias formats for maximum flexibility:

1. **Space-separated format**: Use spaces instead of hyphens
   - `/new chat` instead of `/new-chat`
   - `/add agent` instead of `/add-agent`
   - `/list worlds` instead of `/list-worlds`

2. **Bidirectional aliases**: Commands work in both orders
   - `/chat new` works the same as `/new chat`
   - `/agent add` works the same as `/add agent`
   - Both resolve to the primary command (e.g., `/chat create`, `/agent create`)

3. **Backward compatibility**: Old hyphenated aliases still work
   - `/new-chat`, `/add-agent`, `/list-worlds` are still supported
   - Ensures existing scripts and workflows continue to function

**Examples:**
```bash
# All of these create a new chat:
/chat create
/create chat
/chat new
/new chat
/new-chat

# All of these create a new agent:
/agent create
/create agent
/agent add
/add agent
/add
/add-agent
```

### Interactive Prompts
Most create and update commands support interactive prompts when called without parameters. This makes it easy to fill in required fields step-by-step.

### Parameter Types
- `<required>` - Required parameter
- `[optional]` - Optional parameter
- `<name|option>` - Multiple options available

### Auto-completion
Use Tab for command auto-completion (if your terminal supports it).

### Context Awareness
- Agent and chat commands require a world to be selected first
- Use `/world select` to choose a world before working with agents or chats

## Getting Help

```bash
# Show all commands
/help

# Show commands for a specific category
/help world
/help agent
/help chat

# Show details for a specific command
/help world create
/help agent update
```

## Development

The CLI implementation is in `cli/commands.ts` with the following features:
- Direct command mapping system with interactive parameter collection
- Core function calls without command processing layer
- User-friendly messages with technical details for debugging
- Automatic world state management and refreshing
- Short command aliases for improved usability
- Context-sensitive commands that adapt based on world selection

For more information, see the main project documentation in `.docs/`.
