/**
 * World Integration Layer - High-Level World and Agent Operations
 *
 * Features:
 * - World system initialization and startup logic with configurable turn limits
 * - Event system integration (message broadcasting, subscriptions)
 * - World and agent CRUD operations (re-exported from specialized modules)
 * - Backward compatibility layer for existing imports
 * - Agent subscription management for event-driven message processing
 * - Per-world turn limit configuration for agent LLM call management
 *
 * Core Functions:
 * - Initialization: ensureDefaultWorld, loadWorlds, initializeWorldSystem
 * - Message broadcasting: broadcastMessage, sendMessage
 * - Agent subscriptions: subscribeToAgentMessages with world-specific filtering
 * - Turn Limit Management: getWorldTurnLimit for per-world turn limit enforcement
 * - Re-exports: All CRUD operations from world-manager, agent-manager, agent-memory
 *
 * Architecture:
 * - Integration layer that coordinates between specialized modules
 * - Delegates CRUD operations to focused modules (world-manager, agent-manager, agent-memory)
 * - Maintains event system integration and message broadcasting
 * - Preserves all existing function signatures for backward compatibility
 * - Supports per-world turn limit configuration (default: 5 LLM calls)
 *
 * Module Organization:
 * - world-manager.ts: World CRUD operations (create, delete, list, save, load)
 * - agent-manager.ts: Agent CRUD operations (create, remove, update, get, list)
 * - agent-memory.ts: Agent memory operations (add, clear, conversation history)
 * - world-state.ts: Shared state management (worlds Map, subscriptions)
 */

import {
  MessagePayload,
  MessageEventPayload,
  EventType
} from './types';
import {
  publishMessageEvent,
  subscribeToMessages,
  subscribeToWorld,
  subscribeToSSE,
  subscribeToSystem,
  initializeEventBus
} from './event-bus';

// Re-export event subscription functions for backward compatibility
export {
  subscribeToMessages as subscribeToMessageEvents,
  subscribeToWorld as subscribeToWorldEvents,
  subscribeToSSE as subscribeToSSEEvents,
  subscribeToSystem as subscribeToSystemEvents
} from './event-bus';

// Re-export CRUD operations from specialized modules for backward compatibility
export {
  createWorld,
  deleteWorld,
  getWorldInfo,
  listWorlds,
  saveWorld,
  loadWorld,
  loadWorldFromDisk,
  getWorldTurnLimit
} from './world-manager';

export {
  createAgent,
  removeAgent,
  updateAgent,
  getAgent,
  getAgents
} from './agent-manager';

export {
  addToAgentMemory,
  getAgentConversationHistory,
  clearAgentMemory
} from './agent-memory';

export {
  _clearAllWorldsForTesting
} from './world-state';

import { initializeFileStorage } from './storage';
import {
  listWorldsFromDisk,
  ensureDataDirectories
} from './world-persistence';
import { createWorld, loadWorldFromDisk, listWorlds } from './world-manager';
import { getAgent } from './agent-manager';

// Default world configuration
export const DEFAULT_WORLD_NAME = 'Default World';

/**
 * Create default world if no worlds exist
 */
export async function ensureDefaultWorld(): Promise<string> {
  // Initialize event bus with local provider
  initializeEventBus({ provider: 'local', enableLogging: true });

  await initializeFileStorage();
  await ensureDataDirectories();

  // Check if any worlds exist on disk
  const existingWorlds = await listWorldsFromDisk();

  if (existingWorlds.length > 0) {
    // Load existing worlds into memory
    for (const worldName of existingWorlds) {
      try {
        await loadWorldFromDisk(worldName);
      } catch (error) {
        console.warn(`Failed to load world ${worldName}:`, error);
      }
    }
    return existingWorlds[0]; // Return first world name
  }

  // Create default world
  const defaultWorldName = await createWorld({ name: DEFAULT_WORLD_NAME });
  return defaultWorldName;
}

/**
 * Load worlds with basic logic - returns world list and suggests action
 */
export async function loadWorlds(): Promise<{ worlds: string[]; action: 'create' | 'use' | 'select'; defaultWorld?: string }> {
  // Initialize event bus with local provider
  initializeEventBus({ provider: 'local', enableLogging: true });

  await initializeFileStorage();
  await ensureDataDirectories();

  // Check if any worlds exist on disk
  const existingWorlds = await listWorldsFromDisk();

  if (existingWorlds.length === 0) {
    // No worlds found - suggest creating default world
    return { worlds: existingWorlds, action: 'create' };
  }

  if (existingWorlds.length === 1) {
    // One world found - suggest using it automatically
    return { worlds: existingWorlds, action: 'use', defaultWorld: existingWorlds[0] };
  }

  // Multiple worlds found - suggest interactive selection
  return { worlds: existingWorlds, action: 'select' };
}

/**
 * Simple world loading - loads first available world or creates default
 */
export async function loadWorldsWithSelection(): Promise<string> {
  // Initialize event bus with local provider
  initializeEventBus({ provider: 'local', enableLogging: true });

  await initializeFileStorage();
  await ensureDataDirectories();

  // Check if any worlds exist on disk
  const existingWorlds = await listWorldsFromDisk();

  if (existingWorlds.length === 0) {
    // No worlds found - create default world
    const defaultWorldName = await createWorld({ name: DEFAULT_WORLD_NAME });
    return defaultWorldName;
  }

  // Load first available world
  const worldName = existingWorlds[0];
  await loadWorldFromDisk(worldName);
  return worldName;
}

/**
 * Initialize world system and ensure default world exists
 */
export async function initializeWorldSystem(): Promise<string> {
  return await ensureDefaultWorld();
}

// ===== EVENT SYSTEM =====

/**
 * Broadcast a message to all agents in a world
 */
export async function broadcastMessage(worldName: string, message: string, sender?: string): Promise<void> {
  const worlds = listWorlds();
  if (!worlds.includes(worldName)) {
    throw new Error(`World ${worldName} not found`);
  }

  const senderName = sender || 'HUMAN';

  // Create simple message payload with flat structure
  const messageEventPayload: MessageEventPayload = {
    content: message,
    sender: senderName
  };

  // Publish MESSAGE event with flat payload structure
  await publishMessageEvent(messageEventPayload);
}

/**
 * Send a direct message to a specific agent
 */
export async function sendMessage(worldName: string, targetName: string, message: string, sender?: string): Promise<void> {
  const worlds = listWorlds();
  if (!worlds.includes(worldName)) {
    throw new Error(`World not found`);
  }

  const target = getAgent(worldName, targetName);
  if (!target) {
    throw new Error(`Agent not found`);
  }

  const senderName = sender || 'system';

  // Create simple message payload with flat structure
  const messageEventPayload: MessageEventPayload = {
    content: message,
    sender: senderName
  };

  // Publish direct message event
  await publishMessageEvent(messageEventPayload);
}

/**
 * Subscribe to messages for a specific agent in a world
 */
export function subscribeToAgentMessages(worldName: string, agentName: string, callback: (event: any) => void): () => void {
  return subscribeToMessages((event: any) => {
    if (event.payload?.worldName === worldName &&
      (event.payload?.recipient === agentName || event.payload?.targetName === agentName)) {
      callback(event);
    }
  });
}
