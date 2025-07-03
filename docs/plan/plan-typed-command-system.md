# Typed Command System Implementation Plan

## Overview
Complete redesign of the command system using typed command unions (Option C), system event type, no backward compatibility, time-based request IDs, and CLI command mapping.

## Implementation Steps

### ✅ Phase 1: Update Command Types
- [x] Create typed command request/response unions
- [x] Add time-based request ID generation
- [x] Define WebSocket message types for command communication
- [x] Replace old CommandResult interface with typed responses

### 🔄 Phase 2: Update Server Command Processing
- [ ] Rewrite commands/commands.ts to use typed requests
- [ ] Replace args array processing with typed parameters
- [ ] Update command handlers to match new signatures
- [ ] Add command request validation

### 🔄 Phase 3: Update WebSocket Server
- [ ] Update ws.ts to handle command-request/command-response
- [ ] Ensure proper system event type responses
- [ ] Add request ID tracking and response matching
- [ ] Remove old args-based command processing

### 🔄 Phase 4: Update Client API
- [ ] Rewrite ws-api.js command functions
- [ ] Replace sendCommand with typed command functions
- [ ] Add request tracking and response matching
- [ ] Update error handling for typed responses

### 🔄 Phase 5: Update UI Components
- [ ] Update world selection to use new getWorlds command
- [ ] Update agent operations to use new agent commands
- [ ] Update error handling for new response format
- [ ] Test all command flows end-to-end

### ✅ Phase 6: Enhance CLI Command System
- [x] Create a command mapping system (e.g. `/clear` maps to `clear`)
- [x] Update CLI to handle commands directly without going through system events
- [x] Process non-command inputs directly to message events
- [x] Ensure parameter extraction for each command type
- [x] Update processCLIInput function to support new command flow
- [x] Test command execution in both pipeline and interactive modes

## Key Changes

### Command Structure
**Before:**
```javascript
sendCommand('/getWorld', worldName)
```

**After:**
```javascript
sendGetWorldCommand({ worldName: 'Debate Club' })
```

### Request/Response Flow
1. Client creates typed request with time-based ID
2. Client sends via system event with command-request eventType
3. Server processes typed request parameters
4. Server responds via system event with command-response eventType
5. Client matches response by request ID

### CLI Command Handling
**Before:**
```javascript
// All input processed through system event
processCLIInput(input, world, rootPath, 'HUMAN')
```

**After:**
```javascript
// Direct command handling for inputs starting with /
if (input.startsWith('/')) {
  const commandName = extractCommandName(input);
  const params = extractCommandParameters(input, commandName);
  executeCommand(commandName, params, world);
} else {
  // Send as message for non-commands
  sendMessage(input, 'HUMAN', world);
}
```

### Benefits
- Type safety for all command parameters
- No more string parsing or args arrays
- Proper request/response tracking
- Clear separation of concerns
- Better error handling
- Multi-word parameter support
- More intuitive CLI command handling
- Separation of command and message processing

## Risk Assessment
- **High**: Complete breaking change - no backward compatibility
- **Medium**: All client code needs updating
- **Low**: Type safety reduces runtime errors

## Next Steps
1. Confirm plan approach
2. Implement Phase 2: Server command processing
3. Implement Phase 3: WebSocket server updates
4. Implement Phase 4: Client API updates
5. Implement Phase 5: UI updates
6. Implement Phase 6: CLI command enhancements
7. Test complete flow
