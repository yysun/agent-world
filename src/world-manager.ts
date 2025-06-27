/**
 * World Manager - World CRUD Operations
 *
 * Features:
 * - World creation, deletion, and listing operations
 * - World information retrieval and state management
 * - World persistence operations (save/load from disk)
 * - Integration with world-persistence module for file I/O
 * - Event system integration for world lifecycle events
 *
 * Core Functions:
 * - createWorld: Create new world with optional configuration
 * - deleteWorld: Remove world and cleanup all associated data
 * - getWorldInfo: Get world metadata and agent count
 * - listWorlds: List all available world names
 * - saveWorld/loadWorld: Persistence operations for world state
 * - loadWorldFromDisk: Load world configuration and agents from disk
 *
 * Implementation:
 * - Uses shared world state from world-state.ts
 * - Delegates file I/O operations to world-persistence.ts
 * - Publishes world lifecycle events via event-bus
 * - Handles error cases with proper rollback on failures
 * - Maintains separation of concerns between state and persistence
 */

import { WorldState, WorldOptions, WorldInfo } from './types';
import { worlds, agentSubscriptions, subscribeAgentToMessages } from './world-state';
import { publishWorldEvent, initializeEventBus } from './event-bus';
import {
  saveWorldToDisk as saveWorldToDiskPersistence,
  loadWorldFromDisk as loadWorldFromDiskPersistence,
  listWorldsFromDisk,
  getWorldDir
} from './world-persistence';
import fs from 'fs/promises';

/**
 * Create a new world
 */
export async function createWorld(options: WorldOptions = {}): Promise<string> {
  // Initialize event bus with local provider (defensive)
  initializeEventBus({ provider: 'local', enableLogging: true });

  const worldName = options.name || `world-${Date.now()}`;
  const worldState: WorldState = {
    name: worldName,
    agents: new Map(),
    turnLimit: options.turnLimit || 5 // Default turn limit of 5
  };

  worlds.set(worldName, worldState);

  // Save to disk immediately
  try {
    await saveWorldToDisk(worldName);
  } catch (error) {
    // Rollback memory change on disk error
    worlds.delete(worldName);
    throw error;
  }

  // Publish world creation event
  await publishWorldEvent({
    action: 'WORLD_CREATED',
    worldName,
    name: worldState.name,
    timestamp: new Date().toISOString()
  });

  return worldName;
}

/**
 * Get world information
 */
export function getWorldInfo(worldName: string): WorldInfo | null {
  const world = worlds.get(worldName);
  if (!world) return null;

  return {
    name: world.name,
    agentCount: world.agents.size,
    turnLimit: world.turnLimit || 5 // Default to 5 if not set
  };
}

/**
 * Get turn limit for a specific world
 */
export function getWorldTurnLimit(worldName: string): number {
  const world = worlds.get(worldName);
  return world?.turnLimit || 5; // Default to 5 if world not found or turn limit not set
}

/**
 * Delete a world and cleanup
 */
export async function deleteWorld(worldName: string): Promise<boolean> {
  const world = worlds.get(worldName);
  if (!world) return false;

  // Get world directory path before removing from memory
  const worldDir = getWorldDir(worldName);

  // Clean up all agent subscriptions for this world
  for (const agentName of world.agents.keys()) {
    const subscriptionKey = `${worldName}:${agentName}`;
    const unsubscribe = agentSubscriptions.get(subscriptionKey);
    if (unsubscribe) {
      unsubscribe();
      agentSubscriptions.delete(subscriptionKey);
    }
  }

  // Remove from memory first
  worlds.delete(worldName);

  // Remove world directory from disk
  try {
    await fs.rm(worldDir, { recursive: true, force: true });
  } catch (error) {
    // Rollback memory change if disk operation fails
    worlds.set(worldName, world);
    throw error;
  }

  return true;
}

/**
 * List all world names (from memory)
 */
export function listWorlds(): string[] {
  return Array.from(worlds.keys());
}

/**
 * Save world state to disk
 */
export async function saveWorld(worldName: string): Promise<boolean> {
  try {
    await saveWorldToDisk(worldName);
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      return false;
    }
    throw error;
  }
}

/**
 * Save world configuration and agents to disk
 */
async function saveWorldToDisk(worldName: string): Promise<void> {
  const world = worlds.get(worldName);
  if (!world) {
    throw new Error(`World ${worldName} not found`);
  }

  // Call the persistence module function
  await saveWorldToDiskPersistence(worldName, world);
}

/**
 * Load world state from disk
 */
export async function loadWorld(worldName: string): Promise<void> {
  await loadWorldFromDisk(worldName);
}

/**
 * Load world configuration and agents from disk
 */
export async function loadWorldFromDisk(worldName: string): Promise<void> {
  const worldState = await loadWorldFromDiskPersistence(worldName);

  worlds.set(worldName, worldState);

  // Subscribe loaded agents to MESSAGE events
  for (const [agentName, agent] of worldState.agents) {
    subscribeAgentToMessages(worldName, agent);
  }
}
