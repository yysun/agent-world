# Architecture Plan: Ink-Based TUI Client for Agent World

**Date:** 2025-11-01  
**Status:** Ready for Implementation  
**Related Requirement:** `.docs/reqs/2025-11-01/req-async-world-processing.md`  
**Depends On:** `.docs/plans/2025-11-01/plan-async-world-processing.md` (WebSocket server)

## Overview

Implementation plan for a modern Terminal User Interface (TUI) using Ink (React for CLIs) that connects to the Agent World WebSocket server. This provides a professional, real-time monitoring interface for agent worlds with minimal implementation effort.

**Core Goals**:
- ✅ Professional terminal UI with React-like components
- ✅ Real-time event streaming from WebSocket server
- ✅ 90% code reuse from web frontend patterns
- ✅ Split-pane layout (agents sidebar + chat view)
- ✅ Interactive command execution
- ✅ Zero breaking changes to existing CLI

**Key Benefits**:
- ✅ Easiest implementation (2/10 difficulty)
- ✅ Fastest development (2-3 days)
- ✅ Automatic re-rendering (Ink handles terminal updates)
- ✅ Familiar React patterns (hooks, components, state)
- ✅ Rich UI components (spinners, colors, layouts)

---

## Simplified Phase Structure (3 Phases, 3 Days)

### Phase 1: Core Infrastructure (Day 1)
WebSocket connection + basic event display

### Phase 2: UI Components (Day 2)
Chat view + agent sidebar + input box

### Phase 3: Polish & Testing (Day 3)
Commands + error handling + documentation

---

## Phase 1: Core Infrastructure (Day 1)

### Task 1.1: Project Setup and Dependencies

**Create new package:**
```
tui/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.tsx         # Entry point
│   ├── App.tsx           # Main component
│   ├── hooks/            # Custom hooks
│   └── components/       # UI components
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
    "ws": "^8.16.0",
    "meow": "^13.0.0",
    "chalk": "^5.3.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/ws": "^8.5.10",
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
- [ ] Initialize package.json with dependencies
- [ ] Configure TypeScript for React/Ink
- [ ] Add build and dev scripts
- [ ] Install dependencies

**Deliverable:** Project scaffolding ready

---

### Task 1.2: WebSocket Hook Implementation

**File:** `tui/src/hooks/useWebSocket.ts`

```typescript
/**
 * WebSocket Connection Hook
 * 
 * Manages WebSocket connection lifecycle and provides methods
 * for subscribing, sending messages, and executing commands.
 * 
 * Features:
 * - Automatic reconnection
 * - Event callback handling
 * - Connection state tracking
 * - Message queue for offline messages
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import WebSocket from 'ws';

export interface WebSocketMessage {
  type: 'subscribe' | 'enqueue' | 'command' | 'unsubscribe' | 'ping';
  worldId?: string;
  chatId?: string | null;
  replayFrom?: 'beginning' | number;
  content?: string;
  sender?: string;
  command?: string;
}

export interface WebSocketEvent {
  type: 'event' | 'subscribed' | 'enqueued' | 'result' | 'replay-complete' | 'error' | 'pong';
  seq?: number;
  isHistorical?: boolean;
  eventType?: string;
  event?: any;
  currentSeq?: number;
  replayingFrom?: number;
  historicalEventCount?: number;
  messageId?: string;
  queuePosition?: number;
  estimatedWaitSeconds?: number;
  success?: boolean;
  message?: string;
  data?: any;
  refreshWorld?: boolean;
  lastSeq?: number;
  code?: string;
  details?: string;
}

export interface UseWebSocketOptions {
  onEvent?: (event: WebSocketEvent) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onError?: (error: Error) => void;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

export interface UseWebSocketReturn {
  connected: boolean;
  connecting: boolean;
  lastError: string | null;
  subscribe: (worldId: string, chatId: string | null, replayFrom: 'beginning' | number) => void;
  enqueue: (worldId: string, chatId: string | null, content: string, sender?: string) => void;
  executeCommand: (worldId: string, command: string) => void;
  unsubscribe: (worldId: string, chatId?: string | null) => void;
  ping: () => void;
  disconnect: () => void;
}

export function useWebSocket(
  serverUrl: string,
  options: UseWebSocketOptions = {}
): UseWebSocketReturn {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const messageQueueRef = useRef<WebSocketMessage[]>([]);
  
  const {
    onEvent,
    onConnected,
    onDisconnected,
    onError,
    reconnectInterval = 3000,
    maxReconnectAttempts = 5
  } = options;

  const send = useCallback((message: WebSocketMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    } else {
      // Queue message for when connection is restored
      messageQueueRef.current.push(message);
    }
  }, []);

  const flushMessageQueue = useCallback(() => {
    if (messageQueueRef.current.length > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
      messageQueueRef.current.forEach(msg => send(msg));
      messageQueueRef.current = [];
    }
  }, [send]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN || connecting) {
      return;
    }

    setConnecting(true);
    setLastError(null);

    try {
      const ws = new WebSocket(serverUrl);

      ws.on('open', () => {
        setConnected(true);
        setConnecting(false);
        reconnectAttemptsRef.current = 0;
        onConnected?.();
        flushMessageQueue();
      });

      ws.on('message', (data: Buffer) => {
        try {
          const msg: WebSocketEvent = JSON.parse(data.toString());
          onEvent?.(msg);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      });

      ws.on('error', (error: Error) => {
        setLastError(error.message);
        onError?.(error);
      });

      ws.on('close', () => {
        setConnected(false);
        setConnecting(false);
        onDisconnected?.();
        wsRef.current = null;

        // Attempt reconnection
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectInterval);
        } else {
          setLastError(`Failed to reconnect after ${maxReconnectAttempts} attempts`);
        }
      });

      wsRef.current = ws;
    } catch (error) {
      setConnecting(false);
      setLastError(error instanceof Error ? error.message : 'Connection failed');
      onError?.(error instanceof Error ? error : new Error('Connection failed'));
    }
  }, [serverUrl, connecting, onConnected, onDisconnected, onError, flushMessageQueue, reconnectInterval, maxReconnectAttempts]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    setConnected(false);
    setConnecting(false);
  }, []);

  // Connect on mount
  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [serverUrl]); // Reconnect if server URL changes

  const subscribe = useCallback((worldId: string, chatId: string | null, replayFrom: 'beginning' | number) => {
    send({
      type: 'subscribe',
      worldId,
      chatId,
      replayFrom
    });
  }, [send]);

  const enqueue = useCallback((worldId: string, chatId: string | null, content: string, sender: string = 'human') => {
    send({
      type: 'enqueue',
      worldId,
      chatId,
      content,
      sender
    });
  }, [send]);

  const executeCommand = useCallback((worldId: string, command: string) => {
    send({
      type: 'command',
      worldId,
      command
    });
  }, [send]);

  const unsubscribe = useCallback((worldId: string, chatId?: string | null) => {
    send({
      type: 'unsubscribe',
      worldId,
      chatId
    });
  }, [send]);

  const ping = useCallback(() => {
    send({ type: 'ping' });
  }, [send]);

  return {
    connected,
    connecting,
    lastError,
    subscribe,
    enqueue,
    executeCommand,
    unsubscribe,
    ping,
    disconnect
  };
}
```

**Tasks:**
- [ ] Implement WebSocket connection management
- [ ] Add automatic reconnection logic
- [ ] Implement message queue for offline messages
- [ ] Add connection state tracking
- [ ] Add event callback handling
- [ ] Unit tests for connection lifecycle

**Deliverable:** WebSocket hook with auto-reconnection

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
 */

import { useState, useCallback, useMemo } from 'react';
import type { WebSocketEvent } from './useWebSocket';

export interface Message {
  messageId: string;
  sender: string;
  content: string;
  timestamp: Date;
  isHistorical?: boolean;
}

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
- [ ] Implement world state management
- [ ] Add message history tracking
- [ ] Add agent status tracking
- [ ] Implement replay progress tracking
- [ ] Add event processor for WebSocket events
- [ ] Unit tests for state updates

**Deliverable:** World state hook with event processing

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

## Phase 2: UI Components (Day 2)

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

## Phase 3: Polish & Testing (Day 3)

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

2. **Integration Tests**
   - [ ] Connect to mock WebSocket server
   - [ ] Subscribe and receive events
   - [ ] Send messages and commands
   - [ ] Replay event history

3. **Manual Testing Scenarios**
   - [ ] Connect to real WebSocket server
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
- [ ] Write unit tests for hooks
- [ ] Write integration tests
- [ ] Manual testing with real server
- [ ] Performance testing
- [ ] Fix identified issues

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
- [ ] Reuses WebSocket protocol from web frontend
- [ ] TypeScript compilation without errors
- [ ] All tests pass
- [ ] No memory leaks during long sessions

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

## Comparison: TUI vs Other Options

| Feature | Existing CLI | Basic Remote CLI | TUI with Ink |
|---------|--------------|------------------|--------------|
| **Difficulty** | N/A | 3/10 | 2/10 ✅ |
| **Time** | N/A | 3-4 days | 2-3 days ✅ |
| **Lines of Code** | 2217 | ~650 | ~900 |
| **Code Reuse** | N/A | 60% | 90% ✅ |
| **UI Quality** | N/A | Basic | Professional ✅ |
| **Real-Time UI** | N/A | Manual | Automatic ✅ |
| **Maintainability** | Complex | Medium | High ✅ |
| **React Patterns** | No | No | Yes ✅ |

---

## Dependencies Overview

### Core Dependencies
- `ink` (v4.4.1) - React-based CLI framework
- `ink-spinner` (v5.0.0) - Loading spinners
- `ink-text-input` (v5.0.1) - Text input component
- `react` (v18.2.0) - React library
- `ws` (v8.16.0) - WebSocket client
- `meow` (v13.0.0) - CLI argument parsing

### Development Dependencies
- `typescript` (v5.3.3) - TypeScript compiler
- `tsx` (v4.7.0) - TypeScript execution
- `vitest` (v1.0.0) - Testing framework
- `@types/react` (v18.2.0) - React types
- `@types/ws` (v8.5.10) - WebSocket types

**Total bundle size:** ~5MB (with all dependencies)

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
| Ink version compatibility | Medium | Pin Ink version, test thoroughly |
| Terminal compatibility | Medium | Test on major terminals (iTerm, Terminal.app, Windows Terminal) |
| WebSocket connection drops | High | Implement robust reconnection logic |
| Performance with many messages | Medium | Implement message limit and virtual scrolling |
| Unicode/emoji rendering | Low | Test with various character sets |

---

## Final Architecture Summary

```
┌─────────────────────────────────────────────────────────────┐
│                         TUI CLIENT                          │
├─────────────────────────────────────────────────────────────┤
│  Entry Point (index.tsx)                                    │
│    ↓                                                         │
│  App Component (App.tsx)                                    │
│    ├── useWebSocket hook → WebSocket connection            │
│    ├── useWorldState hook → State management               │
│    └── useEventProcessor hook → Event handling             │
│         ↓                                                    │
│  UI Components                                              │
│    ├── ChatView (message display)                          │
│    ├── AgentSidebar (agent status)                         │
│    ├── InputBox (user input)                               │
│    ├── CommandResult (command output)                      │
│    └── ConnectionStatus (connection state)                 │
└─────────────────────────────────────────────────────────────┘
                          ↕ WebSocket
┌─────────────────────────────────────────────────────────────┐
│                    WEBSOCKET SERVER (ws/)                   │
├─────────────────────────────────────────────────────────────┤
│  - Event streaming                                          │
│  - Command execution                                        │
│  - Message queueing                                         │
│  - World management                                         │
└─────────────────────────────────────────────────────────────┘
```

---

## Next Steps

1. ✅ Review this plan with stakeholders
2. ✅ Confirm timeline and priorities
3. → Create GitHub issues for each phase
4. → Begin Phase 1: Core Infrastructure
5. → Daily standups to track progress

**Ready to Start:** All architectural decisions made, plan is implementation-ready.

---

**Estimated Total Effort:** 3 days  
**Confidence Level:** 95% (Very High)  
**Risk Level:** Low

**Key Success Factor:** 90% code reuse from web frontend patterns makes this the fastest and lowest-risk option for remote monitoring.
