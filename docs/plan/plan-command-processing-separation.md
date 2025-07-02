# Implementation Plan: Command Processing Separation and Centralization

## Overview
Centralize command processing through system/message event types with strict channel enforcement, command validation, and proper error handling.

## Goals
- [x] Separate system commands (/) from user messages
- [x] Enforce strict channel rules for WebSocket and CLI
- [x] Add comprehensive command validation and registry
- [x] Centralize all command processing logic
- [x] Maintain backward compatibility where possible

## Architecture Changes

### 1. Command Processing Functions
- **processSystemCommand()**: Handle `/` commands with validation
- **processUserMessage()**: Handle plain text user messages  
- **processCLIInput()**: Route CLI input to appropriate channels
- **processWSInput()**: Enforce WebSocket channel restrictions
- **Replace existing processInput()** calls with appropriate functions

### 2. Command Registry & Validation
- Create command registry mapping (`/clear` → `clear`, `/getWorld` → `getWorld`)
- Add command syntax validation before execution
- Validate required parameters and world context
- Return structured error responses

### 3. Channel Enforcement Rules
- **CLI**: Route `/` commands → system processing, plain text → message processing
- **WebSocket system events**: Only allow `/` commands (including global commands)
- **WebSocket message events**: Only allow plain text (NO `/` commands - breaking change)
- **Global commands**: Only through `system` event type

### 4. Error Handling Enhancement
- Command syntax validation with detailed error messages
- World context requirement validation
- Structured error responses matching existing `CommandResult` format
- Invalid command reporting

## Implementation Steps

### Step 1: Update Commands Layer (`commands/commands.ts`)
- [ ] Create command registry with mappings
- [ ] Add command validation functions
- [ ] Implement `processSystemCommand()` function
- [ ] Implement `processUserMessage()` function
- [ ] Implement `processCLIInput()` function
- [ ] Implement `processWSInput()` function
- [ ] Add comprehensive error handling

### Step 2: Update WebSocket Server (`server/ws.ts`)
- [ ] Update `system`/`world` events to use `processWSInput()`
- [ ] Remove `/` command processing from `message` events
- [ ] Restrict global commands to `system` events only
- [ ] Add validation error responses
- [ ] Update error handling and logging

### Step 3: Update CLI (`cli/index.ts`)
- [ ] Replace `processInput()` calls with `processCLIInput()`
- [ ] Maintain existing user experience
- [ ] Add proper error handling for validation failures
- [ ] Update event handling logic

### Step 4: Testing and Validation
- [ ] Test CLI command routing (`/clear` vs plain messages)
- [ ] Test WebSocket `system` event with commands
- [ ] Test WebSocket `message` event rejection of `/` commands
- [ ] Test global commands through `system` events only
- [ ] Test command validation and error responses
- [ ] Test world context validation

### Step 5: Documentation and Cleanup
- [ ] Update function documentation
- [ ] Remove deprecated functions
- [ ] Update error message consistency
- [ ] Add logging for debugging

## Breaking Changes
- **WebSocket `message` events** will no longer accept `/` commands
- Existing WebSocket clients must use `system` events for commands
- This improves architecture separation and is acceptable per requirements

## Command Registry Structure
```typescript
const commandRegistry = {
  // Global commands (no world context required)
  '/getWorlds': { command: 'getWorlds', global: true },
  '/addWorld': { command: 'addWorld', global: true },
  '/getWorld': { command: 'getWorld', global: true },
  
  // World-specific commands (require world context)
  '/clear': { command: 'clear', global: false },
  '/addAgent': { command: 'addAgent', global: false },
  '/updateWorld': { command: 'updateWorld', global: false },
  '/updateAgent': { command: 'updateAgent', global: false },
  '/updateAgentConfig': { command: 'updateAgentConfig', global: false },
  '/updateAgentPrompt': { command: 'updateAgentPrompt', global: false },
  '/updateAgentMemory': { command: 'updateAgentMemory', global: false }
};
```

## Validation Rules
1. **Command Format**: Must start with `/` for system processing
2. **Command Existence**: Must exist in command registry
3. **World Context**: World-specific commands require valid world subscription
4. **Parameter Count**: Validate minimum required parameters
5. **Channel Restriction**: Enforce system vs message channel rules

## Error Response Format
```typescript
{
  success: false,
  error: string,
  details?: {
    command?: string,
    validCommands?: string[],
    requiredParams?: number,
    actualParams?: number,
    worldRequired?: boolean
  },
  timestamp: string
}
```

## Expected Outcomes
- Centralized command processing through system/message channels
- Strict channel enforcement preventing misuse
- Comprehensive command validation with helpful error messages
- Improved architecture separation between commands and messages
- Better debugging and error tracking
- Maintained CLI user experience with enhanced backend structure
