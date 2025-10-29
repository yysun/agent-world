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
 * - World message subscription functions
 *
 * Purpose:
 * - Preserve essential world subscription functionality
 * - Maintain transport abstraction for CLI and WebSocket
 * - Provide code reuse for event handling across transports
 * - Ensure proper world lifecycle management across refresh operations
 * - WebSocket command processing moved to server/ws.ts for better separation
 * - Enable worlds to subscribe/unsubscribe to message events
 *
 * World Refresh Architecture:
 * - Each subscription maintains reference to current world instance
 * - Refresh completely destroys old world (EventEmitter, agents map, listeners)
 * - Creates fresh world instance with new EventEmitter and repopulated agents
 * - Prevents event crosstalk between old and new world instances
 * - Maintains subscription continuity for client connections
 */

import { World } from './types.js';
import { getWorld } from './managers.js';
import { createCategoryLogger, type LogLevel, addLogStreamCallback } from './logger.js';
import { subscribeAgentToMessages, subscribeWorldToMessages } from './events.js';

function toKebabCase(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

// Create subscription category logger (part of core functionality)
const logger = createCategoryLogger('core.subscription');

// Log streaming event data structure
export interface LogStreamEvent {
  level: LogLevel;
  category: string;
  message: string;
  timestamp: string;
  data?: any;
  messageId: string;
}

// Client connection interface for transport abstraction
export interface ClientConnection {
  isOpen: boolean;
  onWorldEvent?: (eventType: string, eventData: any) => void;
  onError?: (error: string) => void;
  onLog?: (logEvent: LogStreamEvent) => void;
}

// World subscription management
export interface WorldSubscription {
  world: World;
  unsubscribe: () => Promise<void>;
  refresh: () => Promise<World>;
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

  subscribeWorldToMessages(currentWorld);

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
    refresh: async () => {
      const worldId = currentWorld?.id || '';
      logger.debug('Refreshing world subscription', { worldId });

      // Destroy the old world instance completely
      await destroyCurrentWorld();

      // Create a completely new world instance
      const refreshedWorld = await getWorld(worldId);
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
  client: ClientConnection
): Promise<WorldSubscription | null> {
  try {
    // Load world using core manager (convert to kebab-case internally)
    const worldId = toKebabCase(worldIdentifier);
    const currentWorld = await getWorld(worldId);

    if (!currentWorld) {
      if (client.onError) {
        client.onError(`World not found: ${worldIdentifier}`);
      }
      return null;
    }

    // MCP servers will be started on-demand in getMCPToolsForWorld()
    if (currentWorld.mcpConfig) {
      logger.debug(`World ${worldId} has MCP config - servers will start on-demand`);
    }

    // Use startWorld function to create the subscription
    const subscription = await startWorld(currentWorld, client);

    // MCP servers use connection pooling and will be cleaned up automatically
    // when the Express app shuts down

    return subscription;
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

  // World activity events
  const activityListener = (eventData: any) => {
    if (client.onWorldEvent) {
      client.onWorldEvent('world-activity', eventData);
    }
  };
  world.eventEmitter.on('world-activity', activityListener);
  listeners.set('world-activity', activityListener);

  const processingListener = (eventData: any) => {
    if (client.onWorldEvent) {
      client.onWorldEvent('processing', eventData);
    }
  };
  world.eventEmitter.on('processing', processingListener);
  listeners.set('processing', processingListener);

  const idleListener = (eventData: any) => {
    if (client.onWorldEvent) {
      client.onWorldEvent('idle', eventData);
    }
  };
  world.eventEmitter.on('idle', idleListener);
  listeners.set('idle', idleListener);

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

  // Log streaming - set up if client has onLog callback
  if (client.onLog) {
    const logUnsubscribe = addLogStreamCallback((logEvent) => {
      client.onLog!(logEvent);
    });
    listeners.set('logStream', logUnsubscribe);
  }

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