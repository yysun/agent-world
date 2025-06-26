# Agent Interface and Turn Limit Logic Implementation Plan

## Overview
Refactor Agent interface to remove metadata field and implement LLM call-based turn limit logic instead of message history analysis.

## Implementation Steps

### Step 1: Update Agent Interface in types.ts
- [x] Remove `metadata?: Record<string, any>` field from Agent interface
- [x] Add `llmCallCount: number` field to track LLM invocations
- [x] Add `lastLLMCall?: Date` field to track timing of last LLM call
- [x] Review existing codebase for any metadata usage and migrate to direct Agent properties

### Step 2: Update Agent Creation and Initialization
- [x] Update agent creation logic in world.ts or agent-manager.ts to initialize llmCallCount to 0
- [x] Update agent loading logic to handle new fields with defaults
- [x] Ensure backward compatibility for existing agent data files

### Step 3: Implement LLM Call Tracking
- [x] Modify `processAgentMessage` function in agent.ts to increment llmCallCount before LLM calls
- [x] Update llmCallCount atomically to prevent race conditions
- [x] Update lastLLMCall timestamp when making LLM calls
- [x] Persist agent state changes to storage after each LLM call

### Step 4: Refactor Turn Limit Logic in shouldRespondToMessage
- [x] Replace message history analysis with llmCallCount check
- [x] Keep TURN_LIMIT constant (5) but apply to LLM calls instead of messages
- [x] Implement reset logic when human/system message is received
- [x] Maintain existing turn limit message publishing behavior
- [x] Keep turn limit message ignore logic unchanged

### Step 5: Add LLM Call Count Reset Logic
- [x] Reset llmCallCount to 0 when receiving HUMAN/human/user messages
- [x] Reset llmCallCount to 0 when receiving system/world messages
- [x] Ensure reset happens before turn limit check to allow immediate response
- [x] Add debug logging for reset events

### Step 6: Update Agent Persistence
- [x] Ensure llmCallCount and lastLLMCall are saved with agent state
- [x] Update agent loading to handle missing fields gracefully
- [x] Test agent persistence and loading with new fields

### Step 7: Update Related Components
- [x] Update any code that references Agent.metadata to use direct Agent properties
- [x] Update agent status display/logging to include LLM call information
- [x] Ensure CLI commands work with updated Agent interface

### Step 8: Add Testing and Validation
- [x] Test turn limit logic with new LLM call counting
- [x] Test reset behavior with human/system messages
- [x] Test agent persistence with new fields
- [x] Validate backward compatibility with existing agent data

## Technical Details

### New Agent Interface Structure
```typescript
export interface Agent {
  name: string;
  type: string;
  status?: 'active' | 'inactive' | 'error';
  config: AgentConfig;
  createdAt?: Date;
  lastActive?: Date;
  llmCallCount: number;
  lastLLMCall?: Date;
}
```

### Turn Limit Logic Flow
1. Check if llmCallCount >= TURN_LIMIT
2. If true, send turn limit message and return false
3. If false, proceed with normal response logic
4. Reset llmCallCount when human/system message received
5. Increment llmCallCount before each LLM call

### Reset Conditions
- Message sender is 'HUMAN', 'human', or 'user'
- Message sender is 'system' or 'world'
- Turn limit message is sent (to prevent immediate re-triggering)

## Dependencies
- types.ts: Agent interface updates
- agent.ts: Turn limit logic and LLM call tracking
- world.ts or agent-manager.ts: Agent creation/loading
- Storage layer: Agent persistence with new fields

## Testing Requirements
- Unit tests for turn limit logic with LLM call counting
- Integration tests for agent persistence with new fields
- Backward compatibility tests with existing agent data
- Turn limit reset behavior validation
