/**
 * Agent Modal Update Module - TypeScript Type Definitions
 * 
 * Type definitions for agent-modal-update.js module providing:
 * - Agent modal opening and closing operations
 * - Agent creation and editing workflow management
 * - Agent refresh operations after modal updates
 * - Memory count updates after clearing operations
 * - Global event coordination between modal and parent components
 * - Agent memory display in conversation area with chat-like formatting
 * - Memory clearing functionality with actual API calls
 * - Smart memory loading for AgentInfo objects
 * - Real-time memory count updates and state synchronization
 * 
 * Features:
 * - Global AppRun event coordination (show-agent-modal, hide-agent-modal)
 * - Agent refresh after CRUD operations
 * - Memory count synchronization
 * - Chat-like interface with role-based message styling
 * - Automatic full agent data fetching when memory array is missing
 * - Backward compatibility with both AgentInfo and full Agent objects
 * - Memory operations with proper API integration and state updates
 * - Error handling and user feedback
 * - Browser compatibility with zero Node.js dependencies
 */

import { World, Agent, AgentInfo, AgentMessage } from 'core/types';

/**
 * Application state interface for agent modal operations
 */
export interface AppState {
  worlds: World[];
  selectedWorldId: string | null;
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
 * Agent update event payload
 */
export interface AgentUpdatedPayload {
  worldName: string;
  agent: Agent;
}

/**
 * Agent memory cleared event payload
 */
export interface AgentMemoryClearedPayload {
  worldName: string;
  agentName: string;
}

/**
 * Event with stopPropagation method
 */
export interface StopPropagationEvent {
  stopPropagation?: () => void;
}

// Agent memory management functions
export function displayAgentMemory(state: AppState, agent: Agent | AgentInfo): Promise<AppState>;
export function clearAgentMemory(state: AppState, agent: Agent | AgentInfo): Promise<AppState>;
export function clearAgentMemoryFromModal(state: AppState, agent: Agent | AgentInfo): Promise<AppState>;

// Modal control functions
export function openAgentModal(state: AppState, agent: Agent): AppState;
export function openAgentModalCreate(state: AppState, e?: StopPropagationEvent): AppState;
export function closeAgentModal(state: AppState): AppState;

// Agent management functions
export function handleAgentUpdated(state: AppState, payload: AgentUpdatedPayload): Promise<AppState>;
export function handleAgentMemoryCleared(state: AppState, payload: AgentMemoryClearedPayload): AppState;
