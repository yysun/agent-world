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
 * - Eliminate redundant command processing wrapper
 * - Preserve essential world subscription functionality
 * - Maintain transport abstraction for CLI and WebSocket
 * - Provide code reuse for event handling across transports
 * - Ensure proper world lifecycle management across refresh operations
 * 
 * World Refresh Architecture:
 * - Each subscription maintains reference to current world instance
 * - Refresh completely destroys old world (EventEmitter, agents map, listeners)
 * - Creates fresh world instance with new EventEmitter and repopulated agents
 * - Prevents event crosstalk between old and new world instances
 * - Maintains subscription continuity for client connections
 */

import pino from 'pino';
import { World } from './types.js';
import { getFullWorld as coreGetFullWorld } from './world-manager.js';
import { publishMessage } from './world-events.js';
import { toKebabCase } from './utils.js';

// Create logger instance
const logger = pino({
  name: 'world-subscription',
  level: process.env.LOG_LEVEL || 'debug',
  transport: process.env.NODE_ENV !== 'production' ? {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  } : undefined
});

// Client connection interface for transport abstraction
export interface ClientConnection {
  send: (data: string) => void;
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

// World subscription management
export async function subscribeWorld(
  worldIdentifier: string,
  rootPath: string,
  client: ClientConnection
): Promise<WorldSubscription | null> {
  try {
    // Load world using core manager (convert to kebab-case internally)
    const worldId = toKebabCase(worldIdentifier);
    let currentWorld = await coreGetFullWorld(rootPath, worldId);

    if (!currentWorld) {
      if (client.onError) {
        client.onError(`World not found: ${worldIdentifier}`);
      }
      return null;
    }

    // Set up event listeners
    let worldEventListeners = setupWorldEventListeners(currentWorld, client);

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
      refresh: async (refreshRootPath: string) => {
        logger.debug('Refreshing world subscription', { worldId, worldIdentifier });

        // Destroy the old world instance completely
        await destroyCurrentWorld();

        // Create a completely new world instance
        const refreshedWorld = await coreGetFullWorld(refreshRootPath, worldId);
        if (!refreshedWorld) {
          throw new Error(`Failed to refresh world: ${worldIdentifier}`);
        }

        // Update current references
        currentWorld = refreshedWorld;

        // Set up new event listeners on the fresh world
        worldEventListeners = setupWorldEventListeners(currentWorld, client);

        logger.debug('World subscription refreshed', {
          worldId: currentWorld.id,
          agentCount: currentWorld.agents.size
        });

        return currentWorld;
      }
    };
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
    return await coreGetFullWorld(rootPath, worldId);
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

// Response helpers for backward compatibility
export function sendSuccess(client: ClientConnection, message: string, data?: any): void {
  const response = {
    type: 'success',
    message,
    data,
    timestamp: new Date().toISOString()
  };
  client.send(JSON.stringify(response));
}

export function sendError(client: ClientConnection, error: string, details?: any): void {
  const response = {
    type: 'error',
    error,
    details,
    timestamp: new Date().toISOString()
  };
  client.send(JSON.stringify(response));
}

export function sendCommandResult(client: ClientConnection, commandResult: any): void {
  client.send(JSON.stringify(commandResult));
}

// Response interfaces for WebSocket compatibility
export interface SimpleCommandResponse {
  success: boolean;
  message?: string;
  data?: any;
  error?: string;
  type?: string; // Add type field for command tracking
  requestId?: string; // Add requestId for client correlation
}

// Helper function to generate request IDs
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Command processing function that calls core directly
export async function processWSCommand(
  commandType: string,
  params: any,
  world: World | null,
  rootPath: string
): Promise<SimpleCommandResponse> {
  try {
    switch (commandType) {
      case 'getWorlds':
        const { listWorlds } = await import('./world-manager.js');
        const worlds = await listWorlds(rootPath);
        return {
          success: true,
          message: 'Worlds retrieved successfully',
          data: worlds,
          type: commandType
        };

      case 'getWorld':
        const { getWorldConfig } = await import('./world-manager.js');
        const worldName = params.worldName || params.name;
        if (!worldName) {
          return { success: false, error: 'World name is required', type: commandType };
        }
        const worldData = await getWorldConfig(rootPath, toKebabCase(worldName));
        if (!worldData) {
          return { success: false, error: `World '${worldName}' not found`, type: commandType };
        }
        return {
          success: true,
          message: `World '${worldName}' retrieved successfully`,
          data: worldData,
          type: commandType
        };

      case 'createWorld':
        const { createWorld } = await import('./world-manager.js');
        const newWorld = await createWorld(rootPath, {
          name: params.name,
          description: params.description || `A world named ${params.name}`
        });
        return {
          success: true,
          message: `World '${params.name}' created successfully`,
          data: newWorld,
          type: commandType
        };

      case 'updateWorld':
        if (!world) {
          return { success: false, error: 'No world selected', type: commandType };
        }
        const { updateWorld } = await import('./world-manager.js');
        const updates = params.updates || {};
        const updatedWorld = await updateWorld(rootPath, world.id, updates);
        return {
          success: true,
          message: `World '${world.name}' updated successfully`,
          data: updatedWorld,
          type: commandType
        };

      case 'createAgent':
        if (!world) {
          return { success: false, error: 'No world selected', type: commandType };
        }
        const { LLMProvider } = await import('./types.js');
        const agent = await world.createAgent({
          id: toKebabCase(params.name),
          name: params.name,
          type: 'conversational',
          provider: LLMProvider.OPENAI,
          model: params.model || 'gpt-4',
          systemPrompt: params.prompt || `You are ${params.name}, an agent in the ${world.name} world.`
        });
        return {
          success: true,
          message: `Agent '${params.name}' created successfully`,
          data: agent,
          type: commandType
        };

      case 'updateAgentConfig':
        if (!world) {
          return { success: false, error: 'No world selected', type: commandType };
        }
        const agentToUpdate = world.agents.get(params.agentName);
        if (!agentToUpdate) {
          return { success: false, error: `Agent '${params.agentName}' not found`, type: commandType };
        }
        const updatedAgent = await world.updateAgent(params.agentName, params.config || {});
        return {
          success: true,
          message: `Agent '${params.agentName}' config updated successfully`,
          data: updatedAgent,
          type: commandType
        };

      case 'updateAgentPrompt':
        if (!world) {
          return { success: false, error: 'No world selected', type: commandType };
        }
        const agentForPrompt = world.agents.get(params.agentName);
        if (!agentForPrompt) {
          return { success: false, error: `Agent '${params.agentName}' not found`, type: commandType };
        }
        const agentWithNewPrompt = await world.updateAgent(params.agentName, {
          systemPrompt: params.prompt
        });
        return {
          success: true,
          message: `Agent '${params.agentName}' prompt updated successfully`,
          data: agentWithNewPrompt,
          type: commandType
        };

      case 'clearAgentMemory':
        if (!world) {
          return { success: false, error: 'No world selected', type: commandType };
        }
        const agentForClear = world.agents.get(params.agentName);
        if (!agentForClear) {
          return { success: false, error: `Agent '${params.agentName}' not found`, type: commandType };
        }
        await world.clearAgentMemory(params.agentName);
        return {
          success: true,
          message: `Agent '${params.agentName}' memory cleared successfully`,
          data: null,
          type: commandType
        };

      default:
        return { success: false, error: `Unknown command type: ${commandType}`, type: commandType };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      type: commandType
    };
  }
}
