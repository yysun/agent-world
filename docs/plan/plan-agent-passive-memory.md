# Agent Passive Memory Implementation Plan

## Overview
Update agent message event handling to save all messages to memory while maintaining mention-based LLM processing.

## Implementation Steps

### Step 1: Modify processAgentMessage Function
- [x] **What**: Split message saving from LLM processing logic
- [x] **Where**: `src/agent.ts` - `processAgentMessage` function
- [x] **Details**: 
  - [x] Always save incoming messages to memory regardless of mention status
  - [x] Only proceed with LLM processing when shouldRespondToMessage returns true
  - [x] Maintain existing response logic and auto-mention behavior

### Step 2: Update shouldRespondToMessage Logic
- [x] **What**: Clarify function purpose as LLM processing decision only
- [x] **Where**: `src/agent.ts` - `shouldRespondToMessage` function
- [x] **Details**:
  - [x] Function should only determine LLM processing, not memory saving
  - [x] Keep existing mention-based logic
  - [x] Keep turn limit checking
  - [x] Keep system message handling

### Step 3: Create Separate Memory Saving Logic
- [x] **What**: Extract message saving into independent function
- [x] **Where**: `src/agent.ts` - new function `saveIncomingMessageToMemory`
- [x] **Details**:
  - [x] Always save incoming messages as user messages
  - [x] Include sender information in memory
  - [x] Handle timestamp and formatting consistently
  - [x] Skip saving agent's own messages

### Step 4: Update Message Event Subscription
- [x] **What**: Ensure all agents receive and save all messages
- [x] **Where**: Message event subscription logic
- [x] **Details**:
  - [x] All agents should process all messages for memory saving
  - [x] LLM processing should still be filtered by shouldRespondToMessage
  - [x] Maintain event filtering for appropriate agents

### Step 5: Testing and Validation
- [x] **What**: Verify memory behavior and LLM processing separation
- [x] **Where**: Unit tests and integration tests
- [x] **Details**:
  - [x] Test that all messages are saved to memory
  - [x] Test that only mentioned agents process with LLM
  - [x] Test conversation context is available for future responses
  - [x] Test turn limit behavior is unchanged

## Key Changes

### Before
```
Message → shouldRespondToMessage → if true: save + LLM process
                                → if false: ignore completely
```

### After
```
Message → always save to memory
       → shouldRespondToMessage → if true: LLM process
                                → if false: no LLM process
```

## Files to Modify
- `src/agent.ts` - Main implementation
- `tests/agent.test.ts` - Add tests for new behavior
- Documentation updates as needed

## Dependencies
- Existing memory functions (addToAgentMemory)
- Existing LLM processing logic
- Event system for message distribution

## Risks and Considerations
- Memory storage overhead (all agents save all messages)
- Ensure no performance impact on LLM processing
- Maintain backward compatibility
- Verify turn limit logic works correctly
- Test with multiple agents in conversation
