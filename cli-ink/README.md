# CLI-Ink Usage Guide

## Overview
The Agent World CLI-Ink provides dual-mode operation for interacting with Agent World with console-based display:
- **Pipeline Mode**: Command-line execution with structured output for scripting
- **Interactive Mode**: Console-based terminal interface with real-time interaction

**Note**: This CLI now uses console.log for all display events instead of Ink components for simpler output and fewer dependencies.

## Installation
The CLI is available as part of the Agent World package:
```bash
npm run cli-ink
# or directly via npx
npx tsx cli-ink/index.ts
```

## Pipeline Mode

Pipeline mode is ideal for automation, scripting, and programmatic access. It automatically executes commands and exits with structured JSON output.

### Command Execution
```bash
# Execute a single command
npm run cli-ink -- --command "/getworlds"

# Specify root path and world
npm run cli-ink -- --root /data/worlds --world myworld --command "/getworld"

# Clear specific agent
npm run cli-ink -- --root /data/worlds --world myworld --command "/clear agent1"
```

### Command Sequences
```bash
# Execute multiple commands in sequence
npm run cli-ink setroot /data/worlds select myworld clear agent1 exit

# Each command is executed in order until 'exit' or failure
```

### Pipeline Input
```bash
# Send message to world via stdin
echo "Hello agents!" | npm run cli-ink -- --world myworld

# Process file input
cat message.txt | npm run cli-ink -- --world myworld
```

### Structured Output
All pipeline mode commands return structured JSON:
```json
{
  "data": { ... },
  "message": "Command executed successfully",
  "refreshWorld": false,
  "timestamp": "2025-07-02T00:26:39.188Z"
}
```

## Interactive Mode

Interactive mode provides a console-based terminal interface with real-time command execution and world interaction using simple console.log output.

### Basic Usage
```bash
# Start interactive mode
npm run cli-ink

# Start with specific root path
npm run cli-ink -- --root /data/worlds

# Start connected to a world
npm run cli-ink -- --root /data/worlds --world myworld
```

### Interactive Features

#### World Selection
- Automatic discovery of available worlds
- Interactive world selection menu (numbered or by name)
- Auto-selection when only one world is available

#### Command Input
- Readline-based command input with prompt
- Real-time command execution with immediate feedback
- Direct message sending (without / prefix for agent communication)
- Graceful Ctrl+C handling

#### Real-time Event Display
- **Streaming**: Live agent responses displayed as they generate
- **System Events**: 📟 System notifications and status updates
- **World Events**: 🌍 World-level notifications
- **Messages**: 🤖 Agent messages and responses
- **Streaming Indicator**: ⚡ Shows when agents are actively responding

#### Result Display
- Emoji-enhanced status indicators (✅ success, ❌ error)
- Formatted command results with clear feedback
- Timestamp tracking for all operations
- Structured data display with JSON formatting
- Real-time streaming content display

### Available Commands

All commands from the shared command core are available:

#### World Management
```bash
getworlds              # List all available worlds
getworld               # Get current world information
addworld MyWorld       # Create a new world
updateworld config     # Update world configuration
```

#### Agent Management
```bash
addagent AgentName     # Add a new agent
clear agent1           # Clear specific agent memory
clear all              # Clear all agents memory
updateagentconfig      # Update agent configuration
updateagentprompt      # Update agent system prompt
```

#### Message Handling
```bash
# Send messages directly (without / prefix)
Hello agents!
```

## Configuration

### Environment Variables
```bash
AGENT_WORLD_DATA_PATH=/path/to/worlds  # Default root path
LOG_LEVEL=debug                        # Enable debug logging
```

## Integration Examples

### Automation Scripts
```bash
#!/bin/bash
# Automated world setup
npm run cli-ink -- --command "/addworld TestWorld"
npm run cli-ink -- --world TestWorld --command "/addagent Assistant"
echo "Welcome!" | npm run cli-ink -- --world TestWorld
```

### CI/CD Integration
```bash
# Test world health
npm run cli-ink -- --command "/getworlds" > worlds.json
npm run cli-ink -- --world test --command "/getworld" > world-status.json
```

### Development Workflow
```bash
# Quick world inspection
npm run cli-ink -- --world development --command "/getworld"

# Interactive debugging
npm run cli-ink -- --world development
# Then use interactive mode for real-time exploration
```

## Error Handling

### Pipeline Mode
- Exit code 0: Success
- Exit code 1: Command failure or error
- Structured error output in JSON format

### Interactive Mode
- Real-time error display with emoji indicators
- Graceful error recovery with world state refresh
- Detailed error messages and context
- Automatic cleanup on exit or interruption

## Tips and Best Practices

1. **Use Pipeline Mode for Automation**: Reliable, scriptable, structured output
2. **Use Interactive Mode for Exploration**: Console-based UI, real-time feedback, easy experimentation
3. **World Context**: Connect to a world first for agent-specific commands
4. **Structured Output**: Pipeline mode output is perfect for parsing in scripts
5. **Real-time Interaction**: Watch for streaming indicators to see when agents are responding

## Troubleshooting

### Common Issues
1. **"World not found"**: Check world name and root path
2. **"Command requires world subscription"**: Connect to a world first
3. **Import errors**: Ensure all dependencies are installed

### Debug Mode
Enable debug logging for detailed operation insight:
```bash
LOG_LEVEL=debug npm run cli-ink
```

## Changes from Ink Version

### Removed Dependencies
- React and @types/react
- ink, ink-select-input, ink-text-input
- All JSX/TSX component files

### New Features
- Console-based event display with emoji indicators
- Readline interface for interactive input
- Real-time streaming display via stdout
- Simplified world selection interface
- Enhanced error handling with visual feedback

### Maintained Features
- All command processing logic
- Event streaming and real-time updates
- World subscription and management
- Pipeline and interactive mode support
- Structured JSON output for automation

## Display Features

### Console-Based Output
- **Status Indicators**: ✅ ❌ 🔄 for success/error/loading states
- **Event Types**: Different emoji prefixes for different event types
- **Streaming Display**: Real-time content streaming with visual indicators
- **World Info**: Agent count, turn limits, and connection status
- **Structured Data**: Clean JSON formatting for complex data

### Event Display Examples
```
🤖 Assistant: Hello! How can I help you today?
📟 System: Agent memory cleared successfully
🌍 World: New agent added to the world
⚡ Streaming: Assistant
This is a real-time streaming response...
✅ Command completed successfully
```
