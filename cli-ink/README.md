# CLI-Ink Usage Guide

## Overview
The Agent World CLI-Ink provides dual-mode operation for interacting with Agent World:
- **Pipeline Mode**: Command-line execution with structured output for scripting
- **Interactive Mode**: Rich terminal UI with real-time interaction

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

Interactive mode provides a rich terminal interface with real-time command execution and world interaction.

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

#### Command Input
- Type commands directly (with or without leading `/`)
- Real-time command execution with immediate feedback
- Command history with ↑/↓ arrow navigation
- Auto-completion and validation

#### World Connection
- Live world status display
- Agent count and configuration
- Turn limit and world metadata
- Automatic world refresh after state changes

#### Result Display
- Formatted command results with success/error indicators
- Timestamp tracking for all operations
- Structured data display with JSON formatting
- Error handling with detailed feedback

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

### Configuration File
User preferences are stored in `~/.agent-world/cli-config.json`:
```json
{
  "defaultRootPath": "/data/worlds",
  "defaultWorld": "myworld",
  "interactiveMode": true,
  "displayOptions": {
    "colors": true,
    "timestamps": false,
    "verboseOutput": false
  }
}
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
- Real-time error display with context
- Graceful error recovery
- Detailed error messages and suggestions

## Tips and Best Practices

1. **Use Pipeline Mode for Automation**: Reliable, scriptable, structured output
2. **Use Interactive Mode for Exploration**: Rich UI, real-time feedback, easy experimentation
3. **Command History**: Use ↑/↓ arrows in interactive mode to replay commands
4. **World Context**: Connect to a world first for agent-specific commands
5. **Structured Output**: Pipeline mode output is perfect for parsing in scripts

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

### Configuration Reset
Remove configuration file to reset to defaults:
```bash
rm ~/.agent-world/cli-config.json
```
