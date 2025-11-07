# Enhanced Approval Protocol with AgentId in JSON

**Date**: November 6, 2025  
**Status**: ✅ Completed  
**Tests**: All 1003 tests passing

## Overview

Implemented a cleaner approach for routing approval responses by embedding `agentId` inside the JSON structure instead of using `@mention` prefixes. The server automatically extracts `agentId` and prepends the appropriate `@mention` before broadcasting.

## Problem Context

During investigation of message flow, discovered that the web frontend wasn't sending `@mention` with approval responses. Two approaches were considered:

1. **Original approach**: Add `@agentId,` prefix to message content string
2. **Improved approach**: Embed `agentId` inside JSON structure ✅ (chosen)

The second approach is cleaner because:
- Separation of concerns (routing metadata vs message content)
- Consistent with enhanced string protocol design
- Easier to parse and validate
- No string concatenation fragility

## Complete Message Flow: Step-by-Step

This section explains the complete lifecycle of messages in Agent World, from the first user message through agent responses and approvals.

### Scenario: User Sends First Message

**User Action**: Types "list files in ~/Documents" and presses Enter

#### Phase 1: Message Creation (Web Frontend)

**Step 1**: User input is validated and prepared
```typescript
// web/src/pages/World.update.ts - validateAndPrepareMessage()
const userInput = "list files in ~/Documents";
const messageId = generateId(); // e.g., "msg_1730918400123"

const messageData = {
  id: messageId,
  text: userInput,
  sender: 'HUMAN',
  timestamp: new Date(),
  fromAgentId: null
};
```

**Step 2**: Message is sent via SSE to server
```typescript
// web/src/utils/sse-client.ts - sendChatMessage()
await fetch(`/api/worlds/${worldName}/messages`, {
  method: 'POST',
  body: JSON.stringify({
    content: "list files in ~/Documents",
    sender: 'HUMAN'
  })
});
```

#### Phase 2: Server Receives Message

**Step 3**: API endpoint receives the POST request
```typescript
// server/api.ts - POST /api/worlds/:worldName/messages
app.post('/api/worlds/:worldName/messages', async (req, res) => {
  const { content, sender } = req.body;
  const world = await loadWorld(worldName);
  
  // Publish to event system
  publishMessage(world, content, sender);
});
```

**Step 4**: Message is published to EventEmitter
```typescript
// core/events.ts - publishMessage()
export function publishMessage(world: World, content: string, sender: string): WorldMessageEvent {
  const messageId = generateId();
  
  // Parse enhanced protocol (checks for agentId in JSON)
  const { targetAgentId } = parseMessageContent(content, 'user');
  
  // Prepend @mention if agentId found
  let finalContent = content;
  if (targetAgentId) {
    finalContent = `@${targetAgentId}, ${content}`;
  }
  
  const messageEvent: WorldMessageEvent = {
    content: finalContent,
    sender: 'HUMAN',
    timestamp: new Date(),
    messageId: messageId,
    chatId: world.currentChatId,
    replyToMessageId: undefined
  };
  
  // Broadcast to all subscribers
  world.eventEmitter.emit('message', messageEvent);
  
  return messageEvent;
}
```

#### Phase 3: Message Broadcasting

**Step 5**: EventEmitter broadcasts to all subscribed agents
```typescript
// core/events.ts - Agent subscriptions
world.eventEmitter.on('message', async (messageEvent: WorldMessageEvent) => {
  // Each agent receives this event
  await handleIncomingMessage(world, agent, messageEvent);
});
```

**Step 6**: Each agent evaluates if they should respond
```typescript
// core/events.ts - shouldAgentRespond()
const shouldRespond = await shouldAgentRespond(world, agent, messageEvent);

// Checks:
// 1. Is sender the agent itself? → NO (skip)
// 2. Is sender HUMAN with no mentions? → YES (respond - public message)
// 3. Is agent mentioned at paragraph beginning? → YES (respond - directed)
// 4. Is sender another agent without mentions? → NO (skip)
// 5. Is turn limit exceeded? → NO (respond if under limit)
```

**Step 7**: Message is saved to each agent's memory
```typescript
// core/events.ts - saveIncomingMessageToMemory()
const { message: parsedMessage } = parseMessageContent(messageEvent.content, 'user');

const userMessage: AgentMessage = {
  ...parsedMessage,
  role: 'user',
  content: messageEvent.content,
  sender: messageEvent.sender,
  messageId: messageEvent.messageId,
  chatId: messageEvent.chatId,
  createdAt: messageEvent.timestamp
};

agent.memory.push(userMessage);
await saveAgent(world.id, agent);
```

#### Phase 4: Agent Processes Message

**Step 8**: Agent determines it should respond (public HUMAN message)
```typescript
// Assuming agent "a1" responds
const shouldA1Respond = await shouldAgentRespond(world, agentA1, messageEvent);
// Returns: true (HUMAN message, no mentions, not turn limited)
```

**Step 9**: Agent prepares messages for LLM
```typescript
// core/events.ts - prepareMessagesForLLM()
const messages = prepareMessagesForLLM(agent, messageEvent, agent.memory, chatId);

// Result:
[
  { role: 'system', content: agent.systemPrompt },
  { role: 'user', content: 'list files in ~/Documents', sender: 'HUMAN', ... }
]
```

**Step 10**: LLM is called with prepared messages
```typescript
// core/llm-manager.ts - callLLM()
const response = await callLLM(
  agent.provider,
  agent.model,
  messages,
  agent.tools,
  agent.llmConfig
);
```

#### Phase 5: LLM Requests Tool Execution

**Step 11**: LLM responds with tool call request
```typescript
// LLM Response (OpenAI format)
{
  role: 'assistant',
  content: null,
  tool_calls: [{
    id: 'call_abc123',
    type: 'function',
    function: {
      name: 'shell_cmd',
      arguments: JSON.stringify({
        command: 'ls',
        parameters: ['~/Documents']
      })
    }
  }]
}
```

**Step 12**: Tool requires approval - Request generated
```typescript
// core/events.ts - Tool execution flow
if (toolRequiresApproval(toolName)) {
  // Create approval request message
  const approvalMessage = {
    role: 'assistant',
    content: null,
    tool_calls: [{
      id: 'approval_shell_cmd_123',
      function: {
        name: 'client.request_approval',
        arguments: JSON.stringify({
          tool_name: 'shell_cmd',
          tool_args: { command: 'ls', parameters: ['~/Documents'] },
          message: 'Approve execution of shell command: ls ~/Documents?',
          options: ['deny', 'approve_once', 'approve_session']
        })
      }
    }]
  };
  
  agent.memory.push(approvalMessage);
}
```

#### Phase 6: Approval Request Sent to User

**Step 13**: SSE streams approval request to web frontend
```typescript
// Server broadcasts via SSE
sseClients.forEach(client => {
  client.write(`data: ${JSON.stringify({
    type: 'message',
    payload: {
      content: approvalMessage,
      sender: 'a1',
      messageId: 'msg_approval_req_123',
      timestamp: new Date()
    }
  })}\n\n`);
});
```

**Step 14**: Web UI displays approval request
```typescript
// web/src/pages/World.update.ts - detectToolCallRequest()
const toolCallData = {
  toolCallId: 'approval_shell_cmd_123',
  toolName: 'shell_cmd',
  toolArgs: { command: 'ls', parameters: ['~/Documents'] },
  approvalMessage: 'Approve execution of shell command: ls ~/Documents?',
  approvalOptions: ['deny', 'approve_once', 'approve_session'],
  agentId: 'a1'
};

// UI renders ApprovalBox with buttons
```

#### Phase 7: User Approves (NEW PROTOCOL)

**Step 15**: User clicks "Approve Once" button
```typescript
// web/src/pages/World.update.ts - submitApprovalDecision()
const decision = 'approve';
const scope = 'once';

// Create enhanced string protocol message
const enhancedMessage = JSON.stringify({
  __type: 'tool_result',
  tool_call_id: 'approval_shell_cmd_123',
  agentId: 'a1',  // ← Embedded in JSON
  content: JSON.stringify({
    decision: 'approve',
    scope: 'once',
    toolName: 'shell_cmd'
  })
});

await sendChatMessage(worldName, enhancedMessage, { sender: 'HUMAN' });
```

**Step 16**: Server receives approval message
```typescript
// POST /api/worlds/:worldName/messages
const content = '{"__type":"tool_result","tool_call_id":"approval_shell_cmd_123",...}';
```

#### Phase 8: Enhanced Protocol Processing (NEW)

**Step 17**: parseMessageContent extracts agentId
```typescript
// core/message-prep.ts - parseMessageContent()
const parsed = JSON.parse(content);

if (parsed.__type === 'tool_result') {
  return {
    message: {
      role: 'tool',
      tool_call_id: parsed.tool_call_id,
      content: parsed.content,
      createdAt: new Date()
    },
    targetAgentId: parsed.agentId  // ← Extracted: 'a1'
  };
}
```

**Step 18**: publishMessage prepends @mention automatically
```typescript
// core/events.ts - publishMessage()
const { targetAgentId } = parseMessageContent(content, 'user');

let finalContent = content;
if (targetAgentId) {
  finalContent = `@${targetAgentId}, ${content}`;  // "@a1, {JSON...}"
}

const messageEvent = {
  content: finalContent,  // ← Modified with @mention
  sender: 'HUMAN',
  messageId: generateId(),
  timestamp: new Date()
};

world.eventEmitter.emit('message', messageEvent);
```

#### Phase 9: Agent Receives Approval

**Step 19**: Only agent "a1" responds (due to @mention)
```typescript
// core/events.ts - shouldAgentRespond()
const mentions = extractParagraphBeginningMentions(messageEvent.content);
// Returns: ['a1']

const shouldA1Respond = shouldAgentRespond(world, agentA1, messageEvent);
// Returns: true (agent is mentioned)

const shouldA2Respond = shouldAgentRespond(world, agentA2, messageEvent);
// Returns: false (different agent mentioned)
```

**Step 20**: Agent "a1" parses approval and saves to memory
```typescript
// core/events.ts - saveIncomingMessageToMemory()
const { message: parsedMessage } = parseMessageContent(messageEvent.content, 'user');

// Saves as OpenAI tool message format:
{
  role: 'tool',
  tool_call_id: 'approval_shell_cmd_123',
  content: '{"decision":"approve","scope":"once","toolName":"shell_cmd"}',
  sender: 'HUMAN',
  messageId: 'msg_approval_resp_123',
  chatId: world.currentChatId,
  createdAt: new Date()
}

agent.memory.push(toolMessage);
```

#### Phase 10: Tool Execution

**Step 21**: Agent checks approval cache and executes tool
```typescript
// core/approval-cache.ts - Approval checking
const approval = findApprovalInMessages(agent.memory, 'shell_cmd');
// Found: { decision: 'approve', scope: 'once' }

// Execute the tool
const toolResult = await executeTool('shell_cmd', {
  command: 'ls',
  parameters: ['~/Documents']
});

// Result: { stdout: 'file1.txt\nfile2.txt\nfolder1/', stderr: '', exitCode: 0 }
```

**Step 22**: Tool result is added to memory
```typescript
const toolResultMessage = {
  role: 'tool',
  tool_call_id: 'call_abc123',
  content: JSON.stringify(toolResult),
  createdAt: new Date()
};

agent.memory.push(toolResultMessage);
```

#### Phase 11: Agent Generates Final Response

**Step 23**: Agent calls LLM again with tool result
```typescript
// core/llm-manager.ts - Second LLM call
const messages = [
  { role: 'system', content: agent.systemPrompt },
  { role: 'user', content: 'list files in ~/Documents' },
  { role: 'assistant', content: null, tool_calls: [...] },
  { role: 'tool', tool_call_id: 'call_abc123', content: '{"stdout":"..."}' }
];

const finalResponse = await callLLM(provider, model, messages, tools);
// LLM Response: "Here are the files in ~/Documents:\n- file1.txt\n- file2.txt\n- folder1/"
```

**Step 24**: Agent decides if auto-mention needed
```typescript
// core/events.ts - shouldAutoMention()
const shouldAdd = shouldAutoMention(
  finalResponse.content,
  'HUMAN',  // sender of original message
  'a1'      // this agent's ID
);

// Returns: false (HUMAN check prevents auto-mention)
```

**Step 25**: Response is published (no auto-mention added)
```typescript
// core/events.ts - Agent publishes response
const agentMessage = {
  role: 'assistant',
  content: "Here are the files in ~/Documents:\n- file1.txt\n- file2.txt\n- folder1/",
  sender: 'a1',
  messageId: generateId(),
  timestamp: new Date()
};

agent.memory.push(agentMessage);
publishMessage(world, agentMessage.content, 'a1');
```

#### Phase 12: Response Broadcast

**Step 26**: Message is broadcast to all agents
```typescript
// Other agents check if they should respond
const shouldA2Respond = shouldAgentRespond(world, agentA2, {
  content: "Here are the files...",
  sender: 'a1'
});

// Returns: false (agent message without mentions - not a public message)
```

**Step 27**: SSE streams response to web frontend
```typescript
// Server sends via SSE
client.write(`data: ${JSON.stringify({
  type: 'message',
  payload: {
    content: "Here are the files in ~/Documents:\n- file1.txt\n- file2.txt\n- folder1/",
    sender: 'a1',
    messageId: 'msg_final_resp_123',
    timestamp: new Date()
  }
})}\n\n`);
```

**Step 28**: Web UI displays agent's response
```typescript
// web/src/pages/World.update.ts - Message rendering
const newMessage = {
  id: 'msg_final_resp_123',
  text: "Here are the files in ~/Documents:\n- file1.txt\n- file2.txt\n- folder1/",
  sender: 'a1',
  timestamp: new Date(),
  fromAgentId: 'a1',
  isFromAgent: true
};

state.messages.push(newMessage);
```

### Key Observations

1. **Enhanced Protocol Integration**: The new `agentId` field in JSON is extracted in Step 17 and used to prepend @mention in Step 18, ensuring proper routing without string concatenation in the client.

2. **Mention-Based Routing**: The @mention prepended by the server ensures only the target agent ("a1") responds to the approval message (Step 19), preventing other agents from triggering.

3. **OpenAI Format Preservation**: The enhanced protocol converts to OpenAI `role: 'tool'` format (Step 20) before saving to agent memory, maintaining LLM compatibility.

4. **HUMAN Check Behavior**: Agent responses to HUMAN messages don't get auto-mentions (Step 24), which means they appear as agent messages without mentions. Other agents won't respond to these (Step 26) because they're not public messages.

5. **Complete Audit Trail**: Every message has a unique `messageId` generated at creation time, enabling complete traceability through the system.

## Implementation

### 1. Enhanced String Protocol Parser (`core/message-prep.ts`)

**Changed return type** from `ChatMessage` to `{message: ChatMessage, targetAgentId?: string}`:

```typescript
export function parseMessageContent(
  content: string,
  defaultRole: 'user' | 'assistant' = 'user'
): { message: ChatMessage; targetAgentId?: string }
```

**Extracts `agentId` from JSON**:

```typescript
// Input format
{
  "__type": "tool_result",
  "tool_call_id": "approval_shell_cmd_123",
  "agentId": "a1",  // ← New field
  "content": "{\"decision\":\"approve\",\"scope\":\"session\"}"
}

// Output
{
  message: {
    role: "tool",
    tool_call_id: "approval_shell_cmd_123",
    content: "...",
    createdAt: Date
  },
  targetAgentId: "a1"  // ← Extracted separately
}
```

### 2. Message Publishing (`core/events.ts`)

**Auto-prepends @mention** from extracted `targetAgentId`:

```typescript
export function publishMessage(world: World, content: string, sender: string, ...): WorldMessageEvent {
  const messageId = generateId();
  
  // Parse enhanced string protocol to extract targetAgentId
  const { targetAgentId } = parseMessageContent(content, 'user');

  // Prepend @mention if agentId is present
  let finalContent = content;
  if (targetAgentId) {
    finalContent = `@${targetAgentId}, ${content}`;
    loggerMemory.debug('[publishMessage] Prepended @mention from enhanced protocol', {
      agentId: targetAgentId,
      messageId
    });
  }

  const messageEvent: WorldMessageEvent = {
    content: finalContent,  // ← Modified content with @mention
    sender,
    timestamp: new Date(),
    messageId,
    chatId: targetChatId,
    replyToMessageId
  };

  world.eventEmitter.emit('message', messageEvent);
  return messageEvent;
}
```

**Updated `saveIncomingMessageToMemory`** to destructure new return format:

```typescript
const { message: parsedMessage } = parseMessageContent(messageEvent.content, 'user');
```

### 3. Web Frontend (`web/src/pages/World.update.ts`)

**Sends approval using enhanced protocol**:

```typescript
const submitApprovalDecision = async (state, decision, scope) => {
  // Build approval decision
  const approvalDecision: 'approve' | 'deny' = decision === 'approve' ? 'approve' : 'deny';
  const approvalScope = scope === 'session' ? 'session' : 'once';
  
  // Create enhanced string protocol message with agentId INSIDE JSON
  const enhancedMessage = JSON.stringify({
    __type: 'tool_result',
    tool_call_id: request.toolCallId || `approval_${request.toolName}_${Date.now()}`,
    agentId: request.agentId,  // ← Embedded in JSON structure
    content: JSON.stringify({
      decision: approvalDecision,
      scope: approvalScope,
      toolName: request.toolName
    })
  });
  
  await sendChatMessage(state.worldName, enhancedMessage, { sender: 'HUMAN' });
};
```

**Captures `agentId` from approval requests**:

```typescript
interface Message {
  toolCallData?: {
    toolCallId: string;
    toolName: string;
    toolArgs: Record<string, any>;
    approvalMessage: string;
    approvalOptions: string[];
    agentId?: string;  // ← New field
  };
}
```

### 4. Test Updates

**Updated all test files** to use new destructuring pattern:

```typescript
// Before
const result = parseMessageContent(content, 'user');
expect(result.role).toBe('tool');

// After
const { message: result, targetAgentId } = parseMessageContent(content, 'user');
expect(result.role).toBe('tool');
expect(targetAgentId).toBe('a1');
```

**Added new tests** for `agentId` extraction:

```typescript
it('should extract agentId from enhanced string format', () => {
  const enhancedMessage = JSON.stringify({
    __type: 'tool_result',
    agentId: 'a1',
    tool_call_id: 'approval_test_789',
    content: JSON.stringify({ decision: 'approve', scope: 'session' })
  });

  const { message: parsedMessage, targetAgentId } = parseMessageContent(enhancedMessage, 'user');

  expect(parsedMessage.role).toBe('tool');
  expect(parsedMessage.tool_call_id).toBe('approval_test_789');
  expect(targetAgentId).toBe('a1');
});
```

## Architecture Flow

### Message Flow with AgentId

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. User approves in Web UI                                      │
│    - Clicks "Approve Once" or "Approve Session"                 │
│    - UI has agentId from original approval request              │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. Web sends enhanced string protocol message                   │
│    JSON.stringify({                                             │
│      __type: 'tool_result',                                     │
│      tool_call_id: 'approval_shell_cmd_123',                    │
│      agentId: 'a1',  ← Embedded in JSON                         │
│      content: '{"decision":"approve","scope":"session"}'        │
│    })                                                            │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. Server receives message via SSE                              │
│    - publishMessage() called with JSON string                   │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. parseMessageContent() extracts agentId                       │
│    - Returns: { message: {...}, targetAgentId: 'a1' }          │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. publishMessage() prepends @mention                           │
│    - Modifies content: '@a1, {original JSON}'                   │
│    - Creates messageEvent with modified content                 │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ 6. EventEmitter broadcasts to all agents                        │
│    - Message includes @a1 mention                               │
│    - Only a1 will respond (due to mention filtering)            │
└─────────────────────────────────────────────────────────────────┘
```

## Benefits

### ✅ **Cleaner Architecture**
- Routing metadata (agentId) separated from message content
- No string concatenation in multiple places
- Single source of truth for mention handling (publishMessage)

### ✅ **Better Type Safety**
- `agentId` is explicit field in JSON schema
- TypeScript interfaces clearly define structure
- Easier to validate and debug

### ✅ **Consistent Protocol**
- All clients (TUI, CLI, Web) use same JSON structure
- Server handles mention prepending uniformly
- OpenAI-compliant `role: 'tool'` format in agent memory

### ✅ **Maintainability**
- Parser changes isolated to one function
- Tests explicitly verify agentId extraction
- Clear separation between parsing and routing logic

## Files Changed

| File | Changes | Lines |
|------|---------|-------|
| `core/message-prep.ts` | Changed return type to include `targetAgentId` | +44/-38 |
| `core/events.ts` | Auto-prepend @mention from targetAgentId | +31/-14 |
| `web/src/pages/World.update.ts` | Use enhanced protocol with agentId in JSON | +50/-29 |
| `web/src/types/index.ts` | Add agentId to toolCallData interface | +1 |
| `tests/core/message-prep.test.ts` | Update all test expectations | +34/-34 |
| `tests/core/enhanced-string-protocol.test.ts` | Add agentId extraction tests | +49/-11 |
| `tests/core/approval-broadcast-bug.test.ts` | New test file for approval flow | +200 |

**Total**: 7 files, +409/-126 lines

## Testing

### Test Coverage

- ✅ **21 tests** in `message-prep.test.ts` - All updated and passing
- ✅ **11 tests** in `enhanced-string-protocol.test.ts` - 3 new tests added
- ✅ **9 tests** in `approval-broadcast-bug.test.ts` - New test file
- ✅ **1003 total tests** passing

### Key Test Scenarios

1. **AgentId Extraction**:
   - Extracts agentId from enhanced protocol JSON ✅
   - Returns undefined when agentId not present ✅
   - Doesn't extract from regular text messages ✅

2. **Message Parsing**:
   - Parses tool_result with agentId ✅
   - Handles backward compatibility (no agentId) ✅
   - Maintains OpenAI ChatMessage format ✅

3. **Approval Flow**:
   - HUMAN check in shouldAutoMention (restored) ✅
   - Agent responses without mentions don't broadcast ✅
   - Complete approval scenario works end-to-end ✅

## Migration Notes

### Breaking Changes

⚠️ **Parser Return Type Changed**:
```typescript
// Before
const result: ChatMessage = parseMessageContent(content, 'user');

// After  
const { message, targetAgentId } = parseMessageContent(content, 'user');
```

All call sites have been updated in this PR.

### Backward Compatibility

✅ **Fully backward compatible**:
- Regular text messages work unchanged
- JSON without agentId works unchanged
- Existing tool_result messages work unchanged
- Only new feature: agentId extraction when present

## Related Changes

### Restored HUMAN Check

As part of this work, **restored the HUMAN check** in `shouldAutoMention()`:

```typescript
export function shouldAutoMention(response: string, sender: string, agentId: string): boolean {
  if (!response?.trim() || !sender || !agentId) return false;
  if (determineSenderType(sender) === SenderType.HUMAN) return false;  // ← Restored
  if (sender.toLowerCase() === agentId.toLowerCase()) return false;
  return getValidMentions(response, agentId).length === 0;
}
```

This ensures agent responses to HUMAN messages don't automatically get @HUMAN mentions added, maintaining the original behavior where agent messages without mentions don't broadcast to other agents.

## Future Enhancements

### Potential Improvements

1. **Schema Validation**: Add JSON schema validation for enhanced protocol
2. **Type Definitions**: Create TypeScript interfaces for enhanced protocol format
3. **Documentation**: Update protocol documentation with agentId field
4. **Client Libraries**: Create helper functions for building enhanced messages

### Example Helper Function

```typescript
export function createToolResult(opts: {
  toolCallId: string;
  agentId?: string;
  decision: 'approve' | 'deny';
  scope?: 'once' | 'session';
  toolName: string;
}): string {
  return JSON.stringify({
    __type: 'tool_result',
    tool_call_id: opts.toolCallId,
    agentId: opts.agentId,
    content: JSON.stringify({
      decision: opts.decision,
      scope: opts.scope,
      toolName: opts.toolName
    })
  });
}
```

## Conclusion

Successfully refactored approval message routing to use a cleaner JSON-based approach with `agentId` embedded in the message structure. The server now automatically extracts and prepends `@mention` routing, eliminating string concatenation fragility and providing better separation of concerns.

All 1003 tests passing, with comprehensive coverage of the new functionality and backward compatibility maintained.
