# CLI Command Mapping Implementation Plan

## Overview
Implement a direct command mapping system in the CLI to bypass system events for commands and send non-command inputs directly to message events.

## Implementation Steps

### Phase 1: Update Command Processing Logic
- [ ] Create a command mapping object that maps `/command` to `command` names
- [ ] Update `processCLIInput` to detect commands vs messages
- [ ] Implement direct command execution for inputs starting with `/`
- [ ] Implement direct message sending for inputs not starting with `/`

### Phase 2: Refactor CLI Command Handling
- [ ] Extract command name and parameters from input string
- [ ] Map command to the appropriate typed command
- [ ] Add parameter validation specific to each command
- [ ] Ensure proper error handling for invalid commands

### Phase 3: Update Response Handling
- [ ] Ensure consistent response format for both direct commands and messages
- [ ] Maintain compatibility with existing CLI output format
- [ ] Preserve streaming functionality for agent responses
- [ ] Handle command-specific response formatting

### Phase 4: Test and Verify
- [ ] Test all commands in pipeline mode
- [ ] Test all commands in interactive mode
- [ ] Verify proper message handling in both modes
- [ ] Ensure proper error handling in both modes

## Implementation Details

### Command Mapping
```typescript
// Command mapping object - maps CLI commands to internal command names
const COMMAND_MAP: Record<string, string> = {
  'clear': 'clearAgentMemory',
  'world': 'getWorld',
  'worlds': 'getWorlds',
  'create-world': 'createWorld',
  'update-world': 'updateWorld',
  'create-agent': 'createAgent',
  'update-agent': 'updateAgentConfig',
  'update-prompt': 'updateAgentPrompt',
  'help': 'help'
};
```

### Command Processing
```typescript
// Process CLI input
export async function processCLIInput(
  input: string,
  world: World | null,
  rootPath: string,
  sender: string = 'HUMAN'
): Promise<CLIResponse> {
  // If input starts with '/', process as command
  if (input.trim().startsWith('/')) {
    // Extract command and parameters
    const { command, params } = extractCommand(input);
    
    // Execute command directly
    return await executeCommand(command, params, world, rootPath);
  } else {
    // Handle as message
    if (!world) {
      return {
        success: false,
        message: 'Cannot send message - no world selected',
        technicalDetails: 'Message requires world context'
      };
    }

    // Send message directly to message event
    publishMessage(world, input, sender);
    
    return {
      success: true,
      message: 'Message sent',
      data: { sender }
    };
  }
}
```

### Message Handling
```typescript
// Send message directly without system event
function sendMessage(world: World, content: string, sender: string): void {
  publishMessage(world, content, sender);
}
```

## Expected Outcomes
1. Cleaner separation between command and message handling
2. More direct execution path for commands
3. No functional changes visible to the user
4. Improved code organization and maintainability
5. Better error handling for specific command types
