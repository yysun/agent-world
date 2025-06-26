# Update index-tui.ts to Match index.ts Implementation Plan

## Objective
Update index-tui.ts to match the latest functionality in index.ts while preserving the TUI-specific 2-part screen layout and user input behavior.

## Analysis of Differences

### Missing Components in index-tui.ts:
1. **Missing imports**: cliLogger, exportCommand, listCommand, loadSystemPrompt, getAgentConversationHistory, subscribeToSystem, subscribeToMessages
2. **Missing streaming module**: Uses old streaming-manager instead of StreamingDisplay module
3. **Missing utility functions**: debug(), estimateInputTokens()
4. **Missing event subscriptions**: SYSTEM and MESSAGE event handlers
5. **Incomplete command registry**: Missing export command, uses inline agents command instead of listCommand
6. **Missing external input handling**: No piped input or CLI arguments processing
7. **Different shutdown handling**: No signal handlers or proper cleanup
8. **Different SSE event handling**: Missing usage tracking and token estimation
9. **Missing graceful shutdown for external input**: No exit logic for piped input

### TUI-Specific Components to Preserve:
1. Terminal UI imports and initialization
2. UI handlers (onInput, onCommand, onQuit)
3. Terminal compatibility check
4. UI update calls for agent list
5. Console output capture for commands
6. TUI-specific world selection logic (auto-select first world)

## Implementation Steps

### Step 1: Update Header Comment and Imports
- [x] Update header comment to match index.ts style and functionality description
- [x] Add missing imports: cliLogger, exportCommand, listCommand, loadSystemPrompt, getAgentConversationHistory
- [x] Add missing event bus imports: subscribeToSystem, subscribeToMessages
- [x] Replace streaming-manager import with StreamingDisplay import
- [x] Add missing type imports for event payloads

### Step 2: Add Missing Utility Functions
- [x] Add debug() utility function
- [x] Add estimateInputTokens() function
- [x] Add selectWorldInteractively() function (for potential future use)

### Step 3: Update Command Registry
- [x] Replace inline agents command with listCommand import
- [x] Add exportCommand to registry
- [x] Update command implementations to match index.ts patterns
- [x] Fix quitCommand implementation

### Step 4: Update Main Function Structure
- [x] Add StreamingDisplay.setCurrentWorldName() call after world loading
- [x] Add proper signal handlers for graceful shutdown
- [x] Update loadAgents() function to match index.ts implementation
- [x] Add external input handling (piped input and CLI arguments)

### Step 5: Update Event Handling
- [x] Replace streaming-manager with StreamingDisplay calls
- [x] Add proper SSE event handling with token estimation and usage tracking
- [x] Add SYSTEM event subscription for debug messages
- [x] Add MESSAGE event subscription for @human notifications
- [x] Update streaming event handling to match index.ts patterns

### Step 6: Adapt TUI-Specific Features
- [x] Maintain TUI console output capture for command display
- [x] Preserve UI update calls for agent list
- [x] Keep terminal compatibility check and UI initialization
- [x] Adapt external input to work with TUI display methods
- [x] Ensure proper UI cleanup in shutdown handlers

### Step 7: Update Initialization and Cleanup
- [x] Add proper unsubscribe variable handling
- [x] Update cleanup in onQuit handler
- [x] Add StreamingDisplay callback setup for TUI
- [x] Ensure proper resource cleanup on exit

### Step 8: Testing and Validation
- [x] Test all commands work correctly in TUI
- [x] Verify streaming functionality matches index.ts behavior
- [x] Test external input handling (if applicable to TUI)
- [x] Verify graceful shutdown and cleanup
- [x] Test multi-agent streaming with proper display

## Technical Considerations

1. **Console Output Capture**: TUI requires capturing console.log output for command display, which index.ts doesn't need
2. **Display Methods**: TUI uses ui.displaySystem(), ui.displayError() etc. while index.ts uses console.log with colors
3. **External Input**: TUI may not support piped input in the same way, but should handle CLI arguments
4. **Streaming Display**: TUI will need to adapt StreamingDisplay calls to work with UI methods
5. **World Selection**: TUI auto-selects first world instead of interactive selection

## Success Criteria

- [x] All functionality from index.ts is available in index-tui.ts
- [x] TUI-specific interface and behavior is preserved
- [x] Streaming works correctly with proper token counting and usage display
- [x] All commands function identically to index.ts
- [x] Event handling matches index.ts patterns
- [x] Graceful shutdown and cleanup work properly
- [x] External input is handled appropriately for TUI context
