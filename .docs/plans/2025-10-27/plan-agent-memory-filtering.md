# Architecture Review: Agent Memory Filtering for LLM Context

**Date:** October 27, 2025  
**Type:** Architecture Review (AR)  
**Status:** Recommendation Phase  

## Problem Statement

Agents currently save ALL incoming messages to their memory (except their own messages), but only respond to messages where they're mentioned at paragraph beginnings or to public messages from humans. This creates a scenario where "not mentioned" messages pollute the LLM context when agents eventually do respond.

### Current Flow Analysis

```
Message Flow:
1. Message arrives → subscribeAgentToMessages handler
2. ALWAYS saves to agent memory via saveIncomingMessageToMemory (events.ts:369)
3. THEN checks if agent should respond via shouldAgentRespond (events.ts:376)
4. When agent eventually responds, processAgentMessage loads conversation history (events.ts:488)
5. prepareMessagesForLLM includes ALL saved messages as 'user' role entries (utils.ts:190-221)
```

### Concrete Example

```
Scenario:
- User says "hi"
- Agent A responds with "how can I help you?"
- Agent B doesn't respond (not mentioned) BUT saves "hi" to memory
- Later when Agent B responds to "@agent-b please help", it sees:
  - "hi" (saved as user message)
  - "how can I help you?" (saved as user message from Agent A)
  - "@agent-b please help" (current message)

Problem: Agent B's LLM context contains irrelevant "hi" message
```

## Solution Options Analysis

### Option 1: Filter at LLM Context Preparation ⭐ **RECOMMENDED**

**Approach:** Modify `prepareMessagesForLLM` to only include messages the agent would have responded to.

```typescript
// New logic in prepareMessagesForLLM
const relevantHistory = conversationHistory.filter(msg => {
  if (msg.agentId === agent.id) return true; // Always include own messages
  return wouldAgentHaveRespondedToHistoricalMessage(agent, msg);
});
```

**Pros:**
- ✅ Preserves complete memory for analytics/debugging
- ✅ Clean LLM context with only relevant messages
- ✅ Non-breaking change to storage layer
- ✅ Memory remains intact for future features
- ✅ Single point of filtering logic
- ✅ Reversible without data loss

**Cons:**
- ⚠️ Requires re-implementing response logic for historical filtering
- ⚠️ Slightly more complex context preparation

### Option 2: Conditional Memory Storage

**Approach:** Only save messages to agent memory if agent would respond.

```typescript
// Modified saveIncomingMessageToMemory
if (await shouldAgentRespond(world, agent, messageEvent)) {
  agent.memory.push(userMessage);
}
```

**Pros:**
- ✅ Simpler memory model
- ✅ Smaller memory footprint
- ✅ Clean LLM context automatically

**Cons:**
- ❌ **MAJOR:** Breaks analytics and debugging capabilities
- ❌ Loses potential context for future AI improvements
- ❌ Makes it impossible to track what agents "heard" but didn't respond to
- ❌ Irreversible data loss
- ❌ Poor future-proofing

### Option 3: Enhanced Message Metadata

**Approach:** Add metadata to track response decisions.

```typescript
interface AgentMessage {
  // ... existing fields
  didRespond?: boolean;
  responseRelevant?: boolean;
}
```

**Pros:**
- ✅ Preserves all data with context
- ✅ Flexible filtering options
- ✅ Audit trail for response decisions

**Cons:**
- ❌ Storage schema changes required
- ❌ More complex implementation
- ❌ Higher memory usage
- ❌ Breaking changes to existing data

### Option 4: Dual Memory Streams

**Approach:** Separate "active context" from "full memory".

```typescript
interface Agent {
  memory: AgentMessage[];          // All messages (full history)
  activeContext: AgentMessage[];   // Only relevant messages
}
```

**Pros:**
- ✅ Best of both worlds
- ✅ Complete audit trail + clean context
- ✅ Future-proof for different context strategies

**Cons:**
- ❌ Most complex implementation
- ❌ Higher memory usage
- ❌ Potential sync issues between streams
- ❌ Major schema changes

## Evaluation Matrix

| Criteria | Option 1: Filter at LLM | Option 2: Conditional Storage | Option 3: Metadata | Option 4: Dual Streams |
|----------|-------------------------|-------------------------------|---------------------|-------------------------|
| **Context Quality** | ✅ Excellent | ✅ Excellent | ✅ Excellent | ✅ Excellent |
| **Memory Efficiency** | ⚠️ Medium | ✅ High | ❌ Low | ❌ Lowest |
| **Implementation** | ✅ Simple | ✅ Very Simple | ⚠️ Medium | ❌ Complex |
| **Data Preservation** | ✅ Full | ❌ **Major Loss** | ✅ Full | ✅ Full |
| **Analytics/Debug** | ✅ Full | ❌ **Broken** | ✅ Enhanced | ✅ Enhanced |
| **Breaking Changes** | ✅ None | ⚠️ Logic Changes | ❌ Schema Changes | ❌ Schema Changes |
| **Future-Proof** | ✅ Good | ❌ Poor | ✅ Excellent | ✅ Excellent |

## Recommendation: Option 1 - Filter at LLM Context Preparation

### Rationale

1. **Data Integrity:** Preserves complete memory for debugging, analytics, and future improvements
2. **Clean Implementation:** Single point of filtering in `prepareMessagesForLLM`
3. **Non-Breaking:** No storage layer changes required
4. **Reversible:** Can adjust filtering logic without data loss
5. **Performance:** Filtering only during LLM calls, not every message save
6. **Risk Mitigation:** Low-risk implementation with high impact

### Implementation Plan

#### Step 1: Create Historical Response Filter

```typescript
/**
 * Check if agent would have responded to a historical message
 * Re-implements shouldAgentRespond logic for saved messages
 */
function wouldAgentHaveRespondedToHistoricalMessage(
  agent: Agent, 
  message: AgentMessage
): boolean {
  // Always include own messages
  if (message.agentId === agent.id) return true;
  
  // Skip messages from this agent itself
  if (message.sender?.toLowerCase() === agent.id.toLowerCase()) {
    return false;
  }
  
  const content = message.content || '';
  
  // Never respond to turn limit messages
  if (content.includes('Turn limit reached')) {
    return false;
  }
  
  // Never respond to system messages
  if (message.sender === 'system') {
    return false;
  }
  
  // Always respond to world messages
  if (message.sender === 'world') {
    return true;
  }
  
  const anyMentions = extractMentions(content);
  const mentions = extractParagraphBeginningMentions(content);
  
  // Determine sender type
  const senderType = determineSenderType(message.sender);
  
  // For HUMAN messages
  if (senderType === SenderType.HUMAN) {
    if (mentions.length === 0) {
      // If there are ANY mentions anywhere but none at paragraph beginnings, don't respond
      if (anyMentions.length > 0) {
        return false;
      } else {
        return true; // No mentions = public message
      }
    } else {
      return mentions.includes(agent.id.toLowerCase());
    }
  }
  
  // For agent messages, only respond if this agent has a paragraph-beginning mention
  return mentions.includes(agent.id.toLowerCase());
}
```

#### Step 2: Modify prepareMessagesForLLM

```typescript
export function prepareMessagesForLLM(
  agent: Agent,
  messageData: MessageData,
  conversationHistory: AgentMessage[] = [],
  chatId?: string | null
): AgentMessage[] {
  const messages: AgentMessage[] = [];

  // Add system message if available
  if (agent.systemPrompt) {
    messages.push({
      role: 'system',
      content: agent.systemPrompt,
      createdAt: new Date()
    });
  }

  // Filter conversation history by chatId if provided
  let filteredHistory = conversationHistory;
  if (chatId !== undefined) {
    filteredHistory = conversationHistory.filter(msg => msg.chatId === chatId);
  }

  // NEW: Filter to only include messages this agent would have responded to
  const relevantHistory = filteredHistory.filter(msg => 
    wouldAgentHaveRespondedToHistoricalMessage(agent, msg)
  );

  // Add filtered conversation history
  messages.push(...relevantHistory);

  // Add current message as user input
  messages.push(messageDataToAgentMessage(messageData));

  return messages;
}
```

#### Step 3: Add Comprehensive Tests

```typescript
describe('Historical Message Filtering', () => {
  test('should filter out messages agent would not have responded to', () => {
    const agent = createMockAgent({ id: 'test-agent' });
    const history = [
      { content: 'Hi everyone', sender: 'user', agentId: 'other' }, // Would respond (public)
      { content: 'I think @other-agent should help', sender: 'user', agentId: 'other' }, // Would NOT respond (mid-mention)
      { content: '@test-agent help please', sender: 'user', agentId: 'other' }, // Would respond (mentioned)
    ];
    
    const result = prepareMessagesForLLM(agent, mockMessageData, history);
    
    expect(result).toHaveLength(3); // system + 2 relevant messages + current
    expect(result[1].content).toBe('Hi everyone');
    expect(result[2].content).toBe('@test-agent help please');
  });
});
```

### Migration Strategy

1. **Phase 1:** Implement filtering logic with feature flag
2. **Phase 2:** Test with subset of agents
3. **Phase 3:** Enable globally
4. **Phase 4:** Monitor LLM context quality improvements

### Success Metrics

- ✅ Reduced irrelevant context in LLM calls
- ✅ Improved agent response relevance
- ✅ Maintained complete memory for debugging
- ✅ No breaking changes to existing functionality

## Alternative Considerations

### Future Enhancements (Post-Implementation)

1. **Smart Context Window Management:** Use filtering as basis for dynamic context window optimization
2. **Agent-Specific Filtering:** Allow agents to customize their relevance criteria
3. **Learning-Based Filtering:** Use agent response patterns to improve filtering over time

### Risk Assessment

**Low Risk Implementation:**
- No data loss
- No breaking changes
- Single function modification
- Easily reversible

**Monitoring Points:**
- LLM context size reduction
- Agent response quality
- Memory usage stability
- Performance impact

## Conclusion

**Recommendation:** Implement Option 1 (Filter at LLM Context Preparation) as the optimal solution balancing effectiveness, safety, and implementation complexity.

**Next Steps:**
1. Implement `wouldAgentHaveRespondedToHistoricalMessage` function
2. Modify `prepareMessagesForLLM` with filtering logic
3. Add comprehensive unit tests
4. Deploy with monitoring
5. Evaluate effectiveness and iterate as needed

This approach solves the core problem while preserving data integrity and providing a foundation for future memory management enhancements.