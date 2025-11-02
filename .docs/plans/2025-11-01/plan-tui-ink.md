# Architecture Plan: Ink-Based TUI Client for Agent World

**Date:** 2025-11-01  
**Last Updated:** 2025-11-02 (Architecture Review)  
**Status:** Updated - Ready for Implementation  
**Related Requirement:** `.docs/reqs/2025-11-01/req-async-world-processing.md`  
**Depends On:** `.docs/plans/2025-11-01/plan-async-world-processing.md` (WebSocket server - ✅ COMPLETED)

## Overview

Implementation plan for a modern Terminal User Interface (TUI) using Ink (React for CLIs) that connects to the Agent World WebSocket server. This provides a professional, real-time monitoring interface for agent worlds with minimal implementation effort.

**Core Goals**:
- ✅ Professional terminal UI with React-like components
- ✅ Real-time event streaming from WebSocket server
- ✅ **Zero code duplication** via shared code in ws/ folder
- ✅ Responsive layout (compact/narrow/normal modes)
- ✅ Interactive command execution
- ✅ Integrated with existing CLI (separate binary, same package)

**Key Benefits**:
- ✅ Easiest implementation (2/10 difficulty)
- ✅ Fastest development (4-5 days total)
- ✅ Automatic re-rendering (Ink handles terminal updates)
- ✅ Familiar React patterns (hooks, components, state)
- ✅ Rich UI components (spinners, colors, layouts)
- ✅ **Shared packages eliminate maintenance burden**
- ✅ **Focused hooks for better testability**

**Architecture Review Updates (2025-11-02)**:
- ❌ **Removed:** Code copying from web/ (Phase 0)
- ✅ **Added:** Shared code in ws/ folder (types, domain, ws-client) - no new packages
- ✅ **Added:** Split WebSocket hook into 3 focused hooks
- ✅ **Added:** Responsive layout system for terminal compatibility
- ✅ **Added:** CLI integration strategy (separate binary, same package)
- ✅ **Added:** Performance optimizations (batching, throttling)
- ✅ **Added:** Comprehensive error handling

---

## Updated Phase Structure (4 Phases, 4-5 Days)

**PREREQUISITE: WebSocket Server (ws/) - ✅ COMPLETED**
- Event streaming protocol implementation
- Subscription/replay/command handling
- Ready for TUI integration

### Phase 0: Shared Code in ws/ Folder (Day 1)
**NEW APPROACH:** Add shared code to ws/ folder instead of copying or creating new packages
- ws/types.ts (shared type definitions)
- ws/domain.ts (shared business logic)  
- ws/ws-client.ts (reusable WebSocket client)

### Phase 1: Core Infrastructure (Day 2)
WebSocket connection + 3 focused hooks + responsive layout

### Phase 2: UI Components (Day 3)
Chat view + agent sidebar + input box + layout modes

### Phase 3: Polish & Testing (Day 4-5)
Error handling + commands + testing + CLI integration + documentation

---

## Phase 0: Shared Code in ws/ Folder (Day 1)

**Goal:** Add shared types, domain logic, and WebSocket client to ws/ folder.

**Why ws/ Folder:**
- ✅ **Zero code duplication** - single source of truth
- ✅ **No new packages** - uses existing ws/ package  
- ✅ **Semantically correct** - ws/ naturally contains WebSocket protocol + client code
- ✅ **Works everywhere** - Node.js (TUI, ws server) and browser (web, React apps)
- ✅ **Easy imports** - `import { Message } from '../ws/types.js'`
- ✅ **Already has infrastructure** - package.json, tsconfig, build setup

**What Goes in ws/:**
- `ws/types.ts` - Shared TypeScript types (Message, Agent, WSEvent, etc.)
- `ws/domain.ts` - Pure business logic functions (validation, utils)
- `ws/ws-client.ts` - WebSocket client (works in Node.js + browser)

**What Stays Separate:**
- `ws/ws-server.ts` - WebSocket server (Node.js only)
- `ws/queue-processor.ts` - Queue processor (Node.js only)
- `tui/` - TUI-specific UI components and hooks
- `web/` - Web-specific UI components (can optionally use ws/types, ws/domain)

---

### Task 0.1: Add Shared Types to ws/types.ts

**Create:** `ws/types.ts`

**Content Strategy:**
- Extract types from `web/src/types/index.ts`
- Remove UI-specific fields (spriteIndex, expandable, etc.)
- Keep only core data structures
- Add JSDoc comments for all exports
- Ensure browser + Node.js compatibility (types are always compatible)

**File Content (example):**
```typescript
// ws/types.ts - Shared type definitions

/**
 * Event types in the Agent World system
 */
export type EventType = 'message' | 'sse' | 'world' | 'log';
export type SenderType = 'human' | 'agent' | 'system';

/**
 * Message in a chat
 */
export interface Message {
  messageId: string;
  sender: string;
  content: string;
  timestamp: Date;
  chatId?: string;
  isHistorical?: boolean;
  // UI fields removed: spriteIndex, expandable, resultPreview
}

/**
 * Agent definition
 */
export interface Agent {
  name: string;
  prompt: string;
  model?: string;
  // UI fields removed: spriteIndex, messageCount
}

/**
 * World configuration
 */
export interface World {
  id: string;
  name: string;
  agents: Agent[];
}

/**
 * Chat session
 */
export interface Chat {
  id: string;
  worldId: string;
  name?: string;
  createdAt: Date;
}

/**
 * WebSocket protocol - client to server
 */
export interface WSMessage {
  type: 'subscribe' | 'enqueue' | 'command' | 'unsubscribe' | 'ping';
  worldId?: string;
  chatId?: string | null;
  replayFrom?: 'beginning' | number;
  content?: string;
  sender?: string;
  command?: string;
}

/**
 * WebSocket protocol - server to client
 */
export interface WSEvent {
  type: 'event' | 'subscribed' | 'enqueued' | 'result' | 'replay-complete' | 'error' | 'pong';
  seq?: number;
  isHistorical?: boolean;
  eventType?: string;
  event?: any;
  currentSeq?: number;
  replayingFrom?: number;
  historicalEventCount?: number;
  messageId?: string;
  success?: boolean;
  message?: string;
  data?: any;
}

/**
 * SSE streaming events
 */
export interface StreamStartData {
  agentName: string;
  messageId: string;
}

export interface StreamChunkData {
  agentName: string;
  content: string;
}

export interface StreamEndData {
  agentName: string;
  messageId: string;
}

// ... other shared types
```

**Tasks:**
- [ ] Create `ws/types.ts`
- [ ] Extract and clean types from web/src/types/
- [ ] Remove UI-specific fields
- [ ] Add comprehensive JSDoc comments
- [ ] Ensure TypeScript compiles in ws/ package
- [ ] Update ws/index.ts to export types

**Usage Examples:**
```typescript
// In tui/src/App.tsx
import type { Message, Agent, WSEvent } from '../ws/types.js';

// In web/src/component.ts (if migrated)
import type { Message, Agent } from '../ws/types';
```

**Deliverable:** ws/types.ts (~400 LOC, 0% duplication)

---

### Task 0.2: Add WebSocket Client to ws/ws-client.ts

**Create:** `ws/ws-client.ts`

**Features:**
- Connection lifecycle management  
- Automatic reconnection with exponential backoff
- Offline message queue
- Type-safe protocol (using ws/types.ts)
- Event-driven architecture
- Works in both Node.js (using `ws` package) and browser (using global `WebSocket`)

**File Content (example):**
```typescript
// ws/ws-client.ts - WebSocket client for Node.js + browser

import type { WSMessage, WSEvent } from './types.js';

// Detect environment and use appropriate WebSocket implementation
const isNode = typeof process !== 'undefined' && process.versions?.node;
let WebSocketImpl: any;

if (isNode) {
  // Node.js: use ws package (already a dependency of ws/)
  WebSocketImpl = require('ws').WebSocket;
} else {
  // Browser: use global WebSocket
  WebSocketImpl = globalThis.WebSocket;
}

export interface WebSocketClientOptions {
  onEvent?: (event: WSEvent) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onError?: (error: Error) => void;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

/**
 * WebSocket client that works in Node.js and browser
 */
export class WebSocketClient {
  private ws: any | null = null;
  private url: string;
  private options: WebSocketClientOptions;
  private reconnectAttempts = 0;
  private messageQueue: WSMessage[] = [];
  private reconnectTimeout: NodeJS.Timeout | null = null;

  constructor(url: string, options: WebSocketClientOptions = {}) {
    this.url = url;
    this.options = {
      reconnectInterval: 3000,
      maxReconnectAttempts: 5,
      ...options
    };
  }

  connect(): void {
    // Connection implementation
  }

  send(message: WSMessage): void {
    // Send implementation with queue
  }

  disconnect(): void {
    // Disconnect implementation
  }

  private reconnect(): void {
    // Reconnection with exponential backoff
  }

  private flushQueue(): void {
    // Flush queued messages
  }
}
```

**Tasks:**
- [ ] Create `ws/ws-client.ts`
- [ ] Implement connection management with reconnection
- [ ] Implement message queue for offline messages
- [ ] Add browser + Node.js compatibility
- [ ] Add comprehensive error handling
- [ ] Write unit tests with mock WebSocket
- [ ] Add JSDoc documentation
- [ ] Update ws/index.ts to export WebSocketClient

**Usage Examples:**
```typescript
// In tui/src/hooks/useWebSocketConnection.ts
import { WebSocketClient } from '../ws/ws-client.js';

const client = new WebSocketClient('ws://localhost:3001', {
  onEvent: (event) => console.log(event),
  onConnected: () => console.log('connected')
});
client.connect();
```

**Deliverable:** ws/ws-client.ts (~500 LOC, works in Node.js + browser)

---

### Task 0.3: Add Shared Domain Logic to ws/domain.ts

**Create:** `ws/domain.ts`

**Purpose:** Share business logic between web frontend, TUI, and WebSocket server. This file contains **pure functions only** - no framework-specific code.

**Location Rationale:**
- Lives in ws/ folder alongside types.ts and ws-client.ts
- WebSocket server already has the infrastructure
- Works in both Node.js (TUI, server) and browser (web, React)
- No new package needed

**Content Strategy:**
- Extract **pure functions only** from `web/src/domain/`
- Skip framework-specific code (AppRun state creators)
- Focus on business logic, validation, calculations
- All functions must be framework-agnostic
- Comprehensive unit tests (easy to test pure functions)

**File Structure:**
```typescript
// ws/domain.ts

// ============================================================
// VALIDATION LOGIC
// ============================================================

export function validateMessage(content: string): { valid: boolean; error?: string } {
  if (!content || content.trim().length === 0) {
    return { valid: false, error: 'Message cannot be empty' };
  }
  if (content.length > 10000) {
    return { valid: false, error: 'Message too long (max 10000 chars)' };
  }
  return { valid: true };
}

export function shouldSendOnEnter(key: string, input: string): boolean {
  return key === 'Enter' && !input.includes('\n');
}

// ============================================================
// MESSAGE UTILITIES
// ============================================================

export function hasExpandableContent(message: Message): boolean {
  return message.content.length > 200 || message.content.includes('\n\n');
}

export function findMessageById(messages: Message[], id: string): Message | undefined {
  return messages.find(msg => msg.id === id);
}

export function truncateMessage(content: string, maxLength: number): string {
  if (content.length <= maxLength) return content;
  return content.slice(0, maxLength) + '...';
}

// ============================================================
// CHAT UTILITIES
// ============================================================

export function canDeleteChat(chat: Chat): boolean {
  return chat.id !== 'default' && chat.messages.length === 0;
}

export function formatChatTimestamp(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: 'numeric',
    hour12: true
  }).format(date);
}

// ============================================================
// STREAMING UTILITIES
// ============================================================

export function isStreaming(agentName: string, agents: Map<string, AgentStatus>): boolean {
  return agents.get(agentName)?.status === 'thinking';
}

export function getActiveAgents(agents: Map<string, AgentStatus>): string[] {
  return Array.from(agents.entries())
    .filter(([_, status]) => status.status === 'thinking')
    .map(([name]) => name);
}

// event-processing.ts
export function processMessageEvent(event: WSEvent): Message | null
export function processSSEEvent(event: WSEvent): { agentName: string; action: 'start' | 'chunk' | 'end'; content?: string }
```

**Tasks:**
- [ ] Create ws/domain.ts file
- [ ] Extract pure functions from web/src/domain/
- [ ] Skip framework-specific code
- [ ] Add comprehensive JSDoc comments
- [ ] Write extensive unit tests (>90% coverage)
- [ ] Document all exported functions

**Deliverable:** Shared domain logic in ws/domain.ts (~600 LOC, pure functions, highly testable)

---

### Task 0.4: Update ws/index.ts and Validate Imports

**Goal:** Export shared code from ws/index.ts and validate the architecture

**Why This Task:**
- Makes shared code easily importable
- Provides a clean import surface
- Tests that all shared code works correctly
- Establishes import patterns for TUI and web

**Changes Required:**

**1. Update ws/index.ts:**
```typescript
// ws/index.ts

// Re-export all types
export type * from './types.js';

// Re-export WebSocket client
export { WebSocketClient } from './ws-client.js';

// Re-export domain logic
export * from './domain.js';

// Keep existing ws-server exports
export { startWebSocketServer } from './ws-server.js';
export { startQueueProcessor } from './queue-processor.js';
```

**2. Validate imports in web/:**
```typescript
// web/src/components/ChatView.tsx
// Before:
import type { Message, Agent, World } from '../types';
import { validateMessage } from '../domain/validation';

// After:
import type { Message, Agent, World } from '../../ws/types.js';
import { validateMessage } from '../../ws/domain.js';
```

**3. Validate imports in TUI (future):**
```typescript
// tui/src/components/ChatWindow.tsx
import type { Message } from '../../ws/types.js';
import { WebSocketClient } from '../../ws/ws-client.js';
import { validateMessage } from '../../ws/domain.js';
```

**Tasks:**
- [ ] Update ws/index.ts to export all shared code
- [ ] Update web/ imports to use ../ws/* paths
- [ ] Remove duplicated type definitions from web/src/
- [ ] Remove duplicated logic from web/src/domain/
- [ ] Run `npm install` to ensure dependencies are correct
- [ ] Verify web frontend still works
- [ ] Run web tests to ensure no regressions
- [ ] Document the new import patterns

**Deliverable:** Web frontend consuming shared code from ws/, validation complete

---

## Phase 1: Core Infrastructure (Day 2)

**Prerequisites:**
- ✅ Phase 0 completed (shared code in ws/ folder)
- ✅ WebSocket server running on ws://localhost:3001
- ✅ Web frontend consuming shared code successfully

**Goal:** Build TUI infrastructure with 3 focused hooks and responsive layout system.

**Key Changes from Original Plan:**
- ✅ **Split monolithic useWebSocket into 3 focused hooks**
- ✅ **Add responsive layout system**
- ✅ **Use shared code from ws/ folder**
- ✅ **Add performance optimizations (batching, throttling)**
    "ws",
    "tui",
    "next"
  ]
}
```

**Tasks:**
- [ ] Update ws/index.ts to export all shared code
- ✅ Phase 0 completed (shared packages created and validated)
- ✅ WebSocket server running on ws://localhost:3001
- ✅ Web frontend consuming shared packages successfully

**Goal:** Build TUI infrastructure with 3 focused hooks and responsive layout system.

**Key Changes from Original Plan:**
- ✅ **Split monolithic useWebSocket into 3 focused hooks**
- ✅ **Add responsive layout system**
- ✅ **Use shared packages instead of local types**
- ✅ **Add performance optimizations (batching, throttling)**

---

### Task 1.1: Project Setup and Dependencies

**Create new package:**
```
tui/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.tsx         # Entry point
│   ├── App.tsx           # Main component
│   ├── hooks/            # React hooks (NEW)
│   │   ├── useWebSocketConnection.ts   # Connection management
│   │   ├── useAgentWorldClient.ts      # High-level operations
│   │   ├── useWorldState.ts            # State management
│   │   ├── useEventProcessor.ts        # Event processing
│   │   └── useResponsiveLayout.ts      # Layout adaptation
│   ├── components/       # Ink UI components (NEW)
│   │   ├── layouts/      # Layout modes
│   │   ├── ChatView.tsx
│   │   ├── AgentSidebar.tsx
│   │   └── InputBox.tsx
│   └── utils/            # TUI-specific utilities
└── README.md
```

**package.json:**
```json
{
  "name": "@agent-world/tui",
  "version": "1.0.0",
  "type": "module",
  "bin": {
    "agent-world-tui": "./dist/index.js"
  },
  "scripts": {
    "dev": "tsx src/index.tsx --server ws://localhost:3001 --world default-world",
    "build": "tsc && chmod +x dist/index.js",
    "start": "node dist/index.js",
    "test": "vitest"
  },
  "dependencies": {
    "ink": "^4.4.1",
    "ink-spinner": "^5.0.0",
    "ink-text-input": "^5.0.1",
    "ink-select-input": "^5.0.0",
    "react": "^18.2.0",
    "meow": "^13.0.0",
    "chalk": "^5.3.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "typescript": "^5.3.3",
    "tsx": "^4.7.0",
    "vitest": "^1.0.0"
  }
}
```

**tsconfig.json:**
```json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "jsx": "react",
    "module": "ES2022",
    "target": "ES2022",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Tasks:**
- [ ] Create `tui/` directory structure
- [ ] Initialize package.json with shared package dependencies
- [ ] Configure TypeScript for React/Ink
- [ ] Add build and dev scripts
- [ ] Install dependencies (`npm install` links workspaces)
- [ ] Verify shared packages resolve correctly
- [ ] Create basic entry point and App skeleton

**Deliverable:** Project scaffolding ready, consuming shared packages

---

### Task 1.2: WebSocket Hooks Implementation (3 Focused Hooks)

**Architecture Decision:** Split into 3 focused hooks for better separation of concerns

**Why 3 Hooks:**
- ✅ Single Responsibility Principle - each hook has one job
- ✅ Easier testing - test connection, operations, and state independently
- ✅ Better reusability - hooks can be composed differently
- ✅ Clearer code - smaller, focused hooks are easier to understand

#### Hook 1: useWebSocketConnection (Connection Management)

**File:** `tui/src/hooks/useWebSocketConnection.ts`

**Responsibility:** Low-level WebSocket connection lifecycle only
- Connection state tracking (connected, connecting, error)
- Automatic reconnection with exponential backoff
- Raw WebSocket instance management
- Connection events (onOpen, onClose, onError)

**Interface:**
```typescript
export interface UseWebSocketConnectionReturn {
  ws: WebSocket | null;
  connected: boolean;
  connecting: boolean;
  error: string | null;
  reconnect: () => void;
  disconnect: () => void;
}

export function useWebSocketConnection(
  url: string,
  options?: {
    onConnected?: () => void;
    onDisconnected?: () => void;
    onError?: (error: Error) => void;
    reconnectInterval?: number;
    maxReconnectAttempts?: number;
  }
): UseWebSocketConnectionReturn;
```

**Implementation Strategy:**
- Use `WebSocketClient` from `ws/ws-client.ts` for core connection logic
- Wrap in React hooks for lifecycle management
- Keep minimal - just connection, no protocol

**Tasks:**
- [ ] Implement connection state management
- [ ] Add automatic reconnection logic
- [ ] Add connection event callbacks
- [ ] Unit tests for connection lifecycle
- [ ] Test reconnection scenarios

**Deliverable:** ~100 LOC, focused connection hook

#### Hook 2: useAgentWorldClient (High-Level Operations)

**File:** `tui/src/hooks/useAgentWorldClient.ts`

**Responsibility:** Protocol-level operations on top of connection
- Subscribe to world/chat events
- Enqueue messages
- Execute commands
- Unsubscribe
- Message queue for offline messages

**Interface:**
```typescript
import type { WSMessage, WSEvent } from '../../ws/types.js';

export interface UseAgentWorldClientReturn {
  subscribe: (worldId: string, chatId: string | null, replayFrom: 'beginning' | number) => void;
  enqueue: (worldId: string, chatId: string | null, content: string, sender?: string) => void;
  executeCommand: (worldId: string, command: string) => void;
  unsubscribe: (worldId: string, chatId?: string | null) => void;
  ping: () => void;
}

export function useAgentWorldClient(
  ws: WebSocket | null,
  connected: boolean,
  onEvent?: (event: WSEvent) => void
): UseAgentWorldClientReturn;
```

**Implementation Strategy:**
- Depends on useWebSocketConnection (receives ws instance)
- Uses types from `ws/types.ts` for protocol types
- Handles message queueing when offline
- Processes incoming WebSocket messages

**Tasks:**
- [ ] Implement subscription management
- [ ] Implement message queueing
- [ ] Implement command execution
- [ ] Add message parsing and validation
- [ ] Unit tests with mock WebSocket
- [ ] Test offline message queue

**Deliverable:** ~150 LOC, protocol operations hook

#### Hook 3: useWorldState (State Management)

**File:** `tui/src/hooks/useWorldState.ts`

**Responsibility:** Application state derived from events
- Message history
- Agent status tracking
- Replay progress
- Error state

**Interface:**
```typescript
import type { Message, Agent } from '../../ws/types.js';

export interface AgentStatus {
  name: string;
  isActive: boolean;
  isStreaming: boolean;
  currentMessage?: string;
  lastActivity?: Date;
}

export interface WorldState {
  messages: Message[];
  agents: Map<string, AgentStatus>;
  isReplaying: boolean;
  replayProgress?: {
    current: number;
    total: number;
    percentage: number;
  };
  error: string | null;
}

export interface UseWorldStateReturn extends WorldState {
  addMessage: (message: Message) => void;
  updateAgentStatus: (agentName: string, status: Partial<AgentStatus>) => void;
  setReplayProgress: (current: number, total: number) => void;
  setError: (error: string | null) => void;
  clearMessages: () => void;
  reset: () => void;
}

export function useWorldState(): UseWorldStateReturn;
```

**Implementation Strategy:**
- Pure React state management (useState, useCallback, useMemo)
- No WebSocket logic - just state updates
- Uses types from `ws/types.ts` for data structures
- Memory limit (keep last 1000 messages)

**Tasks:**
- [ ] Implement message history management
- [ ] Implement agent status tracking
- [ ] Implement replay progress tracking
- [ ] Add memory limits
- [ ] Unit tests for state updates
- [ ] Test with large message counts

**Deliverable:** ~200 LOC, pure state management hook

#### Hook 4: useEventProcessor (Event Processing)

**File:** `tui/src/hooks/useEventProcessor.ts`

**Responsibility:** Process WebSocket events and update state
- Parse incoming events
- Update world state accordingly
- Handle different event types (message, SSE, world events)
- Batch updates during replay for performance

**Interface:**
```typescript
import type { WSEvent } from '../../ws/types.js';
import type { UseWorldStateReturn } from './useWorldState';

export interface UseEventProcessorOptions {
  batchDuringReplay?: boolean;    // Buffer updates during replay
  batchSize?: number;              // Process N at a time
  throttleMs?: number;             // Max update frequency
}

export function useEventProcessor(
  worldState: UseWorldStateReturn,
  options?: UseEventProcessorOptions
): (event: WSEvent) => void;
```

**Implementation Strategy:**
- Uses functions from `ws/domain.ts` for event processing logic
- Batches state updates during replay (performance optimization)
- Throttles UI updates (max 60fps)
- Handles all event types from protocol

**Tasks:**
- [ ] Implement event type routing
- [ ] Add batching for replay performance
- [ ] Add throttling for UI updates
- [ ] Use domain logic for processing
- [ ] Unit tests for all event types
- [ ] Performance tests with 1000+ events

**Deliverable:** ~150 LOC, event processing hook with performance optimizations

**Summary - 3 Focused Hooks:**
```typescript
// Usage in App.tsx:
const wsConnection = useWebSocketConnection(serverUrl, { onConnected, onDisconnected });
const worldState = useWorldState();
const processEvent = useEventProcessor(worldState, { batchDuringReplay: true });
const client = useAgentWorldClient(wsConnection.ws, wsConnection.connected, processEvent);

// Subscribe to world
useEffect(() => {
  if (wsConnection.connected) {
    client.subscribe(worldId, chatId, replayFrom);
  }
}, [wsConnection.connected]);

// Send message
client.enqueue(worldId, chatId, 'Hello', 'human');
```

**Total:** ~600 LOC across 4 hooks (vs 500+ in monolithic hook)

**Benefits:**
- Clear separation of concerns
- Easy to test independently
- Flexible composition
- Performance optimizations built-in

**Deliverable:** 4 focused hooks with comprehensive testing

---

### Task 1.3: World State Hook

**File:** `tui/src/hooks/useWorldState.ts`

```typescript
/**
 * World State Management Hook
 * 
 * Manages world state derived from WebSocket events:
 * - Message history
 * - Agent activity status
 * - Streaming state
 * - Event replay progress
 * 
 * Provides filtered and formatted data for UI components.
 * 
 * NOTE: Message interface should use types from tui/src/types/ (Phase 0)
 * rather than redefining here.
 */

import { useState, useCallback, useMemo } from 'react';
import type { WebSocketEvent } from './useWebSocket';
import type { Message, Agent } from '../types';  // Use Phase 0 types

export interface AgentStatus {
  name: string;
  isActive: boolean;
  isStreaming: boolean;
  currentMessage?: string;
  lastActivity?: Date;
}

export interface WorldState {
  messages: Message[];
  agents: Map<string, AgentStatus>;
  isReplaying: boolean;
  replayProgress?: {
    current: number;
    total: number;
    percentage: number;
  };
  error: string | null;
}

export interface UseWorldStateReturn extends WorldState {
  addMessage: (message: Message) => void;
  updateAgentStatus: (agentName: string, status: Partial<AgentStatus>) => void;
  setReplayProgress: (current: number, total: number) => void;
  setError: (error: string | null) => void;
  clearMessages: () => void;
  reset: () => void;
}

const MAX_MESSAGES = 1000; // Keep last 1000 messages in memory

export function useWorldState(): UseWorldStateReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [agents, setAgents] = useState<Map<string, AgentStatus>>(new Map());
  const [isReplaying, setIsReplaying] = useState(false);
  const [replayProgress, setReplayProgressState] = useState<{ current: number; total: number; percentage: number } | undefined>();
  const [error, setError] = useState<string | null>(null);

  const addMessage = useCallback((message: Message) => {
    setMessages(prev => {
      const newMessages = [...prev, message];
      // Keep only last MAX_MESSAGES
      if (newMessages.length > MAX_MESSAGES) {
        return newMessages.slice(newMessages.length - MAX_MESSAGES);
      }
      return newMessages;
    });
  }, []);

  const updateAgentStatus = useCallback((agentName: string, status: Partial<AgentStatus>) => {
    setAgents(prev => {
      const newAgents = new Map(prev);
      const current = newAgents.get(agentName) || {
        name: agentName,
        isActive: false,
        isStreaming: false
      };
      newAgents.set(agentName, { ...current, ...status });
      return newAgents;
    });
  }, []);

  const setReplayProgress = useCallback((current: number, total: number) => {
    if (total > 0) {
      setIsReplaying(true);
      setReplayProgressState({
        current,
        total,
        percentage: Math.round((current / total) * 100)
      });
    } else {
      setIsReplaying(false);
      setReplayProgressState(undefined);
    }
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  const reset = useCallback(() => {
    setMessages([]);
    setAgents(new Map());
    setIsReplaying(false);
    setReplayProgressState(undefined);
    setError(null);
  }, []);

  return {
    messages,
    agents,
    isReplaying,
    replayProgress,
    error,
    addMessage,
    updateAgentStatus,
    setReplayProgress,
    setError,
    clearMessages,
    reset
  };
}

/**
 * Hook to process WebSocket events and update world state
 */
export function useEventProcessor(worldState: UseWorldStateReturn) {
  return useCallback((event: WebSocketEvent) => {
    switch (event.type) {
      case 'subscribed':
        if (event.historicalEventCount && event.historicalEventCount > 0) {
          worldState.setReplayProgress(0, event.historicalEventCount);
        }
        break;

      case 'event':
        // Update replay progress for historical events
        if (event.isHistorical && worldState.replayProgress) {
          worldState.setReplayProgress(
            worldState.replayProgress.current + 1,
            worldState.replayProgress.total
          );
        }

        // Process event by type
        if (event.eventType === 'message' && event.event) {
          const msg = event.event;
          worldState.addMessage({
            messageId: msg.messageId || `${Date.now()}-${Math.random()}`,
            sender: msg.sender || 'unknown',
            content: msg.content || '',
            timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
            isHistorical: event.isHistorical
          });
        } else if (event.eventType === 'sse' && event.event) {
          const sseEvent = event.event;
          const agentName = sseEvent.agentName;

          if (sseEvent.type === 'start') {
            worldState.updateAgentStatus(agentName, {
              isStreaming: true,
              isActive: true,
              currentMessage: ''
            });
          } else if (sseEvent.type === 'chunk') {
            worldState.updateAgentStatus(agentName, {
              currentMessage: (worldState.agents.get(agentName)?.currentMessage || '') + (sseEvent.content || '')
            });
          } else if (sseEvent.type === 'end') {
            const finalMessage = worldState.agents.get(agentName)?.currentMessage;
            if (finalMessage) {
              worldState.addMessage({
                messageId: sseEvent.messageId || `${Date.now()}-${Math.random()}`,
                sender: agentName,
                content: finalMessage,
                timestamp: new Date(),
                isHistorical: event.isHistorical
              });
            }
            worldState.updateAgentStatus(agentName, {
              isStreaming: false,
              isActive: false,
              currentMessage: undefined,
              lastActivity: new Date()
            });
          }
        } else if (event.eventType === 'world' && event.event) {
          const worldEvent = event.event;
          
          // Track agent activity
          if (worldEvent.type === 'response-start' && worldEvent.source?.startsWith('agent:')) {
            const agentName = worldEvent.source.replace('agent:', '');
            worldState.updateAgentStatus(agentName, {
              isActive: true,
              lastActivity: new Date()
            });
          } else if (worldEvent.type === 'response-end' && worldEvent.source?.startsWith('agent:')) {
            const agentName = worldEvent.source.replace('agent:', '');
            worldState.updateAgentStatus(agentName, {
              isActive: false,
              lastActivity: new Date()
            });
          }
        }
        break;

      case 'replay-complete':
        worldState.setReplayProgress(0, 0);
        break;

      case 'error':
        worldState.setError(event.message || 'Unknown error');
        break;

      default:
        // Ignore other message types
        break;
    }
  }, [worldState]);
}
```

**Tasks:**
- [ ] Implement world state management hook
- [ ] Add message history tracking (use Message type from Phase 0)
- [ ] Add agent status tracking
- [ ] Implement replay progress tracking
- [ ] Add event processor for WebSocket events (reuse logic from Phase 0)
- [ ] Unit tests for state updates

**Deliverable:** World state hook with event processing (leveraging Phase 0 domain logic)

---

### Task 1.3.5: Responsive Layout Hook

**File:** `tui/src/hooks/useResponsiveLayout.ts`

**Purpose:** Adapt layout to terminal size for better compatibility

```typescript
/**
 * Responsive Layout Hook
 * 
 * Determines layout mode based on terminal dimensions:
 * - Compact: < 80 cols (single pane, agent count only)
 * - Narrow: 80-120 cols (30%/70% split)
 * - Normal: > 120 cols (25%/75% split)
 * 
 * Handles terminal resize events automatically.
 */

import { useStdoutDimensions } from 'ink';
import { useMemo } from 'react';

export type LayoutMode = 'compact' | 'narrow' | 'normal';

export interface LayoutDimensions {
  mode: LayoutMode;
  sidebarWidth: number | string;
  chatWidth: number | string;
  showSidebar: boolean;
  terminalColumns: number;
  terminalRows: number;
}

export function useResponsiveLayout(): LayoutDimensions {
  const { columns, rows } = useStdoutDimensions();
  
  const layout = useMemo((): LayoutDimensions => {
    if (columns < 80) {
      // Compact mode: hide sidebar, show agent count in header
      return {
        mode: 'compact',
        sidebarWidth: 0,
        chatWidth: '100%',
        showSidebar: false,
        terminalColumns: columns,
        terminalRows: rows
      };
    } else if (columns < 120) {
      // Narrow mode: narrower sidebar
      return {
        mode: 'narrow',
        sidebarWidth: '30%',
        chatWidth: '70%',
        showSidebar: true,
        terminalColumns: columns,
        terminalRows: rows
      };
    } else {
      // Normal mode: full layout
      return {
        mode: 'normal',
        sidebarWidth: '25%',
        chatWidth: '75%',
        showSidebar: true,
        terminalColumns: columns,
        terminalRows: rows
      };
    }
  }, [columns, rows]);
  
  return layout;
}
```

**Layout Modes:**

**Compact Mode (< 80 cols):**
```
┌─────────────────────────────────────┐
│ Agent World - my-world (3 agents) ●│
├─────────────────────────────────────┤
│ [12:30:45] human:                   │
│   Hello there                       │
│ [12:30:46] assistant:               │
│   Hello! How can I help?            │
├─────────────────────────────────────┤
│ > Type message...                   │
├─────────────────────────────────────┤
│ Ctrl+C to exit | 42 messages        │
└─────────────────────────────────────┘
```

**Narrow Mode (80-120 cols):**
```
┌─────────────┬───────────────────────────────────────────┐
│ Agents (3)  │ Agent World - my-world                   ●│
├─────────────┼───────────────────────────────────────────┤
│ ● alice     │ [12:30:45] human:                         │
│   Last: ... │   Hello there                             │
│             │ [12:30:46] assistant:                     │
│ ○ bob       │   Hello! How can I help?                  │
│   Last: ... │                                           │
├─────────────┼───────────────────────────────────────────┤
│             │ > Type message...                         │
├─────────────┴───────────────────────────────────────────┤
│ Ctrl+C to exit | Messages: 42 | Agents: 3               │
└─────────────────────────────────────────────────────────┘
```

**Normal Mode (> 120 cols):**
```
┌─────────────────┬──────────────────────────────────────────────────────────┐
│ Agents (3)      │ Agent World - my-world                                  ●│
├─────────────────┼──────────────────────────────────────────────────────────┤
│ ● alice         │ [12:30:45] human:                                        │
│   🔵 Streaming  │   Hello there                                            │
│   Last: 12:31   │ [12:30:46] assistant:                                    │
│                 │   Hello! How can I help you today?                       │
│ ○ bob           │                                                          │
│   Last: 12:28   │                                                          │
│                 │                                                          │
│ ○ charlie       │                                                          │
│   Last: 12:25   │                                                          │
├─────────────────┼──────────────────────────────────────────────────────────┤
│                 │ > Type a message or /command...                          │
├─────────────────┴──────────────────────────────────────────────────────────┤
│ Ctrl+C to exit | Messages: 42 | Agents: 3 | Connected                     │
└────────────────────────────────────────────────────────────────────────────┘
```

**Tasks:**
- [ ] Implement useResponsiveLayout hook
- [ ] Define layout mode thresholds
- [ ] Calculate dimensions for each mode
- [ ] Handle terminal resize events
- [ ] Test on different terminal sizes
- [ ] Test resize behavior

**Deliverable:** ~100 LOC, responsive layout hook with 3 modes

---

### Task 1.4: Entry Point and Basic App

**File:** `tui/src/index.tsx`

```typescript
#!/usr/bin/env node

/**
 * Agent World TUI - Entry Point
 * 
 * Terminal User Interface for Agent World using Ink (React for CLIs).
 * Connects to WebSocket server for real-time monitoring and interaction.
 * 
 * Usage:
 *   agent-world-tui --server ws://localhost:3001 --world my-world
 *   agent-world-tui -s ws://localhost:3001 -w my-world --chat chat-123
 */

import React from 'react';
import { render } from 'ink';
import meow from 'meow';
import App from './App.js';

const cli = meow(`
  Usage
    $ agent-world-tui --server <url> --world <name>

  Options
    --server, -s  WebSocket server URL (default: ws://localhost:3001)
    --world, -w   World name or ID (required)
    --chat, -c    Chat ID to load (optional)
    --replay      Replay from sequence number or 'beginning' (default: beginning)
    --help        Show this help message

  Examples
    $ agent-world-tui --server ws://localhost:3001 --world my-world
    $ agent-world-tui -s ws://prod:3001 -w production --chat chat-123
    $ agent-world-tui -w my-world --replay 1500
`, {
  importMeta: import.meta,
  flags: {
    server: {
      type: 'string',
      alias: 's',
      default: 'ws://localhost:3001'
    },
    world: {
      type: 'string',
      alias: 'w',
      isRequired: true
    },
    chat: {
      type: 'string',
      alias: 'c'
    },
    replay: {
      type: 'string',
      default: 'beginning'
    }
  }
});

// Parse replay option
const replayFrom = cli.flags.replay === 'beginning' ? 'beginning' : parseInt(cli.flags.replay, 10);

render(
  <App
    serverUrl={cli.flags.server}
    worldId={cli.flags.world}
    chatId={cli.flags.chat || null}
    replayFrom={replayFrom}
  />
);
```

**File:** `tui/src/App.tsx`

```typescript
/**
 * Main App Component
 * 
 * Root component that orchestrates:
 * - WebSocket connection
 * - World state management
 * - Layout and routing between views
 */

import React, { useEffect, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { useWebSocket } from './hooks/useWebSocket.js';
import { useWorldState, useEventProcessor } from './hooks/useWorldState.js';

interface AppProps {
  serverUrl: string;
  worldId: string;
  chatId: string | null;
  replayFrom: 'beginning' | number;
}

const App: React.FC<AppProps> = ({ serverUrl, worldId, chatId, replayFrom }) => {
  const { exit } = useApp();
  const [hasSubscribed, setHasSubscribed] = useState(false);
  
  const worldState = useWorldState();
  const processEvent = useEventProcessor(worldState);
  
  const ws = useWebSocket(serverUrl, {
    onEvent: processEvent,
    onConnected: () => {
      worldState.setError(null);
    },
    onDisconnected: () => {
      worldState.setError('Disconnected from server');
    },
    onError: (error) => {
      worldState.setError(error.message);
    }
  });
  
  // Subscribe to world on connection
  useEffect(() => {
    if (ws.connected && !hasSubscribed) {
      ws.subscribe(worldId, chatId, replayFrom);
      setHasSubscribed(true);
    }
  }, [ws.connected, hasSubscribed, worldId, chatId, replayFrom, ws]);
  
  // Handle Ctrl+C to exit
  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      ws.disconnect();
      exit();
    }
  });
  
  // Loading state
  if (ws.connecting) {
    return (
      <Box flexDirection="column" padding={1}>
        <Box>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text color="cyan"> Connecting to {serverUrl}...</Text>
        </Box>
      </Box>
    );
  }
  
  // Connection error
  if (!ws.connected && worldState.error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">✗ {worldState.error}</Text>
        <Text color="gray" dimColor>Press Ctrl+C to exit</Text>
      </Box>
    );
  }
  
  // Replay progress
  if (worldState.isReplaying && worldState.replayProgress) {
    return (
      <Box flexDirection="column" padding={1}>
        <Box>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text color="cyan"> Replaying events...</Text>
        </Box>
        <Box marginTop={1}>
          <Text>
            {worldState.replayProgress.current} / {worldState.replayProgress.total} ({worldState.replayProgress.percentage}%)
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text color="gray" dimColor>Press Ctrl+C to exit</Text>
        </Box>
      </Box>
    );
  }
  
  // Main UI (placeholder for Phase 2)
  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="single" borderColor="cyan" paddingX={1}>
        <Text color="cyan" bold>Agent World - {worldId}</Text>
      </Box>
      
      <Box marginTop={1}>
        <Text>Messages: {worldState.messages.length}</Text>
      </Box>
      
      <Box marginTop={1}>
        <Text>Agents: {worldState.agents.size}</Text>
      </Box>
      
      {worldState.error && (
        <Box marginTop={1}>
          <Text color="red">Error: {worldState.error}</Text>
        </Box>
      )}
      
      <Box marginTop={1}>
        <Text color="gray" dimColor>Press Ctrl+C to exit</Text>
      </Box>
    </Box>
  );
};

export default App;
```

**Tasks:**
- [ ] Create entry point with CLI argument parsing
- [ ] Implement basic App component
- [ ] Add connection status display
- [ ] Add replay progress display
- [ ] Add keyboard shortcuts (Ctrl+C to exit)
- [ ] Add error display

**Deliverable:** Working TUI with connection and replay display

---

## Phase 2: UI Components (Day 3)

**Prerequisites:**
- ✅ Phase 1 completed (WebSocket connection working)
- ✅ Can connect to ws://localhost:3001 and receive events

**Goal:** Build Ink UI components using React patterns.

### Task 2.1: Chat View Component

**File:** `tui/src/components/ChatView.tsx`

```typescript
/**
 * Chat View Component
 * 
 * Displays message history with:
 * - Sender-specific colors (human = yellow, agents = green)
 * - Timestamps
 * - Auto-scrolling to latest message
 * - Historical vs live message indicators
 */

import React, { useRef, useEffect } from 'react';
import { Box, Text } from 'ink';
import type { Message } from '../hooks/useWorldState.js';

interface ChatViewProps {
  messages: Message[];
  maxMessages?: number;
}

const ChatView: React.FC<ChatViewProps> = ({ messages, maxMessages = 100 }) => {
  const containerRef = useRef<any>(null);
  
  // Get last N messages
  const displayMessages = messages.slice(-maxMessages);
  
  // Auto-scroll effect (Ink handles this automatically with flexGrow)
  useEffect(() => {
    // Ink's layout engine handles scrolling automatically
  }, [displayMessages.length]);
  
  if (displayMessages.length === 0) {
    return (
      <Box padding={1}>
        <Text color="gray" dimColor>No messages yet. Type a message to get started.</Text>
      </Box>
    );
  }
  
  return (
    <Box flexDirection="column" padding={1} ref={containerRef}>
      {displayMessages.map((msg, index) => {
        const isHuman = msg.sender === 'human' || msg.sender.toLowerCase() === 'human';
        const senderColor = isHuman ? 'yellow' : 'green';
        const timestamp = msg.timestamp.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });
        
        return (
          <Box key={`${msg.messageId}-${index}`} flexDirection="column" marginBottom={1}>
            <Box>
              <Text color="gray" dimColor>[{timestamp}]</Text>
              <Text> </Text>
              <Text color={senderColor} bold>{msg.sender}:</Text>
              {msg.isHistorical && <Text color="gray" dimColor> (historical)</Text>}
            </Box>
            <Box paddingLeft={2}>
              <Text>{msg.content}</Text>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
};

export default ChatView;
```

**Tasks:**
- [ ] Implement message list rendering
- [ ] Add sender-specific styling
- [ ] Add timestamp formatting
- [ ] Add historical message indicator
- [ ] Add empty state
- [ ] Test with large message counts

**Deliverable:** Chat view component with message display

---

### Task 2.2: Agent Sidebar Component

**File:** `tui/src/components/AgentSidebar.tsx`

```typescript
/**
 * Agent Sidebar Component
 * 
 * Displays agent status with:
 * - Active/inactive indicators
 * - Streaming status with spinner
 * - Last activity timestamp
 * - Real-time updates
 */

import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import type { AgentStatus } from '../hooks/useWorldState.js';

interface AgentSidebarProps {
  agents: Map<string, AgentStatus>;
}

const AgentSidebar: React.FC<AgentSidebarProps> = ({ agents }) => {
  const agentList = Array.from(agents.values());
  
  if (agentList.length === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="gray" dimColor>No agents</Text>
      </Box>
    );
  }
  
  return (
    <Box flexDirection="column" padding={1}>
      <Text color="cyan" bold>Agents ({agentList.length})</Text>
      <Box marginTop={1} flexDirection="column">
        {agentList.map((agent) => {
          const statusColor = agent.isActive ? 'green' : 'gray';
          const statusText = agent.isActive ? '●' : '○';
          const lastActivityText = agent.lastActivity
            ? agent.lastActivity.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
              })
            : '-';
          
          return (
            <Box key={agent.name} flexDirection="column" marginBottom={1}>
              <Box>
                <Text color={statusColor}>{statusText}</Text>
                <Text> </Text>
                <Text bold>{agent.name}</Text>
              </Box>
              
              {agent.isStreaming && (
                <Box paddingLeft={2}>
                  <Text color="blue">
                    <Spinner type="dots" />
                  </Text>
                  <Text color="blue"> Streaming...</Text>
                </Box>
              )}
              
              {agent.currentMessage && (
                <Box paddingLeft={2}>
                  <Text color="gray" dimColor>
                    {agent.currentMessage.substring(0, 30)}
                    {agent.currentMessage.length > 30 ? '...' : ''}
                  </Text>
                </Box>
              )}
              
              <Box paddingLeft={2}>
                <Text color="gray" dimColor>Last: {lastActivityText}</Text>
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

export default AgentSidebar;
```

**Tasks:**
- [ ] Implement agent list rendering
- [ ] Add status indicators (active/inactive)
- [ ] Add streaming status with spinner
- [ ] Add current message preview
- [ ] Add last activity timestamp
- [ ] Test with multiple agents

**Deliverable:** Agent sidebar with real-time status

---

### Task 2.3: Input Box Component

**File:** `tui/src/components/InputBox.tsx`

```typescript
/**
 * Input Box Component
 * 
 * Provides text input with:
 * - Command detection (starts with /)
 * - Input history (up/down arrows)
 * - Multi-line support (future)
 * - Send on Enter
 */

import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

interface InputBoxProps {
  onSubmit: (value: string, isCommand: boolean) => void;
  disabled?: boolean;
  placeholder?: string;
}

const InputBox: React.FC<InputBoxProps> = ({
  onSubmit,
  disabled = false,
  placeholder = 'Type a message or /command...'
}) => {
  const [value, setValue] = useState('');
  
  const handleSubmit = (submittedValue: string) => {
    const trimmed = submittedValue.trim();
    if (!trimmed) return;
    
    const isCommand = trimmed.startsWith('/');
    onSubmit(trimmed, isCommand);
    setValue('');
  };
  
  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1}>
      <Text color={disabled ? 'gray' : 'white'}>{'> '}</Text>
      <TextInput
        value={value}
        onChange={setValue}
        onSubmit={handleSubmit}
        placeholder={placeholder}
        showCursor={!disabled}
      />
    </Box>
  );
};

export default InputBox;
```

**Tasks:**
- [ ] Implement text input with TextInput component
- [ ] Add command detection (/ prefix)
- [ ] Add submit handler
- [ ] Add disabled state
- [ ] Add placeholder support
- [ ] Test input handling

**Deliverable:** Input box with command detection

---

### Task 2.4: Main Layout Integration

**File:** `tui/src/App.tsx` (UPDATE)

```typescript
// Update App.tsx to use new components

import React, { useEffect, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { useWebSocket } from './hooks/useWebSocket.js';
import { useWorldState, useEventProcessor } from './hooks/useWorldState.js';
import ChatView from './components/ChatView.js';
import AgentSidebar from './components/AgentSidebar.js';
import InputBox from './components/InputBox.js';

interface AppProps {
  serverUrl: string;
  worldId: string;
  chatId: string | null;
  replayFrom: 'beginning' | number;
}

const App: React.FC<AppProps> = ({ serverUrl, worldId, chatId, replayFrom }) => {
  const { exit } = useApp();
  const [hasSubscribed, setHasSubscribed] = useState(false);
  
  const worldState = useWorldState();
  const processEvent = useEventProcessor(worldState);
  
  const ws = useWebSocket(serverUrl, {
    onEvent: processEvent,
    onConnected: () => {
      worldState.setError(null);
    },
    onDisconnected: () => {
      worldState.setError('Disconnected from server');
    },
    onError: (error) => {
      worldState.setError(error.message);
    }
  });
  
  // Subscribe to world on connection
  useEffect(() => {
    if (ws.connected && !hasSubscribed) {
      ws.subscribe(worldId, chatId, replayFrom);
      setHasSubscribed(true);
    }
  }, [ws.connected, hasSubscribed, worldId, chatId, replayFrom, ws]);
  
  // Handle Ctrl+C to exit
  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      ws.disconnect();
      exit();
    }
  });
  
  const handleSubmit = (value: string, isCommand: boolean) => {
    if (isCommand) {
      ws.executeCommand(worldId, value);
    } else {
      ws.enqueue(worldId, chatId, value, 'human');
    }
  };
  
  // Loading state
  if (ws.connecting) {
    return (
      <Box flexDirection="column" padding={1}>
        <Box>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text color="cyan"> Connecting to {serverUrl}...</Text>
        </Box>
      </Box>
    );
  }
  
  // Connection error
  if (!ws.connected && worldState.error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">✗ {worldState.error}</Text>
        <Text color="gray" dimColor>Press Ctrl+C to exit</Text>
      </Box>
    );
  }
  
  // Replay progress
  if (worldState.isReplaying && worldState.replayProgress) {
    return (
      <Box flexDirection="column" padding={1}>
        <Box>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text color="cyan"> Replaying events...</Text>
        </Box>
        <Box marginTop={1}>
          <Text>
            {worldState.replayProgress.current} / {worldState.replayProgress.total} ({worldState.replayProgress.percentage}%)
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text color="gray" dimColor>Press Ctrl+C to exit</Text>
        </Box>
      </Box>
    );
  }
  
  // Main UI with split-pane layout
  return (
    <Box flexDirection="column" height="100%">
      {/* Header */}
      <Box borderStyle="single" borderColor="cyan" paddingX={1}>
        <Text color="cyan" bold>Agent World - {worldId}</Text>
        {ws.connected && <Text color="green"> ●</Text>}
      </Box>
      
      {/* Main content: sidebar + chat */}
      <Box flexGrow={1} flexDirection="row">
        {/* Agent Sidebar */}
        <Box width="25%" borderStyle="single" borderColor="gray">
          <AgentSidebar agents={worldState.agents} />
        </Box>
        
        {/* Chat View */}
        <Box width="75%" flexDirection="column">
          <Box flexGrow={1} overflowY="scroll">
            <ChatView messages={worldState.messages} />
          </Box>
        </Box>
      </Box>
      
      {/* Error bar */}
      {worldState.error && (
        <Box paddingX={1} backgroundColor="red">
          <Text color="white">Error: {worldState.error}</Text>
        </Box>
      )}
      
      {/* Input */}
      <InputBox
        onSubmit={handleSubmit}
        disabled={!ws.connected}
        placeholder={ws.connected ? 'Type a message or /command...' : 'Disconnected'}
      />
      
      {/* Footer */}
      <Box paddingX={1}>
        <Text color="gray" dimColor>
          Ctrl+C to exit | Messages: {worldState.messages.length} | Agents: {worldState.agents.size}
        </Text>
      </Box>
    </Box>
  );
};

export default App;
```

**Tasks:**
- [ ] Integrate ChatView component
- [ ] Integrate AgentSidebar component
- [ ] Integrate InputBox component
- [ ] Add split-pane layout
- [ ] Add header and footer
- [ ] Add error bar
- [ ] Test full layout

**Deliverable:** Complete UI with all components integrated

---

## Phase 3: Polish & Testing (Day 4)

**Prerequisites:**
- ✅ Phase 2 completed (UI components built)
- ✅ Basic TUI functional with chat and agent views

**Goal:** Add polish, commands, comprehensive testing, and documentation.

### Task 3.1: Command Support

Add command processing and display:

```typescript
// tui/src/components/CommandResult.tsx
import React from 'react';
import { Box, Text } from 'ink';

interface CommandResultProps {
  command: string;
  result: any;
  timestamp: Date;
}

const CommandResult: React.FC<CommandResultProps> = ({ command, result, timestamp }) => {
  const time = timestamp.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  
  return (
    <Box flexDirection="column" borderStyle="single" borderColor="blue" padding={1} marginBottom={1}>
      <Box>
        <Text color="gray" dimColor>[{time}]</Text>
        <Text> </Text>
        <Text color="blue" bold>Command:</Text>
        <Text> {command}</Text>
      </Box>
      
      {result.success ? (
        <Box flexDirection="column" paddingLeft={2} marginTop={1}>
          <Text color="green">✓ {result.message || 'Success'}</Text>
          {result.data && (
            <Box marginTop={1}>
              <Text>{JSON.stringify(result.data, null, 2)}</Text>
            </Box>
          )}
        </Box>
      ) : (
        <Box paddingLeft={2} marginTop={1}>
          <Text color="red">✗ {result.message || 'Failed'}</Text>
        </Box>
      )}
    </Box>
  );
};

export default CommandResult;
```

**Tasks:**
- [ ] Create CommandResult component
- [ ] Add command result to world state
- [ ] Display command results in UI
- [ ] Add command history
- [ ] Test common commands

**Deliverable:** Command execution with result display

---

### Task 3.2: Error Handling & Reconnection UI

**File:** `tui/src/components/ConnectionStatus.tsx`

```typescript
/**
 * Connection Status Component
 * 
 * Displays connection state and reconnection progress
 */

import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';

interface ConnectionStatusProps {
  connected: boolean;
  connecting: boolean;
  error: string | null;
}

const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  connected,
  connecting,
  error
}) => {
  if (connected) {
    return (
      <Box>
        <Text color="green">● Connected</Text>
      </Box>
    );
  }
  
  if (connecting) {
    return (
      <Box>
        <Text color="yellow">
          <Spinner type="dots" />
        </Text>
        <Text color="yellow"> Connecting...</Text>
      </Box>
    );
  }
  
  if (error) {
    return (
      <Box>
        <Text color="red">● Disconnected</Text>
        <Text color="gray" dimColor> ({error})</Text>
      </Box>
    );
  }
  
  return (
    <Box>
      <Text color="gray" dimColor>● Disconnected</Text>
    </Box>
  );
};

export default ConnectionStatus;
```

**Tasks:**
- [ ] Create ConnectionStatus component
- [ ] Add to header
- [ ] Show reconnection attempts
- [ ] Add error details
- [ ] Test disconnect/reconnect flow

**Deliverable:** Connection status UI with error handling

---

### Task 3.3: Documentation

**File:** `tui/README.md`

```markdown
# Agent World TUI

Terminal User Interface for Agent World using Ink (React for CLIs).

## Features

- 🔌 Real-time WebSocket connection to Agent World server
- 💬 Live message streaming and chat history
- 🤖 Agent status monitoring (active, streaming, last activity)
- ⚡ Event replay for catching up on history
- 🎨 Professional split-pane layout with colors
- ⌨️ Interactive command execution
- 🔄 Automatic reconnection on disconnect

## Installation

```bash
npm install -g @agent-world/tui
```

Or run directly with npx:

```bash
npx @agent-world/tui --server ws://localhost:3001 --world my-world
```

## Usage

### Basic Usage

```bash
agent-world-tui --server ws://localhost:3001 --world my-world
```

### With Chat ID

```bash
agent-world-tui --world my-world --chat chat-123
```

### Replay from Specific Sequence

```bash
agent-world-tui --world my-world --replay 1500
```

## Options

- `--server, -s` - WebSocket server URL (default: `ws://localhost:3001`)
- `--world, -w` - World name or ID (required)
- `--chat, -c` - Chat ID to load (optional)
- `--replay` - Replay from sequence number or 'beginning' (default: 'beginning')
- `--help` - Show help message

## Keyboard Shortcuts

- `Ctrl+C` - Exit application
- `Enter` - Send message or execute command
- `Up/Down` - Navigate command history (coming soon)

## Commands

Commands start with `/`:

- `/world list` - List all worlds
- `/agent list` - List agents in current world
- `/chat list` - List chat history
- `/help` - Show help

Regular messages (without `/`) are sent as user messages to the world.

## Architecture

- Built with [Ink](https://github.com/vadimdemedes/ink) (React for CLIs)
- Uses WebSocket for real-time communication
- Subscribes to world events for live updates
- Maintains local state for UI rendering

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build

# Run tests
npm test
```

## License

MIT
```

**Tasks:**
- [ ] Create README with usage examples
- [ ] Document all CLI options
- [ ] Add keyboard shortcuts reference
- [ ] Add architecture overview
- [ ] Add troubleshooting guide

**Deliverable:** Complete documentation

---

### Task 3.4: Testing & Quality Assurance

**Test Plan:**

1. **Unit Tests** (`tui/src/__tests__/`)
   - [ ] WebSocket hook connection lifecycle
   - [ ] World state updates from events
   - [ ] Event processor logic
   - [ ] Component rendering
   - [ ] Reused domain logic (from Phase 0)

2. **Integration Tests**
   - [ ] Connect to mock WebSocket server
   - [ ] Subscribe and receive events
   - [ ] Send messages and commands
   - [ ] Replay event history
   - [ ] Test with real WebSocket server (ws/)

3. **Manual Testing Scenarios**
   - [ ] Connect to real WebSocket server (ws://localhost:3001)
   - [ ] Send messages and see agent responses
   - [ ] Execute commands (/agent list, /world list)
   - [ ] Disconnect and reconnect
   - [ ] Replay from beginning
   - [ ] Multiple agents streaming simultaneously

4. **Performance Testing**
   - [ ] Handle 1000+ messages without lag
   - [ ] Multiple rapid messages
   - [ ] Long-running connections (1+ hour)

**Tasks:**
- [ ] Write unit tests for hooks and components
- [ ] Write unit tests for reused logic (validate Phase 0 extraction)
- [ ] Write integration tests
- [ ] Manual testing with real WebSocket server
- [ ] Performance testing
- [ ] Fix identified issues
- [ ] Update REUSE.md with lessons learned

**Deliverable:** Tested and validated TUI application

---

## Success Criteria Checklist

### Functional Requirements
- [ ] Connects to WebSocket server successfully
- [ ] Subscribes to world events
- [ ] Displays real-time message stream
- [ ] Shows agent status (active, streaming)
- [ ] Accepts user input (messages and commands)
- [ ] Executes commands and shows results
- [ ] Handles reconnection gracefully
- [ ] Replays event history on connection

### Technical Requirements
- [ ] Uses Ink for UI components
- [ ] Uses React hooks for state management
- [ ] Reuses types, API, and domain logic from web frontend (Phase 0)
- [ ] TypeScript compilation without errors
- [ ] All tests pass (including reused logic tests)
- [ ] No memory leaks during long sessions
- [ ] REUSE.md accurately documents code reuse strategy

### User Experience Requirements
- [ ] Professional split-pane layout
- [ ] Clear connection status indicator
- [ ] Smooth real-time updates (no flickering)
- [ ] Responsive input handling
- [ ] Clear error messages
- [ ] Helpful keyboard shortcuts

### Code Quality Requirements
- [ ] Well-documented components
- [ ] Type-safe TypeScript code
- [ ] Reusable hooks and components
- [ ] Consistent code style
- [ ] Comprehensive error handling

---

## Comparison: TUI Implementation Approaches

| Feature | Existing CLI | Basic Remote CLI | TUI with Ink (Updated Plan) |
|---------|--------------|------------------|--------------------------|
| **Difficulty** | N/A | 3/10 | 2/10 ✅ |
| **Time** | N/A | 3-4 days | 4-5 days ✅ |
| **Lines of Code** | 2217 | ~650 | ~1500 (TUI: ~900 + Shared: ~600) |
| **Code Duplication** | N/A | Medium | **Zero ✅** (shared packages) |
| **UI Quality** | N/A | Basic | Professional ✅ |
| **Real-Time UI** | N/A | Manual | Automatic ✅ |
| **Maintainability** | Complex | Medium | **Very High ✅** (shared packages) |
| **React Patterns** | No | No | Yes ✅ |
| **Shared Packages** | No | No | **Yes ✅** (ws/ folder: types, domain, ws-client) |
| **Responsive Layout** | No | No | **Yes ✅** (3 modes) |
| **Protocol** | N/A | WebSocket | WebSocket ✅ |
| **Hook Architecture** | N/A | Monolithic | **Focused ✅** (3 hooks) |

**Key Advantages:** 
- **Zero code duplication** via shared code in ws/ folder
- **3 focused hooks** for better testability and reusability
- **Responsive layout** system for terminal compatibility
- **Future-proof** architecture - any client can import from ws/

---

## Dependencies Overview

### Core Dependencies
- `ink` (v4.4.1) - React-based CLI framework
- `ink-spinner` (v5.0.0) - Loading spinners
- `ink-text-input` (v5.0.1) - Text input component
- `react` (v18.2.0) - React library
- `meow` (v13.0.0) - CLI argument parsing

### Shared Code from ws/ Folder
- Types from `ws/types.ts` - Shared type definitions
- Domain logic from `ws/domain.ts` - Shared business logic  
- WebSocket client from `ws/ws-client.ts` - WebSocket client library

**Note:** TUI imports shared code directly from `../ws/*.js` - no additional package dependencies needed

### Development Dependencies
- `typescript` (v5.3.3) - TypeScript compiler
- `tsx` (v4.7.0) - TypeScript execution
- `vitest` (v1.0.0) - Testing framework
- `@types/react` (v18.2.0) - React types

### Shared Code from ws/ Folder
- Types from `ws/types.ts` - Shared type definitions
- Domain logic from `ws/domain.ts` - Shared business logic
- WebSocket client from `ws/ws-client.ts` - WebSocket client library

**Note:** TUI imports shared code directly from `../ws/*.js` - no workspace package dependencies needed

**Total bundle size:** ~4MB (with all dependencies, excluding shared code)

---

## Rollout Plan

### Week 1: Development
- Days 1-2: Core infrastructure + UI components
- Day 3: Polish + testing

### Week 2: Alpha Testing
- Deploy alongside existing CLI
- Internal testing with team
- Gather feedback

### Week 3: Beta Release
- Public beta announcement
- Documentation updates
- Monitor for issues

### Week 4: Stable Release
- Version 1.0.0 release
- Add to main package.json as optional dependency
- Update main README with TUI option

---

## Future Enhancements (Post v1.0)

1. **Command History** (1 day)
   - Up/Down arrow navigation
   - Persistent history file

2. **Split View Modes** (2 days)
   - Full screen chat mode
   - Full screen agent list mode
   - Toggle between layouts

3. **Theming Support** (1 day)
   - Light/dark themes
   - Custom color schemes

4. **Search & Filter** (2 days)
   - Search message history
   - Filter by sender
   - Filter by date range

5. **Export Chat** (1 day)
   - Export current view to markdown
   - Export to JSON

6. **Multiple World Tabs** (3 days)
   - Switch between worlds
   - Monitor multiple worlds simultaneously

---

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| WebSocket server not ready | High | Phase 0 can proceed independently; mock server for testing |
| Ink version compatibility | Medium | Pin Ink version, test thoroughly |
| Terminal compatibility | Medium | Test on major terminals (iTerm, Terminal.app, Windows Terminal) |
| WebSocket connection drops | High | Implement robust reconnection logic (from plan) |
| Performance with many messages | Medium | Implement message limit and virtual scrolling |
| Unicode/emoji rendering | Low | Test with various character sets |
| Type definition drift | Medium | Maintain REUSE.md, sync types with web frontend |

---

## Final Architecture Summary (Updated with ws/ Folder Approach)

```
┌─────────────────────────────────────────────────────────────┐
│              WEBSOCKET SERVER (ws/) - ✅ COMPLETED          │
│            (Includes shared code for TUI/web)               │
├─────────────────────────────────────────────────────────────┤
│  Server Components:                                         │
│    ├── ws-server.ts    → WebSocket server                  │
│    ├── queue-processor.ts → Message queue handler          │
│    └── index.ts        → Entry point + exports             │
│                                                             │
│  Shared Code (NEW - consumed by TUI & web):                │
│    ├── types.ts        → Shared type definitions           │
│    │   ├── WSEvent, WSMessage                              │
│    │   ├── Message, Chat                                   │
│    │   └── Agent types                                     │
│    │                                                         │
│    ├── domain.ts       → Shared business logic             │
│    │   ├── validateMessage()                               │
│    │   ├── message-utils                                   │
│    │   └── event processing                                │
│    │                                                         │
│    └── ws-client.ts    → Reusable WebSocket client         │
│        ├── WebSocketClient class                           │
│        ├── Connection lifecycle                            │
│        └── Protocol operations                             │
└─────────────────────────────────────────────────────────────┘
                          ↑ Imports from ↓
┌─────────────────────────────────────────────────────────────┐
│                         TUI CLIENT                          │
├─────────────────────────────────────────────────────────────┤
│  Entry Point (index.tsx) → CLI arg parsing                 │
│    ↓                                                         │
│  App Component (App.tsx) → Main orchestration              │
│    ↓                                                         │
│  **3 Focused Hooks Architecture:**                         │
│    ├── useWebSocketConnection → Connection mgmt (100 LOC)  │
│    │     (uses: ws/ws-client.ts)                           │
│    ├── useAgentWorldClient → Protocol ops (150 LOC)        │
│    │     (uses: ws/types.ts)                               │
│    ├── useWorldState → State management (200 LOC)          │
│    │     (uses: ws/types.ts)                               │
│    ├── useEventProcessor → Event processing (150 LOC)      │
│    │     (uses: ws/domain.ts, ws/types.ts)                 │
│    └── useResponsiveLayout → Layout adaptation (100 LOC)   │
│         ↓                                                    │
│  **UI Components (Ink - Responsive):**                     │
│    ├── layouts/                                             │
│    │   ├── CompactLayout (< 80 cols)                       │
│    │   ├── NarrowLayout (80-120 cols)                      │
│    │   └── NormalLayout (> 120 cols)                       │
│    ├── ChatView (message display)                          │
│    ├── AgentSidebar (agent status)                         │
│    ├── InputBox (user input)                               │
│    ├── CommandResult (command output)                      │
│    └── ConnectionStatus (connection state)                 │
└─────────────────────────────────────────────────────────────┘
                          ↕ WebSocket (ws://)
┌─────────────────────────────────────────────────────────────┐
│                    CORE BACKEND SERVICES                    │
├─────────────────────────────────────────────────────────────┤
│  - Event streaming protocol (WebSocket)                     │
│  - Subscription management (worldId, chatId, replay)        │
│  - Command execution                                        │
│  - Message queueing                                         │
│  - World state management                                   │
└─────────────────────────────────────────────────────────────┘
                          ↕
┌─────────────────────────────────────────────────────────────┐
│                      CORE & STORAGE                         │
├─────────────────────────────────────────────────────────────┤
│  - Event persistence (sequence numbers)                     │
│  - World/Agent/Chat management                              │
│  - Event replay support                                     │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    OTHER CONSUMERS                          │
│              (Future - Can use shared packages)             │
├─────────────────────────────────────────────────────────────┤
│  web/        → Web frontend (already using shared packages) │
│  next/       → Next.js frontend (can migrate)               │
│  mobile/     → Future mobile app (can reuse)                │
│  desktop/    → Future Electron app (can reuse)              │
└─────────────────────────────────────────────────────────────┘
```

**Key Architecture Improvements:**
- ✅ **Zero duplication** - single source of truth in shared packages
- ✅ **3 focused hooks** - better separation of concerns
- ✅ **Responsive layout** - 3 modes for terminal compatibility
- ✅ **Reusable WS client** - framework-agnostic, can be used by any client
- ✅ **Shared domain logic** - business rules centralized
- ✅ **Future-proof** - any client can consume shared packages

---

## Implementation Order

### Prerequisites (✅ COMPLETED)
- ✅ WebSocket server implementation (`ws/`)
  - Event streaming protocol
  - Subscription/replay/command handling
  - Integration with core event storage

### TUI Implementation (4-5 Days)
1. **Phase 0:** Add shared code to ws/ folder (Day 1)
   - Add ws/types.ts (shared type definitions)
   - Add ws/domain.ts (shared business logic)
   - Add ws/ws-client.ts (WebSocket client)
   - Update ws/index.ts to export shared code
   - Migrate web/ to import from ws/
2. **Phase 1:** Core infrastructure (Day 2)
   - 3 focused hooks (connection, client, state, processor)
   - Responsive layout hook
3. **Phase 2:** UI components (Day 3)
   - 3 layout modes (compact/narrow/normal)
   - Chat view, agent sidebar, input box
4. **Phase 3:** Polish & testing (Day 4-5)
   - Error handling
   - CLI integration
   - Testing (unit + integration)
   - Documentation

---

## Next Steps

1. ✅ Review this updated plan with stakeholders
2. ✅ Confirm WebSocket server is completed (✅ DONE)
3. ✅ Confirm timeline and priorities
4. → Create GitHub issues for each phase
5. → Begin Phase 0: Add Shared Code to ws/ Folder
6. → Daily standups to track progress
7. → Validate web/ migration to use ws/ imports
8. → Build TUI on top of shared code from ws/

**Updated Status:** Plan fully revised with ws/ folder architecture and AR recommendations.

---

**Estimated Total Effort:** 4-5 days (TUI only)
**Shared Code in ws/:** ~1500 LOC (types: 400, domain: 600, ws-client: 500)
**TUI:** ~900 LOC (hooks: 600, components: 300)
**WebSocket Server:** ✅ Completed
**Confidence Level:** 98% (Very High)  
**Risk Level:** Very Low (shared code + focused hooks eliminate major risks)

**Key Success Factor:** Shared code in ws/ folder eliminates duplication and provides a solid foundation for TUI and future clients.

---

## Architecture Review Summary (2025-11-02)

**Review Outcome:** Plan significantly improved with the following changes:

### Critical Changes (Must-Have):
1. ✅ **Shared code in ws/ folder instead of code copying** - eliminates duplication
2. ✅ **3 focused hooks instead of monolithic hook** - better testability
3. ✅ **Responsive layout system** - terminal compatibility
4. ✅ **CLI integration strategy** - separate binary, same package

### Important Changes (Should-Have):
5. ✅ **Event batching for replay performance** - handles 1000+ events smoothly
6. ✅ **Comprehensive error handling** - all scenarios covered
7. ✅ **Testing infrastructure** - unit + integration tests

### Risk Mitigation:
- **Code duplication risk:** Eliminated (shared code in ws/)
- **Type drift risk:** Eliminated (single source of truth in ws/types.ts)
- **Hook complexity risk:** Mitigated (split into 3 focused hooks)
- **Terminal compatibility risk:** Addressed (responsive layout)
- **Performance risk:** Addressed (batching + throttling)

### Final Recommendation:
✅ **READY FOR IMPLEMENTATION** - Architecture is solid, risks are mitigated, and plan is comprehensive.

The updated plan maintains the same 4-5 day timeline while significantly improving code quality, maintainability, and future extensibility.
