//@ts-check
/// <reference path="../agent-world.d.ts" />

/**
 * Home Update Module - TypeScript Type Definitions
 * 
 * Type definitions for home-update.js module providing:
 * - Input field state management for quick messages
 * - Message sending with generator pattern for loading states
 * - Navigation utilities (scroll, clear messages)
 * - State helper utilities for computed values
 * - UI interaction handlers
 * - Application state initialization and world management
 * - Agent management and validation utilities
 * - Complete state operations for home page functionality
 * 
 * Features:
 * - Generator-based async state updates for smooth UI
 * - Comprehensive error handling with user feedback
 * - Auto-scroll functionality for conversation area
 * - State persistence and validation
 * - Single source of truth for home-related operations
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
 * Agent validation utilities interface
 */
export interface AgentValidationInterface {
  validateAgent(agent: Agent): ValidationResult;
  isNewAgent(agent: Agent): boolean;
}

/**
 * Quick message structure for conversation area
 */
export interface QuickMessage {
  id: number;
  role: 'user' | 'system';
  content: string;
  createdAt: Date;
  sender: string;
  sending?: boolean;
}

/**
 * Input event handler type
 */
export interface InputEvent {
  target: {
    value: string;
  };
}

/**
 * Keyboard event handler type
 */
export interface KeyboardEvent {
  key: string;
  target: {
    value: string;
  };
}

/**
 * Generator return type for async state updates
 */
export type StateGenerator = AsyncGenerator<AppState, AppState, unknown>;

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

// Input handlers
export function onQuickInput(state: AppState, e: InputEvent): AppState;
export function onQuickKeypress(state: AppState, e: KeyboardEvent): AppState | StateGenerator;

// Message management
export function sendQuickMessage(state: AppState): StateGenerator;

// Navigation utilities
export function scrollToTop(state: AppState): AppState;
export function scrollToBottom(state: AppState): void;

// State helper utilities
export function getSelectedWorldName(state: AppState): string | null;
