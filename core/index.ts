/**
 * Core Module Exports - Public API Only
 * 
 * Exports:
 * - World management functions (createWorld, getWorld, updateWorld, deleteWorld, listWorlds)
 * - Type definitions and LLM provider enumeration
 * - Package version metadata
 * 
 * Architecture: World-mediated access pattern with clean separation between public and internal APIs.
 * All agent operations go through World interface. Internal modules not exposed.
 */

// World management functions
export {
  createWorld,
  getWorld,
  updateWorld,
  deleteWorld,
  listWorlds
} from './world-manager';

// Types and enums
export type {
  World,
  CreateWorldParams,
  UpdateWorldParams,
  Agent,
  AgentMessage,
  CreateAgentParams,
  UpdateAgentParams,
  AgentInfo
} from './types';

export { LLMProvider } from './types';

// Package metadata
export const VERSION = '1.0.0';
