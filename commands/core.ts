/**
 * Unified Commands Core Module
 * 
 * Features:
 * - Consolidated command processing and world subscription
 * - Simplified command routing with unified handlers
 * - Transport-agnostic client connection interface
 * - Streamlined event handling and world management
 * 
 * Consolidation:
 * - Merges commands.ts and events.ts functionality
 * - Unified command execution pipeline
 * - Simplified error handling patterns
 * - Maintained type safety with less boilerplate
 */

import pino from 'pino';
import { z } from 'zod';
import { World, Agent, LLMProvider } from '../core/types.js';
import { WorldInfo, listWorlds, getWorld as coreGetWorld, createWorld, updateWorld } from '../core/world-manager.js';
import { publishMessage } from '../core/world-events.js';
import { toKebabCase } from '../core/utils.js';
import {
  Command,
  CommandResponse,
  ClientConnection,
  WorldSubscription,
  generateRequestId
} from './types-new.js';

// Create logger instance
const logger = pino({
  name: 'commands-core',
  level: process.env.LOG_LEVEL || 'debug',
  transport: process.env.NODE_ENV !== 'production' ? {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  } : undefined
});

// Helper functions for response creation
const createSuccessResponse = (
  requestId: string,
  type: Command['type'],
  data?: any,
  refreshWorld?: boolean
): CommandResponse => ({
  requestId,
  type,
  success: true,
  data,
  refreshWorld,
  timestamp: new Date().toISOString()
});

const createErrorResponse = (
  requestId: string,
  type: Command['type'],
  error: string
): CommandResponse => ({
  requestId,
  type,
  success: false,
  error,
  timestamp: new Date().toISOString()
});

// Unified command processor
export const processCommand = async (
  command: Command,
  world: World | null = null,
  rootPath: string = './data/worlds'
): Promise<CommandResponse> => {
  try {
    logger.debug('Processing command', {
      type: command.type,
      requestId: command.id,
      hasWorld: !!world
    });

    switch (command.type) {
      case 'getWorlds':
        return await handleGetWorlds(command, rootPath);

      case 'getWorld':
        return await handleGetWorld(command, rootPath);

      case 'createWorld':
        return await handleCreateWorld(command, rootPath);

      case 'updateWorld':
        if (!world) throw new Error('UpdateWorld command requires world context');
        return await handleUpdateWorld(command, world, rootPath);

      case 'createAgent':
        if (!world) throw new Error('CreateAgent command requires world context');
        return await handleCreateAgent(command, world);

      case 'updateAgentConfig':
        if (!world) throw new Error('UpdateAgentConfig command requires world context');
        return await handleUpdateAgentConfig(command, world);

      case 'updateAgentPrompt':
        if (!world) throw new Error('UpdateAgentPrompt command requires world context');
        return await handleUpdateAgentPrompt(command, world);

      case 'updateAgentMemory':
        if (!world) throw new Error('UpdateAgentMemory command requires world context');
        return await handleUpdateAgentMemory(command, world);

      case 'clearAgentMemory':
        if (!world) throw new Error('ClearAgentMemory command requires world context');
        return await handleClearAgentMemory(command, world);

      default:
        throw new Error(`Unknown command type: ${(command as any).type}`);
    }
  } catch (error) {
    logger.error('Command processing failed', {
      error: error instanceof Error ? error.message : error,
      requestId: command.id,
      commandType: command.type
    });
    return createErrorResponse(
      command.id,
      command.type,
      `Command processing failed: ${error instanceof Error ? error.message : error}`
    );
  }
};

// Individual command handlers
async function handleGetWorlds(command: Extract<Command, { type: 'getWorlds' }>, rootPath: string): Promise<CommandResponse> {
  try {
    const worldInfos = await listWorlds(rootPath);
    const worldsWithAgentDetails = await Promise.all(
      worldInfos.map(async (worldInfo) => {
        try {
          const world = await coreGetWorld(rootPath, worldInfo.id);
          return {
            ...worldInfo,
            agentCount: world?.agents?.size || 0,
            agents: world ? Array.from(world.agents.values()) : []
          };
        } catch (error) {
          logger.warn('Failed to load world details', {
            worldId: worldInfo.id,
            error: error instanceof Error ? error.message : error
          });
          return {
            ...worldInfo,
            agentCount: 0,
            agents: []
          };
        }
      })
    );

    return createSuccessResponse(command.id, 'getWorlds', worldsWithAgentDetails);
  } catch (error) {
    logger.error('GetWorlds command failed', {
      error: error instanceof Error ? error.message : error,
      requestId: command.id
    });
    return createErrorResponse(command.id, 'getWorlds', `Failed to get worlds: ${error instanceof Error ? error.message : error}`);
  }
}

async function handleGetWorld(command: Extract<Command, { type: 'getWorld' }>, rootPath: string): Promise<CommandResponse> {
  try {
    const worldId = toKebabCase(command.worldName);
    const world = await coreGetWorld(rootPath, worldId);

    if (!world) {
      return createErrorResponse(command.id, 'getWorld', `World not found: ${command.worldName}`);
    }

    const agents = Array.from(world.agents.values()).map((agentValue) => agentValue as Agent);
    const worldData = {
      id: world.id,
      name: world.name,
      description: world.description || '',
      turnLimit: world.turnLimit,
      agentCount: agents.length,
      agents
    };

    return createSuccessResponse(command.id, 'getWorld', worldData);
  } catch (error) {
    logger.error('GetWorld command failed', {
      error: error instanceof Error ? error.message : error,
      requestId: command.id,
      worldName: command.worldName
    });
    return createErrorResponse(command.id, 'getWorld', `Failed to get world: ${error instanceof Error ? error.message : error}`);
  }
}

async function handleCreateWorld(command: Extract<Command, { type: 'createWorld' }>, rootPath: string): Promise<CommandResponse> {
  try {
    const newWorld = await createWorld(rootPath, {
      name: command.name,
      description: command.description || `A new world called ${command.name}`,
      turnLimit: command.turnLimit || 5
    });

    const worldData = {
      id: newWorld.id,
      name: newWorld.name,
      description: newWorld.description || '',
      turnLimit: newWorld.turnLimit
    };

    return createSuccessResponse(command.id, 'createWorld', worldData);
  } catch (error) {
    logger.error('CreateWorld command failed', {
      error: error instanceof Error ? error.message : error,
      requestId: command.id,
      worldName: command.name
    });
    return createErrorResponse(command.id, 'createWorld', `Failed to create world: ${error instanceof Error ? error.message : error}`);
  }
}

async function handleUpdateWorld(command: Extract<Command, { type: 'updateWorld' }>, world: World, rootPath: string): Promise<CommandResponse> {
  try {
    await world.save(); // Save current state first
    const updatedWorld = await updateWorld(rootPath, world.id, command.updates);

    if (updatedWorld) {
      const message = Object.keys(command.updates).map(key => `${key} updated`).join(', ');
      return createSuccessResponse(command.id, 'updateWorld', { message: `World ${message}`, refreshWorld: true }, true);
    } else {
      return createErrorResponse(command.id, 'updateWorld', 'Failed to update world');
    }
  } catch (error) {
    logger.error('UpdateWorld command failed', {
      error: error instanceof Error ? error.message : error,
      requestId: command.id,
      worldName: command.worldName,
      updates: command.updates
    });
    return createErrorResponse(command.id, 'updateWorld', `Failed to update world: ${error instanceof Error ? error.message : error}`);
  }
}

async function handleCreateAgent(command: Extract<Command, { type: 'createAgent' }>, world: World): Promise<CommandResponse> {
  try {
    const agent = await world.createAgent({
      id: toKebabCase(command.name),
      name: command.name,
      type: 'assistant',
      systemPrompt: command.systemPrompt || `You are ${command.name}. ${command.description || 'A helpful assistant'}`,
      provider: (command.provider as LLMProvider) || LLMProvider.OPENAI,
      model: command.model || 'gpt-4o-mini'
    });

    const agentData = {
      id: agent.id,
      name: agent.name,
      status: agent.status,
      provider: agent.provider,
      model: agent.model,
      messageCount: agent.memory?.length || 0
    };

    return createSuccessResponse(command.id, 'createAgent', agentData, true);
  } catch (error) {
    logger.error('CreateAgent command failed', {
      error: error instanceof Error ? error.message : error,
      requestId: command.id,
      agentName: command.name
    });
    return createErrorResponse(command.id, 'createAgent', `Failed to create agent: ${error instanceof Error ? error.message : error}`);
  }
}

async function handleUpdateAgentConfig(command: Extract<Command, { type: 'updateAgentConfig' }>, world: World): Promise<CommandResponse> {
  try {
    const agent = world.agents.get(toKebabCase(command.agentName));
    if (!agent) {
      return createErrorResponse(command.id, 'updateAgentConfig', `Agent not found: ${command.agentName}`);
    }

    // Update agent configuration
    Object.assign(agent, command.config);
    await world.save();

    return createSuccessResponse(command.id, 'updateAgentConfig', { message: 'Agent configuration updated', refreshWorld: true }, true);
  } catch (error) {
    logger.error('UpdateAgentConfig command failed', {
      error: error instanceof Error ? error.message : error,
      requestId: command.id,
      agentName: command.agentName
    });
    return createErrorResponse(command.id, 'updateAgentConfig', `Failed to update agent config: ${error instanceof Error ? error.message : error}`);
  }
}

async function handleUpdateAgentPrompt(command: Extract<Command, { type: 'updateAgentPrompt' }>, world: World): Promise<CommandResponse> {
  try {
    const agent = world.agents.get(toKebabCase(command.agentName));
    if (!agent) {
      return createErrorResponse(command.id, 'updateAgentPrompt', `Agent not found: ${command.agentName}`);
    }

    agent.systemPrompt = command.systemPrompt;
    await world.save();

    return createSuccessResponse(command.id, 'updateAgentPrompt', { message: 'Agent prompt updated', refreshWorld: true }, true);
  } catch (error) {
    logger.error('UpdateAgentPrompt command failed', {
      error: error instanceof Error ? error.message : error,
      requestId: command.id,
      agentName: command.agentName
    });
    return createErrorResponse(command.id, 'updateAgentPrompt', `Failed to update agent prompt: ${error instanceof Error ? error.message : error}`);
  }
}

async function handleUpdateAgentMemory(command: Extract<Command, { type: 'updateAgentMemory' }>, world: World): Promise<CommandResponse> {
  try {
    const agent = world.agents.get(toKebabCase(command.agentName));
    if (!agent) {
      return createErrorResponse(command.id, 'updateAgentMemory', `Agent not found: ${command.agentName}`);
    }

    if (command.action === 'clear') {
      agent.memory = [];
    } else if (command.action === 'add' && command.message) {
      if (!agent.memory) agent.memory = [];
      agent.memory.push(command.message);
    }

    await world.save();
    return createSuccessResponse(command.id, 'updateAgentMemory', { message: 'Agent memory updated', refreshWorld: true }, true);
  } catch (error) {
    logger.error('UpdateAgentMemory command failed', {
      error: error instanceof Error ? error.message : error,
      requestId: command.id,
      agentName: command.agentName
    });
    return createErrorResponse(command.id, 'updateAgentMemory', `Failed to update agent memory: ${error instanceof Error ? error.message : error}`);
  }
}

async function handleClearAgentMemory(command: Extract<Command, { type: 'clearAgentMemory' }>, world: World): Promise<CommandResponse> {
  try {
    if (command.agentName) {
      // Clear specific agent memory
      const agent = world.agents.get(toKebabCase(command.agentName));
      if (!agent) {
        return createErrorResponse(command.id, 'clearAgentMemory', `Agent not found: ${command.agentName}`);
      }
      agent.memory = [];
    } else {
      // Clear all agents' memory
      for (const agent of world.agents.values()) {
        (agent as Agent).memory = [];
      }
    }

    await world.save();
    const message = command.agentName ? `Cleared memory for ${command.agentName}` : 'Cleared memory for all agents';
    return createSuccessResponse(command.id, 'clearAgentMemory', { message, refreshWorld: true }, true);
  } catch (error) {
    logger.error('ClearAgentMemory command failed', {
      error: error instanceof Error ? error.message : error,
      requestId: command.id,
      agentName: command.agentName
    });
    return createErrorResponse(command.id, 'clearAgentMemory', `Failed to clear agent memory: ${error instanceof Error ? error.message : error}`);
  }
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
    const world = await coreGetWorld(rootPath, worldId);

    if (!world) {
      if (client.onError) {
        client.onError(`World not found: ${worldIdentifier}`);
      }
      return null;
    }

    // Set up event listeners
    const worldEventListeners = setupWorldEventListeners(world, client);

    // Return subscription object with cleanup methods
    return {
      world,
      unsubscribe: async () => {
        await cleanupWorldSubscription(world, worldEventListeners);
      },
      refresh: async (rootPath: string) => {
        // Clean up existing listeners
        await cleanupWorldSubscription(world, worldEventListeners);

        // Reload world
        const refreshedWorld = await coreGetWorld(rootPath, worldId);
        if (!refreshedWorld) {
          throw new Error(`Failed to refresh world: ${worldIdentifier}`);
        }

        // Set up new listeners
        setupWorldEventListeners(refreshedWorld, client);
        return refreshedWorld;
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
function setupWorldEventListeners(world: World, client: ClientConnection): Map<string, (...args: any[]) => void> {
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
async function cleanupWorldSubscription(world: World, worldEventListeners: Map<string, (...args: any[]) => void>): Promise<void> {
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

// Get world wrapper function for commands layer
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

// Legacy function aliases for backward compatibility
export const processCommandRequest = processCommand;
