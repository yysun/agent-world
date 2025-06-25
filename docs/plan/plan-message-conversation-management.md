# Message Privacy and Conversation Management - Implementation Plan

## Overview
Implement intelligent conversation management system that enables natural agent interactions while preventing chaos, maintaining privacy, and ensuring human oversight remains accessible.

## Phase 1: Agent-Level Enhancements (Priority)

### Step 1: Enhanced Message Filtering Logic
**File**: `src/agent.ts` - `shouldRespondToMessage()` function
**Goal**: Improve agent message filtering with better @mention detection and rules

#### Implementation Tasks:
- [ ] **1.1** Update @mention parsing to support agent names only (not IDs)
  - Extract agent names from `@agentName` pattern
  - Support case-insensitive matching (@Alice, @alice)
  - Ignore malformed mentions (@@agent, @nonexistent, @)
- [ ] **1.2** Enhance message response rules
  - Public messages (no @mentions): All agents respond to human messages only
  - Private messages (with @mentions): Only mentioned agents respond
  - Agent-to-agent messages: Only respond if explicitly mentioned
  - Self-message prevention: Never respond to own messages
- [ ] **1.3** Add validation for agent existence
  - Check if mentioned agent exists in current world
  - Treat mentions of non-existent agents as broadcast messages

### Step 2: Turn Counter Implementation
**File**: `src/world.ts` - Add global conversation tracking
**Goal**: Prevent infinite agent-to-agent conversations

#### Implementation Tasks:
- [ ] **2.1** Add turn counter storage
  - Create `worldConversationCounters` Map<worldName, number>
  - Track consecutive agent messages per world
  - Initialize counter to 0 when world is created/loaded
- [ ] **2.2** Implement counter increment logic
  - Increment counter when agent publishes message
  - Reset counter to 0 on human or system messages
  - Add counter tracking in `subscribeAgentToMessages()` function
- [ ] **2.3** Add turn limit enforcement
  - Check counter before allowing agent response
  - Block agent processing when counter >= 20
  - Inject @human redirect message when limit reached, remove the original @mention

### Step 3: Pass Command Processing
**File**: `src/agent.ts` - `processAgentMessage()` function
**Goal**: Allow agents to explicitly hand control to humans

#### Implementation Tasks:
- [ ] **3.1** Add pass command detection
  - Scan agent response for `<world>pass</world>` pattern
  - Use regex to detect command anywhere in response content
- [ ] **3.2** Implement pass command behavior
  - Replace agent response with "@human [AgentName] is passing control to you"
  - Reset turn counter to 0 when pass command is detected
  - Prevent normal agent response when pass command is found

### Step 4: Auto-Mention Addition
**File**: `src/agent.ts` - Response generation logic
**Goal**: Automatically add @mentions when agents reply to other agents

#### Implementation Tasks:
- [ ] **4.1** Detect agent-to-agent conversations
  - Identify when agent is responding to another agent's message
  - Extract original sender from message metadata
- [ ] **4.2** Auto-add @mention to responses
  - Prepend "@[senderName] " to agent response when replying to another agent
  - Skip auto-mention for human messages (already have natural addressing)
  - Ensure no duplicate @mentions if agent already included them

### Step 5: Enhanced Logging and Monitoring
**File**: `src/agent.ts`, `src/world.ts` - Add conversation tracking logs
**Goal**: Provide visibility into conversation management behavior

#### Implementation Tasks:
- [ ] **5.1** Add turn counter logging
  - Log when counter increments/resets
  - Log when turn limit is reached
  - Log pass command detections
- [ ] **5.2** Add @mention processing logs
  - Log mention extraction and validation
  - Log routing decisions (public vs private)
  - Log auto-mention additions

## Phase 2: Event Bus Selective Routing (Future)

### Step 6: Event Bus Gate Function
**File**: `src/event-bus.ts` - Add selective routing for messages topic
**Goal**: Route messages only to relevant agents for performance optimization

#### Implementation Tasks:
- [ ] **6.1** Create message analysis function
  - Extract @mentions from message content
  - Validate mentioned agents exist in world
  - Classify message as public (no mentions) or private (with mentions)
- [ ] **6.2** Implement selective routing logic
  - Public messages: Route to all agents in world
  - Private messages: Route only to mentioned agents
  - Apply only to 'messages' topic, leave 'world' and 'sse' unchanged
- [ ] **6.3** Update agent subscription logic
  - Agents receive only relevant messages
  - Simplify agent filtering (no need to check mentions)
  - Maintain self-message prevention

## Testing Strategy

### Unit Tests
- [ ] **Test @mention parsing** - Various mention formats and edge cases
- [ ] **Test turn counter logic** - Increment, reset, limit enforcement
- [ ] **Test pass command detection** - Various content formats
- [ ] **Test auto-mention addition** - Agent-to-agent vs agent-to-human

### Integration Tests
- [ ] **Test full conversation flows** - Multi-agent conversations with limits
- [ ] **Test human intervention** - Recovery from turn limits and pass commands
- [ ] **Test privacy behavior** - Public vs private message routing

### End-to-End Tests
- [ ] **Test CLI conversation flow** - Human → Agent → Agent → Human
- [ ] **Test limit enforcement** - 20-message limit with automatic intervention
- [ ] **Test pass command flow** - Agent passes control, human regains control

## Data Structures

### Turn Counter Storage
```typescript
// In src/world.ts
const worldConversationCounters = new Map<string, number>();

interface ConversationState {
  consecutiveAgentMessages: number;
  lastMessageSender: string;
  lastMessageTimestamp: string;
}
```

### Enhanced Message Data
```typescript
// In src/types.ts
interface MessageAnalysis {
  mentions: string[];
  isPublic: boolean;
  isPrivate: boolean;
  validMentions: string[];
  invalidMentions: string[];
}
```

## Risk Mitigation

### Rollback Strategy
- All changes are additive to existing functionality
- Feature flags can disable new behavior if issues arise
- Original message broadcasting remains as fallback

### Performance Considerations
- Turn counter stored in memory (low overhead)
- @mention parsing uses simple regex (fast)
- Phase 1 maintains current event broadcasting (no routing changes)

### Compatibility
- Existing agent configurations unchanged
- Current CLI behavior preserved
- All existing tests should continue passing

## Success Criteria

### Phase 1 Success Metrics
1. **Turn Limiting**: No more than 20 consecutive agent messages in any conversation
2. **Pass Commands**: Agents can successfully hand control to humans
3. **@Mention Detection**: Agents respond only when mentioned (private messages)
4. **Auto-Mention Addition**: Agent responses include @mentions when replying to other agents
5. **Human Control**: Humans can always regain conversation control

### Phase 2 Success Metrics
1. **Selective Routing**: Private messages reach only mentioned agents
2. **Performance**: Reduced message processing overhead for large agent pools
3. **Privacy**: Private conversations remain isolated from other agents

## Dependencies

### Required Changes
- `src/agent.ts` - Enhanced filtering and response logic
- `src/world.ts` - Turn counter tracking and enforcement
- `src/types.ts` - New interfaces for conversation state

### Optional Enhancements
- `src/event-bus.ts` - Selective routing (Phase 2)
- `cli/index.ts` - Enhanced conversation display
- Tests updates for new functionality

## Timeline Estimate

### Phase 1 (Agent-Level Enhancements)
- **Week 1**: Steps 1-2 (Enhanced filtering + Turn counter)
- **Week 2**: Steps 3-4 (Pass commands + Auto-mentions)
- **Week 3**: Step 5 + Testing (Logging + Full test suite)

### Phase 2 (Event Bus Routing)
- **Week 4**: Step 6 (Selective routing implementation)
- **Week 5**: Integration testing and optimization

**Total Estimated Time**: 5 weeks for complete implementation
**Minimum Viable Implementation**: 3 weeks (Phase 1 only)
