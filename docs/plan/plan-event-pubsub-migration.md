# New Event System Implementation Plan - World-Level EventEmitter

## Overview
Create a completely new event system for `src/managers` using World-Level EventEmitter. This is a from-scratch implementation with zero dependencies on existing event systems, ensuring no compatibility issues.

## Architecture Summary

### World-Level EventEmitter Design
- **Each World instance** has its own `eventEmitter: EventEmitter`
- **Natural event isolation** - No cross-world event pollution possible
- **Simple event protocol** - Use `'message'` events for all messaging
- **Direct EventEmitter** - No abstraction layers or complex providers
- **Automatic agent processing** - Agents respond to all world messages automatically

### Type System Corrections
- **Use existing types**: `Event`, `MessageEventPayload`, `SSEEventPayload` from `src/types.ts`
- **No custom MessageEvent**: Avoid type conflicts with existing system
- **Proper imports**: Only from `../types.js`, `../utils.js`, storage modules

### New Files to Create

#### Core Event Management
```
src/managers/
├── utils.ts             # generateId() and manager utilities
├── world-events.ts       # World.eventEmitter event functions
├── agent-events.ts       # Agent message processing and subscriptions  
├── message-manager.ts    # Message broadcasting and routing
├── llm-manager.ts        # LLM integration with new SSE events
├── world-manager.ts      # Enhanced with event integration
└── agent-manager.ts      # Enhanced with automatic subscriptions
```

#### Zero Dependencies on Existing Event System
- ❌ No imports from `src/event-bus.ts`
- ❌ No imports from `src/world-event-bus.ts` 
- ❌ No imports from `src/agent.ts`
- ❌ No imports from `src/llm.ts`
- ✅ Only allowed: `src/types.ts`, `src/utils.ts`, storage modules

## Implementation Steps

### Step 0: Create Manager Utilities
**File**: `src/managers/utils.ts`

**Purpose**: Manager-specific utility functions

**Functions to implement**:
```typescript
/**
 * Generate unique ID for messages and events
 */
export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Create world message event data structure
 */
export interface WorldMessageEvent {
  content: string;
  sender: string;
  timestamp: Date;
  messageId: string;
}

/**
 * Create SSE event data structure  
 */
export interface WorldSSEEvent {
  agentName: string;
  type: 'start' | 'chunk' | 'end' | 'error';
  content?: string;
  error?: string;
  messageId: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}
```

**Dependencies**: None (native crypto API)

---

### Step 1: Create Core Event Functions
**File**: `src/managers/world-events.ts`

**Purpose**: Provide World.eventEmitter event management functions

**Functions to implement**:
```typescript
import { World, Agent } from '../types.js';
import { generateId, WorldMessageEvent, WorldSSEEvent } from './utils.js';

// Message publishing using World.eventEmitter
export function publishMessage(world: World, content: string, sender: string): void {
  const messageEvent: WorldMessageEvent = {
    content,
    sender, 
    timestamp: new Date(),
    messageId: generateId()
  };
  world.eventEmitter.emit('message', messageEvent);
}

// Message subscription using World.eventEmitter
export function subscribeToMessages(
  world: World, 
  handler: (event: WorldMessageEvent) => void
): () => void {
  world.eventEmitter.on('message', handler);
  return () => world.eventEmitter.off('message', handler);
}

// SSE events using World.eventEmitter
export function publishSSE(world: World, data: Partial<WorldSSEEvent>): void {
  const sseEvent: WorldSSEEvent = {
    agentName: data.agentName!,
    type: data.type!,
    content: data.content,
    error: data.error,
    messageId: data.messageId || generateId(),
    usage: data.usage
  };
  world.eventEmitter.emit('sse', sseEvent);
}

export function subscribeToSSE(
  world: World,
  handler: (event: WorldSSEEvent) => void  
): () => void {
  world.eventEmitter.on('sse', handler);
  return () => world.eventEmitter.off('sse', handler);
}

// Broadcast to all agents in world
export function broadcastToWorld(world: World, message: string, sender?: string): void {
  publishMessage(world, message, sender || 'HUMAN');
}
```

**Dependencies**: Only `../types.js`, `./utils.js`

---

### Step 2: Create Agent Event Processing
**File**: `src/managers/agent-events.ts`

**Purpose**: Agent subscription management and automatic message processing

**Functions to implement**:
```typescript
import { World, Agent, AgentMessage } from '../types.js';
import { subscribeToMessages, publishMessage, publishSSE } from './world-events.js';
import { saveAgentToDisk } from './agent-storage.js';
import { streamAgentResponse } from './llm-manager.js';
import { WorldMessageEvent } from './utils.js';

// Agent subscription with automatic processing
export function subscribeAgentToMessages(world: World, agent: Agent): () => void {
  const handler = async (messageEvent: WorldMessageEvent) => {
    // Skip messages from this agent itself
    if (messageEvent.sender === agent.id) return;
    
    // Automatic message processing
    if (shouldAgentRespond(agent, messageEvent)) {
      await processAgentMessage(world, agent, messageEvent);
    }
  };
  
  return subscribeToMessages(world, handler);
}

// Agent message processing logic (reimplemented from src/agent.ts)
async function processAgentMessage(
  world: World, 
  agent: Agent, 
  messageEvent: WorldMessageEvent
): Promise<void> {
  try {
    // Add message to agent memory
    const agentMessage: AgentMessage = {
      role: 'user',
      content: messageEvent.content,
      sender: messageEvent.sender,
      createdAt: messageEvent.timestamp
    };
    
    agent.memory.push(agentMessage);
    
    // Call LLM for response
    const response = await streamAgentResponse(world, agent, agent.memory);
    
    // Add response to memory
    agent.memory.push({
      role: 'assistant', 
      content: response,
      createdAt: new Date()
    });
    
    // Auto-sync memory to file (if enabled)
    if (agent.config.autoSyncMemory !== false) {
      await saveAgentToDisk(world.id, agent);
    }
    
    // Publish agent response
    publishMessage(world, response, agent.id);
    
  } catch (error) {
    console.error(`Agent ${agent.id} failed to process message:`, error);
  }
}

// Message filtering logic
function shouldAgentRespond(agent: Agent, messageEvent: WorldMessageEvent): boolean {
  // Check for direct mentions (@agentName)
  if (messageEvent.content.includes(`@${agent.id}`)) return true;
  
  // Check for direct messages (implement direct message logic)
  // Add other filtering criteria as needed
  
  return false; // Default: don't respond unless mentioned
}
```

**Dependencies**: `./world-events.js`, `./llm-manager.js`, `./agent-storage.js`, `./utils.js`

---

### Step 3: Enhance World Manager with Events
**File**: `src/managers/world-manager.ts` (enhance existing)

**Add event integration**:
```typescript
import { EventEmitter } from 'events';
// Add imports for agent subscription management
import { subscribeAgentToMessages } from './agent-events.js';

// Update createWorld function
export async function createWorld(params: CreateWorldParams): Promise<World> {
  // ...existing world creation logic...
  
  const worldData: WorldData = {
    id: params.name,
    config: {
      name: params.name,
      description: params.description,
      turnLimit: params.turnLimit || 5
    }
  };

  await saveWorldToDisk(root, worldData);

  // Return runtime World object with EventEmitter
  const world: World = {
    id: worldData.id,
    config: worldData.config,
    eventEmitter: new EventEmitter(), // ← New EventEmitter per world
    agents: new Map()
  };
  
  return world;
}

// Update getWorld function to restore EventEmitter
export async function getWorld(worldId: string): Promise<World | null> {
  const root = getRootDirectory();
  const worldData = await loadWorldFromDisk(root, worldId);

  if (!worldData) {
    return null;
  }

  // Create runtime World with fresh EventEmitter
  const world: World = {
    id: worldData.id,
    config: worldData.config,
    eventEmitter: new EventEmitter(), // ← Fresh EventEmitter
    agents: new Map()
  };
  
  // Load agents and subscribe them to messages
  const agents = await loadAllAgentsFromDisk(worldId);
  for (const agent of agents) {
    world.agents.set(agent.id, agent);
    // Automatically subscribe agent to world messages
    subscribeAgentToMessages(world, agent);
  }

  return world;
}
```

---

### Step 4: Enhance Agent Manager with Auto-Subscriptions
**File**: `src/managers/agent-manager.ts` (enhance existing)

**Add automatic event subscriptions**:
```typescript
// Add imports for event integration
import { subscribeAgentToMessages } from './agent-events.js';

// Track agent subscriptions for cleanup
const agentSubscriptions = new Map<string, () => void>();

// Update createAgent function
export async function createAgent(params: CreateAgentParams): Promise<Agent> {
  // ...existing agent creation logic...
  
  const agent: Agent = {
    id: params.id,
    type: params.type,
    status: 'inactive',
    config: {
      name: params.name,
      type: params.type,
      provider: params.provider,
      model: params.model,
      apiKey: params.apiKey,
      baseUrl: params.baseUrl,
      systemPrompt: params.systemPrompt,
      temperature: params.temperature,
      maxTokens: params.maxTokens,
      autoSyncMemory: true // ← Default: enable auto-sync
    },
    createdAt: now,
    lastActive: now,
    llmCallCount: 0,
    memory: []
  };

  await saveAgentToDisk(worldId, agent);
  
  // Get world for event subscription
  const world = await getWorld(worldId);
  if (world) {
    // Add agent to world
    world.agents.set(agent.id, agent);
    
    // Automatically subscribe agent to world messages
    const unsubscribe = subscribeAgentToMessages(world, agent);
    agentSubscriptions.set(`${worldId}:${agent.id}`, unsubscribe);
  }
  
  return agent;
}

// Update deleteAgent function
export async function deleteAgent(agentId: string): Promise<boolean> {
  const worldId = getWorldId();
  
  // Unsubscribe from events
  const subscriptionKey = `${worldId}:${agentId}`;
  const unsubscribe = agentSubscriptions.get(subscriptionKey);
  if (unsubscribe) {
    unsubscribe();
    agentSubscriptions.delete(subscriptionKey);
  }
  
  // Remove from world agents Map
  const world = await getWorld(worldId);
  if (world) {
    world.agents.delete(agentId);
  }
  
  return await deleteAgentFromDisk(worldId, agentId);
}
```

---

### Step 5: Create LLM Manager with New SSE Events
**File**: `src/managers/llm-manager.ts`

**Purpose**: LLM integration using World.eventEmitter for SSE events

**Functions to implement**:
```typescript
import { generateText, streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
// Import other AI SDK providers as needed
import { World, Agent, AgentMessage, LLMProvider, stripCustomFieldsFromMessages } from '../types.js';
import { publishSSE } from './world-events.js';
import { generateId, WorldSSEEvent } from './utils.js';

// LLM configuration interface
export interface LLMConfig {
  provider: LLMProvider;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
}

// Streaming agent response with SSE events
export async function streamAgentResponse(
  world: World,
  agent: Agent, 
  messages: AgentMessage[]
): Promise<string> {
  const messageId = generateId();
  
  try {
    // Publish SSE start event
    publishSSE(world, {
      agentName: agent.id,
      type: 'start',
      messageId
    });

    // Load LLM provider
    const model = loadLLMProvider(agent.config);
    
    // Convert messages for LLM (strip custom fields)
    const llmMessages = stripCustomFieldsFromMessages(messages);
    
    // Stream response
    const { textStream } = await streamText({
      model,
      messages: llmMessages,
      temperature: agent.config.temperature,
      maxTokens: agent.config.maxTokens
    });

    let fullResponse = '';
    
    // Stream chunks and emit SSE events
    for await (const chunk of textStream) {
      fullResponse += chunk;
      
      publishSSE(world, {
        agentName: agent.id,
        type: 'chunk',
        content: chunk,
        messageId
      });
    }

    // Publish SSE end event
    publishSSE(world, {
      agentName: agent.id,
      type: 'end',
      messageId,
      // Add usage information if available
    });

    // Update agent activity
    agent.lastActive = new Date();
    agent.llmCallCount++;
    agent.lastLLMCall = new Date();

    return fullResponse;

  } catch (error) {
    // Publish SSE error event
    publishSSE(world, {
      agentName: agent.id,
      type: 'error',
      error: error.message,
      messageId
    });
    
    throw error;
  }
}

// Non-streaming LLM call
export async function generateAgentResponse(
  agent: Agent,
  messages: AgentMessage[]
): Promise<string> {
  const model = loadLLMProvider(agent.config);
  const llmMessages = stripCustomFieldsFromMessages(messages);
  
  const { text } = await generateText({
    model,
    messages: llmMessages,
    temperature: agent.config.temperature,
    maxTokens: agent.config.maxTokens
  });

  // Update agent activity
  agent.lastActive = new Date();
  agent.llmCallCount++;
  agent.lastLLMCall = new Date();

  return text;
}

// LLM provider loading (extracted from existing llm.ts)
function loadLLMProvider(config: AgentConfig): any {
  // Implementation similar to existing llm.ts but without event dependencies
  switch (config.provider) {
    case LLMProvider.OPENAI:
      return createOpenAI({
        apiKey: config.apiKey || process.env.OPENAI_API_KEY || ''
      })(config.model);
    
    // Add other providers as needed...
    
    default:
      throw new Error(`Unsupported LLM provider: ${config.provider}`);
  }
}
```

---

### Step 6: Create Message Manager for Broadcasting
**File**: `src/managers/message-manager.ts`

**Purpose**: High-level message broadcasting and routing functions

**Functions to implement**:
```typescript
import { publishMessage } from './world-events.js';
import { getWorld } from './world-manager.js';
import { WorldMessageEvent } from './utils.js';

// Broadcast message to all agents in a world
export async function broadcastMessage(worldId: string, message: string, sender?: string): Promise<void> {
  const world = await getWorld(worldId);
  if (!world) {
    throw new Error(`World ${worldId} not found`);
  }

  publishMessage(world, message, sender || 'HUMAN');
}

// Send direct message to specific agent
export async function sendDirectMessage(
  worldId: string, 
  targetAgentId: string, 
  message: string, 
  sender?: string
): Promise<void> {
  const world = await getWorld(worldId);
  if (!world) {
    throw new Error(`World ${worldId} not found`);
  }

  const targetAgent = world.agents.get(targetAgentId);
  if (!targetAgent) {
    throw new Error(`Agent ${targetAgentId} not found in world ${worldId}`);
  }

  // Publish with target information for filtering
  publishMessage(world, `@${targetAgentId} ${message}`, sender || 'HUMAN');
}

// Get world message history (if needed)
export async function getWorldMessages(worldId: string): Promise<WorldMessageEvent[]> {
  // Implementation depends on if you want to track message history
  // Could store in World object or separate storage
  return [];
}
```

---

## Implementation Order

### Phase 1: Core Infrastructure (Days 1-2)
1. ✅ Create `utils.ts` with generateId and type definitions
2. ✅ Create `world-events.ts` with basic event functions
3. ✅ Enhance `world-manager.ts` with EventEmitter integration
4. ✅ Fix `agent-manager.ts` comment block corruption
5. ✅ Test basic message emission/subscription
6. ✅ Verify per-world event isolation

### Phase 2: Agent Integration (Days 3-4)  
1. ✅ Create `agent-events.ts` with agent processing logic
2. ✅ Enhance `agent-manager.ts` with auto-subscriptions
3. ✅ Implement message filtering and response logic
4. ✅ Test agent-to-agent communication

### Phase 3: LLM Integration (Days 5-6)
1. ✅ Create `llm-manager.ts` with streaming and SSE events
2. ✅ Integrate with agent message processing
3. ✅ Add memory auto-sync functionality
4. ✅ Test end-to-end LLM workflows

### Phase 4: Message Management (Days 7-8)
1. ✅ Create `message-manager.ts` for broadcasting
2. ✅ Add direct messaging capabilities  
3. ✅ Integration testing across all components
4. ✅ Performance testing and optimization

## Testing Strategy

### Unit Testing
- ✅ World.eventEmitter event emission/subscription
- ✅ Agent message filtering logic
- ✅ LLM integration with SSE events
- ✅ Memory auto-sync functionality

### Integration Testing
- ✅ Multi-agent communication in single world
- ✅ Cross-world event isolation verification
- ✅ Agent subscription cleanup on deletion
- ✅ Error handling and rollback scenarios

### Performance Testing
- ✅ Event throughput with multiple agents
- ✅ Memory usage with large conversation histories
- ✅ File I/O performance with auto-sync enabled
- ✅ EventEmitter performance vs existing event bus

## Success Criteria

### Functional Verification
- [ ] ✅ Per-world event isolation working correctly
- [ ] ✅ Agents automatically process all world messages  
- [ ] ✅ Memory auto-sync configurable and working
- [ ] ✅ SSE events maintain protocol compatibility
- [ ] ✅ Zero dependencies on existing event system

### Architectural Verification  
- [ ] ✅ Clean separation from existing code
- [ ] ✅ No circular dependencies
- [ ] ✅ Proper subscription cleanup
- [ ] ✅ Error handling with rollback

### Compatibility Verification
- [ ] ✅ Existing event system continues working unchanged
- [ ] ✅ New and old systems can run in parallel
- [ ] ✅ SSE message protocol compatible with clients
- [ ] ✅ Zero breaking changes to existing API
