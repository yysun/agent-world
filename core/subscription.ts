/**
 * World Subscription Management Module
 * 
 * Features:
 * - Centralized world subscription and event handling
 * - Transport-agnostic client connection interface
 * - Event listener setup and cleanup management
 * - Memory leak prevention and proper resource cleanup
 * - World instance isolation and complete destruction during refresh
 * - EventEmitter recreation and agent map repopulation
 * 
 * Purpose:
 * - Preserve essential world subscription functionality
 * - Maintain transport abstraction for CLI and WebSocket
 * - Provide code reuse for event handling across transports
 * - Ensure proper world lifecycle management across refresh operations
 * - WebSocket command processing moved to server/ws.ts for better separation
 * 
 * World Refresh Architecture:
 * - Each subscription maintains reference to current world instance
 * - Refresh completely destroys old world (EventEmitter, agents map, listeners)
 * - Creates fresh world instance with new EventEmitter and repopulated agents
 * - Prevents event crosstalk between old and new world instances
 * - Maintains subscription continuity for client connections
 */

import { World } from './types.js';
import { getWorld as coreGetWorld } from './managers.js';
import { publishMessage, subscribeAgentToMessages } from './events.js';
import { toKebabCase } from './utils.js';
import { createCategoryLogger } from './logger.js';

// Create subscription category logger (part of core functionality)
const logger = createCategoryLogger('core');

// Client connection interface for transport abstraction
export interface ClientConnection {
  isOpen: boolean;
  onWorldEvent?: (eventType: string, eventData: any) => void;
  onError?: (error: string) => void;
}

// World subscription management
export interface WorldSubscription {
  world: World;
  unsubscribe: () => Promise<void>;
  refresh: (rootPath: string) => Promise<World>;
  destroy: () => Promise<void>;
}

// Start world with event listeners - extracted from subscribeWorld
export async function startWorld(world: World, client: ClientConnection): Promise<WorldSubscription> {
  // Set up event listeners
  let worldEventListeners = setupWorldEventListeners(world, client);
  let currentWorld: World | null = world;

  // Subscribe all loaded agents to world messages (moved from getFullWorld)
  for (const agent of currentWorld.agents.values()) {
    subscribeAgentToMessages(currentWorld, agent);
  }

  // Helper function to destroy current world instance
  const destroyCurrentWorld = async () => {
    if (currentWorld) {
      // Clean up all event listeners
      await cleanupWorldSubscription(currentWorld, worldEventListeners);

      // Remove all listeners from the EventEmitter to prevent memory leaks
      currentWorld.eventEmitter.removeAllListeners();

      // Clear agents map references
      currentWorld.agents.clear();

      logger.debug('World instance destroyed', { worldId: currentWorld.id });
    }
  };

  // Return subscription object with cleanup methods
  return {
    get world() {
      if (!currentWorld) {
        throw new Error('World subscription has been destroyed');
      }
      return currentWorld;
    },
    unsubscribe: async () => {
      await destroyCurrentWorld();
      currentWorld = null;
    },
    destroy: async () => {
      await destroyCurrentWorld();
      currentWorld = null;
    },
    refresh: async (rootPath: string) => {
      const worldId = currentWorld?.id || '';
      logger.debug('Refreshing world subscription', { worldId });

      // Destroy the old world instance completely
      await destroyCurrentWorld();

      // Create a completely new world instance
      const refreshedWorld = await coreGetWorld(rootPath, worldId);
      if (!refreshedWorld) {
        throw new Error(`Failed to refresh world: ${worldId}`);
      }

      // Update current references
      currentWorld = refreshedWorld;

      // Set up new event listeners on the fresh world
      worldEventListeners = setupWorldEventListeners(currentWorld, client);

      // Subscribe all loaded agents to world messages (moved from getFullWorld)
      for (const agent of currentWorld.agents.values()) {
        subscribeAgentToMessages(currentWorld, agent);
      }

      logger.debug('World subscription refreshed', {
        worldId: currentWorld.id,
        agentCount: currentWorld.agents.size
      });

      return currentWorld;
    }
  };
}

// World subscription management
export async function subscribeWorld(
  worldIdentifier: string,
  rootPath: string,
  client: ClientConnection
): Promise<WorldSubscription | null> {
  try {
    // Load world using core manager (convert to kebab-case internally)
    const worldId = toKebabCase(worldIdentifier);
    const currentWorld = await coreGetWorld(rootPath, worldId);

    if (!currentWorld) {
      if (client.onError) {
        client.onError(`World not found: ${worldIdentifier}`);
      }
      return null;
    }

    // Use startWorld function to create the subscription
    return await startWorld(currentWorld, client);
  } catch (error) {
    logger.error('World subscription failed', {
      worldIdentifier,
      error: error instanceof Error ? error.message : error
    });
    if (client.onError) {
      client.onError(`Failed to subscribe to world: ${error instanceof Error ? error.message : error}`);
    }
    return null;
  }
}

// Set up event listeners for world events with client connection forwarding
export function setupWorldEventListeners(world: World, client: ClientConnection): Map<string, (...args: any[]) => void> {
  const listeners = new Map<string, (...args: any[]) => void>();

  // System events
  const systemListener = (eventData: any) => {
    if (client.onWorldEvent) {
      client.onWorldEvent('system', eventData);
    }
  };
  world.eventEmitter.on('system', systemListener);
  listeners.set('system', systemListener);

  // World events
  const worldListener = (eventData: any) => {
    if (client.onWorldEvent) {
      client.onWorldEvent('world', eventData);
    }
  };
  world.eventEmitter.on('world', worldListener);
  listeners.set('world', worldListener);

  // Message events
  const messageListener = (eventData: any) => {
    if (client.onWorldEvent) {
      client.onWorldEvent('message', eventData);
    }
  };
  world.eventEmitter.on('message', messageListener);
  listeners.set('message', messageListener);

  // SSE events
  const sseListener = (eventData: any) => {
    if (client.onWorldEvent) {
      client.onWorldEvent('sse', eventData);
    }
  };
  world.eventEmitter.on('sse', sseListener);
  listeners.set('sse', sseListener);

  return listeners;
}

// Clean up world subscription and event listeners
export async function cleanupWorldSubscription(world: World, worldEventListeners: Map<string, (...args: any[]) => void>): Promise<void> {
  try {
    // Remove all event listeners
    for (const [eventType, listener] of worldEventListeners.entries()) {
      world.eventEmitter.removeListener(eventType, listener);
    }
    worldEventListeners.clear();

    logger.debug('World subscription cleanup completed', { worldId: world.id });
  } catch (error) {
    logger.error('World subscription cleanup failed', {
      worldId: world.id,
      error: error instanceof Error ? error.message : error
    });
  }
}

// Get world wrapper function for subscription layer
export async function getWorld(
  worldIdentifier: string,
  rootPath: string
): Promise<World | null> {
  try {
    const worldId = toKebabCase(worldIdentifier);
    return await coreGetWorld(rootPath, worldId);
  } catch (error) {
    logger.error('Failed to get world', {
      worldIdentifier,
      error: error instanceof Error ? error.message : error
    });
    return null;
  }
}

// Message publishing helper
export function handleMessagePublish(world: World, eventMessage: string, sender?: string): void {
  // Normalize sender to standard format
  const normalizedSender = sender === 'WebSocket' || sender === 'CLI' || sender?.startsWith('user') ? 'HUMAN' : sender || 'HUMAN';

  // Publish message to world events
  publishMessage(world, eventMessage, normalizedSender);
}
