/**
 * Agent Actions Module - TypeScript Type Definitions
 * 
 * Type definitions for agent-actions.js module providing:
 * - Agent memory display and management operations
 * - UI message structures for conversation area
 * - State management for agent operations
 * - Memory clearing functionality with API integration
 * 
 * Features:
 * - Type-safe agent memory operations with comprehensive validation
 * - UI message formatting for chat-like display
 * - Complete API coverage for agent management functions
 * - Browser compatibility with zero Node.js dependencies
 */

import { World, Agent, AgentInfo, AgentMessage } from 'core/types';

/**
 * UI-specific message structure for conversation area
 */
export interface UIMessage {
  id: number;
  type: 'system' | 'error' | 'memory' | 'memory-user' | 'memory-assistant';
  sender: string;
  text: string;
  timestamp: string;
  worldName: string | null;
  hasError?: boolean;
}

/**
 * Application state interface for agent operations
 */
export interface AgentActionState {
  worlds: World[];
  worldName: string | null;
  agents: (Agent | AgentInfo)[];
  selectedAgentId: string | null;
  messages: UIMessage[];
  editingAgent: Agent | null;
  loading: boolean;
  updating: boolean;
  quickMessage: string;
  needScroll: boolean;
  isSending: boolean;
  theme: string;
}

// Agent memory management functions
export function displayAgentMemory(state: AgentActionState, agent: Agent | AgentInfo): Promise<AgentActionState>;
export function clearAgentMemory(state: AgentActionState, agent: Agent | AgentInfo): Promise<AgentActionState>;
export function clearAgentMemoryFromModal(state: AgentActionState, agent: Agent | AgentInfo): Promise<AgentActionState>;
