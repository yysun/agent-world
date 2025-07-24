# Requirements: CLI Non-Streaming Mode for Pipeline Mode

## Overview
Modify the Agent World CLI to use non-streaming mode for LLM responses from all agents when running in pipeline mode, while maintaining streaming mode for interactive mode.

## Current CLI Mode Analysis

### CLI Mode Detection
```typescript
const isPipelineMode = !!(
  options.command ||      // -c, --command option provided  
  messageFromArgs ||      // CLI arguments provided (after options)
  !process.stdin.isTTY   // stdin input available (piped)
);
```

### Current Mode Classification
1. **Interactive Mode**: No `-c` option AND no command line arguments AND TTY input
   - Uses streaming responses for real-time user experience
   - Readline interface with live agent response chunks
2. **Pipeline Mode**: Any of the following conditions:
   - `--command` option provided (system commands)
   - Command line arguments provided (user messages)  
   - Stdin input available (piped messages)
   - Uses non-streaming responses for automation/scripting

## Updated Core Requirements

### 1. Global Streaming Control Implementation
- **Global Flag**: Add global flag to control streaming behavior across the system
- **Default Behavior**: Streaming ON by default for CLI interactive mode and web interface
- **Pipeline Override**: CLI pipeline mode sets flag to OFF for non-streaming responses
- **Centralized Control**: Single point of control for streaming vs non-streaming decisions

### 2. LLM Manager Enhancement
- **generateAgentResponse Validation**: Ensure generateAgentResponse works correctly in non-streaming mode
- **Unit Testing**: Add comprehensive unit tests for generateAgentResponse before implementation
- **Streaming Awareness**: Make generateAgentResponse respect global streaming flag
- **Backward Compatibility**: Preserve existing streaming behavior where expected

### 3. CLI Mode-Specific Behavior
- **Interactive Mode**: Keep existing streaming behavior (flag ON)
  - Real-time SSE events and chunk-by-chunk display
  - Readline interface with live response streaming
- **Pipeline Mode**: Use non-streaming responses (flag OFF)
  - Commands via `--command` option
  - Messages via command line arguments  
  - Messages via stdin input
  - Complete responses before display

### 4. Agent Chain Behavior
- **Agent-to-Agent Conversations**: Follow global streaming flag setting
- **Multi-Agent Responses**: Consistent streaming behavior across all agents
- **Conversation Chains**: All responses in same mode (streaming or non-streaming)

### 5. Response Collection (Pipeline Mode)
- **Complete Response Waiting**: Wait for full agent responses before display  
- **Multi-Agent Coordination**: Collect responses from all participating agents
- **Partial Failure Handling**: Include partial responses with clear failure indicators
- **Note**: If an agent chain fails midway, display all completed responses plus failure information

### 6. Error Handling and Timeouts
- **Timeout Behavior**: Same timeout values for both modes - used to wait for server responses
- **Error Display**: Errors shown immediately in both modes
- **Partial Failures**: Display completed agent responses even if some agents fail
- **Chain Interruption**: Clear indication when agent chains are interrupted

### 7. Implementation Approach
- **Global Flag Management**: Simple global variable to control streaming state
- **Minimal Changes**: Use existing LLM manager functions with global flag awareness
- **No Core Modifications**: Avoid modifying core event system or world subscription
- **CLI-Only Impact**: Changes primarily affect CLI behavior, not web interface

### 8. Configuration Options (Retain All Existing)
- `-r, --root <path>`: Root path for worlds data (default: `process.env.AGENT_WORLD_DATA_PATH || './data/worlds'`)
- `-w, --world <name>`: World name to connect to
- `-c, --command <cmd>`: Command to execute in pipeline mode
- `-l, --logLevel <level>`: Set log level (trace, debug, info, warn, error) (default: 'error')

### 9. Environment Variables (Retain All Existing)
- **General**: `AGENT_WORLD_DATA_PATH` - Default root path for worlds data
- **OpenAI**: `OPENAI_API_KEY`
- **Anthropic**: `ANTHROPIC_API_KEY`  
- **Google**: `GOOGLE_API_KEY`
- **Azure**: `AZURE_OPENAI_API_KEY`, `AZURE_ENDPOINT`, `AZURE_DEPLOYMENT`, `AZURE_API_VERSION`
- **XAI**: `XAI_API_KEY`
- **OpenAI Compatible**: `OPENAI_COMPATIBLE_API_KEY`, `OPENAI_COMPATIBLE_BASE_URL`
- **Ollama**: `OLLAMA_BASE_URL` (default: 'http://localhost:11434/api')

### 10. Backward Compatibility
- No breaking changes to CLI interface
- All existing commands and options work identically  
- JSON output format remains unchanged for commands
- Environment variable configuration unchanged
- Exit behavior and timing preserved
- Core event system unchanged
- Web interface completely unaffected

### 11. Performance Considerations
- Non-streaming mode reduces network overhead in automation scenarios
- Same timeout handling for server response waiting
- Queue management remains the same
- Response aggregation adds minimal overhead

### 12. Implementation Guidelines
- **Focus**: Implement functional requirements without additional optimizations
- **Security**: Do not add security enhancements beyond existing implementation
- **Performance**: Do not optimize for performance beyond basic functionality
- **Simplicity**: Prioritize clear, straightforward implementation over efficiency gains
- **Testing**: Comprehensive unit tests for generateAgentResponse before implementation

### 6. Agent Chain Behavior
- **Agent-to-Agent Conversations**: All agent responses in pipeline mode use non-streaming, including agent-to-agent interactions
- **Multi-Agent Responses**: Complete responses from all agents before displaying in pipeline mode
- **Conversation Chains**: Entire conversation sequences use non-streaming in pipeline mode

### 7. Response Collection and Aggregation
- **Complete Response Collection**: Wait for full agent responses before display
- **Multi-Agent Coordination**: Collect responses from all participating agents
- **Partial Failure Handling**: Include partial responses with clear failure indicators
- **Note**: If an agent chain fails midway, display all completed responses plus failure information

### 8. Timeout and Error Handling
- **Timeout Behavior**: Same timeout values for both streaming and non-streaming modes - used to wait for server responses
- **Error Display**: Errors shown immediately in both modes, don't wait for completion
- **Partial Failures**: Display completed agent responses even if some agents fail
- **Chain Interruption**: Clear indication when agent chains are interrupted

### 9. Implementation Approach
- Use CLI-specific wrappers to avoid modifying core event system
- Make streaming decision at agent processing level, not event publishing level
- Create response collection mechanism for pipeline mode
- Ensure web interface remains completely unaffected

### 10. Backward Compatibility
- No breaking changes to CLI interface
- All existing commands and options work identically  
- JSON output format remains unchanged for commands
- Environment variable configuration unchanged
- Exit behavior and timing preserved
- Core event system (`publishSSE`, `subscribeWorld`) unchanged

### 11. Performance Considerations
- Non-streaming mode reduces network overhead in automation scenarios
- Same timeout handling for server response waiting
- Queue management remains the same
- Response aggregation adds minimal overhead

### 12. Implementation Guidelines
- **Focus**: Implement functional requirements without additional optimizations
- **Security**: Do not add security enhancements beyond existing implementation
- **Performance**: Do not optimize for performance beyond basic functionality
- **Simplicity**: Prioritize clear, straightforward implementation over efficiency gains

## Usage Examples (No Changes to Interface)

```bash
# Commands (use non-streaming for any agent responses)
cli -w myworld -c "/clear agent1"
cli -w myworld -c "/add MyAgent"

# Messages via arguments (use non-streaming)  
cli -w myworld "Hello, what's the weather like?"
cli -w myworld Hello world

# Messages via stdin (use non-streaming)
echo "Hello agents" | cli -w myworld

# Interactive mode (keep streaming)
cli -w myworld

# Debug mode
cli -w myworld -l debug "Hello world"
```

## What This Affects
- CLI mode detection and response handling
- World event processing for different modes
- LLM manager integration in CLI context
- Agent response display formatting in pipeline mode
- Agent-to-agent conversation handling in pipeline mode
- Response collection and aggregation for multi-agent scenarios

## What This Does NOT Affect
- Core LLM manager functionality
- Agent logic or world management  
- Web interface behavior (completely unaffected)
- Server-side streaming capabilities
- Interactive mode user experience
- CLI interface or command syntax
- Core event system (`publishSSE`, `subscribeWorld`)
- Timeout values or server response handling
