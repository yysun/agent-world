# Implementation Plan: CLI Non-Streaming Mode

## Overview
Add non-streaming mode support for CLI pipeline mode using a global streaming flag, while preserving interactive mode streaming.

## Simplified Architecture Approach

### Current CLI Mode Detection (No Changes)
```typescript
const isPipelineMode = !!(
  options.command ||      // --command option provided
  messageFromArgs ||      // CLI arguments provided
  !process.stdin.isTTY   // stdin input available
);
```

### New Global Streaming Control
- **Global Flag**: Simple boolean flag to control streaming behavior system-wide
- **Default State**: Streaming ON for interactive mode and web interface
- **Pipeline Override**: Set flag OFF when CLI runs in pipeline mode
- **No Core Changes**: Existing functions work with global flag awareness

## Implementation Steps

### ☐ Step 1: Add Global Streaming Flag
- [ ] Create global streaming flag module with default state (ON)
- [ ] Export functions to get/set streaming state
- [ ] Ensure thread-safe access if needed
- [ ] Add TypeScript types for streaming control

### ☐ Step 2: Add Unit Tests for generateAgentResponse
- [ ] Create comprehensive unit tests for generateAgentResponse function
- [ ] Test various scenarios: different providers, error conditions, timeouts
- [ ] Verify non-streaming behavior works correctly
- [ ] Test LLM queue integration and state management
- [ ] Validate agent state persistence after non-streaming calls

### ☐ Step 3: Update LLM Manager for Global Flag Awareness
- [ ] Modify processAgentMessage in events.ts to check global streaming flag
- [ ] Use streamAgentResponse when flag is ON (current behavior)
- [ ] Use generateAgentResponse when flag is OFF (pipeline mode)
- [ ] Ensure both paths work correctly with existing agent processing

### ☐ Step 4: Update CLI to Control Global Flag
- [ ] Set global streaming flag OFF in pipeline mode
- [ ] Set global streaming flag ON in interactive mode (default)
- [ ] Ensure flag is set before any agent processing begins
- [ ] Add debug logging for flag state changes

### ☐ Step 5: Response Handling for Pipeline Mode
- [ ] Update pipeline client event handling for non-streaming responses
- [ ] Ensure complete responses are collected before display
- [ ] Maintain existing timer-based exit behavior
- [ ] Handle partial failures with clear indicators
### ☐ Step 6: Add Error Handling and Partial Failure Support
- [ ] Implement immediate error display for both modes
- [ ] Add partial response collection when agent chains fail midway
- [ ] Create clear failure indicators for incomplete agent chains
- [ ] Ensure timeout behavior is consistent between modes (same values, used for server response waiting)

### ☐ Step 7: Testing and Validation
- [ ] Test commands in pipeline mode (should use non-streaming)
- [ ] Test messages via CLI args (should use non-streaming)
- [ ] Test messages via stdin (should use non-streaming)
- [ ] Test agent-to-agent conversations in pipeline mode (should use non-streaming)
- [ ] Test multi-agent response scenarios with response collection
- [ ] Test partial failure scenarios with completed response display
- [ ] Verify interactive mode streaming still works unchanged
- [ ] Verify web interface remains completely unaffected
- [ ] Test error handling in all modes
- [ ] Validate timeout behavior consistency

## File Changes Required

### Core Files (Minimal Changes)
- `core/streaming-flag.ts` - New global streaming flag module
- `core/events.ts` - Update processAgentMessage to check global flag
- `core/index.ts` - Export streaming flag functions

### CLI Files  
- `cli/index.ts` - Set global flag based on pipeline vs interactive mode

### Test Files
- `tests/core/llm-manager.test.ts` - New unit tests for generateAgentResponse

## Implementation Details

### Global Streaming Flag Module
```typescript
// core/streaming-flag.ts
let globalStreamingEnabled = true; // Default ON for interactive/web

export function setStreamingEnabled(enabled: boolean): void {
  globalStreamingEnabled = enabled;
}

export function isStreamingEnabled(): boolean {
  return globalStreamingEnabled;
}
```

### CLI Flag Control
```typescript
// In CLI main function
import { setStreamingEnabled } from '../core/streaming-flag';

// Set streaming flag based on mode
if (isPipelineMode) {
  setStreamingEnabled(false); // Non-streaming for pipeline
} else {
  setStreamingEnabled(true);  // Streaming for interactive (default)
}
```

### Agent Processing Update
```typescript
// In events.ts processAgentMessage function
import { isStreamingEnabled } from './streaming-flag';

// Choose LLM call method based on global flag
if (isStreamingEnabled()) {
  // Use streaming response (current behavior)
  const response = await streamAgentResponse(world, agent, messages);
} else {
  // Use non-streaming response (pipeline mode)
  const response = await generateAgentResponse(world, agent, messages);
  // Emit complete response as message event
  publishMessage(world, response, agent.id);
}
```

### Unit Test Structure
```typescript
// tests/core/llm-manager.test.ts
describe('generateAgentResponse', () => {
  test('should return complete response without streaming');
  test('should handle different LLM providers');
  test('should handle timeouts correctly');
  test('should update agent state correctly');
  test('should work with LLM queue');
  test('should handle errors gracefully');
});
```

## Configuration Preservation

### Existing CLI Options (No Changes)
- `-r, --root <path>`: Root path for worlds data
- `-w, --world <name>`: World name to connect to  
- `-c, --command <cmd>`: Command to execute in pipeline mode
- `-l, --logLevel <level>`: Set log level

### Existing Environment Variables (No Changes)
- `AGENT_WORLD_DATA_PATH`: Default root path
- `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`: API keys
- `AZURE_*`: Azure OpenAI configuration
- `XAI_API_KEY`: XAI configuration  
- `OPENAI_COMPATIBLE_*`: Custom provider configuration
- `OLLAMA_BASE_URL`: Ollama configuration

## Implementation Guidelines

### Focus and Scope
- **Primary Goal**: Implement functional requirements for non-streaming mode
- **Security**: Do not add security enhancements beyond existing implementation
- **Performance**: Do not optimize for performance beyond basic functionality  
- **Simplicity**: Prioritize clear, straightforward implementation over efficiency gains
- **Compatibility**: Preserve all existing behavior and interfaces
- **Testing**: Comprehensive unit tests for generateAgentResponse before implementation

## Success Criteria
- [ ] Pipeline mode (commands, messages, stdin) uses non-streaming responses for all agents
- [ ] Agent-to-agent conversations in pipeline mode use non-streaming responses
- [ ] Multi-agent responses are collected and displayed together in pipeline mode
- [ ] Partial failures show completed responses plus clear failure indicators
- [ ] Interactive mode continues to stream responses in real-time unchanged
- [ ] Web interface remains completely unaffected by changes
- [ ] No breaking changes to CLI interface or behavior
- [ ] All existing configuration options preserved
- [ ] Error handling works consistently in all modes (immediate display)
- [ ] Timeout behavior is consistent (same values, used for server response waiting)
- [ ] JSON output format unchanged for commands
- [ ] Core event system unchanged
- [ ] generateAgentResponse has comprehensive unit test coverage

### ☐ Step 6: Testing and Validation
- [ ] Test commands in pipeline mode (should use non-streaming)
- [ ] Test messages via CLI args (should use non-streaming)
- [ ] Test messages via stdin (should use non-streaming)
- [ ] Verify interactive mode streaming still works
- [ ] Test error handling in all modes
- [ ] Validate timeout and exit behavior

## File Changes Required

### Core Files (Minimal Changes)
- `core/types.ts` - Add CLI-specific interfaces if needed
- `core/index.ts` - Export CLI-specific wrapper functions

### CLI Files  
- `cli/index.ts` - Add pipeline mode detection and use CLI-specific wrapper
- `cli/stream.ts` - Update streaming detection logic if needed

### New Files
- `cli/pipeline-client.ts` - CLI-specific world subscription wrapper and response collection

## Implementation Details

### Updated CLI-Specific Wrapper
```typescript
// CLI-specific wrapper that doesn't modify core system
interface ResponseCollector {
  isCollecting: boolean;
  responses: Map<string, string>; // agentId -> complete response
  partialFailures: Map<string, string>; // agentId -> error message
  onComplete: (responses: Map<string, string>, failures: Map<string, string>) => void;
}

export async function subscribeWorldForCLI(
  worldName: string,
  rootPath: string,
  client: ClientConnection,
  pipelineMode: boolean
): Promise<WorldSubscription | null>
```

### CLI Mode Detection and Subscription
```typescript
// Pipeline mode uses CLI-specific wrapper with response collection
if (isPipelineMode) {
  worldSubscription = await subscribeWorldForCLI(
    options.world, 
    rootPath, 
    pipelineClient,
    true  // Pipeline mode flag
  );
} else {
  // Interactive mode uses original function unchanged
  worldSubscription = await subscribeWorld(
    selectedWorld, 
    rootPath, 
    interactiveClient
  );
}
```

### Agent Response Logic Update (At Processing Level)
```typescript
// In agent processing logic - decision made at processing level
const usePipelineMode = client.pipelineMode || false;

if (usePipelineMode) {
  // Use non-streaming response for all agents in pipeline mode
  const response = await generateAgentResponse(world, agent, messages);
  // Collect response for aggregation
  responseCollector.addResponse(agent.id, response);
} else {
  // Use streaming response for interactive mode
  const response = await streamAgentResponse(world, agent, messages);
}
```

### Pipeline Client Event Handling with Response Collection
```typescript
// Pipeline client with response collection
const pipelineClient: ClientConnection = {
  isOpen: true,
  pipelineMode: true,  // Add mode flag
  responseCollector: new ResponseCollector(),
  
  onWorldEvent: (eventType: string, eventData: any) => {
    // Collect complete responses in pipeline mode
    if (eventType === 'agent_response_complete') {
      responseCollector.addResponse(eventData.agentId, eventData.content);
    }
    
    // Handle partial failures
    if (eventType === 'agent_response_error') {
      responseCollector.addPartialFailure(eventData.agentId, eventData.error);
    }
    
    // Display when collection is complete
    if (responseCollector.isComplete()) {
      displayAggregatedResponses(responseCollector.responses, responseCollector.partialFailures);
      setupExitTimer(3000);
    }
    
    // Immediate error display
    if (eventType === 'error') {
      console.log(red(`Error: ${eventData.message}`));
    }
  }
};
```

## Configuration Preservation

### Existing CLI Options (No Changes)
- `-r, --root <path>`: Root path for worlds data
- `-w, --world <name>`: World name to connect to  
- `-c, --command <cmd>`: Command to execute in pipeline mode
- `-l, --logLevel <level>`: Set log level

### Existing Environment Variables (No Changes)
- `AGENT_WORLD_DATA_PATH`: Default root path
- `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`: API keys
- `AZURE_*`: Azure OpenAI configuration
- `XAI_API_KEY`: XAI configuration  
- `OPENAI_COMPATIBLE_*`: Custom provider configuration
- `OLLAMA_BASE_URL`: Ollama configuration

## Implementation Guidelines

### Focus and Scope
- **Primary Goal**: Implement functional requirements for non-streaming mode
- **Security**: Do not add security enhancements beyond existing implementation
- **Performance**: Do not optimize for performance beyond basic functionality  
- **Simplicity**: Prioritize clear, straightforward implementation over efficiency gains
- **Compatibility**: Preserve all existing behavior and interfaces

## Success Criteria
- [ ] Pipeline mode (commands, messages, stdin) uses non-streaming responses for all agents
- [ ] Agent-to-agent conversations in pipeline mode use non-streaming responses
- [ ] Multi-agent responses are collected and displayed together in pipeline mode
- [ ] Partial failures show completed responses plus clear failure indicators
- [ ] Interactive mode continues to stream responses in real-time unchanged
- [ ] Web interface remains completely unaffected by changes
- [ ] No breaking changes to CLI interface or behavior
- [ ] All existing configuration options preserved
- [ ] Error handling works consistently in all modes (immediate display)
- [ ] Timeout behavior is consistent (same values, used for server response waiting)
- [ ] JSON output format unchanged for commands
- [ ] Core event system (`publishSSE`, `subscribeWorld`) unchanged
