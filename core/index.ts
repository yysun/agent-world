/**
 * Core Module Exports - Public API for both Node.js and Browser
 * 
 * Exports:
 * - World management functions (Node.js: full implementation, Browser: no-op warnings)
 * - Type definitions and LLM provider enumeration (both environments)
 * - Utility functions (both environments)
 * - Package version metadata
 * 
 * Architecture: World-mediated access pattern with conditional compilation.
 * Browser gets types and structure, Node.js gets full storage functionality.
 */

/**
 * Core Module Exports - Public API for both Node.js and Browser
 * 
 * Exports:
 * - World management functions (Node.js: full implementation, Browser: no-op warnings)
 * - Type definitions and LLM provider enumeration (both environments)
 * - Utility functions (both environments)
 * - Package version metadata
 * 
 * Architecture: World-mediated access pattern with conditional compilation.
 * Browser gets types and structure, Node.js gets full storage functionality.
 */

/**
 * Core Module Exports - Public API for both Node.js and Browser
 * 
 * Exports:
 * - World management functions (Node.js: full implementation, Browser: no-op warnings)
 * - Type definitions and LLM provider enumeration (both environments)
 * - Utility functions (both environments)
 * - Package version metadata
 * 
 * Architecture: World-mediated access pattern with conditional compilation.
 * Browser gets types and structure, Node.js gets full storage functionality.
 */

/**
 * Core Module Exports - Public API for both Node.js and Browser
 * 
 * Exports:
 * - World management functions (Node.js: full implementation, Browser: no-op warnings)
 * - Type definitions and LLM provider enumeration (both environments)
 * - Utility functions (both environments)
 * - Package version metadata
 * 
 * Architecture: World-mediated access pattern with conditional compilation.
 * Browser gets types and structure, Node.js gets full storage functionality.
 */

// World management functions - conditionally compiled
export {
  createWorld,
  getWorld,
  updateWorld,
  deleteWorld,
  listWorlds
} from './world-manager';

// Agent management functions - conditionally compiled  
export {
  createAgent,
  getAgent,
  updateAgent,
  deleteAgent,
  listAgents,
  updateAgentMemory,
  clearAgentMemory
} from './agent-manager';

// Types and enums (safe for both Node.js and browser)
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

// Utility functions (safe for both Node.js and browser)
export { generateId, toKebabCase } from './utils';

// Package metadata
export const VERSION = '1.0.0';
