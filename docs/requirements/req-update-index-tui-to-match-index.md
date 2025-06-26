# Requirements: Update index-tui.ts to Match index.ts Functionality

## What: Functional Parity Between CLI Interfaces

### Core Requirement
Update the Terminal UI interface (index-tui.ts) to have complete functional parity with the standard CLI interface (index.ts) while preserving the TUI's unique 2-part screen layout and user input behavior.

### Functional Requirements

#### 1. Complete Command Support
- All commands available in index.ts must work identically in index-tui.ts
- Command registry must include: add, agents (listCommand), clear, export, help, show, stop, use, quit
- Commands must execute with identical behavior and output formatting
- Error handling must match index.ts patterns

#### 2. Streaming Functionality Parity
- Real-time agent response streaming with flashing emoji indicators
- Token counting and usage tracking identical to index.ts
- Multi-agent concurrent streaming support
- Proper streaming state management and cleanup
- StreamingDisplay module integration (not streaming-manager)

#### 3. Event System Integration
- SSE event subscription for agent streaming responses
- SYSTEM event handling for debug messages
- MESSAGE event handling for @human notifications and turn limits
- Proper event unsubscription and cleanup on exit

#### 4. External Input Processing
- Support for command line arguments as user messages
- Piped input detection and processing (if technically feasible in TUI)
- Graceful handling of external input with proper exit behavior
- External input should be displayed and broadcasted to agents

#### 5. Agent Management
- Identical agent loading and initialization logic
- Token estimation for conversation context
- Agent conversation history access
- Memory and persistence integration matching index.ts

#### 6. Error Handling and Logging
- Integration with cliLogger for consistent error reporting
- Proper error display in TUI format
- Debug message handling and display
- Fatal error handling with graceful exit

#### 7. Shutdown and Cleanup
- Signal handlers for SIGINT and SIGTERM
- Proper resource cleanup (event unsubscription, streaming state reset)
- Graceful exit messages and state preservation
- TUI-specific cleanup (UI resources, terminal state)

### Preservation Requirements

#### 1. TUI Interface Characteristics
- Maintain 2-part screen layout with input field and display area
- Preserve terminal-kit UI components and behavior
- Keep console output capture for command result display
- Maintain UI update methods for agent list and status
- Preserve terminal compatibility checks

#### 2. User Interaction Patterns
- Keep onInput, onCommand, and onQuit handler structure
- Maintain TUI-specific input processing and display methods
- Preserve agent list updates in UI panel
- Keep TUI-specific world selection logic (auto-select first)

#### 3. Display and Formatting
- Adapt console.log outputs to UI display methods
- Maintain color coding and formatting in TUI context
- Preserve streaming display integration with TUI layout
- Keep system message and error display patterns

### Technical Requirements

#### 1. Module Integration
- Replace streaming-manager with StreamingDisplay module
- Add missing imports: cliLogger, exportCommand, listCommand, event subscriptions
- Import utility functions: loadSystemPrompt, getAgentConversationHistory
- Maintain TUI-specific imports: terminal-kit-ui, terminal compatibility

#### 2. Code Structure Alignment
- Match main() function structure and flow
- Align utility function implementations (debug, estimateInputTokens)
- Standardize command registry patterns
- Maintain function-based approach throughout

#### 3. Event Handling Patterns
- SSE event handling with proper token estimation and usage tracking
- Event subscription management with cleanup
- Streaming event routing to appropriate display methods
- Background process handling and status tracking

### Acceptance Criteria

#### 1. Functional Verification
- All commands from index.ts work identically in TUI
- Streaming behavior matches index.ts exactly
- External input processing functions correctly
- Event handling provides same functionality
- Error states and recovery match index.ts behavior

#### 2. Interface Preservation
- TUI maintains its distinctive 2-part layout
- User input behavior remains unchanged
- Terminal compatibility and display quality preserved
- Console output capture continues to work
- UI updates and agent status display function correctly

#### 3. Quality Standards
- No breaking changes to existing TUI functionality
- Performance matches or exceeds current implementation
- Memory usage and resource cleanup work properly
- Code maintainability and readability preserved
- Error handling covers all edge cases

### Non-Requirements

#### What This Does NOT Include
- Changing the fundamental TUI interface design
- Modifying the terminal-kit UI component structure
- Altering the 2-part screen layout approach
- Converting TUI to use readline instead of terminal-kit
- Adding new features not present in index.ts
- Optimizing or refactoring existing working TUI code beyond alignment needs
