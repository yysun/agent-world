# TUI Index Update Implementation Plan

## Overview
Update index-tui.ts to achieve complete functional parity with index.ts while preserving the TUI's unique 2-part screen layout and user input behavior. Focus on message streaming, display, and event-driven communication system compliance.

## Implementation Steps

### Phase 1: Module Integration and Imports (Foundation)

#### Step 1.1: Update Import Statements
- [ ] **Add missing command imports**: Verify all commands (listCommand, showCommand, stopCommand, useCommand) are imported
- [ ] **Add cliLogger import**: `import { cliLogger } from '../src/logger';`
- [ ] **Verify StreamingDisplay import**: Ensure `import * as StreamingDisplay from './streaming/streaming-display';` is present
- [ ] **Add utility imports**: Verify `loadSystemPrompt`, `getAgentConversationHistory` imports exist
- [ ] **Add event subscription imports**: Verify `subscribeToSSE`, `subscribeToSystem`, `subscribeToMessages` imports exist

#### Step 1.2: Update File Header Comment Block
- [ ] **Update features list**: Add missing features from index.ts file header
- [ ] **Update architecture description**: Align with index.ts patterns
- [ ] **Update recent changes**: Reflect current implementation status
- [ ] **Add streaming and event handling details**: Document TUI-specific streaming integration

### Phase 2: Command Registry and Function Alignment

#### Step 2.1: Complete Command Registry
- [ ] **Verify command registry completeness**: Ensure all commands from index.ts are included
  - add: addCommand ✓
  - agents: listCommand ✓ 
  - clear: clearCommand ✓
  - export: exportCommand ✓
  - help: helpCommand ✓
  - show: showCommand ✓
  - stop: stopCommand ✓
  - use: useCommand ✓
  - quit: quitCommand ✓
- [ ] **Verify command function signatures**: Match index.ts parameter patterns `(args: string[], worldName: string) => Promise<void>`

#### Step 2.2: Utility Function Implementation
- [ ] **Add debug utility function**: Copy debug function from index.ts with gray color output
- [ ] **Add estimateInputTokens function**: Copy token estimation logic from index.ts
- [ ] **Add loadAgents function**: Ensure TUI version matches index.ts implementation exactly
- [ ] **Add quitCommand function**: Ensure proper TUI cleanup before exit

### Phase 3: Event System Integration (Core Focus)

#### Step 3.1: SSE Event Handling
- [ ] **Implement SSE event subscription**: Copy SSE event handling logic from index.ts
- [ ] **Add streaming start detection**: Handle agent start events for TUI streaming display
- [ ] **Add streaming content updates**: Route content updates to TUI display methods
- [ ] **Add streaming completion handling**: Handle agent completion events
- [ ] **Add token usage tracking**: Implement real-time token counting with visual indicators

#### Step 3.2: System Event Handling  
- [ ] **Implement SYSTEM event subscription**: Handle debug messages appropriately in TUI
- [ ] **Add system message display**: Route system events to TUI display area (not input area)
- [ ] **Add debug information handling**: Make debug info available but not intrusive

#### Step 3.3: Message Event Handling
- [ ] **Implement MESSAGE event subscription**: Handle @human notifications and turn limits
- [ ] **Add mention-based routing**: Implement @agentName syntax detection and routing
- [ ] **Add turn limit control**: Implement automatic turn limiting (max 5 consecutive agent messages)
- [ ] **Add pass command detection**: Detect and handle pass commands for human control handover

#### Step 3.4: Event Cleanup Management
- [ ] **Add event unsubscription**: Implement proper cleanup in shutdown handler
- [ ] **Add resource cleanup**: Ensure streaming state reset and memory cleanup
- [ ] **Add graceful exit handling**: Maintain TUI-specific cleanup while adding event cleanup

### Phase 4: Real-Time Streaming System Implementation

#### Step 4.1: Streaming Display Integration
- [ ] **Verify StreamingDisplay module usage**: Ensure proper import and function calls
- [ ] **Implement streaming start calls**: Call `StreamingDisplay.startStreaming()` for TUI display
- [ ] **Implement content update calls**: Call `StreamingDisplay.addStreamingContent()` during streaming
- [ ] **Implement streaming end calls**: Call `StreamingDisplay.endStreaming()` on completion
- [ ] **Implement error handling calls**: Call `StreamingDisplay.markStreamingError()` on errors

#### Step 4.2: Multi-Agent Concurrent Support
- [ ] **Verify concurrent streaming support**: Ensure multiple agents can stream simultaneously
- [ ] **Implement visual distinction**: Each agent's response visually distinct in TUI display area
- [ ] **Implement progress indicators**: Show flashing emoji and progress in display area
- [ ] **Implement independent positioning**: Each agent gets independent display line

#### Step 4.3: Token Usage and Performance Monitoring
- [ ] **Implement input token estimation**: Copy logic from index.ts for conversation context
- [ ] **Implement real-time output counting**: Count tokens during streaming with visual indicators
- [ ] **Add token display formatting**: Use (↑ input, ↓ output) format in TUI display area
- [ ] **Ensure performance visibility**: Make token usage visible without cluttering input area

### Phase 5: Content Display and Message Processing

#### Step 5.1: Content Display Patterns
- [ ] **Implement preview during streaming**: Show truncated previews on single lines in display area
- [ ] **Implement full content after completion**: Display complete content after streaming finishes
- [ ] **Protect input area**: Ensure preview updates do NOT interfere with user input area
- [ ] **Implement error visual feedback**: Handle streaming errors with appropriate visual indicators
- [ ] **Integrate with message history**: Seamless integration with conversation history display

#### Step 5.2: Message History and Context
- [ ] **Verify conversation history access**: Ensure `getAgentConversationHistory` is used correctly
- [ ] **Implement context loading**: Load and display conversation context as needed
- [ ] **Integrate with agent memory**: Ensure memory persistence works correctly
- [ ] **Add conversation quality control**: Implement turn limiting and conversation management

### Phase 6: External Input Processing and CLI Parity

#### Step 6.1: External Input Handling
- [ ] **Implement command line argument processing**: Handle CLI args as user messages (copy from index.ts)
- [ ] **Assess piped input feasibility**: Determine if piped input is technically feasible in TUI
- [ ] **Implement external input display**: Show external input in display area before broadcasting
- [ ] **Implement graceful exit behavior**: Exit after processing external input (if appropriate for TUI)

#### Step 6.2: Agent Management Parity
- [ ] **Verify agent loading logic**: Ensure agent initialization matches index.ts exactly
- [ ] **Verify token estimation**: Ensure conversation context token estimation works
- [ ] **Verify memory integration**: Ensure agent memory and persistence match index.ts
- [ ] **Verify world management**: Ensure world loading and state management match

### Phase 7: Error Handling and Logging Integration

#### Step 7.1: Logging Integration
- [ ] **Integrate cliLogger**: Use cliLogger for consistent error reporting
- [ ] **Implement TUI error display**: Show errors in display area with proper formatting
- [ ] **Implement debug message handling**: Handle debug messages without cluttering interface
- [ ] **Implement fatal error handling**: Graceful exit on fatal errors with cleanup

#### Step 7.2: Error Recovery and Resilience
- [ ] **Implement streaming error recovery**: Handle streaming failures gracefully
- [ ] **Implement event system error handling**: Handle event subscription failures
- [ ] **Implement agent communication errors**: Handle agent response failures
- [ ] **Implement automatic recovery**: Transparent recovery from transient failures

### Phase 8: Performance and Cleanup Optimization

#### Step 8.1: Performance Standards Implementation
- [ ] **Verify sub-100ms streaming updates**: Ensure streaming updates appear within 100ms
- [ ] **Verify non-blocking processing**: Ensure event processing doesn't introduce latency
- [ ] **Test concurrent performance**: Verify multiple agent responses don't degrade performance
- [ ] **Implement memory management**: Ensure stable memory usage during long conversations

#### Step 8.2: Resource Cleanup and Signal Handling
- [ ] **Implement signal handlers**: Add SIGINT and SIGTERM handlers (copy from index.ts)
- [ ] **Enhance shutdown cleanup**: Add event unsubscription to existing TUI cleanup
- [ ] **Implement streaming state reset**: Call `StreamingDisplay.resetStreamingState()` on shutdown
- [ ] **Verify resource leak prevention**: Ensure proper cleanup prevents memory leaks

### Phase 9: Integration Testing and Validation

#### Step 9.1: Functional Verification
- [ ] **Test all commands**: Verify each command works identically to index.ts
- [ ] **Test streaming behavior**: Verify streaming matches index.ts exactly
- [ ] **Test external input processing**: Verify CLI args and piped input work correctly
- [ ] **Test event handling**: Verify SSE, SYSTEM, and MESSAGE events work properly
- [ ] **Test error states and recovery**: Verify error handling matches index.ts

#### Step 9.2: Interface Preservation Validation
- [ ] **Verify TUI layout preservation**: Ensure 2-part layout maintained
- [ ] **Verify user input unchanged**: Ensure input area behavior unchanged
- [ ] **Verify terminal compatibility**: Ensure compatibility and display quality preserved
- [ ] **Verify console output capture**: Ensure command output capture continues working
- [ ] **Verify UI updates**: Ensure agent status display functions correctly

#### Step 9.3: Performance and Quality Validation
- [ ] **Test performance standards**: Verify performance matches or exceeds current implementation
- [ ] **Test memory usage**: Verify memory usage and cleanup work properly
- [ ] **Test error coverage**: Verify error handling covers all edge cases
- [ ] **Test maintainability**: Verify code maintainability and readability preserved

## Implementation Dependencies and Order

### Critical Path:
1. **Phase 1 & 2** (Foundation) → **Phase 3** (Event System) → **Phase 4** (Streaming) → **Phase 5** (Display)
2. **Phase 6** (External Input) can be implemented in parallel with Phase 4-5
3. **Phase 7** (Error Handling) should be implemented incrementally throughout other phases
4. **Phase 8** (Performance) and **Phase 9** (Testing) are final validation phases

### Key Integration Points:
- **Event System ↔ Streaming**: SSE events must properly trigger streaming display updates
- **Streaming ↔ Display**: StreamingDisplay module must integrate with TUI display area
- **External Input ↔ Display**: External input must be shown in display area before processing
- **Error Handling ↔ All Systems**: Error handling must be integrated throughout all components

## Success Criteria

### Functional Success:
- [ ] All commands from index.ts work identically in TUI
- [ ] Real-time streaming with token counting works exactly like index.ts
- [ ] External input processing functions correctly (CLI args at minimum)
- [ ] Event handling provides same functionality as index.ts
- [ ] Error states and recovery match index.ts behavior

### Preservation Success:
- [ ] TUI maintains distinctive 2-part layout
- [ ] User input area behavior completely unchanged
- [ ] Terminal compatibility and display quality preserved
- [ ] Console output capture continues working
- [ ] UI updates and agent status display function correctly

### Performance Success:
- [ ] Sub-100ms streaming updates
- [ ] No noticeable latency from event processing
- [ ] Stable performance with multiple concurrent agents
- [ ] Proper memory management and cleanup

## Risk Mitigation

### High-Risk Areas:
1. **Event System Integration**: May require careful coordination with existing TUI event handling
2. **Streaming Display Integration**: Must not interfere with TUI input area
3. **External Input Processing**: Piped input may not be feasible in TUI environment
4. **Performance**: Adding event processing must not degrade TUI responsiveness

### Mitigation Strategies:
1. **Incremental Implementation**: Implement and test each phase before proceeding
2. **Preservation Testing**: Test TUI functionality after each major change
3. **Performance Monitoring**: Monitor performance metrics throughout implementation
4. **Fallback Planning**: Maintain working TUI state at each phase completion

## Notes

- **User Input Area**: Explicitly protected - NO CHANGES to input field behavior
- **Display Area Focus**: All new functionality goes in the display area
- **Module Reuse**: Leverage existing StreamingDisplay module rather than recreating
- **Function-Based Approach**: Maintain function-based pattern throughout
- **Terminal-Kit Preservation**: Keep existing terminal-kit UI components and behavior
