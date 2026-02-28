# Architecture Plan: LLM Provider Refactoring

**Date:** 2025-11-08  
**Status:** Draft  
**Related:** message-process-flow.md

---

## Overview

Refactor LLM providers to be pure data transformers and move tool execution orchestration to events.ts. This addresses two architectural issues:

1. **Inconsistent return types**: Providers return either `string` or `{ type: 'approval_flow', ... }` object
2. **Misplaced responsibilities**: Providers execute tools and handle approval logic (should be in events.ts)

### Critical Constraints

1. **SSE Completion**: Must wait for SSE streaming to complete before processing tool calls (no partial processing)
2. **Single Tool Call**: Current implementation only supports ONE tool call per LLM response (OpenAI can return multiple, but we'll only process first)
3. **Iterative Flow**: Use loop (while) instead of recursion for tool execution cycles

---

## Current Architecture Problems

### Problem 1: Mixed Return Types

**Current Code:**
```typescript
// openai-direct.ts
async function streamOpenAIResponse(): Promise<string | { type: 'approval_flow', ... }> {
  // ... normal response
  return fullResponse; // string
  
  // ... or approval flow
  return {
    type: 'approval_flow',
    originalMessage: {...},
    approvalMessage: {...}
  };
}
```

**Issues:**
- Callers must check `typeof response === 'string'` or `response.type === 'approval_flow'`
- Type checking scattered in events.ts, llm-manager.ts
- Unclear API contract
- Poor type safety

### Problem 2: Providers Do Too Much

**Current Flow:**
```
Provider:
  ├─ Call LLM API ✅ (correct)
  ├─ Stream chunks ✅ (correct)
  ├─ Detect tool calls ❌ (should be in events.ts)
  ├─ Execute tools ❌ (should be in events.ts)
  ├─ Handle approval logic ❌ (should be in events.ts)
  └─ Create approval flow object ❌ (should be in events.ts)
```

**Issues:**
- Violates separation of concerns
- Tool execution duplicated in 3 providers (openai, anthropic, google)
- Approval logic duplicated in 3 providers
- Hard to test providers in isolation
- Adding new providers requires duplicating tool/approval logic

---

## Target Architecture

### 1. Unified Response Type

**Define explicit response structure:**

```typescript
// core/types.ts

/**
 * Unified LLM response structure
 * Providers always return this type, never raw strings
 */
export type LLMResponse = {
  type: 'text' | 'tool_calls';
  
  // For text responses
  content?: string;
  
  // For tool call responses
  messages?: Array<{
    role: 'assistant' | 'user' | 'tool';
    content: string;
    tool_calls?: Array<{
      id: string;
      type: 'function';
      function: {
        name: string;
        arguments: string;
      };
    }>;
    tool_call_id?: string;
  }>;
  
  // Metadata
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
};
```

**Benefits:**
- ✅ Explicit type contract
- ✅ No `typeof` checks needed
- ✅ Easy to extend (add new types)
- ✅ Better TypeScript support

### 2. Simplified Provider Responsibilities

**Providers become pure data transformers:**

```typescript
// openai-direct.ts
export async function streamOpenAIResponse(
  client: OpenAI,
  model: string,
  messages: any[],
  agent: Agent,
  world: World,
  onChunk: (content: string) => void,
  messageId: string
): Promise<LLMResponse> {
  // 1. Call LLM API
  const stream = await client.chat.completions.create({
    model,
    messages,
    stream: true
  });

  // 2. Stream chunks
  let fullContent = '';
  let toolCalls: any[] = [];
  
  for await (const chunk of stream) {
    if (chunk.choices[0]?.delta?.content) {
      const content = chunk.choices[0].delta.content;
      fullContent += content;
      onChunk(content);
    }
    
    if (chunk.choices[0]?.delta?.tool_calls) {
      // Accumulate tool calls
      toolCalls = mergeToolCalls(toolCalls, chunk.choices[0].delta.tool_calls);
    }
  }

  // 3. Return unified response (NO tool execution)
  if (toolCalls.length > 0) {
    return {
      type: 'tool_calls',
      messages: [{
        role: 'assistant',
        content: fullContent,
        tool_calls: toolCalls
      }],
      usage: { inputTokens: 0, outputTokens: 0 } // Parse from response
    };
  }

  return {
    type: 'text',
    content: fullContent,
    usage: { inputTokens: 0, outputTokens: 0 }
  };
}
```

**What providers NO LONGER do:**
- ❌ Execute tools
- ❌ Check approvals
- ❌ Handle tool results
- ❌ Recursive LLM calls
- ❌ Create approval flow objects

### 3. Tool Execution in events.ts

**events.ts orchestrates tool execution:**

```typescript
// events.ts: processAgentMessage()

export async function processAgentMessage(
  world: World,
  agent: Agent,
  messageEvent: WorldMessageEvent | null = null
): Promise<void> {
  const completeActivity = beginWorldActivity(world, `agent:${agent.id}`);
  
  try {
    // ITERATIVE FLOW: Use while-loop instead of recursion
    // Why? Tool execution may trigger another LLM call (with tool results).
    //      Instead of calling processAgentMessage recursively (stack overflow risk),
    //      we loop until we get a final text response or need user approval.
    // Example: LLM → tool_call → execute tool → LLM (with result) → tool_call → execute → LLM (with result) → text
    let done = false;
    let iterations = 0;
    const MAX_ITERATIONS = 10; // Prevent infinite loops
    
    while (!done && iterations < MAX_ITERATIONS) {
      iterations++;
      
      loggerAgent.debug('LLM iteration', {
        agentId: agent.id,
        iteration: iterations,
        memoryLength: agent.memory.length
      });
      
      // 1. Prepare messages (loads fresh from storage)
      const messages = await prepareMessagesForLLM(world.id, agent, world.currentChatId);
      
      // 2. Call LLM (waits for SSE to complete)
      let llmResponse: LLMResponse;
      try {
        llmResponse = await callLLM(world, agent, messages);
      } catch (error) {
        loggerAgent.error('LLM call failed', {
          agentId: agent.id,
          iteration: iterations,
          error: error instanceof Error ? error.message : error
        });
        
        // Emit error event
        publishEvent(world, 'system', {
          message: `[Error] LLM call failed: ${error instanceof Error ? error.message : String(error)}`,
          type: 'error'
        });
        
        throw error; // Propagate error
      }
      
      // 3. Handle response based on type
      if (llmResponse.type === 'text') {
        // Text response - save and publish
        await handleTextResponse(world, agent, llmResponse, messageEvent);
        done = true; // Exit loop
        
      } else if (llmResponse.type === 'tool_calls') {
        // Tool calls - execute with approval checking
        const needsApproval = await handleToolCalls(world, agent, llmResponse, messageEvent);
        
        if (needsApproval) {
          // Approval required - stop loop and wait for user
          done = true;
        }
        // Otherwise continue loop (tool result added to memory, call LLM again)
      }
    }
    
    if (iterations >= MAX_ITERATIONS) {
      loggerAgent.error('Max iterations reached', {
        agentId: agent.id,
        maxIterations: MAX_ITERATIONS
      });
      
      publishEvent(world, 'system', {
        message: `[Error] Agent ${agent.id} exceeded maximum LLM iterations (${MAX_ITERATIONS})`,
        type: 'error'
      });
    }
    
  } catch (error) {
    loggerAgent.error('Agent failed to process message', {
      agentId: agent.id,
      error: error instanceof Error ? error.message : error
    });
    throw error;
  } finally {
    completeActivity();
  }
}

async function handleToolCalls(
  world: World,
  agent: Agent,
  llmResponse: LLMResponse,
  triggeringMessage: WorldMessageEvent | null
): Promise<boolean> { // Returns true if approval required (should stop processing)
  const assistantMessage = llmResponse.messages![0];
  const toolCalls = assistantMessage.tool_calls!;
  
  // LIMITATION: Only process FIRST tool call
  // OpenAI can return multiple tool calls, but current architecture supports one at a time
  // TODO: Support multiple tool calls in future iteration
  if (toolCalls.length > 1) {
    loggerAgent.warn('Multiple tool calls detected, only processing first', {
      agentId: agent.id,
      toolCallCount: toolCalls.length,
      toolNames: toolCalls.map(tc => tc.function.name)
    });
  }
  
  const toolCall = toolCalls[0]; // Process only first tool call
  const toolName = toolCall.function.name;
  const toolArgs = JSON.parse(toolCall.function.arguments);
  
  // Save original assistant message with tool calls
  const originalMessageId = generateId();
  agent.memory.push({
    role: 'assistant',
    content: assistantMessage.content,
    tool_calls: [toolCall], // Only include first tool call
    messageId: originalMessageId,
    replyToMessageId: triggeringMessage?.messageId,
    chatId: world.currentChatId,
    agentId: agent.id,
    sender: agent.id,
    createdAt: new Date()
  });
  
  // Emit original message event
  world.eventEmitter.emit('message', {
    sender: agent.id,
    content: assistantMessage.content,
    messageId: originalMessageId,
    chatId: world.currentChatId,
    role: 'assistant',
    tool_calls: [toolCall],
    timestamp: new Date()
  });
  
  // Get MCP tools
  const mcpTools = await getMCPToolsForWorld(world.id);
  const tool = mcpTools[toolName];
  
  if (!tool) {
    loggerAgent.error('Tool not found', { toolName, agentId: agent.id });
    // Add error result to memory
    agent.memory.push({
      role: 'tool',
      content: `Error: Tool '${toolName}' not found`,
      tool_call_id: toolCall.id,
      messageId: generateId(),
      chatId: world.currentChatId,
      agentId: agent.id,
      sender: 'tool',
      createdAt: new Date()
    });
    return false; // Continue processing (LLM will see error)
  }
  
  try {
    // Execute with approval checking (wrapped by tool-utils.ts)
    const context = {
      agentId: agent.id,
      worldId: world.id,
      chatId: world.currentChatId,
      world,
      workingDirectory: process.cwd()
    };
    
    const result = await tool.execute(toolArgs, context);
    
    // Check if approval is required
    if (result && typeof result === 'object' && result._stopProcessing) {
      // Tool requires approval
      await handleApprovalRequest(
        world,
        agent,
        result._approvalMessage,
        originalMessageId,
        toolCall.id
      );
      return true; // Stop processing, wait for user approval
    }
    
    // Tool executed successfully - add result to memory
    agent.memory.push({
      role: 'tool',
      content: typeof result === 'string' ? result : JSON.stringify(result),
      tool_call_id: toolCall.id,
      messageId: generateId(),
      chatId: world.currentChatId,
      agentId: agent.id,
      sender: 'tool',
      createdAt: new Date()
    });
    
    // Save agent with tool result
    const storage = await getStorageWrappers();
    await storage.saveAgent(world.id, agent);
    
    return false; // Continue processing (no approval needed)
    
  } catch (error) {
    // Tool execution failed
    loggerAgent.error('Tool execution failed', {
      agentId: agent.id,
      toolName,
      error: error instanceof Error ? error.message : error
    });
    
    // Add error result to memory
    agent.memory.push({
      role: 'tool',
      content: `Error executing tool: ${error instanceof Error ? error.message : String(error)}`,
      tool_call_id: toolCall.id,
      messageId: generateId(),
      chatId: world.currentChatId,
      agentId: agent.id,
      sender: 'tool',
      createdAt: new Date()
    });
    
    return false; // Continue processing (LLM will see error)
  }
}

async function handleApprovalRequest(
  world: World,
  agent: Agent,
  approvalMessage: any,
  originalMessageId: string,
  toolCallId: string
): Promise<void> {
  // Save approval request to memory
  const approvalMessageId = generateId();
  agent.memory.push({
    role: 'assistant',
    content: approvalMessage.content || '',
    tool_calls: approvalMessage.tool_calls,
    messageId: approvalMessageId,
    replyToMessageId: originalMessageId,
    chatId: world.currentChatId,
    agentId: agent.id,
    sender: agent.id,
    createdAt: new Date(),
    toolCallStatus: approvalMessage.toolCallStatus
  });
  
  // Save agent
  const storage = await getStorageWrappers();
  await storage.saveAgent(world.id, agent);
  
  // Emit approval request event (UI will display)
  world.eventEmitter.emit('message', {
    sender: agent.id,
    content: approvalMessage.content,
    messageId: approvalMessageId,
    chatId: world.currentChatId,
    role: 'assistant',
    tool_calls: approvalMessage.tool_calls,
    toolCallStatus: approvalMessage.toolCallStatus,
    replyToMessageId: originalMessageId,
    timestamp: new Date()
  });
}

async function handleTextResponse(
  world: World,
  agent: Agent,
  llmResponse: LLMResponse,
  triggeringMessage: WorldMessageEvent
): Promise<void> {
  let finalResponse = llmResponse.content!;
  
  // Apply auto-mention logic
  finalResponse = removeSelfMentions(finalResponse, agent.id);
  if (shouldAutoMention(finalResponse, triggeringMessage.sender, agent.id)) {
    finalResponse = addAutoMention(finalResponse, triggeringMessage.sender);
  }
  
  // Save to memory
  const messageId = generateId();
  agent.memory.push({
    role: 'assistant',
    content: finalResponse,
    messageId,
    replyToMessageId: triggeringMessage.messageId,
    chatId: world.currentChatId,
    agentId: agent.id,
    sender: agent.id,
    createdAt: new Date()
  });
  
  // Save agent
  const storage = await getStorageWrappers();
  await storage.saveAgent(world.id, agent);
  
  // Publish message
  publishMessageWithId(world, finalResponse, agent.id, messageId, world.currentChatId, triggeringMessage.messageId);
}
```

---

## Implementation Plan

### Phase 1: Define Types ✓

- [ ] Add `LLMResponse` type to `core/types.ts`
- [ ] Export type from `core/index.ts`
- [ ] Update provider function signatures

**Files to modify:**
- `core/types.ts` - Add LLMResponse type
- `core/openai-direct.ts` - Change return type
- `core/anthropic-direct.ts` - Change return type
- `core/google-direct.ts` - Change return type

### Phase 2: Simplify Providers ✓

Remove tool execution logic from providers:

- [ ] `openai-direct.ts`: Remove tool execution loop, return `LLMResponse`
- [ ] `anthropic-direct.ts`: Remove tool execution loop, return `LLMResponse`
- [ ] `google-direct.ts`: Remove tool execution loop, return `LLMResponse`

**What to remove from each provider:**
- Tool call detection logic → Return tool_calls in response
- `tool.execute()` calls → Move to events.ts
- `result._stopProcessing` checks → Move to events.ts
- Approval flow object creation → Move to events.ts
- Recursive LLM calls with tool results → Move to events.ts

**What to keep in providers:**
- LLM API calls
- Streaming with onChunk callback
- Response accumulation
- Usage/token tracking

### Phase 3: Move Tool Orchestration to events.ts ✓

- [ ] Create `handleToolCalls()` in events.ts
- [ ] Create `handleApprovalRequest()` in events.ts
- [ ] Create `handleTextResponse()` in events.ts
- [ ] Update `processAgentMessage()` to route by response type
- [ ] Update `resumeLLMAfterApproval()` to use new flow

**Key changes:**
- Tool execution happens in events.ts, not providers
- Approval detection happens in events.ts, not providers
- Recursive LLM calls happen in events.ts, not providers

### Phase 4: Update llm-manager.ts ✓

- [ ] Update `streamAgentResponse()` to return `LLMResponse`
- [ ] Update `generateAgentResponse()` to return `LLMResponse`
- [ ] Remove type checking logic (no more `typeof response === 'string'`)

**Files to modify:**
- `core/llm-manager.ts` - Update return types and remove type checks

### Phase 5: Update events.ts Callers ✓

- [ ] Update all `typeof response === 'string'` checks
- [ ] Update all `response.type === 'approval_flow'` checks
- [ ] Use `llmResponse.type === 'text' | 'tool_calls'` instead

**Files to modify:**
- `core/events.ts` - Update processAgentMessage, resumeLLMAfterApproval

### Phase 6: Update Tests ✓

- [ ] Update provider tests to expect `LLMResponse`
- [ ] Update integration tests for new flow
- [ ] Add tests for tool execution in events.ts
- [ ] Verify approval flow still works

**Test files to update:**
- `tests/core/*.test.ts` - Provider tests
- `tests/integration/*.ts` - Integration tests
- `tests/e2e/*.ts` - E2E approval tests

### Phase 7: Update Documentation ✓

- [ ] Update `message-process-flow.md` to reflect new architecture
- [ ] Update provider documentation
- [ ] Update architecture diagrams

---

## Benefits

### Architectural Improvements

1. **Clear separation of concerns:**
   - Providers: Pure data transformation (LLM API ↔ LLMResponse)
   - events.ts: Orchestration (tool execution, approval flow, state management)

2. **Consistent API:**
   - All providers return same type (`LLMResponse`)
   - No type checking needed
   - Clear contract for callers

3. **Easier to maintain:**
   - Tool execution logic in ONE place (events.ts)
   - Approval logic in ONE place (events.ts)
   - Adding new providers = implement LLM API calls only

4. **Better testability:**
   - Providers testable in isolation (no tool mocking needed)
   - Tool execution testable separately
   - Approval flow testable separately

5. **Type safety:**
   - Explicit types eliminate runtime type checks
   - TypeScript can catch type errors at compile time
   - Better IDE autocomplete

### Code Reduction

Estimated lines of code removed:
- `openai-direct.ts`: ~150 lines (tool execution loop)
- `anthropic-direct.ts`: ~150 lines (tool execution loop)
- `google-direct.ts`: ~150 lines (tool execution loop)
- `events.ts`: ~50 lines (type checking logic)

**Total: ~500 lines removed, replaced with ~200 lines in events.ts**

**Net reduction: ~300 lines**

---

## Migration Strategy

### Backward Compatibility

To avoid breaking existing code during migration:

1. **Create new functions first:**
   - `streamOpenAIResponseV2()` with new signature
   - `handleToolCallsNew()` in events.ts
   - Keep old functions temporarily

2. **Migrate gradually:**
   - Switch one provider at a time
   - Run tests after each provider
   - Keep old code until all providers migrated

3. **Remove old code:**
   - After all tests pass, remove old functions
   - Remove old type checks
   - Update all documentation

### Rollback Plan

If issues discovered during migration:
- Keep old provider functions (rename to `*_legacy`)
- Add feature flag to toggle between old/new flow
- Investigate issues in isolation
- Fix and re-enable new flow

---

## Risks and Mitigations

### Risk 1: Breaking existing behavior

**Mitigation:**
- Run full test suite after each phase
- Keep E2E approval tests passing
- Test with real LLM providers (not just mocks)

### Risk 2: Performance regression

**Mitigation:**
- Profile tool execution before/after
- Ensure no extra LLM calls introduced
- Monitor token usage in tests

### Risk 3: Approval flow breaks

**Mitigation:**
- Test all approval scenarios:
  - approve_once
  - approve_session
  - deny
  - tool execution errors
  - LLM errors during tool flow

### Risk 4: Infinite loops with iterative flow

**Mitigation:**
- Add MAX_ITERATIONS limit (10)
- Log each iteration
- Emit error event if limit reached
- Monitor in tests

### Risk 5: Multiple tool calls limitation

**Expected Behavior:**
- LLM should request tools **one at a time** (sequential, not parallel)
- Each tool call → execute → LLM sees result → next tool call

**If LLM returns multiple tool calls anyway:**
- We only process FIRST tool call (ignore others)
- Log warning
- LLM will re-request remaining tools in next iteration

**Mitigation:**
- Update system prompts to instruct LLMs: "Request one tool at a time"
- Log warning when multiple tool calls detected
- Document limitation clearly
- Monitor logs to see if this happens frequently

---

## Success Criteria

- [ ] All providers return `LLMResponse` type
- [ ] All tool execution happens in events.ts
- [ ] All approval logic happens in events.ts
- [ ] All tests pass (unit, integration, e2e)
- [ ] No type checking with `typeof response === 'string'`
- [ ] Documentation updated
- [ ] Code review approved
- [ ] No regressions in approval flow
- [ ] SSE completion verified (no partial tool processing)
- [ ] Single tool call limitation documented
- [ ] Iterative flow (no recursion) implemented
- [ ] Error handling for LLM and tool failures
- [ ] Max iteration limit prevents infinite loops
- [ ] Token usage tracked across iterations

---

## Target Message Processing Flow (After Refactoring)

### 1. User Input → System
```
User types message
  ↓
CLI/UI: (varies by interface)
  ↓
events.ts: publishMessage(world, content, sender, chatId)
  ↓
events.ts: world.eventEmitter.emit('message', {...})
```

### 2. Message Event → Agent Processing
```
EventEmitter emits 'message' event
  ↓
events.ts: subscribeAgentToMessages(world, agent) - event handler
  ↓
events.ts: processAgentMessage(world, agent, messageEvent)
  ↓
utils.ts: prepareMessagesForLLM(worldId, agent, chatId)
  ↓  (internally loads fresh data from storage)
  ├─ Storage: loadAgent(worldId, agentId) - fresh system prompt
  └─ Storage: getMemory(worldId, chatId) - conversation history
```

### 3. LLM Call (Streaming Path) - Iterative Loop
```
events.ts: processAgentMessage() - starts iteration loop
  ↓
Iteration Loop: while (!done && iterations < MAX_ITERATIONS)
  ↓
  Iteration N:
    ↓
    utils.ts: prepareMessagesForLLM(worldId, agent, chatId)
    ↓  (loads fresh data including any tool results from previous iteration)
    ├─ Storage: loadAgent(worldId, agentId)
    └─ Storage: getMemory(worldId, chatId)
    ↓
    llm-manager.ts: streamAgentResponse(world, agent, messages, publishSSE)
    ↓
    llm-manager.ts: publishSSE(world, {type: 'start', messageId})
    ↓
    llm-manager.ts: stripCustomFieldsFromMessages(messages)
    ↓
    llm-manager.ts: getMCPToolsForWorld(world.id)
    ↓
    llm-manager.ts: appendToolRulesToSystemMessage(messages, hasMCPTools)
    ↓
    llm-manager.ts: streamOpenAIResponse(client, model, messages, agent, world, onChunk, messageId)
    ↓
    openai-direct.ts: streamOpenAIResponse(...) - provider function
    ↓
    openai-direct.ts: client.chat.completions.create({stream: true})
    ↓
    Loop: for each chunk
      openai-direct.ts: onChunk(delta.content) - callback
        ↓
      llm-manager.ts: publishSSE(world, {type: 'chunk', content})
    ↓
    Wait for stream completion (SSE done)
    ↓
    openai-direct.ts: Return LLMResponse { type: 'text' | 'tool_calls', content, messages, usage }
    ↓
    llm-manager.ts: publishSSE(world, {type: 'end', messageId})
    ↓
    llm-manager.ts: return LLMResponse to events.ts
    ↓
    events.ts: Check response type
    ↓
    ┌─────────────────────┴─────────────────────┐
    │                                           │
    ▼                                           ▼
  [4A: Text Response]                    [4B: Tool Calls]
```

### 4A. Text Response (Final Answer)
```
events.ts: handleTextResponse(world, agent, llmResponse, messageEvent)
  ↓
events.ts: Apply auto-mention logic (removeSelfMentions, addAutoMention)
  ↓
events.ts: agent.memory.push(assistantMessage)
  ↓
Storage: saveAgent(worldId, agent)
  ↓
events.ts: publishMessageWithId(world, response, agent.id, messageId, chatId)
  ↓
events.ts: world.eventEmitter.emit('message', {...})
  ↓
done = true (exit iteration loop)
```

### 4B. Tool Calls (Execute and Continue Loop)
```
events.ts: handleToolCalls(world, agent, llmResponse, messageEvent)
  ↓
events.ts: Extract tool_calls from LLMResponse
  ↓
events.ts: Process FIRST tool call only (log warning if multiple)
  ↓
events.ts: toolName = toolCall.function.name
  ↓
events.ts: toolArgs = JSON.parse(toolCall.function.arguments)
  ↓
events.ts: Save original assistant message with tool_calls to memory
  ↓
events.ts: agent.memory.push({role: 'assistant', tool_calls: [toolCall], ...})
  ↓
events.ts: world.eventEmitter.emit('message', {...}) - emit original
  ↓
events.ts: Check if tool requires approval
  ↓
events.ts: checkToolApproval(world, toolName, toolArgs, agent.memory)
  ↓
  ├─ Check agent.memory: findSessionApproval(agent.memory, toolName, toolArgs)
  └─ Check agent.memory: findOnceApproval(agent.memory, toolName, toolArgs)
  ↓
  ┌─────────────────────┴─────────────────────┐
  │                                           │
  ▼                                           ▼
[Approval Found]                      [No Approval - Need Request]
  │                                           │
  ▼                                           ▼
Execute tool immediately              Create approval request
  │                                           │
  ├─ Get tool from mcpTools                   ├─ Generate approval_id
  ├─ tool.execute(args, context)              ├─ Create client.requestApproval message
  ├─ Save tool result to memory               ├─ agent.memory.push(approvalMessage)
  ├─ Continue loop (done=false)               ├─ Storage: saveAgent(worldId, agent)
  └─ Next iteration with tool result          ├─ world.eventEmitter.emit('message', {...})
                                               └─ Return needsApproval=true (done=true, exit loop)
```

### 5. User Approval Response (Resumes Iteration)
```
User: approve_once / approve_session / deny
  ↓
CLI/UI: publishMessage(world, JSON.stringify({__type: 'tool_result', ...}), 'human', chatId)
  ↓
events.ts: publishMessage()
  ↓
events.ts: world.eventEmitter.emit('message', {...})
  ↓
events.ts: subscribeAgentToMessages() catches event
  ↓
events.ts: parseMessageContent() detects role === 'tool'
  ↓
events.ts: Execute the approved tool NOW (before saving to memory)
  ↓
  ├─ Parse approval decision (approve/deny, once/session)
  ├─ If approved: Execute shell_cmd with actual command
  ├─ Get actual tool result (stdout/stderr/exitCode)
  └─ Create tool result with ACTUAL execution output
  ↓
events.ts: agent.memory.push(toolResultMessage) - with actual result
  ↓
Storage: saveAgent(worldId, agent)
  ↓
events.ts: processAgentMessage(world, agent, null) - Resume iteration
  ↓
[Back to step 3: LLM Call - Next iteration with tool result]
```

### 6. Tool Execution Error Handling
```
events.ts: handleToolCalls() - during tool execution
  ↓
try {
  tool.execute(args, context)
} catch (error) {
  ├─ Log error
  ├─ Create error result message
  ├─ agent.memory.push({role: 'tool', content: 'Error: ...', ...})
  └─ Continue loop (done=false) - LLM sees error and can respond
}
```

---

## Key Differences from Current Implementation

### Provider Responsibilities (CHANGED)
**Before:**
- Providers detect tool calls
- Providers execute tools
- Providers handle approval logic
- Providers create approval_flow objects
- Providers do recursive LLM calls

**After:**
- Providers ONLY call LLM API and stream chunks
- Providers return `LLMResponse { type, content, messages, usage }`
- NO tool execution, NO approval logic, NO recursion
- Pure data transformation

### Approval Flow (CHANGED)
**Before:**
- Approval check happens in tool-utils.ts during tool.execute()
- Provider detects `result._stopProcessing`
- Provider creates approval_flow object
- events.ts handles the approval_flow

**After:**
- Approval check happens in events.ts BEFORE tool execution
- events.ts creates client.requestApproval message directly
- Provider never sees approval logic
- Cleaner separation of concerns

### Iteration Flow (CHANGED)
**Before:**
- Recursive calls to processAgentMessage()
- Tool execution triggers another LLM call recursively
- Risk of stack overflow

**After:**
- Single while-loop in processAgentMessage()
- Tool execution adds result to memory, loop continues
- MAX_ITERATIONS limit prevents infinite loops
- No recursion risk

### Memory Management (CHANGED)
**Before:**
- Memory updates scattered across provider and events.ts
- Approval request saved in subscribeAgentToMessages handler
- Complex state tracking

**After:**
- ALL memory updates in events.ts
- Clear save points: after tool execution, after approval request
- Simpler state management

---

## Timeline Estimate

- **Phase 1 (Types):** 1 hour
- **Phase 2 (Providers):** 3 hours
- **Phase 3 (events.ts):** 4 hours
- **Phase 4 (llm-manager):** 1 hour
- **Phase 5 (Callers):** 2 hours
- **Phase 6 (Tests):** 3 hours
- **Phase 7 (Docs):** 1 hour

**Total: ~15 hours** (2 days of focused work)

---

## Architecture Review (AR) - 2025-11-08

### Critical Issue: Approval Message Cross-Agent Contamination

**Problem Statement:**
Approval messages (tool results with `role: 'tool'`) from users can be picked up by other agents, causing approval state to leak across agents. This violates agent isolation and could lead to unauthorized tool execution.

**Current Behavior:**
1. User approves tool for Agent A → creates tool result message
2. Agent B's `subscribeAgentToMessages()` receives the message event
3. Agent B checks if `targetAgentId === agent.id` (line 834)
4. **BUT**: If user sends approval in a chat, other agents might process it

**Root Causes:**

1. **Insufficient Agent ID Checking in subscribeAgentToMessages()**
   - Current code (line 825-838):
   ```typescript
   if (parsedMessage.role === 'tool' && parsedMessage.tool_call_id) {
     // Checks targetAgentId but doesn't verify ownership of the tool call
     if (targetAgentId !== agent.id) {
       return; // Skip
     }
     // Proceeds to save to memory
   }
   ```
   - Issue: `targetAgentId` comes from `parseMessageContent()` which parses user input, not from the original approval request

2. **Missing Tool Call ID Ownership Verification**
   - Current code saves approval response if `targetAgentId` matches
   - Does NOT verify the `tool_call_id` belongs to THIS agent's memory
   - An agent could fabricate a `targetAgentId` and contaminate another agent

3. **prepareMessagesForLLM Filtering is Agent-Specific (CORRECT)**
   - Current code (utils.ts line 318):
   ```typescript
   const agentMessages = conversationHistory.filter(msg => msg.agentId === agent.id);
   ```
   - ✅ This correctly filters to only THIS agent's messages
   - ✅ Prevents cross-agent contamination in LLM context
   - BUT: The damage is already done if approval was saved to wrong agent's memory

4. **wouldAgentHaveRespondedToHistoricalMessage() Always Includes Tool Messages**
   - Current code (utils.ts line 211-213):
   ```typescript
   // Always include tool messages (they are results from previous interactions)
   if (message.role === 'tool' || message.sender === 'tool') {
     return true;
   }
   ```
   - Issue: This assumes ALL tool messages in agent's memory are relevant
   - If wrong agent saved the approval response, it will be included in LLM context

**Attack Scenario:**
```
1. Agent A creates shell_cmd tool call with tool_call_id='call_123'
2. Agent A creates client.requestApproval with tool_call_id='approval_456'
3. User approves: Sends {"__type":"tool_result", "tool_call_id":"approval_456", "agentId":"AgentB", ...}
4. Agent B's subscribeAgentToMessages() receives event
5. parseMessageContent() extracts targetAgentId='AgentB'
6. Agent B saves approval to ITS memory (wrong agent!)
7. Agent B's prepareMessagesForLLM() includes the approval (agentId check passes)
8. Agent B now has Agent A's approval in context
```

**Solutions:**

### Option 1: Verify Tool Call ID Ownership (RECOMMENDED)

**Changes Required:**
1. In `subscribeAgentToMessages()` (events.ts), before saving approval response:
   - Search `agent.memory` for a message with `tool_call_id` matching the approval response
   - Only save if found (ownership verified)

**Implementation:**
```typescript
// events.ts: subscribeAgentToMessages()
if (parsedMessage.role === 'tool' && parsedMessage.tool_call_id) {
  // Verify tool call ID belongs to THIS agent's memory
  const toolCallExists = agent.memory.some(msg =>
    msg.role === 'assistant' &&
    msg.tool_calls?.some(tc => tc.id === parsedMessage.tool_call_id)
  );

  if (!toolCallExists) {
    loggerAgent.debug('[subscribeAgentToMessages] Skipping tool result - tool_call_id not found in agent memory', {
      agentId: agent.id,
      toolCallId: parsedMessage.tool_call_id
    });
    return; // Not our tool call
  }

  // Proceed with saving (existing code)
  loggerMemory.debug('Saving approval response to agent memory', {
    agentId: agent.id,
    messageId: messageEvent.messageId,
    toolCallId: parsedMessage.tool_call_id,
    targetAgentId
  });
  // ... rest of existing code
}
```

**Pros:**
- ✅ Simple change (5-10 lines)
- ✅ Explicit ownership verification
- ✅ Prevents cross-agent contamination at source
- ✅ No changes to downstream code

**Cons:**
- ❌ Still relies on `targetAgentId` from user input (not fully trusted)

### Option 2: Store Agent ID in Tool Call ID

**Changes Required:**
1. Modify tool call ID generation to include agent ID: `${agent.id}_call_123`
2. Parse agent ID from tool call ID before processing
3. Reject if agent ID doesn't match

**Implementation:**
```typescript
// When creating tool calls (in provider or events.ts)
const toolCallId = `${agent.id}_${generateId()}`;

// In subscribeAgentToMessages()
if (parsedMessage.role === 'tool' && parsedMessage.tool_call_id) {
  const [callAgentId, ...rest] = parsedMessage.tool_call_id.split('_');
  if (callAgentId !== agent.id) {
    return; // Not for this agent
  }
  // Proceed with saving
}
```

**Pros:**
- ✅ Cryptographically clear ownership
- ✅ No memory search needed
- ✅ Works even if tool call not in memory yet

**Cons:**
- ❌ Requires changes to tool call ID generation across providers
- ❌ More invasive (affects 3+ files)
- ❌ Breaks existing tool call IDs (migration needed)

### Option 3: Remove targetAgentId from User Input (SECURE BUT BREAKING)

**Changes Required:**
1. Remove `agentId` field from approval response JSON
2. Match approval responses to agents by searching ALL agents for matching `tool_call_id`
3. Only the agent with the matching tool call ID in memory receives the approval

**Implementation:**
```typescript
// User sends: {"__type":"tool_result", "tool_call_id":"approval_456", "decision":"approve"}
// NO agentId field

// In subscribeAgentToMessages()
if (parsedMessage.role === 'tool' && parsedMessage.tool_call_id) {
  // Search THIS agent's memory for the tool call ID
  const toolCallExists = agent.memory.some(msg =>
    msg.role === 'assistant' &&
    msg.tool_calls?.some(tc => tc.id === parsedMessage.tool_call_id)
  );

  if (!toolCallExists) {
    return; // Not our tool call
  }

  // No targetAgentId check needed - ownership verified by memory search
  // Proceed with saving
}
```

**Pros:**
- ✅ Most secure (no user-controlled agent targeting)
- ✅ Simplifies message format
- ✅ Forces ownership verification

**Cons:**
- ❌ Breaking change to approval response format
- ❌ Requires updating CLI/UI to not send agentId
- ❌ May break existing tests/workflows

### Recommendation

**Implement Option 1 immediately** (verify tool call ID ownership) as a security fix. This prevents the attack scenario with minimal code changes.

**Consider Option 3 for target architecture** (remove targetAgentId from user input) as part of the refactoring plan. This is the cleanest long-term solution and aligns with the "events.ts orchestration" principle.

### Implementation Plan

**Phase 3 Updates (Tool Orchestration):**
- Add tool call ID ownership verification in events.ts
- Remove reliance on user-supplied `targetAgentId` for security decisions
- Use memory search as source of truth for agent ownership

**Testing:**
- Add test: User sends approval with wrong agentId → should be rejected
- Add test: User sends approval for tool call not in agent memory → should be rejected
- Add test: Agent A and Agent B both have tool calls → approval only goes to correct agent

---

### Additional Concerns

1. **Approval Request Saving (Line 770-808)**
   - Current code checks `isForThisAgent = messageEvent.sender === agent.id`
   - ✅ This is correct - approval requests are generated by the agent itself
   - No cross-agent contamination risk here

2. **Tool Call Status Tracking**
   - `toolCallStatus` object tracks completion state
   - Should be agent-specific (already is via `agent.memory`)
   - ✅ No changes needed

3. **findSessionApproval / findOnceApproval**
   - These search `agent.memory` which is already filtered by `agentId`
   - ✅ No cross-agent contamination risk here

4. **Future: Multiple Agents Sharing Chat**
   - Current design: Each agent maintains separate memory
   - Tool approvals are agent-specific (correct)
   - BUT: UI must show which agent is requesting approval
   - Consider adding `ownerAgentId` to approval request message for UI clarity

---

### Auto-Mention Compatibility Analysis

**Question:** Will the proposed security fix (tool call ID ownership verification) break the auto-mention system?

**Answer:** ✅ **No, auto-mention will continue to work correctly.** Here's why:

#### Current Approval Message Flow

1. **Approval Response Entry Point:**
   ```typescript
   // User sends: {"__type":"tool_result", "tool_call_id":"approval_456", "agentId":"AgentA", ...}
   // subscribeAgentToMessages() receives the message event
   ```

2. **Approval Response Handling (Line 825-1035):**
   - Detects `role === 'tool'` with `tool_call_id`
   - Verifies `targetAgentId === agent.id` ✅
   - **PROPOSED FIX**: Add ownership check (tool_call_id exists in agent.memory) ✅
   - Executes approved tool (shell_cmd)
   - Saves approval response to `agent.memory`
   - Calls `resumeLLMAfterApproval()` → **Does NOT trigger shouldAgentRespond()** ✅
   - **Returns early** (line 1036) → **Bypasses auto-mention logic** ✅

3. **Auto-Mention Logic Location (Line 1442-1444):**
   ```typescript
   // Only called from processAgentMessage() after LLM response
   let finalResponse = removeSelfMentions(response, agent.id);
   if (shouldAutoMention(finalResponse, messageEvent.sender, agent.id)) {
     finalResponse = addAutoMention(finalResponse, messageEvent.sender);
   }
   ```

4. **Key Insight:**
   - Approval responses are **NOT processed by `processAgentMessage()`**
   - Approval responses are **NOT checked by `shouldAgentRespond()`**
   - Approval responses **trigger `resumeLLMAfterApproval()` directly**
   - Auto-mention only applies to **LLM-generated text responses**, not approval messages

#### Why Auto-Mention Doesn't Apply to Approval Messages

**Approval Response Path:**
```
User approval → subscribeAgentToMessages() 
  → Parse as tool result (role='tool')
  → Verify targetAgentId (CURRENT)
  → [PROPOSED] Verify tool_call_id ownership
  → Execute tool
  → Save to memory
  → resumeLLMAfterApproval()
  → RETURN (line 1036)
  ❌ Never reaches shouldAgentRespond()
  ❌ Never reaches processAgentMessage()
  ❌ Never reaches auto-mention logic
```

**Normal LLM Response Path:**
```
User message → subscribeAgentToMessages()
  → shouldAgentRespond() checks mentions
  → saveIncomingMessageToMemory()
  → processAgentMessage()
  → Call LLM
  → Get response string
  → Apply auto-mention logic (line 1442-1444)
  ✅ Auto-mention adds @sender if needed
  → Publish response
```

#### shouldAutoMention() Logic

```typescript
export function shouldAutoMention(response: string, sender: string, agentId: string): boolean {
  if (!response?.trim() || !sender || !agentId) return false;
  if (determineSenderType(sender) === SenderType.HUMAN) return false;  // ← KEY CHECK
  if (sender.toLowerCase() === agentId.toLowerCase()) return false;
  return getValidMentions(response, agentId).length === 0;
}
```

**Critical Observation:**
- Line 709: `if (determineSenderType(sender) === SenderType.HUMAN) return false;`
- Approval responses come from **HUMAN** users
- Even if approval responses reached `shouldAutoMention()`, it would return `false`
- **Auto-mention is explicitly disabled for HUMAN messages**

#### Conclusion

✅ **The proposed security fix is SAFE for auto-mention:**

1. **Approval messages bypass auto-mention logic** (early return at line 1036)
2. **Auto-mention explicitly skips HUMAN messages** (line 709)
3. **Adding tool_call_id ownership check** only makes the system MORE secure
4. **No changes to message routing** - approval responses still target correct agent
5. **resumeLLMAfterApproval() generates new LLM response** which WILL apply auto-mention

#### Testing Recommendation

Add test case to verify:
```typescript
test('Approval response does not trigger auto-mention', async () => {
  // Agent A requests approval for shell_cmd
  // User approves with {"__type":"tool_result", "tool_call_id":"...", ...}
  // Verify:
  // 1. Approval response saved to Agent A memory only
  // 2. No auto-mention added to approval response
  // 3. Agent B does NOT see the approval in its memory
  // 4. LLM response AFTER approval DOES apply auto-mention
});
```

---

### Better Approval Submission Mechanism

**Current Problem:**
Users submit approval responses as **string-encoded JSON** via `publishMessage()`:
```typescript
// Current approach (CLI, line 267-281)
const enhancedMessage = JSON.stringify({
  __type: 'tool_result',
  tool_call_id: toolCallId,
  agentId: agentId,
  content: JSON.stringify({
    decision: 'approve',
    scope: 'session',
    toolName: 'shell_cmd'
  })
});
publishMessage(world, enhancedMessage, 'human');
```

**Issues with Current Approach:**
1. ❌ **Double-encoding**: `content` is JSON stringified twice (nested JSON)
2. ❌ **String-based protocol**: Type-unsafe, requires parsing at multiple layers
3. ❌ **Mixed concerns**: Uses message event for structured tool results
4. ❌ **Parsing overhead**: Every agent receives event and must parse JSON to detect tool results
5. ❌ **Error-prone**: Manual JSON construction in CLI/UI code
6. ❌ **Inconsistent**: `WorldMessageEvent.content` is `string`, but approval responses are structured data

**Why Current Design Exists:**
- `WorldMessageEvent` was designed for text messages (`content: string`)
- Approval responses piggyback on message events to reuse existing infrastructure
- `parseMessageContent()` extracts structured data from JSON strings (enhanced protocol)
- Works but violates type safety and semantic clarity

---

### Recommended Solutions

#### Option 1: Dedicated Approval Event Type (RECOMMENDED)

**Create new event type for tool results:**

```typescript
// core/types.ts - NEW type
export interface WorldToolResultEvent {
  tool_call_id: string;
  agentId: string;          // Target agent for this result
  decision: 'approve' | 'deny';
  scope?: 'once' | 'session';
  toolName: string;
  toolArgs?: Record<string, any>;
  workingDirectory?: string;
  sender: string;           // User who approved/denied
  timestamp: Date;
  messageId: string;
  chatId?: string | null;
}

// Add to EventType enum
export enum EventType {
  MESSAGE = 'message',
  SSE = 'sse',
  TOOL = 'tool',
  SYSTEM = 'system',
  CRUD = 'crud',
  TOOL_RESULT = 'tool-result'  // NEW
}
```

**Usage in CLI:**

```typescript
// cli/index.ts - IMPROVED
const { publishToolResult } = await import('../core/events.js');
publishToolResult(world, {
  tool_call_id: toolCallId,
  agentId: agentId,
  decision: approvalDecision,
  scope: approvalScope,
  toolName: toolName,
  toolArgs: toolArgs,
  workingDirectory: workingDirectory
});
```

**Event handler in events.ts:**

```typescript
// core/events.ts - NEW function
export function publishToolResult(world: World, result: Omit<WorldToolResultEvent, 'sender' | 'timestamp' | 'messageId'>): WorldToolResultEvent {
  const event: WorldToolResultEvent = {
    ...result,
    sender: 'human',
    timestamp: new Date(),
    messageId: generateId()
  };
  
  world.eventEmitter.emit('tool-result', event);
  return event;
}

// subscribeAgentToMessages() - ADD handler
const toolResultHandler = async (event: WorldToolResultEvent) => {
  if (event.agentId !== agent.id) {
    return; // Not for this agent
  }
  
  // Verify tool call ID ownership
  const toolCallExists = agent.memory.some(msg =>
    msg.role === 'assistant' &&
    msg.tool_calls?.some(tc => tc.id === event.tool_call_id)
  );
  
  if (!toolCallExists) {
    loggerAgent.debug('Skipping tool result - tool_call_id not found', {
      agentId: agent.id,
      toolCallId: event.tool_call_id
    });
    return;
  }
  
  // Execute tool, save result, resume LLM
  // ... (existing logic from line 890-1035)
};

world.eventEmitter.on('tool-result', toolResultHandler);
```

**Pros:**
- ✅ **Type-safe**: No JSON parsing, compile-time type checking
- ✅ **Semantic clarity**: Tool results are not text messages
- ✅ **No double-encoding**: Direct object structure
- ✅ **Efficient**: Only target agent processes event (agentId check first)
- ✅ **Easier testing**: Can emit events directly in tests
- ✅ **Better errors**: TypeScript catches missing fields
- ✅ **Clear API**: `publishToolResult()` vs `publishMessage(JSON.stringify(...))`

**Cons:**
- ❌ **Breaking change**: CLI/UI need updates
- ❌ **New event channel**: Adds complexity to event system
- ❌ **Migration needed**: Existing approval workflows break

---

#### Option 2: Extend WorldMessageEvent with Structured Payload

**Add optional structured payload to WorldMessageEvent:**

```typescript
// core/types.ts - MODIFIED
export interface WorldMessageEvent {
  content: string;          // Keep for backward compatibility
  sender: string;
  timestamp: Date;
  messageId: string;
  chatId?: string | null;
  replyToMessageId?: string;
  
  // NEW: Structured payload for non-text messages
  payload?: {
    type: 'tool_result' | 'system_command' | /* future types */;
    data: any;
  };
}
```

**Usage:**

```typescript
// cli/index.ts - IMPROVED
publishMessage(world, '', 'human', undefined, undefined, {
  payload: {
    type: 'tool_result',
    data: {
      tool_call_id: toolCallId,
      agentId: agentId,
      decision: approvalDecision,
      scope: approvalScope,
      toolName: toolName
    }
  }
});
```

**Handler:**

```typescript
// events.ts - subscribeAgentToMessages()
if (messageEvent.payload?.type === 'tool_result') {
  const data = messageEvent.payload.data;
  // Type-safe access to tool result data
  if (data.agentId !== agent.id) return;
  // ... process approval
}
```

**Pros:**
- ✅ **Backward compatible**: Existing messages still work
- ✅ **Type-safe**: Payload is structured
- ✅ **No new event type**: Uses existing infrastructure
- ✅ **Gradual migration**: Can support both old and new formats

**Cons:**
- ❌ **Semantic confusion**: Messages are still "messages" even for tool results
- ❌ **Dual format**: `content` string vs `payload` object creates ambiguity
- ❌ **Less discoverable**: Harder to find tool result handling code

---

#### Option 3: publishMessage Overload with Type Discrimination

**Type-safe overloads:**

```typescript
// core/events.ts - NEW overloads
export function publishMessage(world: World, content: string, sender: string, chatId?: string | null, replyToMessageId?: string): WorldMessageEvent;

export function publishMessage(world: World, toolResult: ToolResultData, sender: string): WorldMessageEvent;

export function publishMessage(world: World, contentOrData: string | ToolResultData, sender: string, chatId?: string | null, replyToMessageId?: string): WorldMessageEvent {
  if (typeof contentOrData === 'string') {
    // Existing string message logic
    // ...
  } else {
    // Tool result logic
    const toolResult = contentOrData;
    const messageEvent: WorldMessageEvent = {
      content: JSON.stringify({ __type: 'tool_result', ...toolResult }),
      sender,
      timestamp: new Date(),
      messageId: generateId(),
      chatId: toolResult.chatId,
      // ... internal marker for fast detection
      _toolResult: toolResult
    };
    world.eventEmitter.emit('message', messageEvent);
    return messageEvent;
  }
}
```

**Pros:**
- ✅ **Type-safe at call site**: TypeScript enforces correct parameters
- ✅ **Single entry point**: No new function to learn
- ✅ **Backward compatible**: String messages still work

**Cons:**
- ❌ **Still uses message events**: Semantic confusion
- ❌ **Complex overload logic**: Harder to maintain
- ❌ **Hidden behavior**: Not obvious tool results are special

---

### Final Recommendation

**Implement Option 1 (Dedicated Tool Result Event) with Separate Event Handler** ✅

**Key Insight:** Create a **new event channel** (`'client-tool-result'`) with dedicated handler, completely separate from message event handler.

```typescript
// NEW: Clean, simple API
publishClientToolResult(world, 'a1', {
  tool_call_id: toolCallId,
  decision: 'approve',
  scope: 'session',
  toolName: 'shell_cmd',
  toolArgs: {...}
});

// Internal implementation
export function publishClientToolResult(
  world: World, 
  agentId: string, 
  result: ClientToolResultData
): void {
  const event: WorldClientToolResultEvent = {
    agentId,
    ...result,
    sender: 'human',
    timestamp: new Date(),
    messageId: generateId(),
    chatId: world.currentChatId
  };
  
  world.eventEmitter.emit('client-tool-result', event);
}
```

**Why This is Better:**

1. **Separation of Concerns** ✅
   - Message handler: Text messages, mentions, auto-mention logic
   - Tool result handler: Approval flow, tool execution, LLM resume
   - **No mixing** of complicated logic

2. **Simpler Message Handler** ✅
   ```typescript
   // subscribeAgentToMessages() becomes MUCH simpler
   // Remove lines 763-1036 (approval handling)
   // Only handle: shouldAgentRespond(), saveMemory(), processAgentMessage()
   ```

3. **Dedicated Tool Result Handler** ✅
   ```typescript
   // NEW: subscribeAgentToClientToolResults()
   const handler = async (event: WorldClientToolResultEvent) => {
     // 1. Check agentId (immediate filter)
     if (event.agentId !== agent.id) return;
     
     // 2. Verify tool call ID ownership (security fix)
     const toolCallExists = agent.memory.some(msg =>
       msg.role === 'assistant' &&
       msg.tool_calls?.some(tc => tc.id === event.tool_call_id)
     );
     if (!toolCallExists) return;
     
     // 3. Execute tool if approved
     // 4. Save result to memory
     // 5. Resume LLM
   };
   
   world.eventEmitter.on('client-tool-result', handler);
   ```

4. **Type Safety** ✅
   - No `parseMessageContent()` needed
   - No JSON string parsing
   - No `__type` markers
   - Direct object structure

5. **Performance** ✅
   - Only target agent subscribes/processes
   - No broadcast to all agents
   - No string parsing overhead

6. **Clearer Event Semantics** ✅
   ```
   'message'           → Text messages (user, agent, system)
   'client-tool-result' → Tool approvals from client (human)
   'sse'               → Streaming chunks
   'tool'              → Tool execution events
   'crud'              → Entity changes
   ```

7. **Aligns with Refactoring Goals** ✅
   - Providers become pure (no approval logic)
   - events.ts orchestrates tool flow (via dedicated handler)
   - Clean separation between message flow and tool flow

**Architecture Change:**

**Current (Complex):**
```
publishMessage("@a1 {__type:tool_result}") 
  → 'message' event 
  → subscribeAgentToMessages() 
  → Parse content to detect tool result (line 815)
  → Check if role === 'tool' (line 825)
  → Handle approval (line 825-1035)
  → OR handle normal message (line 1047-1059)
```

**Proposed (Clean):**
```
publishClientToolResult('a1', {...}) 
  → 'client-tool-result' event 
  → subscribeAgentToClientToolResults() 
  → Handle approval ONLY (dedicated handler)

publishMessage("Hello agent") 
  → 'message' event 
  → subscribeAgentToMessages() 
  → Handle messages ONLY (no approval logic)
```

**Benefits of Separate Handler:**

| Aspect | Current | Proposed |
|--------|---------|----------|
| Message handler complexity | 300+ lines (messages + approvals) | 150 lines (messages only) |
| Tool result handler | Mixed in | 100 lines (approvals only) |
| Type safety | String parsing required | Structured objects |
| Performance | All agents parse all messages | Only target agent processes |
| Testing | Complex mocking | Easy to test separately |
| Maintainability | Hard to follow logic branches | Clear separation |

**Migration Path:**

**Phase 0 (Preparation):**
- Define `WorldClientToolResultEvent` type
- Add `publishClientToolResult()` function
- Keep existing string-based flow (no breaking changes)

**Phase 1 (New Handler):**
- Create `subscribeAgentToClientToolResults()` handler
- Extract approval logic from `subscribeAgentToMessages()` (lines 825-1035)
- Test new flow with feature flag

**Phase 2 (CLI Update):**
- Update CLI to call `publishClientToolResult()` instead of `publishMessage(JSON.stringify(...))`
- Test approval flow end-to-end

**Phase 3 (Web UI Update):**
- Update web UI/server to use new API
- Test in browser

**Phase 4 (Cleanup):**
- Remove approval handling from `subscribeAgentToMessages()` (lines 763-1036)
- Remove `parseMessageContent()` tool result parsing
- Remove `{"__type": "tool_result"}` format
- Simplify message handler (60% code reduction)

**Phase 5 (Documentation):**
- Update message-process-flow.md
- Update API documentation
- Add migration guide

**Success Criteria:**
- ✅ Message handler < 200 lines
- ✅ Tool result handler fully isolated
- ✅ No string parsing for tool results
- ✅ All existing tests pass
- ✅ Performance improvement (fewer event handlers triggered)

**Backward Compatibility:**
During migration, support both APIs:
```typescript
// OLD (deprecated, still works)
publishMessage(world, '@a1 {"__type":"tool_result"}', 'human');

// NEW (recommended)
publishClientToolResult(world, 'a1', {...});
```

Log deprecation warnings for old format, remove after 2-3 releases.

---

### Implementation Details

#### 1. New Type Definition (core/types.ts)

```typescript
/**
 * Client tool result event - user approval/denial of tool execution
 * Separate from WorldMessageEvent to avoid mixing text messages with structured tool results
 */
export interface WorldClientToolResultEvent {
  agentId: string;              // Target agent for this result
  tool_call_id: string;         // Tool call being approved/denied
  decision: 'approve' | 'deny';
  scope?: 'once' | 'session';   // Approval scope
  toolName: string;             // Tool being approved (e.g., 'shell_cmd')
  toolArgs?: Record<string, any>; // Original tool arguments
  workingDirectory?: string;    // For shell_cmd
  sender: string;               // Always 'human' for client tools
  timestamp: Date;
  messageId: string;
  chatId?: string | null;
}

// Add to EventType enum
export enum EventType {
  MESSAGE = 'message',
  SSE = 'sse',
  TOOL = 'tool',
  SYSTEM = 'system',
  CRUD = 'crud',
  CLIENT_TOOL_RESULT = 'client-tool-result'  // NEW
}
```

#### 2. Publishing Function (core/events.ts)

```typescript
/**
 * Publish client tool result (approval/denial) to specific agent
 * Uses dedicated event channel to avoid mixing with message flow
 * 
 * @param world - World instance
 * @param agentId - Target agent ID
 * @param result - Tool result data (decision, scope, tool info)
 * @returns Event that was published
 * 
 * @example
 * publishClientToolResult(world, 'assistant', {
 *   tool_call_id: 'call_abc123',
 *   decision: 'approve',
 *   scope: 'session',
 *   toolName: 'shell_cmd',
 *   toolArgs: { command: 'ls', parameters: ['-la'] }
 * });
 */
export function publishClientToolResult(
  world: World,
  agentId: string,
  result: Omit<WorldClientToolResultEvent, 'sender' | 'timestamp' | 'messageId' | 'chatId' | 'agentId'>
): WorldClientToolResultEvent {
  const event: WorldClientToolResultEvent = {
    agentId,
    ...result,
    sender: 'human',
    timestamp: new Date(),
    messageId: generateId(),
    chatId: world.currentChatId
  };

  loggerPublish.debug('Publishing client tool result', {
    agentId,
    toolCallId: result.tool_call_id,
    decision: result.decision,
    scope: result.scope,
    toolName: result.toolName
  });

  world.eventEmitter.emit(EventType.CLIENT_TOOL_RESULT, event);

  return event;
}
```

#### 3. Dedicated Event Handler (core/events.ts)

```typescript
/**
 * Subscribe agent to client tool results (approval/denial events)
 * Separate from message subscription to isolate approval flow logic
 * 
 * Responsibilities:
 * - Filter events by agentId (only process events for this agent)
 * - Verify tool call ID ownership (security: prevent cross-agent contamination)
 * - Execute approved tools
 * - Save tool results to agent memory
 * - Resume LLM with tool result in context
 * 
 * @param world - World instance
 * @param agent - Agent to subscribe
 * @returns Cleanup function to unsubscribe
 */
export function subscribeAgentToClientToolResults(world: World, agent: Agent): () => void {
  const handler = async (event: WorldClientToolResultEvent) => {
    // Filter by agentId first (performance optimization)
    if (event.agentId !== agent.id) {
      return; // Not for this agent
    }

    loggerAgent.debug('[ClientToolResult] Agent received tool result', {
      agentId: agent.id,
      toolCallId: event.tool_call_id,
      decision: event.decision,
      scope: event.scope,
      toolName: event.toolName
    });

    // SECURITY: Verify tool call ID ownership
    // Prevents cross-agent approval contamination
    const toolCallExists = agent.memory.some(msg =>
      msg.role === 'assistant' &&
      msg.tool_calls?.some(tc => tc.id === event.tool_call_id)
    );

    if (!toolCallExists) {
      loggerAgent.warn('[ClientToolResult] Tool call ID not found in agent memory', {
        agentId: agent.id,
        toolCallId: event.tool_call_id
      });
      return; // Not our tool call - security check failed
    }

    // Execute tool if approved
    let toolResult = '';
    
    if (event.decision === 'approve' && event.toolName === 'shell_cmd') {
      loggerAgent.debug('[ClientToolResult] Executing approved tool', {
        agentId: agent.id,
        toolName: event.toolName,
        scope: event.scope
      });

      const { executeShellCommand } = await import('./shell-cmd-tool.js');
      const args = event.toolArgs || {};
      const command = args.command || '';
      const parameters = args.parameters || [];
      const directory = args.directory || event.workingDirectory || './';

      const execResult = await executeShellCommand(command, parameters, directory);

      if (execResult.exitCode === 0) {
        toolResult = execResult.stdout || '(command completed successfully with no output)';
      } else {
        toolResult = `Command failed (exit code ${execResult.exitCode}):\n${execResult.stderr || execResult.stdout}`;
      }

      loggerAgent.debug('[ClientToolResult] Tool executed', {
        agentId: agent.id,
        exitCode: execResult.exitCode,
        resultLength: toolResult.length
      });

      // Emit tool-execution event for monitoring
      publishEvent(world, 'tool-execution', {
        agentId: agent.id,
        toolName: event.toolName,
        command,
        parameters,
        directory,
        exitCode: execResult.exitCode,
        chatId: event.chatId
      });
    } else if (event.decision === 'deny') {
      toolResult = 'Tool execution was denied by the user.';
      loggerAgent.debug('[ClientToolResult] Tool denied', {
        agentId: agent.id,
        toolName: event.toolName
      });
    }

    // Save tool result to agent memory
    const toolResultMessage: AgentMessage = {
      role: 'tool',
      content: toolResult,
      sender: event.sender,
      createdAt: event.timestamp,
      chatId: event.chatId,
      messageId: event.messageId,
      tool_call_id: event.tool_call_id,
      agentId: agent.id,
      toolCallStatus: {
        [event.tool_call_id]: {
          complete: true,
          result: {
            decision: event.decision,
            scope: event.scope,
            timestamp: event.timestamp.toISOString()
          }
        }
      }
    };

    agent.memory.push(toolResultMessage);

    // Save agent state
    try {
      const storage = await getStorageWrappers();
      await storage.saveAgent(world.id, agent);
      loggerMemory.debug('[ClientToolResult] Tool result saved to memory', {
        agentId: agent.id,
        messageId: event.messageId
      });
    } catch (error) {
      loggerMemory.error('[ClientToolResult] Failed to save tool result', {
        agentId: agent.id,
        error: error instanceof Error ? error.message : error
      });
      return; // Don't resume LLM if save failed
    }

    // Resume LLM with tool result in context
    loggerAgent.debug('[ClientToolResult] Resuming LLM after tool result', {
      agentId: agent.id,
      chatId: event.chatId
    });

    await resumeLLMAfterApproval(world, agent, event.chatId);
  };

  world.eventEmitter.on(EventType.CLIENT_TOOL_RESULT, handler);

  return () => {
    world.eventEmitter.off(EventType.CLIENT_TOOL_RESULT, handler);
  };
}
```

#### 4. CLI Usage (cli/index.ts)

```typescript
// BEFORE (OLD - String-based)
const enhancedMessage = JSON.stringify({
  __type: 'tool_result',
  tool_call_id: toolCallId,
  agentId: agentId,
  content: JSON.stringify({
    decision: approvalDecision,
    scope: approvalScope,
    toolName: toolName
  })
});
const { publishMessage } = await import('../core/events.js');
publishMessage(world, enhancedMessage, 'human');

// AFTER (NEW - Structured)
const { publishClientToolResult } = await import('../core/events.js');
publishClientToolResult(world, agentId, {
  tool_call_id: toolCallId,
  decision: approvalDecision,
  scope: approvalScope,
  toolName: toolName,
  toolArgs: toolArgs,
  workingDirectory: workingDirectory
});
```

#### 5. Agent Setup (core/managers.ts or wherever agents are subscribed)

```typescript
// Subscribe agent to BOTH message and client tool result events
export function setupAgentSubscriptions(world: World, agent: Agent): () => void {
  const cleanupMessage = subscribeAgentToMessages(world, agent);
  const cleanupToolResult = subscribeAgentToClientToolResults(world, agent);
  
  return () => {
    cleanupMessage();
    cleanupToolResult();
  };
}
```

#### 6. Simplify Message Handler (core/events.ts)

**Remove from subscribeAgentToMessages():**
- Lines 763-808: Approval request saving logic (move to separate function if still needed)
- Lines 815-1036: Tool result handling (replaced by subscribeAgentToClientToolResults)

**Keep in subscribeAgentToMessages():**
- Own message check
- Reset LLM call count
- shouldAgentRespond() logic
- saveIncomingMessageToMemory()
- processAgentMessage()

**Result:** Message handler goes from 300+ lines to ~150 lines

---

### Testing Strategy

#### Unit Tests

```typescript
describe('subscribeAgentToClientToolResults', () => {
  test('processes approval for own agent only', async () => {
    // Agent A and B both subscribed
    // Publish result for Agent A
    // Verify: Only Agent A processes, Agent B ignores
  });

  test('rejects tool call ID not in memory (security)', async () => {
    // Agent receives approval for unknown tool_call_id
    // Verify: Rejected, not executed, not saved
  });

  test('executes tool on approval', async () => {
    // Agent receives approval
    // Verify: Tool executed, result saved, LLM resumed
  });

  test('does not execute tool on denial', async () => {
    // Agent receives denial
    // Verify: Tool NOT executed, denial saved, LLM resumed
  });
});
```

#### Integration Tests

```typescript
describe('Client Tool Result Flow', () => {
  test('end-to-end approval flow', async () => {
    // 1. Agent requests approval (shell_cmd)
    // 2. User approves via publishClientToolResult()
    // 3. Tool executes
    // 4. Result saved to memory
    // 5. LLM resumes with result
    // 6. Agent generates final response
  });

  test('approval does not leak to other agents', async () => {
    // Multiple agents in same chat
    // User approves tool for Agent A
    // Verify: Only Agent A receives and processes
  });
});
```

---

## Next Steps

1. Review this plan with team
2. Get approval to proceed
3. Create feature branch: `refactor/llm-provider-simplification`
4. Implement Phase 1 (Types)
5. Commit after each phase with passing tests

---

## Key Design Decisions

### 1. SSE Completion Requirement

**Decision:** Wait for SSE streaming to complete before processing tool calls.

**Rationale:**
- Simpler state management
- Clear SSE event boundaries (start → chunks → end → tools)
- Prevents partial tool execution during streaming
- Easier to debug and test

**Trade-off:** User sees complete text before tools execute (slight delay perception).

### 2. Single Tool Call Limitation

**Decision:** Process only FIRST tool call when multiple returned.

**How it works:**
- If LLM needs 3 tools, it should request them **one at a time** across multiple iterations
- Iteration 1: LLM requests tool A → execute → add result to memory
- Iteration 2: LLM requests tool B (with A's result in context) → execute → add result to memory
- Iteration 3: LLM requests tool C (with A+B results in context) → execute → add result to memory
- Iteration 4: LLM returns final text response

**What if LLM returns multiple tool calls in ONE response?**
- We only execute the FIRST tool call
- Ignore the rest (log warning)
- Call LLM again with first tool's result
- LLM will re-request remaining tools in subsequent iterations

**Rationale:**
- One tool at a time matches approval flow (user approves ONE action at a time)
- Simpler memory management and state tracking
- Easier to debug and test
- Reduces complexity for initial implementation

**Note:** This is an architecture constraint. LLMs should be instructed (via system prompt) to request tools one at a time.

### 3. Iterative vs Recursive Flow

**Decision:** Use while-loop iteration instead of recursion.

**What it means:**
- When LLM returns tool_call → execute tool → LLM needs to be called again with tool result
- **OLD (Recursive):** `processAgentMessage() → handleToolCalls() → processAgentMessage()` (recursive call)
- **NEW (Iterative):** `processAgentMessage() { while (!done) { callLLM → handleToolCalls } }` (loop)

**Rationale:**
- Prevents stack overflow with many tool calls (e.g., LLM calls tool 5 times in a row)
- Easier to add iteration limits (MAX_ITERATIONS = 10)
- Clearer execution flow and state tracking
- Better logging per iteration

**Example Flow (LLM requests 3 tools sequentially):**
```
Iteration 1: User "list and read file.txt" → LLM → ONE tool_call(ls -la) 
             Execute ls → add result to memory
             
Iteration 2: Memory has ls result → LLM → ONE tool_call(cat file.txt)
             Execute cat → add result to memory
             
Iteration 3: Memory has ls + cat results → LLM → text response "Here's what I found..."
             done=true, exit loop
```

**Important:** Each iteration is a separate LLM call. LLM sees previous tool results and decides next action.

**Implementation:** `while (!done && iterations < MAX_ITERATIONS)`

### 4. Error Handling Strategy

**Decision:** Continue processing on tool errors, send error to LLM.

**Rationale:**
- LLM can see errors and adapt
- More resilient than crashing
- Matches current behavior
- User gets informative response

**Alternative:** Stop on error (could be future option).

### 5. Memory Persistence Timing

**Decision:** Save agent after each tool execution.

**Rationale:**
- Consistent state if process crashes
- Tool results immediately available
- Simpler than transactions

**Trade-off:** Multiple DB writes (acceptable for single tool call).

## Notes

- This refactoring touches core architecture - thorough testing required
- Consider pairing with another developer for review
- Run approval flow tests manually before/after to verify behavior
- Document any deviations from plan in commit messages
- Log warnings when multiple tool calls detected (limitation)
- Monitor iteration counts in production to tune MAX_ITERATIONS
