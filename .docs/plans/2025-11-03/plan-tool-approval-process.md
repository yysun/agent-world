# Implementation Plan: Tool Execution Approval Process

**Date:** 2025-11-03  
**Status:** APPROVED FOR IMPLEMENTATION  
**Related Requirement:** `req-tool-approval-process.md`

---

## Implementation Overview

This plan provides a step-by-step implementation guide for adding tool execution approval to the Agent World system. The architecture uses a **two-layer approach**: store ALL messages (including approval flows) in `agent.memory`, but filter `client.*` tools before sending to the LLM.

**Total Estimated Effort**: 30 hours (~4 days for single developer)

---

## Core Architecture Principles

### 1. Two-Layer Design
- **Storage Layer** (`agent.memory`): Saves ALL messages including `client.*` tool calls
- **Processing Layer** (`prepareMessagesForLLM()`): Filters `client.*` tools before LLM API calls

### 2. Message-Based Flow
- Approval decisions travel in `messages[]` array (no server sessions)
- Client POSTs conversation with approval results
- Server extracts decisions, updates cache, processes message
- Stateless and naturally compatible with SSE streaming

### 3. Client-Side Tool Injection (with Filtering)
- Server injects `client.requestApproval` tool calls when approval needed
- Client executes and adds result to `messages[]`
- Server filters `client.*` tools before sending to LLM
- Result: Client sees UI, LLM sees clean conversation

### 4. Tool Structure Extension
- Extend existing MCP tool objects with `location` and `approval` fields
- No new classes needed - modify `mcpToolsToAiTools()` function
- Throw `ApprovalRequiredException` when approval required

### 5. Three-Tier Approval Scope
- **Cancel (Deny)**: Block execution, not cached
- **Once**: Execute immediately, not cached (next call requires approval)
- **Always (Session)**: Execute and cache for `currentChatId` (cleared on chat end)

---

## Component Architecture

```mermaid
graph TB
    subgraph "Storage Layer"
        MEM[agent.memory<br/>ALL messages saved]
    end
    
    subgraph "Processing Layer"
        PREP[prepareMessagesForLLM<br/>Filter client.* tools]
        LLM[LLM API<br/>Clean conversation]
    end
    
    subgraph "Server Execution"
        TOOL[MCP Tool Execute<br/>Check approval cache]
        CACHE[ApprovalCache<br/>chatId → toolName → approved]
        EXC[ApprovalRequiredException<br/>Inject client.requestApproval]
    end
    
    subgraph "Client Layer"
        SSE[SSE Stream<br/>Approval request]
        UI[Approval Dialog<br/>Cancel/Once/Always]
        POST[POST /messages<br/>With approval result]
    end
    
    MEM --> PREP
    PREP --> LLM
    LLM -->|tool_calls| TOOL
    TOOL -->|check| CACHE
    TOOL -->|not approved| EXC
    EXC -->|inject| SSE
    SSE --> UI
    UI --> POST
    POST -->|extract decision| CACHE
    POST -->|cleaned messages| MEM
    
    style MEM fill:#e1f5ff
    style CACHE fill:#fff4e1
    style UI fill:#ffe1e1
    style PREP fill:#ffe1e1
```

---

## Implementation Phases

### Phase 1: Types & Approval Cache (4 hours)

**Files**: `core/types.ts`, `core/approval-cache.ts` (new)  
**Dependencies**: None

#### Tasks

**1.1 Add Type Definitions** (`core/types.ts`)

- [ ] Add `ApprovalDecision` type:
  ```typescript
  type ApprovalDecision = 'approve' | 'deny';
  ```

- [ ] Add `ApprovalScope` type:
  ```typescript
  type ApprovalScope = 'once' | 'session';
  ```

- [ ] Define `ApprovalPolicy` interface:
  ```typescript
  interface ApprovalPolicy {
    required: boolean;
    message?: string;  // User-facing description
    options: string[]; // ['Cancel', 'Once', 'Always']
  }
  ```

- [ ] Define `ApprovalRequiredException` class:
  ```typescript
  class ApprovalRequiredException extends Error {
    constructor(
      public toolName: string,
      public toolArgs: object,
      public message: string,
      public options: string[]
    ) {
      super(`Approval required for ${toolName}`);
    }
  }
  ```

**1.2 Create Approval Cache** (`core/approval-cache.ts`)

- [ ] Implement `ApprovalCache` class:
  ```typescript
  interface ApprovalCacheEntry {
    approved: boolean;
    timestamp: Date;
  }
  
  class ApprovalCache {
    // chatId -> (toolName -> entry)
    private cache = new Map<string, Map<string, ApprovalCacheEntry>>();
    
    set(chatId: string, toolName: string, approved: boolean): void;
    get(chatId: string, toolName: string): boolean | undefined;
    has(chatId: string, toolName: string): boolean;
    clear(chatId: string): void;
    clearAll(): void;
  }
  ```

- [ ] Export singleton instance:
  ```typescript
  export const approvalCache = new ApprovalCache();
  ```

#### Validation
- [ ] TypeScript compiles without errors
- [ ] Unit tests for cache operations (set, get, clear)
- [ ] Unit tests for cache isolation (different chatIds)

---

### Phase 2: Extend MCP Tool Structure (5 hours)

**Files**: `core/mcp-server-registry.ts`  
**Dependencies**: Phase 1

#### Tasks

**2.1 Add Helper Functions**

- [ ] Implement `shouldRequireApproval()`:
  ```typescript
  function shouldRequireApproval(toolName: string, description: string): boolean {
    const dangerousKeywords = ['execute', 'command', 'delete', 'remove', 'write', 'shell'];
    const nameLower = toolName.toLowerCase();
    const descLower = (description || '').toLowerCase();
    
    return dangerousKeywords.some(keyword => 
      nameLower.includes(keyword) || descLower.includes(keyword)
    );
  }
  ```

- [ ] Implement `generateApprovalMessage()`:
  ```typescript
  function generateApprovalMessage(toolName: string, description: string): string {
    return `${description || toolName}\n\nThis tool requires your approval to execute.`;
  }
  ```

- [ ] Implement `sanitizeArgs()`:
  ```typescript
  function sanitizeArgs(args: any): any {
    const sensitiveKeys = ['key', 'password', 'token', 'secret', 'auth'];
    const sanitized = { ...args };
    
    for (const key in sanitized) {
      if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
        sanitized[key] = '[REDACTED]';
      }
    }
    
    return sanitized;
  }
  ```

**2.2 Modify `mcpToolsToAiTools()` Function**

- [ ] Extend tool object structure:
  ```typescript
  export async function mcpToolsToAiTools(...) {
    const aiTools: Record<string, any> = {};
    
    for (const t of tools as Tool[]) {
      const key = nsName(serverName, t.name);
      const requiresApproval = shouldRequireApproval(t.name, t.description);
      
      aiTools[key] = {
        description: t.description,
        parameters: bulletproofSchema(t.inputSchema),
        
        // NEW: Tool metadata
        location: 'server',
        approval: requiresApproval ? {
          required: true,
          message: generateApprovalMessage(t.name, t.description),
          options: ['Cancel', 'Once', 'Always']
        } : undefined,
        
        // Modified: Wrap execution with approval check
        execute: async (args, sequenceId, parentToolCall) => {
          if (requiresApproval) {
            const cache = approvalCache;
            const world = /* get from context */;
            const approved = cache.get(world.currentChatId, t.name);
            
            if (!approved) {
              throw new ApprovalRequiredException(
                t.name,
                sanitizeArgs(args),
                aiTools[key].approval.message,
                aiTools[key].approval.options
              );
            }
          }
          
          // Normal MCP execution
          return await executeMCPTool(worldId, t.name, args);
        }
      };
    }
    
    return aiTools;
  }
  ```

#### Validation
- [ ] TypeScript compiles without errors
- [ ] Unit tests for approval policy detection
- [ ] Unit tests for `ApprovalRequiredException` throwing
- [ ] Integration tests with existing MCP tools

---

### Phase 3: Inject Approval Requests (6 hours)

**Files**: `core/openai-direct.ts`, `core/anthropic-direct.ts`, `core/google-direct.ts`  
**Dependencies**: Phase 2

#### Tasks

**3.1 Add Approval Request Injection** (`core/openai-direct.ts`)

- [ ] Modify `streamOpenAIResponse()` tool execution:
  ```typescript
  try {
    const result = await tool.execute(args, sequenceId, `streaming-${messageId}`);
    // ... existing tool result handling
    
  } catch (error) {
    if (error instanceof ApprovalRequiredException) {
      // Create approval tool call
      const approvalToolCall = {
        id: `approval_${generateId()}`,
        type: 'function',
        function: {
          name: 'client.requestApproval',
          arguments: JSON.stringify({
            originalToolCall: { name: error.toolName, args: error.toolArgs },
            message: error.message,
            options: error.options
          })
        }
      };
      
      // Stream to client
      publishSSE(world, {
        agentName: agent.id,
        type: 'chunk',
        messageId,
        tool_calls: [approvalToolCall]
      });
      
      // CRITICAL: Save to agent.memory for conversation continuity
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: '',
        tool_calls: [approvalToolCall]
      };
      agent.memory.push(assistantMessage);
      await storage.saveAgent(world.id, agent);
      
      // End streaming
      publishSSE(world, {
        agentName: agent.id,
        type: 'end',
        messageId
      });
      
      return fullResponse;
    }
    
    // ... existing error handling
  }
  ```

- [ ] Update `generateOpenAIResponse()` similarly

**3.2 Add to Anthropic Provider** (`core/anthropic-direct.ts`)

- [ ] Apply same approval injection to `streamAnthropicResponse()`
- [ ] Apply same approval injection to `generateAnthropicResponse()`

**3.3 Add to Google Provider** (`core/google-direct.ts`)

- [ ] Apply same approval injection to `streamGoogleResponse()`
- [ ] Apply same approval injection to `generateGoogleResponse()`

#### Validation
- [ ] Unit tests for `ApprovalRequiredException` catching
- [ ] Integration tests for approval request injection
- [ ] Verify approval requests saved to `agent.memory`
- [ ] Test with multiple providers

---

### Phase 4: Message Filtering & Cache Update (5 hours)

**Files**: `core/openai-direct.ts`, `server/api.ts`  
**Dependencies**: Phase 3

#### Tasks

**4.1 Add Message Filtering Function** (`core/openai-direct.ts`)

- [ ] Create `prepareMessagesForLLM()`:
  ```typescript
  function prepareMessagesForLLM(agent: Agent): ChatMessage[] {
    const allMessages = [...agent.memory];
    
    return allMessages.filter(msg => {
      // Filter assistant messages with tool calls
      if (msg.role === 'assistant' && msg.tool_calls) {
        const filteredToolCalls = msg.tool_calls.filter(tc => 
          !tc.function.name.startsWith('client.')
        );
        
        if (filteredToolCalls.length === 0 && !msg.content) {
          return false;
        }
        
        msg.tool_calls = filteredToolCalls;
        return true;
      }
      
      // Filter client tool results
      if (msg.role === 'tool' && msg.tool_call_id?.startsWith('approval_')) {
        return false;
      }
      
      return true;
    });
  }
  ```

- [ ] Use in `streamOpenAIResponse()`:
  ```typescript
  export async function streamOpenAIResponse(...) {
    const llmMessages = prepareMessagesForLLM(agent);
    const conversationMessages = convertMessagesToOpenAI(llmMessages);
    
    const requestParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
      model,
      messages: conversationMessages,  // Clean messages
      // ...
    };
    // ...
  }
  ```

- [ ] Use in `generateOpenAIResponse()` similarly

**4.2 Extract Approval Decisions** (`server/api.ts`)

- [ ] Modify POST `/worlds/:worldName/messages` handler:
  ```typescript
  router.post('/worlds/:worldName/messages', async (req, res) => {
    const { worldName } = req.params;
    const { message, sender, messages } = req.body;
    
    const world = await getWorld(worldName);
    
    // Extract approval decisions
    const approvalResults = messages
      .filter(m => 
        m.role === 'tool' && 
        m.tool_call_id?.startsWith('approval_')
      )
      .map(m => ({
        toolCallId: m.tool_call_id,
        ...JSON.parse(m.content)
      }));
    
    // Update cache
    for (const approval of approvalResults) {
      const { decision, scope, toolName } = approval;
      
      if (decision === 'approve' && scope === 'session') {
        approvalCache.set(world.currentChatId, toolName, true);
        logger.debug('Approval cached', { chatId: world.currentChatId, toolName });
      }
    }
    
    // No filtering here - messages passed through unchanged
    // Filtering happens in prepareMessagesForLLM()
    await handleStreamingChat(req, res, worldName, message, sender, messages);
  });
  ```

#### Validation
- [ ] Unit tests for `prepareMessagesForLLM()` filtering
- [ ] Integration tests for approval cache updates
- [ ] Verify `agent.memory` contains all messages
- [ ] Verify LLM receives filtered messages

---

### Phase 5: Web UI Implementation (4 hours)

**Files**: `web/src/components/ApprovalDialog.tsx` (new), `web/src/lib/world-events.ts`  
**Dependencies**: Phase 3

#### Tasks

**5.1 Create Approval Dialog Component**

- [ ] Create `ApprovalDialog.tsx`:
  ```typescript
  interface ApprovalDialogProps {
    toolName: string;
    toolArgs: object;
    message: string;
    options: string[];
    toolCallId: string;
    onDecision: (decision: string, scope: string) => void;
  }
  
  function ApprovalDialog({ toolName, toolArgs, message, options, toolCallId, onDecision }: ApprovalDialogProps) {
    return (
      <div className="approval-dialog">
        <h3>Tool Approval Required</h3>
        <p className="tool-name">{toolName}</p>
        <pre className="tool-args">{JSON.stringify(toolArgs, null, 2)}</pre>
        <p className="message">{message}</p>
        
        <div className="actions">
          {options.includes('Cancel') && (
            <button onClick={() => onDecision('deny', 'none')}>
              Cancel
            </button>
          )}
          {options.includes('Once') && (
            <button onClick={() => onDecision('approve', 'once')}>
              Approve Once
            </button>
          )}
          {options.includes('Always') && (
            <button onClick={() => onDecision('approve', 'session')}>
              Always (This Session)
            </button>
          )}
        </div>
      </div>
    );
  }
  ```

**5.2 Integrate with SSE Events** (`web/src/lib/world-events.ts`)

- [ ] Add approval detection:
  ```typescript
  eventSource.addEventListener('message', (event) => {
    const data = JSON.parse(event.data);
    
    if (data.type === 'sse' && data.data.tool_calls) {
      for (const toolCall of data.data.tool_calls) {
        if (toolCall.function.name === 'client.requestApproval') {
          const args = JSON.parse(toolCall.function.arguments);
          
          showApprovalDialog({
            toolName: args.originalToolCall.name,
            toolArgs: args.originalToolCall.args,
            message: args.message,
            options: args.options,
            toolCallId: toolCall.id,
            onDecision: (decision, scope) => {
              // Add tool result to messages
              messages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: JSON.stringify({ decision, scope, toolName: args.originalToolCall.name })
              });
              
              // Resubmit
              submitMessage(currentMessage, messages);
            }
          });
        }
      }
    }
  });
  ```

#### Validation
- [ ] Manual testing with approval dialog
- [ ] Verify approval results added to messages
- [ ] Test Cancel/Once/Always buttons
- [ ] Integration tests with mock backend

---

### Phase 6: CLI Implementation (2 hours)

**Files**: `cli/commands.ts`  
**Dependencies**: Phase 3

#### Tasks

**6.1 Add CLI Approval Prompt**

- [ ] Implement approval handler:
  ```typescript
  async function handleApprovalRequest(request: any): Promise<any> {
    console.log(`\n⚠️  Tool Approval Required`);
    console.log(`Tool: ${request.originalToolCall.name}`);
    console.log(`Arguments: ${JSON.stringify(request.originalToolCall.args, null, 2)}`);
    console.log(`Message: ${request.message}`);
    
    const response = await promptUser('Approve? [y]es / [s]ession / [n]o: ');
    
    if (response === 'y') {
      return { decision: 'approve', scope: 'once' };
    } else if (response === 's') {
      return { decision: 'approve', scope: 'session' };
    } else {
      return { decision: 'deny', scope: 'none' };
    }
  }
  ```

- [ ] Integrate with SSE stream:
  ```typescript
  eventSource.addEventListener('message', async (event) => {
    const data = JSON.parse(event.data);
    
    if (data.type === 'sse' && data.data.tool_calls) {
      for (const toolCall of data.data.tool_calls) {
        if (toolCall.function.name === 'client.requestApproval') {
          const args = JSON.parse(toolCall.function.arguments);
          const result = await handleApprovalRequest(args);
          
          // Add to messages and resubmit
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({ ...result, toolName: args.originalToolCall.name })
          });
          
          await sendMessage(message, messages);
        }
      }
    }
  });
  ```

#### Validation
- [ ] Manual CLI testing
- [ ] Test all approval options (y/s/n)
- [ ] Verify message resubmission

---

### Phase 7: Testing & Documentation (4 hours)

**Files**: `tests/core/tool-approval.test.ts` (new), `docs/tool-approval.md` (new)  
**Dependencies**: All previous phases

#### Tasks

**7.1 Create Test Suite**

- [ ] Unit tests for `ApprovalCache`
- [ ] Unit tests for `prepareMessagesForLLM()`
- [ ] Integration tests for approval flow:
  - Tool requires approval → request injected
  - User approves (once) → tool executes
  - User approves (session) → cached for future calls
  - User denies → tool doesn't execute
- [ ] Security tests:
  - LLM cannot call `client.*` tools directly
  - Approval cache isolated by chatId
- [ ] Performance tests:
  - Cache lookup overhead < 1ms

**7.2 Write Documentation**

- [ ] User guide (`docs/tool-approval.md`):
  - How approval system works
  - What triggers approval requests
  - Understanding Cancel/Once/Always options
- [ ] Developer guide:
  - How to add approval to custom tools
  - How to configure approval policies
  - Troubleshooting common issues
- [ ] Update existing docs:
  - Mention approval in MCP server guide
  - Update API documentation

#### Validation
- [ ] All tests pass (aim for 100% coverage)
- [ ] Documentation reviewed for clarity
- [ ] No breaking changes to existing APIs

---

## Implementation Timeline

```mermaid
gantt
    title Tool Approval Implementation (30 hours)
    dateFormat YYYY-MM-DD
    
    section Phase 1-2
    Types & Cache            :p1, 2025-11-03, 4h
    Extend MCP Tools         :p2, after p1, 5h
    
    section Phase 3-4
    Inject Approval Requests :p3, after p2, 6h
    Filter & Cache Update    :p4, after p3, 5h
    
    section Phase 5-6
    Web UI                   :p5, after p4, 4h
    CLI                      :p6, after p5, 2h
    
    section Phase 7
    Testing & Docs           :p7, after p6, 4h
```

---

## Key Implementation Points

### Two-Layer Architecture (Critical Understanding)

**Storage Layer** (`agent.memory`):
```typescript
// Save ALL messages including client.* tools
agent.memory.push(assistantMessage);  // Includes client.requestApproval
agent.memory.push(toolResult);        // Includes approval decision
await storage.saveAgent(world.id, agent);
```

**Processing Layer** (`prepareMessagesForLLM()`):
```typescript
// Filter client.* tools ONLY when preparing LLM input
const llmMessages = prepareMessagesForLLM(agent);  // Filters client.*
const response = await llm.chat(llmMessages);      // Clean input
```

**Why Both Layers?**
- Storage: Complete audit trail + conversation resume capability
- Processing: Clean LLM context + reduced token usage

### Message-Based Approval Flow

1. **Tool Requires Approval** → Throw `ApprovalRequiredException`
2. **Server Injects Request** → Stream `client.requestApproval` tool call via SSE
3. **Client Shows UI** → User chooses Cancel/Once/Always
4. **Client Adds Result** → Append tool result to `messages[]`
5. **Client Resubmits** → POST `/worlds/:worldName/messages` with full history
6. **Server Extracts Decision** → Update cache from `messages[]`
7. **Server Filters & Processes** → Clean messages for LLM, execute tool if approved

**No server sessions needed** - all state flows through messages array.

### Approval Scope Behavior

| Scope | User Action | Cache Behavior | Next Tool Call |
|-------|-------------|----------------|----------------|
| **Cancel** | Deny execution | Not cached | Requires approval again |
| **Once** | Approve this time | Not cached | Requires approval again |
| **Always (Session)** | Trust for chat | Cached with `chatId` | Auto-approved (no prompt) |

Cache cleared when chat ends (tied to `world.currentChatId` lifecycle).

---

## Backward Compatibility

All changes are **additive and opt-in**:

- ✅ Existing tools: No approval required by default
- ✅ Existing clients: Work without modification (no approval prompts)
- ✅ Existing workflows: Continue functioning unchanged
- ✅ Configuration: Opt-in via tool definitions or heuristics

---

## Success Metrics

- [ ] All 168+ existing tests pass
- [ ] New approval tests have >90% coverage
- [ ] Zero breaking changes to public APIs
- [ ] Performance overhead < 5ms per tool call
- [ ] Documentation complete and reviewed

---

## Risk Mitigation

### Risk 1: LLM Confusion from Approval Flow
**Mitigation**: Filter `client.*` tools before sending to LLM using `prepareMessagesForLLM()`

### Risk 2: Approval Fatigue
**Mitigation**: 
- Default scope is "Session" (cached after first approval)
- Heuristics auto-detect dangerous tools only
- Clear UI for managing approved tools

### Risk 3: Timeout Handling
**Mitigation**: 
- Stream ends naturally (no indefinite wait)
- Client must resubmit with approval (user controls timing)
- No server-side blocking

### Risk 4: Cache Isolation
**Mitigation**: 
- Cache keyed by `chatId` (isolation guaranteed)
- Cleared when chat deleted
- No cross-chat approval leakage

---

## Future Enhancements (Post-V1)

- Approval analytics (most approved/denied tools)
- Role-based approval policies
- Pattern-based auto-approval for safe paths
- Approval audit logs for compliance
- Multi-user approval workflows

---

## References

- **Requirement Document**: `.docs/reqs/2025-11-03/req-tool-approval-process.md`
- **Architecture Review**: See requirement document section "Two-Layer Architecture"
- **MCP Server Registry**: `core/mcp-server-registry.ts:856` (tool structure)
- **Agent Memory Pattern**: `core/events.ts:711,874` (message storage)
- **Message Conversion**: `core/openai-direct.ts:110` (LLM input preparation)

---

**Plan Status**: APPROVED FOR IMPLEMENTATION  
**Next Action**: Begin Phase 1 - Types & Approval Cache  
**Estimated Completion**: 4 days (30 hours)
