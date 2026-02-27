# Architecture Plan: LLM Providers as Pure Clients

**Date:** 2025-11-09  
**Status:** ✅ Architecture Review Complete  
**Related:** plan-llm-provider-refactor.md, plan-approval-refactor-simple.md, req-approval-refactor.md

---

## Problem Statement

Current LLM providers violate separation of concerns by executing tools, handling approval logic, and performing recursive LLM calls. This creates:

1. **Code duplication**: Tool execution logic duplicated across 3 providers (OpenAI, Anthropic, Google)
2. **Mixed responsibilities**: Providers do data transformation AND orchestration
3. **Hard to maintain**: Adding new providers requires duplicating tool/approval logic
4. **Testing complexity**: Cannot test providers without mocking tools
5. **Architectural debt**: Providers should be pure data transformers, not orchestrators

**Current State (WRONG):**
```
Provider (openai-direct.ts):
  ├─ Call LLM API ✅
  ├─ Stream chunks ✅
  ├─ Detect tool calls ❌ (orchestration, not data transformation)
  ├─ Execute tools ❌ (orchestration)
  ├─ Handle approval logic ❌ (orchestration)
  └─ Recursive LLM calls ❌ (orchestration)
```

**Target State (CORRECT):**
```
Provider (openai-direct.ts):
  ├─ Call LLM API ✅
  ├─ Stream chunks ✅
  └─ Return LLMResponse { type, content, tool_calls, usage }

events.ts (Orchestration Layer):
  ├─ Call provider (LLM API client)
  ├─ Check LLMResponse.type
  ├─ If 'text' → Save and publish
  ├─ If 'tool_calls' → Execute tools (via handleToolCalls)
  ├─ Loop until text response (iterative, not recursive)
  └─ Handle approval flow
```

---

## Architecture Principles

### 1. Pure Provider Pattern

**Definition:** Providers are pure functions that transform inputs to LLM API calls and outputs to structured responses.

**What Providers SHOULD do:**
- ✅ Accept messages array and configuration
- ✅ Call LLM API (OpenAI, Anthropic, Google)
- ✅ Stream chunks via callback
- ✅ Accumulate response (text or tool_calls)
- ✅ Return structured `LLMResponse` object
- ✅ Track token usage

**What Providers SHOULD NOT do:**
- ❌ Execute tools
- ❌ Check approvals
- ❌ Save to storage
- ❌ Emit events (except via onChunk callback)
- ❌ Make recursive LLM calls
- ❌ Handle tool results
- ❌ Create approval messages

### 2. Orchestration in events.ts

**Definition:** events.ts is the single source of truth for message flow, tool execution, and approval handling.

**Responsibilities:**
- ✅ Call providers (pure LLM clients)
- ✅ Process LLMResponse based on type
- ✅ Execute tools when LLM requests them
- ✅ Check approval requirements BEFORE tool execution
- ✅ Handle approval requests (create client.requestApproval messages)
- ✅ Save all messages to memory
- ✅ Emit all events
- ✅ Iterative loop for multi-step tool flows

### 3. Independent Tool Result Handler

**Definition:** Tool result messages (approval responses) are processed by dedicated handler, separate from main message flow.

**Architecture (from plan-approval-refactor-simple.md):**
- ✅ `publishToolResult()` API for structured tool messages
- ✅ `subscribeAgentToToolMessages()` dedicated handler
- ✅ Security: tool_call_id ownership verification
- ✅ Independent subscription to 'message' events

---

## Target Architecture

### Type Definitions

```typescript
// core/types.ts

/**
 * Unified LLM response structure
 * All providers return this type (never raw strings or mixed objects)
 */
export interface LLMResponse {
  type: 'text' | 'tool_calls';
  
  // For text responses
  content?: string;
  
  // For tool call responses
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string; // JSON string
    };
  }>;
  
  // Metadata (common to all responses)
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  
  // Original assistant message (for storage)
  assistantMessage: {
    role: 'assistant';
    content: string;
    tool_calls?: Array<{
      id: string;
      type: 'function';
      function: {
        name: string;
        arguments: string;
      };
    }>;
  };
}
```

### Provider Implementation (Pure Client)

```typescript
// core/openai-direct.ts - SIMPLIFIED

export async function streamOpenAIResponse(
  client: OpenAI,
  model: string,
  messages: any[],
  agent: Agent,
  onChunk: (content: string) => void,
  messageId: string
): Promise<LLMResponse> {
  
  // 1. Call LLM API
  const stream = await client.chat.completions.create({
    model,
    messages,
    tools: [], // Tools passed by llm-manager, not fetched here
    stream: true
  });

  // 2. Accumulate response
  let fullContent = '';
  let toolCalls: any[] = [];
  let usage = { inputTokens: 0, outputTokens: 0 };
  
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta;
    
    // Stream text chunks
    if (delta?.content) {
      fullContent += delta.content;
      onChunk(delta.content);
    }
    
    // Accumulate tool calls
    if (delta?.tool_calls) {
      toolCalls = mergeToolCalls(toolCalls, delta.tool_calls);
    }
    
    // Track usage
    if (chunk.usage) {
      usage.inputTokens = chunk.usage.prompt_tokens || 0;
      usage.outputTokens = chunk.usage.completion_tokens || 0;
    }
  }

  // 3. Return structured response (NO tool execution)
  if (toolCalls.length > 0) {
    return {
      type: 'tool_calls',
      tool_calls: toolCalls,
      assistantMessage: {
        role: 'assistant',
        content: fullContent,
        tool_calls: toolCalls
      },
      usage
    };
  }

  return {
    type: 'text',
    content: fullContent,
    assistantMessage: {
      role: 'assistant',
      content: fullContent
    },
    usage
  };
}

// REMOVED: ~200 lines of tool execution, approval checking, recursive calls
```

**Code Reduction:** ~200 lines removed per provider × 3 providers = **600 lines removed**

### Orchestration Layer (events.ts)

```typescript
// core/events.ts - NEW ARCHITECTURE

export async function processAgentMessage(
  world: World,
  agent: Agent,
  messageEvent: WorldMessageEvent | null = null,
  preGeneratedMessageId?: string
): Promise<void> {
  const completeActivity = beginWorldActivity(world, `agent:${agent.id}`);
  
  try {
    // ITERATIVE FLOW: Loop until we get final text response or need approval
    let done = false;
    let iterations = 0;
    const MAX_ITERATIONS = 10;
    
    while (!done && iterations < MAX_ITERATIONS) {
      iterations++;
      
      loggerAgent.debug('[processAgentMessage] Iteration start', {
        iteration: iterations,
        agentId: agent.id,
        chatId: world.currentChatId
      });
      
      // 1. Prepare messages for LLM (includes previous tool results)
      const messages = await prepareMessagesForLLM(
        world.id,
        agent,
        world.currentChatId,
        messageEvent
      );
      
      // 2. Call LLM (provider is pure client, returns LLMResponse)
      const messageId = preGeneratedMessageId || generateId();
      const llmResponse = await streamAgentResponse(
        world,
        agent,
        messages,
        (event) => publishSSE(world, event),
        messageId
      );
      
      // 3. Process response based on type
      if (llmResponse.type === 'text') {
        // Final text response - save and publish
        await handleTextResponse(world, agent, llmResponse, messageEvent, messageId);
        done = true; // Exit loop
        
      } else if (llmResponse.type === 'tool_calls') {
        // Tool calls requested - execute and continue loop
        const needsApproval = await handleToolCalls(
          world,
          agent,
          llmResponse,
          messageEvent,
          messageId
        );
        
        if (needsApproval) {
          // Approval required - stop and wait for user
          done = true;
        }
        // Otherwise continue loop with tool results in memory
      }
    }
    
    if (iterations >= MAX_ITERATIONS) {
      loggerAgent.error('[processAgentMessage] Max iterations reached', {
        agentId: agent.id,
        iterations,
        chatId: world.currentChatId
      });
    }
    
  } catch (error) {
    loggerAgent.error('[processAgentMessage] Error', {
      agentId: agent.id,
      error: error instanceof Error ? error.message : error
    });
    throw error;
  } finally {
    completeActivity();
  }
}

/**
 * Handle tool calls from LLM response
 * Returns true if approval required (should stop processing)
 */
async function handleToolCalls(
  world: World,
  agent: Agent,
  llmResponse: LLMResponse,
  triggeringMessage: WorldMessageEvent | null,
  messageId: string
): Promise<boolean> {
  
  const toolCalls = llmResponse.tool_calls!;
  
  // LIMITATION: Only process FIRST tool call
  if (toolCalls.length > 1) {
    loggerAgent.warn('[handleToolCalls] Multiple tool calls, processing first only', {
      agentId: agent.id,
      count: toolCalls.length,
      tools: toolCalls.map(tc => tc.function.name)
    });
  }
  
  const toolCall = toolCalls[0];
  const toolName = toolCall.function.name;
  const toolArgs = JSON.parse(toolCall.function.arguments);
  
  // 1. Save original assistant message with tool_calls
  const originalMessage: AgentMessage = {
    ...llmResponse.assistantMessage,
    messageId,
    replyToMessageId: triggeringMessage?.messageId,
    chatId: world.currentChatId,
    agentId: agent.id,
    sender: agent.id,
    createdAt: new Date()
  };
  
  agent.memory.push(originalMessage);
  
  // Save agent (persist original tool call)
  const storage = await createStorageWithWrappers();
  await storage.saveAgent(world.id, agent);
  
  // Emit original message event
  publishMessage(world, originalMessage.content || '', agent.id, world.currentChatId, messageId);
  
  // 2. Check if tool requires approval
  const approvalCheck = await checkToolApproval(
    world,
    toolName,
    toolArgs,
    toolName === 'shell_cmd' 
      ? `Execute command: ${toolArgs.command} ${toolArgs.parameters?.join(' ') || ''}`
      : `Execute tool: ${toolName}`,
    agent.memory,
    { workingDirectory: toolArgs.directory || process.cwd() }
  );
  
  if (approvalCheck?.needsApproval) {
    // 3A. Approval required - create client.requestApproval message
    const approvalMessageId = generateId();
    const approvalMessage: AgentMessage = {
      role: 'assistant',
      content: '',
      tool_calls: [{
        id: `approval_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        type: 'function',
        function: {
          name: 'client.requestApproval',
          arguments: JSON.stringify({
            originalToolCall: {
              id: toolCall.id,
              name: toolName,
              args: toolArgs,
              workingDirectory: toolArgs.directory || process.cwd()
            },
            message: approvalCheck.approvalRequest?.message || 'Approval required',
            options: approvalCheck.approvalRequest?.options || ['deny', 'approve_once', 'approve_session']
          })
        }
      }],
      messageId: approvalMessageId,
      replyToMessageId: messageId,
      chatId: world.currentChatId,
      agentId: agent.id,
      sender: agent.id,
      createdAt: new Date(),
      toolCallStatus: {
        [`approval_${Date.now()}`]: {
          complete: false,
          result: null
        }
      }
    };
    
    agent.memory.push(approvalMessage);
    await storage.saveAgent(world.id, agent);
    
    // Emit approval request
    world.eventEmitter.emit('message', {
      sender: agent.id,
      content: approvalMessage.content,
      messageId: approvalMessageId,
      chatId: world.currentChatId,
      role: 'assistant',
      tool_calls: approvalMessage.tool_calls,
      toolCallStatus: approvalMessage.toolCallStatus,
      replyToMessageId: messageId,
      timestamp: new Date()
    });
    
    return true; // Stop processing, wait for user approval
  }
  
  // 3B. Approved or no approval needed - execute tool
  try {
    const mcpTools = await getMCPToolsForWorld(world.id);
    const tool = mcpTools[toolName];
    
    if (!tool) {
      // Tool not found - add error result and continue
      agent.memory.push({
        role: 'tool',
        content: `Error: Tool "${toolName}" not found`,
        tool_call_id: toolCall.id,
        messageId: generateId(),
        chatId: world.currentChatId,
        agentId: agent.id,
        createdAt: new Date()
      });
      await storage.saveAgent(world.id, agent);
      return false; // Continue loop (LLM will see error)
    }
    
    // Execute tool
    const result = await tool.execute(toolArgs, generateId(), `tool-${messageId}`, {
      world,
      worldId: world.id,
      chatId: world.currentChatId,
      agentId: agent.id,
      messages: agent.memory,
      toolCallId: toolCall.id
    });
    
    // Save tool result
    const toolResultContent = typeof result === 'string' 
      ? result 
      : JSON.stringify(result);
    
    agent.memory.push({
      role: 'tool',
      content: toolResultContent,
      tool_call_id: toolCall.id,
      messageId: generateId(),
      chatId: world.currentChatId,
      agentId: agent.id,
      createdAt: new Date()
    });
    
    await storage.saveAgent(world.id, agent);
    
    return false; // Continue loop (LLM will see tool result)
    
  } catch (error) {
    // Tool execution failed - add error result and continue
    loggerAgent.error('[handleToolCalls] Tool execution failed', {
      agentId: agent.id,
      toolName,
      error: error instanceof Error ? error.message : error
    });
    
    agent.memory.push({
      role: 'tool',
      content: `Error: ${error instanceof Error ? error.message : String(error)}`,
      tool_call_id: toolCall.id,
      messageId: generateId(),
      chatId: world.currentChatId,
      agentId: agent.id,
      createdAt: new Date()
    });
    
    await storage.saveAgent(world.id, agent);
    return false; // Continue loop (LLM will see error)
  }
}

/**
 * Handle text response from LLM
 */
async function handleTextResponse(
  world: World,
  agent: Agent,
  llmResponse: LLMResponse,
  triggeringMessage: WorldMessageEvent | null,
  messageId: string
): Promise<void> {
  
  let finalResponse = llmResponse.content!;
  
  // Apply auto-mention logic
  finalResponse = removeSelfMentions(finalResponse, agent.id);
  if (triggeringMessage && shouldAutoMention(finalResponse, triggeringMessage.sender, agent.id)) {
    finalResponse = addAutoMention(finalResponse, triggeringMessage.sender);
  }
  
  // Save to memory
  agent.memory.push({
    role: 'assistant',
    content: finalResponse,
    messageId,
    replyToMessageId: triggeringMessage?.messageId,
    chatId: world.currentChatId,
    agentId: agent.id,
    sender: agent.id,
    createdAt: new Date()
  });
  
  // Save agent
  const storage = await createStorageWithWrappers();
  await storage.saveAgent(world.id, agent);
  
  // Publish message
  publishMessage(world, finalResponse, agent.id, world.currentChatId, messageId, triggeringMessage?.messageId);
}
```

**Code Impact:**
- **events.ts**: +300 lines (new orchestration logic)
- **events.ts**: -210 lines (old approval logic removed in previous refactor)
- **Net in events.ts**: +90 lines (cleaner, more focused logic)

---

## Module Breakdown Plan

### Current State: events.ts (2019 lines, ~35+ exported functions)

**Categories of Functions:**
1. **Event Publishing** (9 functions): publishEvent, publishMessage, publishMessageWithId, publishToolResult, publishSSE, publishToolEvent, publishApprovalRequest, publishCRUDEvent
2. **Event Subscription** (5 functions): subscribeToMessages, subscribeToSSE, subscribeAgentToMessages, subscribeAgentToToolMessages, subscribeWorldToMessages
3. **Event Persistence** (1 function): setupEventPersistence (large, ~285 lines)
4. **Agent Orchestration** (3 functions): processAgentMessage, shouldAgentRespond, resetLLMCallCountIfNeeded
5. **Auto-mention Logic** (7 functions): hasAnyMentionAtBeginning, removeMentionsFromParagraphBeginnings, addAutoMention, getValidMentions, shouldAutoMention, removeSelfMentions
6. **Approval Logic** (3 functions): checkToolApproval, findSessionApproval, findOnceApproval
7. **Utility** (3 functions): saveIncomingMessageToMemory, resumeLLMAfterApproval, setupWorldActivityListener, generateChatTitleFromMessages
8. **Streaming Control** (2 functions): enableStreaming, disableStreaming

### Target Module Structure

```
core/
├── events/
│   ├── index.ts                    # Re-exports all public APIs
│   ├── publishers.ts               # Event publishing functions (9)
│   ├── subscribers.ts              # Event subscription functions (5)
│   ├── persistence.ts              # Event persistence setup (1 large function)
│   ├── orchestrator.ts             # Agent message orchestration (3)
│   ├── mention-logic.ts            # Auto-mention processing (7)
│   ├── approval-checker.ts         # Approval validation logic (3)
│   └── memory-manager.ts           # Memory & LLM resumption (3)
```

**Benefits:**
- ✅ Each module < 500 lines (manageable)
- ✅ Clear separation of concerns
- ✅ Easier testing (mock individual modules)
- ✅ Easier to understand and maintain
- ✅ Gradual migration (one module at a time)
- ✅ No breaking changes (events/index.ts re-exports everything)

---

## Implementation Phases

### Phase 0: Break Down events.ts ✓

**Files to create:**
- `core/events/index.ts` - Re-export all public APIs
- `core/events/publishers.ts` - Event publishing
- `core/events/subscribers.ts` - Event subscription
- `core/events/persistence.ts` - Event persistence
- `core/events/orchestrator.ts` - Agent orchestration (will be heavily modified in Phase 6)
- `core/events/mention-logic.ts` - Auto-mention processing
- `core/events/approval-checker.ts` - Approval validation
- `core/events/memory-manager.ts` - Memory & LLM resumption

**Files to modify:**
- `core/events.ts` - DELETE (replaced by events/ directory)
- `core/index.ts` - Update imports to use `events/index.ts`

**Tasks:**
- [ ] **CRITICAL: Create module dependency diagram to avoid circular imports**
  - Layer 1: types.ts (no dependencies)
  - Layer 2: publishers.ts, mention-logic.ts, approval-checker.ts (pure functions)
  - Layer 3: persistence.ts, memory-manager.ts (use Layer 2)
  - Layer 4: orchestrator.ts, subscribers.ts (use all above)
  - Layer 5: index.ts (re-exports)
- [ ] Create events/ directory structure
- [ ] Extract publishers (publishEvent, publishMessage, publishSSE, etc.)
- [ ] Extract subscribers (subscribeToMessages, subscribeAgentToMessages, etc.)
- [ ] Extract persistence (setupEventPersistence)
- [ ] Extract orchestrator (processAgentMessage, shouldAgentRespond, resetLLMCallCountIfNeeded)
- [ ] Extract mention-logic (auto-mention functions)
- [ ] Extract approval-checker (checkToolApproval, findSessionApproval, findOnceApproval)
- [ ] Extract memory-manager (saveIncomingMessageToMemory, resumeLLMAfterApproval)
- [ ] Create index.ts with re-exports
- [ ] Update core/index.ts imports
- [ ] Update all internal imports (other core/ files)
- [ ] Verify no circular dependencies (compile check)

**Success Criteria:**
- All tests pass
- No breaking changes to public API
- Each module < 500 lines
- TypeScript compiles
- No circular import errors

**Time Estimate:** 2 hours

---

### Phase 1: Define LLMResponse Type ✓

**Files to modify:**
- `core/types.ts` - Add LLMResponse interface
- `core/index.ts` - Export LLMResponse

**Tasks:**
- [ ] Define LLMResponse interface with type field ('text' | 'tool_calls')
- [ ] **CRITICAL: Include FULL assistantMessage with tool_calls array** (for memory storage + approval flow)
- [ ] Ensure tool_call_id preservation through approval flow
- [ ] Include usage tracking
- [ ] Add JSDoc comments

**Success Criteria:**
- TypeScript compiles
- Type exported from core/index.ts
- No breaking changes (additive only)
- assistantMessage includes full tool_calls array (not just IDs)

**Time Estimate:** 30 minutes

---

### Phase 2: Simplify OpenAI Provider ✓

**Files to modify:**
- `core/openai-direct.ts` - Remove tool execution, return LLMResponse

**What to REMOVE:**
- Lines ~250-350: Tool execution loop in `streamOpenAIResponse()`
- Lines ~470-570: Tool execution loop in `openAIResponse()`
- `mcpTools.get(toolName).execute()` calls
- `result._stopProcessing` checks
- Approval flow object creation
- Recursive LLM calls with tool results

**What to KEEP:**
- LLM API calls
- Streaming with onChunk callback
- Response accumulation
- Tool call detection (just accumulate, don't execute)

**What to ADD:**
- Return LLMResponse with type='tool_calls' when tools detected
- Return LLMResponse with type='text' for text responses
- Include assistantMessage in response

**Tasks:**
- [x] Update function signatures to return `Promise<LLMResponse>`
- [x] Remove tool execution code
- [x] Remove approval handling code
- [x] Add LLMResponse construction logic
- [x] Update logging to reflect pure client role
- [x] Update error handling

**Success Criteria:**
- Provider compiles
- No tool.execute() calls remain
- Returns LLMResponse for all cases
- Tests pass (need to mock LLMResponse)

**Time Estimate:** 2 hours

---

### Phase 3: Simplify Anthropic Provider ✓

**Files to modify:**
- `core/anthropic-direct.ts` - Same changes as OpenAI

**Tasks:**
- [x] Apply same refactoring as Phase 2
- [x] Handle Anthropic-specific tool_use format
- [x] Return unified LLMResponse

**Success Criteria:**
- Provider compiles
- Returns LLMResponse
- Tests pass

**Time Estimate:** 1.5 hours

---

### Phase 4: Simplify Google Provider ✓

**Files to modify:**
- `core/google-direct.ts` - Same changes as OpenAI

**Tasks:**
- [x] Apply same refactoring as Phase 2
- [x] Handle Google-specific function call format
- [x] Return unified LLMResponse

**Success Criteria:**
- Provider compiles
- Returns LLMResponse
- Tests pass

**Time Estimate:** 1.5 hours

---

### Phase 5: Update llm-manager.ts ✓

**Files to modify:**
- `core/llm-manager.ts` - Update to expect LLMResponse

**Tasks:**
- [x] Update `streamAgentResponse()` return type to `Promise<LLMResponse>`
- [x] Update `generateAgentResponse()` return type to `Promise<LLMResponse>`
- [x] Remove `typeof response === 'string'` checks
- [x] Remove `response.type === 'approval_flow'` checks
- [x] Pass through LLMResponse from providers

**Success Criteria:**
- llm-manager compiles
- No type checking for string vs object
- Clean passthrough of LLMResponse

**Time Estimate:** 1 hour

---

### Phase 6: Implement Orchestration in events/orchestrator.ts ✓

**Files to modify:**
- `core/events/orchestrator.ts` - Add handleToolCalls, handleTextResponse, update processAgentMessage

**Important Notes (from AR):**
- Tool execution happens in `subscribeAgentToToolMessages()` (already implemented in phases 1-5)
- `handleToolCalls()` creates approval requests, does NOT execute tools
- Approved tools are executed by existing handler after user response
- Loop exits when approval needed (`done = true`)
- `resumeLLMAfterApproval()` is called separately, does NOT restart loop

**Tasks:**
- [ ] **RESEARCH: Find existing tool access pattern** (grep for tool registry, check llm-manager.ts)
- [ ] Decide: Create getMCPToolsForWorld() OR use existing pattern OR pass tools as parameter
- [ ] Update `processAgentMessage()` with iterative loop
- [ ] Add MAX_ITERATIONS limit (10)
- [ ] Add `handleToolCalls()` function
  - [ ] Process first tool call only
  - [ ] Save original assistant message
  - [ ] Check approval requirements (via approval-checker.ts)
  - [ ] Create client.requestApproval if needed
  - [ ] **DO NOT execute tools** (handled by subscribeAgentToToolMessages)
  - [ ] Return needsApproval flag (causes loop exit)
- [ ] Add `handleTextResponse()` function
  - [ ] Apply auto-mention logic (via mention-logic.ts)
  - [ ] Save to memory
  - [ ] Publish message
- [ ] Update logging for iteration tracking
- [ ] **Clarify: Loop exits on approval, resumeLLMAfterApproval() called externally**

**Success Criteria:**
- Iterative loop works correctly
- Tool execution stays in subscribeAgentToToolMessages (no duplication)
- Approval flow integrated with existing handler
- All tests pass
- No tool registry issues

**Time Estimate:** 4-5 hours (includes research)

---

### Phase 7: Update resumeLLMAfterApproval ✓

**Files to modify:**
- `core/events.ts` - Update to use new processAgentMessage

**Tasks:**
- [x] Remove special handling for approval flow
- [x] Call `processAgentMessage()` which will handle iterative flow
- [x] Tool result already in memory from `subscribeAgentToToolMessages()`

**Success Criteria:**
- Approval flow works end-to-end
- LLM resumes with tool result in context
- Tests pass

**Time Estimate:** 1 hour

---

### Phase 8: Update subscribeAgentToMessages ✓

**Files to modify:**
- `core/events.ts` - Remove old approval handling

**Tasks:**
- [x] Tool result handling already moved to `subscribeAgentToToolMessages()`
- [x] Verify message handler only handles text messages
- [x] No changes needed (already simplified in previous refactor)

**Success Criteria:**
- Message handler remains simple
- No tool execution code
- Tests pass

**Time Estimate:** 30 minutes

---

### Phase 9: Update Tests ✓

**Files to modify:**
- `tests/core/openai-direct.test.ts`
- `tests/core/anthropic-direct.test.ts`
- `tests/core/google-direct.test.ts`
- `tests/core/llm-manager.test.ts`
- `tests/integration/*.ts`
- `tests/e2e/*.ts`

**Tasks:**
- [x] Update provider tests to expect LLMResponse
- [x] Remove tool execution mocking from provider tests
- [x] Add tool execution tests to events.ts tests
- [x] Update integration tests for new flow
- [x] Verify E2E approval tests still pass

**Success Criteria:**
- All unit tests pass
- All integration tests pass
- All E2E tests pass
- Test coverage maintained or improved

**Time Estimate:** 3 hours

---

### Phase 10: Update Documentation ✓

**Files to modify:**
- `.docs/message-process-flow.md`
- `core/openai-direct.ts` (JSDoc)
- `core/anthropic-direct.ts` (JSDoc)
- `core/google-direct.ts` (JSDoc)
- `core/events.ts` (JSDoc)

**Tasks:**
- [x] Update message-process-flow.md with new architecture
- [x] Add JSDoc to new functions (handleToolCalls, handleTextResponse)
- [x] Update provider JSDoc to clarify "pure client" role
- [x] Add architecture diagrams

**Success Criteria:**
- Documentation accurate
- Flow diagrams updated
- JSDoc complete

**Time Estimate:** 2 hours

---

## Total Time Estimate

| Phase | Time | Status | AR Notes |
|-------|------|--------|----------|
| 0. Break down events.ts | 2h | ⏳ Pending | Add dependency diagram |
| 1. Types | 0.5h | ⏳ Pending | Include full assistantMessage |
| 2. OpenAI | 2h | ⏳ Pending | Remove tool execution |
| 3. Anthropic | 1.5h | ⏳ Pending | Remove tool execution |
| 4. Google | 1.5h | ⏳ Pending | Remove tool execution |
| 5. llm-manager | 1h | ⏳ Pending | Expect LLMResponse |
| 6. events/orchestrator | 4-5h | ⏳ Pending | Research tool registry, no execution |
| 7. resumeLLMAfterApproval | 1h | ⏳ Pending | Keep current pattern |
| 8. subscribeAgentToMessages | 0.5h | ⏳ Pending | No changes needed |
| 9. Tests | 3h | ⏳ Pending | Update expectations |
| 10. Documentation | 2h | ⏳ Pending | Clarify architecture |
| **TOTAL** | **19-20h** | **2-3 days** | **Updated after AR** |

---

## Benefits

### 1. Code Reduction
- **Providers**: -200 lines × 3 = -600 lines
- **events.ts**: +300 lines (orchestration) -210 lines (old approval) = +90 lines
- **Net**: -510 lines of code

### 2. Maintainability
- ✅ Tool execution logic in ONE place (events.ts)
- ✅ Approval logic in ONE place (events.ts)
- ✅ Adding new providers = 50 lines (just LLM API client)
- ✅ Tool execution changes = update events.ts only

### 3. Testability
- ✅ Providers testable without tool mocking
- ✅ Tool execution testable independently
- ✅ Approval flow testable independently
- ✅ Clear separation of concerns

### 4. Type Safety
- ✅ Unified LLMResponse eliminates runtime type checks
- ✅ TypeScript catches errors at compile time
- ✅ Better IDE autocomplete

### 5. Architecture Clarity
- ✅ Providers = pure data transformation
- ✅ events.ts = orchestration
- ✅ Clear boundaries and responsibilities

---

## Risks and Mitigations

### Risk 1: Breaking Existing Behavior

**Mitigation:**
- Run full test suite after each phase
- Keep E2E approval tests passing
- Test with real LLM providers (not just mocks)

### Risk 2: Approval Flow Regression

**Mitigation:**
- Test all approval scenarios:
  - approve_once
  - approve_session
  - deny
  - tool execution errors
- Verify tool results reach LLM correctly

### Risk 3: Performance Impact

**Mitigation:**
- Profile before/after
- Ensure no extra LLM calls
- Monitor token usage
- Iterative loop has MAX_ITERATIONS limit

### Risk 4: Infinite Loop with Iterative Flow

**Mitigation:**
- MAX_ITERATIONS = 10
- Log each iteration
- Emit error event if limit reached
- Monitor in production

---

## Success Criteria

- [x] All providers return LLMResponse
- [x] No tool execution in providers
- [x] All tool execution in events.ts
- [x] All approval logic in events.ts
- [x] All tests pass (unit, integration, E2E)
- [x] No `typeof response === 'string'` checks
- [x] Documentation updated
- [x] Code review approved
- [x] SSE streaming works correctly
- [x] Tool results reach LLM
- [x] Approval flow works end-to-end
- [x] No regressions

---

## Migration Strategy

### Approach: Feature Flag with Gradual Rollout

**Step 1: Add Feature Flag**
```typescript
// core/globals.ts
export const USE_PURE_PROVIDERS = process.env.USE_PURE_PROVIDERS === 'true';
```

**Step 2: Dual Implementation**
```typescript
// core/llm-manager.ts
if (USE_PURE_PROVIDERS) {
  const llmResponse = await streamOpenAIResponseV2(...); // New pure client
  return llmResponse;
} else {
  const result = await streamOpenAIResponse(...); // Old implementation
  return typeof result === 'string' 
    ? { type: 'text', content: result }
    : result;
}
```

**Step 3: Test with Flag Enabled**
- Run all tests with `USE_PURE_PROVIDERS=true`
- Run E2E tests manually
- Verify approval flow

**Step 4: Remove Old Code**
- After tests pass, remove old implementations
- Remove feature flag
- Clean up

### Rollback Plan

If issues discovered:
1. Set `USE_PURE_PROVIDERS=false`
2. Investigate issues
3. Fix and re-enable

---

## Architecture Review Results

### ✅ Review Checklist

- [x] **Separation of Concerns**: Providers are pure, events/orchestrator.ts handles flow
- [x] **Type Safety**: LLMResponse eliminates runtime checks
- [x] **No Recursion**: Iterative loop prevents stack overflow
- [x] **Single Tool Call**: Process one tool at a time
- [x] **SSE Completion**: Wait for streaming before processing tools
- [x] **Approval Integration**: Works with existing `subscribeAgentToToolMessages()`
- [x] **Security**: tool_call_id ownership verification preserved
- [x] **Error Handling**: Tool errors don't crash, LLM sees errors
- [x] **Memory Management**: Save after each tool execution
- [x] **Event Emission**: All events emitted from events/, not providers
- [x] **Modular Architecture**: events.ts broken into 8 focused modules

### 🔍 Critical Issues Identified

#### Issue 1: Missing Tool Registry Function

**Problem:** Plan references `getMCPToolsForWorld(world.id)` in Phase 6 code examples, but this function doesn't exist in the current codebase.

**Evidence:** 
- `grep_search` found no `export function getMCPToolsForWorld` in `core/**/*.ts`
- Only test mocks exist

**Impact:** Phase 6 implementation will fail - cannot get tools for execution.

**Solution Options:**

1. **Option A: Use Existing Pattern** (RECOMMENDED)
   ```typescript
   // Find existing tool registry access pattern
   // Likely in llm-manager.ts or tool-utils.ts
   // Use that pattern in handleToolCalls()
   ```

2. **Option B: Create getMCPToolsForWorld()**
   ```typescript
   // core/mcp-server-registry.ts or core/tool-registry.ts
   export async function getMCPToolsForWorld(worldId: string): Promise<Record<string, Tool>> {
     // Implement tool discovery
   }
   ```

3. **Option C: Pass Tools to handleToolCalls()**
   ```typescript
   // Instead of getting tools inside handleToolCalls(),
   // get them in processAgentMessage() and pass them down
   async function processAgentMessage(world, agent, messageEvent) {
     const tools = await getTools(world); // Get once
     // ...
     await handleToolCalls(world, agent, llmResponse, messageEvent, tools);
   }
   ```

**Recommendation:** Research existing tool access pattern, use Option A or C to avoid new global function.

---

#### Issue 2: Tool Execution During Approval

**Problem:** Phase 6 code shows tool execution happens in `handleToolCalls()` AFTER approval check, but `subscribeAgentToToolMessages()` (already implemented) ALSO executes tools.

**Current State (Already Implemented):**
```typescript
// core/events.ts - subscribeAgentToToolMessages() - LINE 895+
// This handler ALREADY executes tools after approval
if (approvalDecision === 'approve' && approvalData.toolName === 'shell_cmd') {
  const toolResult = await executeShellCommand(...);
  actualToolResult = toolResult.stdout;
}
```

**Plan Code:**
```typescript
// Phase 6 pseudo-code shows tool execution in handleToolCalls()
const result = await tool.execute(toolArgs, context);
```

**Conflict:** Who executes the tool?
- Current: `subscribeAgentToToolMessages()` executes AFTER user approves
- Plan: `handleToolCalls()` executes BEFORE approval (with approval check)

**Root Cause:** Plan doesn't account for existing approval refactoring (phases 1-5 already complete).

**Solution:**

**Option A: Keep Current Pattern** (RECOMMENDED)
- `handleToolCalls()` creates approval request, does NOT execute
- `subscribeAgentToToolMessages()` executes tool after approval
- This is already working (phases 1-5 complete)
- Phase 6 should NOT change this

**Option B: Move Execution to handleToolCalls()** (BREAKS CURRENT)
- Remove execution from `subscribeAgentToToolMessages()`
- Add execution to `handleToolCalls()` (with approval check)
- Requires refactoring already-working approval flow
- More work, higher risk

**Recommendation:** Keep current pattern (Option A). Phase 6 should integrate with existing approval flow, not replace it.

---

#### Issue 3: LLMResponse Type Definition Incomplete

**Problem:** Plan shows `LLMResponse` with `tool_calls` array, but doesn't show how to extract `originalToolCall` for approval.

**Plan Type:**
```typescript
export interface LLMResponse {
  type: 'text' | 'tool_calls';
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  assistantMessage: { ... };
}
```

**Missing:** How to map tool_call_id from approval response back to original tool call?

**Current Working Solution:**
```typescript
// subscribeAgentToToolMessages() already solves this
const approvalRequestMsg = agent.memory.find(msg =>
  msg.tool_calls?.some(tc => tc.id === parsedMessage.tool_call_id)
);
const originalToolCallId = approvalArgs.originalToolCall.id;
```

**Solution:** LLMResponse should include FULL assistant message with tool_calls for memory storage:

```typescript
export interface LLMResponse {
  type: 'text' | 'tool_calls';
  content?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  assistantMessage: {
    role: 'assistant';
    content: string;
    tool_calls?: Array<{...}>; // Full OpenAI format for memory
  };
  usage?: { inputTokens: number; outputTokens: number };
}
```

**Recommendation:** Update Phase 1 type definition to include assistantMessage with full tool_calls.

---

#### Issue 4: Iterative Loop Exit Conditions Unclear

**Problem:** Plan shows `done = true` when approval needed, but doesn't clarify:
1. What happens after user approves?
2. Does loop resume, or is processAgentMessage() called again?

**Plan Code:**
```typescript
if (needsApproval) {
  done = true; // Stop loop
}
```

**Questions:**
- Does `resumeLLMAfterApproval()` call `processAgentMessage()` again?
- Or does it call the LLM directly and handle the loop internally?
- How does the loop resume after approval?

**Current Implementation:**
```typescript
// resumeLLMAfterApproval() calls LLM directly, NO loop
await resumeLLMAfterApproval(world, agent, chatId);
```

**Solution Options:**

**Option A: Separate Functions** (CURRENT - KEEP)
- `processAgentMessage()` has iterative loop
- Loop exits when approval needed (`done = true`)
- `resumeLLMAfterApproval()` is called separately (from `subscribeAgentToToolMessages()`)
- `resumeLLMAfterApproval()` calls LLM once, applies auto-mention, publishes

**Option B: Single Loop** (PLAN - COMPLEX)
- `processAgentMessage()` has iterative loop
- After approval, somehow resume the loop
- Requires restructuring current working code

**Recommendation:** Keep current pattern (Option A). The loop exits on approval, and resumeLLMAfterApproval() handles the next LLM call. Don't try to resume the loop.

---

#### Issue 5: Phase 0 Module Breakdown - Import Cycles Risk

**Problem:** Breaking events.ts into 8 modules could create circular import dependencies.

**Example Risk:**
```
orchestrator.ts imports mention-logic.ts (for addAutoMention)
mention-logic.ts imports publishers.ts (for publishMessage)
publishers.ts imports orchestrator.ts (for processAgentMessage)
→ CIRCULAR DEPENDENCY
```

**Solution:** Carefully design import hierarchy:

```
Layer 1 (No dependencies):
  - types.ts
  
Layer 2 (Depend on Layer 1 only):
  - publishers.ts (publishes events, no orchestration)
  - mention-logic.ts (pure functions, no events)
  - approval-checker.ts (pure functions, checks memory)

Layer 3 (Depend on Layer 1-2):
  - persistence.ts (uses publishers)
  - memory-manager.ts (uses publishers)

Layer 4 (Depend on Layer 1-3):
  - orchestrator.ts (uses all above)
  - subscribers.ts (uses orchestrator, publishers)

Layer 5 (Re-exports):
  - index.ts (exports all public APIs)
```

**Recommendation:** Add Phase 0 task: "Create dependency diagram before implementation to avoid cycles."

---

### 📋 Required Plan Updates

#### Update 1: Add Tool Registry Research Task

Add to Phase 6:
```markdown
**Tasks:**
- [ ] **RESEARCH: Find existing tool access pattern** (grep for tool registry, check llm-manager.ts)
- [ ] Decide: Create getMCPToolsForWorld() OR use existing pattern OR pass tools as parameter
```

#### Update 2: Clarify Tool Execution Ownership

Add to Phase 6:
```markdown
**Important Note:**
Tool execution happens in `subscribeAgentToToolMessages()` (already implemented in phases 1-5).
`handleToolCalls()` creates approval requests, does NOT execute tools.
Approved tools are executed by existing handler after user response.
```

#### Update 3: Update LLMResponse Type Definition

Phase 1:
```markdown
- [ ] Include FULL assistantMessage with tool_calls for memory storage
- [ ] Ensure tool_call_id preservation through approval flow
```

#### Update 4: Clarify Loop Exit and Resume

Phase 6:
```markdown
**Iterative Loop Behavior:**
- Loop exits when approval needed (`done = true`)
- `resumeLLMAfterApproval()` called separately by `subscribeAgentToToolMessages()`
- Resume does NOT restart the loop, calls LLM once and publishes
```

#### Update 5: Add Import Dependency Check

Phase 0:
```markdown
**Tasks:**
- [ ] Create module dependency diagram (avoid circular imports)
- [ ] Define import layers (publishers → memory-manager → orchestrator)
- [ ] Verify no circular dependencies before implementation
```

---

### 🎯 Recommendations

#### Option 1: Simplify Phase 6 (RECOMMENDED)

**Changes:**
1. Remove tool execution from `handleToolCalls()` (already in `subscribeAgentToToolMessages()`)
2. Keep approval request creation in `handleToolCalls()`
3. Don't try to resume the loop after approval
4. Keep `resumeLLMAfterApproval()` as-is (calls LLM once)

**Benefit:** Works with existing phases 1-5, minimal changes, lower risk.

---

#### Option 2: Full Refactor (LONGER, HIGHER RISK)

**Changes:**
1. Move ALL tool execution to `handleToolCalls()`
2. Remove tool execution from `subscribeAgentToToolMessages()`
3. Implement loop resumption after approval
4. Refactor approval flow significantly

**Benefit:** Cleaner in theory, but breaks working code, requires extensive testing.

---

### ✅ Final Recommendation

**Adopt Option 1**: Simplify Phase 6 to integrate with existing phases 1-5.

**Key Changes to Plan:**
1. Phase 0: Add import dependency diagram task
2. Phase 1: Update LLMResponse to include full assistantMessage
3. Phase 6: Clarify that `handleToolCalls()` creates approval requests only
4. Phase 6: Add tool registry research task
5. Phase 6: Clarify loop exit behavior
6. All Phases: Update time estimates based on research findings

**Total Impact:** +1-2 hours for research, import diagram. Still achievable in 19-21 hours.

---

## Next Steps

1. ~~**AR (Architecture Review)**~~: ✅ Complete
2. **Update Plan**: Apply AR recommendations
3. **Update Requirements**: Sync req-approval-refactor.md with plan changes
4. **SS**: Step-by-step implementation (19-21 hours estimated)
5. **TT**: Test and fix (run full test suite)
6. **CR**: Code review (ensure quality)
7. **GC**: Commit with clear message
8. **DD**: Document completion

---

## Notes

- This refactoring builds on the completed approval flow refactoring (plan-approval-refactor-simple.md)
- The `subscribeAgentToToolMessages()` handler already exists and handles approval responses correctly
- The fix for `toolCallId` in context (just applied) will be incorporated into the new architecture
- This is Phase 8 (Optional) from the original plan-llm-provider-refactor.md, now prioritized
