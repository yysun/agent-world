/**
 * Type Definitions - Shared types for React frontend
 * 
 * Purpose: Centralized type definitions for Agent World UI
 * 
 * Features:
 * - Re-exports from ws-client
 * - UI-specific types (World, Agent, Chat, Message)
 * - Form and state types
 * 
 * Changes:
 * - 2025-11-03: Initial type definitions
 */

// Re-export ws-client types
export type {
  ConnectionState,
  WSClientConfig,
  WSClientMessage,
  WSServerMessage,
  WebSocketClient,
  WebSocketClientConfig
} from '@/lib/ws-client';

// World types
export interface World {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  currentChatId?: string;
}

// Agent types
export interface Agent {
  id: string;
  name: string;
  type: string;
  provider?: string;
  model?: string;
  systemPrompt?: string;
  description?: string;
  createdAt: string;
}

// Chat types
export interface Chat {
  id: string;
  name: string;
  createdAt: string;
}

// Message types
export interface Message {
  id: string;
  content: string;
  sender: string;
  timestamp: string;
  chatId?: string;
  worldId?: string;
}

// Event types from server
export interface AgentEvent {
  id: string;
  type: string;
  worldId: string;
  chatId?: string;
  seq?: number;
  payload: any;
  meta?: any;
  createdAt: string;
  timestamp: number;
}

// Hook return types
export interface UseWorldDataReturn {
  worlds: World[];
  loading: boolean;
  error: Error | null;
  createWorld: (data: { name: string; description?: string }) => Promise<World>;
  updateWorld: (worldId: string, data: { name?: string; description?: string }) => Promise<World>;
  deleteWorld: (worldId: string) => Promise<void>;
  getWorld: (worldId: string) => Promise<World | null>;
  refetch: () => Promise<void>;
}

export interface UseAgentDataReturn {
  agents: Agent[];
  loading: boolean;
  error: Error | null;
  createAgent: (data: Partial<Agent>) => Promise<Agent>;
  updateAgent: (agentId: string, data: Partial<Agent>) => Promise<Agent>;
  deleteAgent: (agentId: string) => Promise<void>;
  getAgent: (agentId: string) => Promise<Agent | null>;
  refetch: () => Promise<void>;
}

export interface UseChatDataReturn {
  chats: Chat[];
  messages: Message[];
  loading: boolean;
  error: Error | null;
  sendMessage: (content: string, sender?: string) => Promise<void>;
  createChat: () => Promise<Chat>;
  deleteChat: (chatId: string) => Promise<void>;
  subscribeToChat: (chatId?: string) => Promise<void>;
  unsubscribeFromChat: () => Promise<void>;
}
