/**
 * World Actions Module - TypeScript Type Definitions
 * 
 * Type definitions for world-actions.js module providing:
 * - AppState interface for complete application state management
 * - Function signatures for world, agent, and message operations
 * - Validation utilities and type guards
 * - Browser-safe operation interfaces
 * 
 * Features:
 * - Type-safe state management with comprehensive validation
 * - AppRun integration patterns with proper type annotations
 * - Complete API coverage for all exported functions
 * - Browser compatibility with zero Node.js dependencies
 */

import { World, Agent, AgentMessage } from 'core/types';

/**
 * Application state interface
 */
export interface AppState {
  worlds: World[];
  selectedWorldId: string | null;
  agents: Agent[];
  selectedAgentId: string | null;
  messages: AgentMessage[];
  editingAgent: Agent | null;
  loading: boolean;
  updating: boolean;
  quickMessage: string;
  needScroll: boolean;
  isSending: boolean;
  theme: string;
}

/**
 * Agent validation result interface
 */
export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

/**
 * Agent validation utilities
 */
export interface AgentValidationInterface {
  validateAgent(agent: Agent): ValidationResult;
  isNewAgent(agent: Agent): boolean;
}

// State initialization functions
export function createInitialState(): AppState;
export function initializeState(): Promise<AppState>;

// Data validation functions
export function isValidWorld(data: unknown): data is World;
export function isValidAgent(data: unknown): data is Agent;
export function isValidMessage(data: unknown): data is AgentMessage;

// World management functions
export function updateWorlds(state: AppState, worldsData: unknown[]): AppState;
export function selectWorld(state: AppState, worldName: string): Promise<AppState>;

// Agent management functions
export function updateAgents(state: AppState, agentsData: unknown[]): AppState;
export function selectAgent(state: AppState, agentId: string): AppState;

// Message management functions
export function addMessage(state: AppState, messageData: unknown): AppState;
export function clearMessages(state: AppState): AppState;

// State management functions
export function setEditingAgent(state: AppState, agent: Agent | null): AppState;
export function setLoading(state: AppState, loading: boolean): AppState;
export function setUpdating(state: AppState, updating: boolean): AppState;

// Agent validation utilities
export const AgentValidation: AgentValidationInterface;
