/**
 * Public API Module - Clean World Manager Exports
 * 
 * Features:
 * - Re-exports only public world management functions
 * - Clean separation from internal agent operations
 * - Minimal API surface for npm package distribution
 * - Type-safe exports with proper TypeScript support
 * 
 * Public Functions:
 * - createWorld: Create new world with configuration
 * - getWorld: Load world by ID with EventEmitter reconstruction
 * - updateWorld: Update world configuration
 * - deleteWorld: Remove world and all associated data
 * - listWorlds: Get all world IDs and basic info
 * 
 * Public Types:
 * - World: Main world interface with agent operations
 * - CreateWorldParams: Parameters for world creation
 * - UpdateWorldParams: Parameters for world updates
 * 
 * Architecture:
 * - Acts as facade over internal world-manager implementation
 * - Prevents direct access to agent-manager and agent-storage
 * - All agent operations must go through World interface
 * - Ready for npm package export configuration
 */

// Re-export public world management functions
export {
  createWorld,
  getWorld,
  updateWorld,
  deleteWorld,
  listWorlds
} from '../world-manager.js';

// Re-export public types
export type {
  World,
  CreateWorldParams,
  UpdateWorldParams
} from '../types.js';

// Re-export agent types for World interface usage
export type {
  Agent,
  AgentMessage,
  CreateAgentParams,
  UpdateAgentParams,
  AgentInfo
} from '../types.js';

// Export LLMProvider enum for agent creation
export { LLMProvider } from '../types.js';

/**
 * Version information for the public API
 */
export const VERSION = '1.0.0';

/**
 * API surface summary for documentation
 */
export const API_SURFACE = {
  functions: [
    'createWorld',
    'getWorld',
    'updateWorld',
    'deleteWorld',
    'listWorlds'
  ],
  types: [
    'World',
    'CreateWorldParams',
    'UpdateWorldParams',
    'Agent',
    'AgentMessage',
    'CreateAgentParams',
    'UpdateAgentParams',
    'AgentInfo',
    'LLMProvider'
  ],
  description: 'World-mediated agent management with clean public API surface'
} as const;
