/**
 * Server Commands Implementation
 * 
 * Features:
 * - Typed command handlers using structured request/response interfaces
 * - Time-based request ID tracking and validation
 * - Type-safe parameter handling - no more unsafe args arrays
 * - Comprehensive error handling with typed responses
 * - World context management for command execution
 * 
 * Commands:
 * - getWorlds: List all worlds with agent details
 * - getWorld: Get specific world information and agents
 * - createWorld: Create new world with validation
 * - updateWorld: Update world properties (name, description, turnLimit)
 * - createAgent: Create new agent in world
 * - updateAgentConfig: Update agent configuration (model, provider, status)
 * - updateAgentPrompt: Update agent system prompt
 * - updateAgentMemory: Add messages or clear agent memory
 * - clearAgentMemory: Clear specific or all agent memories
 * 
 * Implementation:
 * - Uses typed request interfaces instead of args arrays
 * - Proper error handling with success/failure responses
 * - Integration with core world and agent management
 * - Request ID validation and response correlation
 * 
 * Changes:
 * - Complete rewrite for typed command system
 * - Replaced all args array processing with typed parameters
 * - Added request validation and response correlation
 * - Structured error handling with typed responses
 * - No backward compatibility - breaking change
 */

import pino from 'pino';
import { World, Agent, LLMProvider } from '../core/types.js';
import { WorldInfo, listWorlds, getWorld, createWorld, updateWorld } from '../core/world-manager.js';
import { toKebabCase } from '../core/utils.js';
import {
  CommandRequest,
  CommandResponse,
  CommandHandlers,
  GetWorldsRequest,
  GetWorldsResponse,
  GetWorldRequest,
  GetWorldResponse,
  CreateWorldRequest,
  CreateWorldResponse,
  UpdateWorldRequest,
  UpdateWorldResponse,
  CreateAgentRequest,
  CreateAgentResponse,
  UpdateAgentConfigRequest,
  UpdateAgentConfigResponse,
  UpdateAgentPromptRequest,
  UpdateAgentPromptResponse,
  UpdateAgentMemoryRequest,
  UpdateAgentMemoryResponse,
  ClearAgentMemoryRequest,
  ClearAgentMemoryResponse
} from './types.js';

// Create logger instance
const logger = pino({
  name: 'commands',
  level: process.env.LOG_LEVEL || 'debug',
  transport: process.env.NODE_ENV !== 'production' ? {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  } : undefined
});

// Helper functions for response creation
const createSuccessResponse = <T extends CommandResponse>(
  requestId: string,
  type: T['type'],
  data?: T['data']
): T => ({
  requestId,
  type,
  success: true,
  data,
  timestamp: new Date().toISOString()
} as T);

const createErrorResponse = <T extends CommandResponse>(
  requestId: string,
  type: T['type'],
  error: string
): T => ({
  requestId,
  type,
  success: false,
  error,
  timestamp: new Date().toISOString()
} as T);

// Global command handlers (no world context required)
const handleGetWorlds = async (request: GetWorldsRequest, rootPath: string): Promise<GetWorldsResponse> => {
  try {
    const worlds = await listWorlds(rootPath);

    // Load each world to get agent details
    const worldsWithAgentDetails = await Promise.all(
      worlds.map(async (worldInfo) => {
        try {
          const fullWorld = await getWorld(rootPath, worldInfo.id);
          if (!fullWorld) {
            return {
              ...worldInfo,
              agentCount: 0,
              agents: []
            };
          }

          const agents = Array.from(fullWorld.agents.values()).map((agentValue) => {
            const agent = agentValue as Agent;
            return {
              id: agent.id,
              name: agent.name,
              messageCount: agent.memory?.length || 0,
              status: agent.status || 'inactive'
            };
          });

          return {
            ...worldInfo,
            agentCount: agents.length,
            agents
          };
        } catch (error) {
          logger.warn('Failed to load world for agent details', {
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

    return createSuccessResponse<GetWorldsResponse>(
      request.id,
      'getWorlds',
      worldsWithAgentDetails
    );
  } catch (error) {
    logger.error('GetWorlds command failed', {
      error: error instanceof Error ? error.message : error,
      requestId: request.id
    });
    return createErrorResponse<GetWorldsResponse>(
      request.id,
      'getWorlds',
      `Failed to get worlds: ${error instanceof Error ? error.message : error}`
    );
  }
};

const handleGetWorld = async (request: GetWorldRequest, rootPath: string): Promise<GetWorldResponse> => {
  try {
    const worldId = toKebabCase(request.worldName);
    const world = await getWorld(rootPath, worldId);

    if (!world) {
      return createErrorResponse<GetWorldResponse>(
        request.id,
        'getWorld',
        `World not found: ${request.worldName}`
      );
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

    return createSuccessResponse<GetWorldResponse>(
      request.id,
      'getWorld',
      worldData
    );
  } catch (error) {
    logger.error('GetWorld command failed', {
      error: error instanceof Error ? error.message : error,
      requestId: request.id,
      worldName: request.worldName
    });
    return createErrorResponse<GetWorldResponse>(
      request.id,
      'getWorld',
      `Failed to get world: ${error instanceof Error ? error.message : error}`
    );
  }
};

const handleCreateWorld = async (request: CreateWorldRequest, rootPath: string): Promise<CreateWorldResponse> => {
  try {
    const newWorld = await createWorld(rootPath, {
      name: request.name,
      description: request.description || `A new world called ${request.name}`,
      turnLimit: request.turnLimit || 5
    });

    const worldData = {
      id: newWorld.id,
      name: newWorld.name,
      description: newWorld.description || '',
      turnLimit: newWorld.turnLimit
    };

    return createSuccessResponse<CreateWorldResponse>(
      request.id,
      'createWorld',
      worldData
    );
  } catch (error) {
    logger.error('CreateWorld command failed', {
      error: error instanceof Error ? error.message : error,
      requestId: request.id,
      worldName: request.name
    });
    return createErrorResponse<CreateWorldResponse>(
      request.id,
      'createWorld',
      `Failed to create world: ${error instanceof Error ? error.message : error}`
    );
  }
};

// World-context command handlers
const handleUpdateWorld = async (request: UpdateWorldRequest, world?: World, rootPath?: string): Promise<UpdateWorldResponse> => {
  try {
    if (!world) {
      return createErrorResponse<UpdateWorldResponse>(
        request.id,
        'updateWorld',
        'UpdateWorld command requires world context'
      );
    }

    if (!rootPath) {
      return createErrorResponse<UpdateWorldResponse>(
        request.id,
        'updateWorld',
        'UpdateWorld command requires rootPath'
      );
    }

    await world.save(); // Save current state first

    const updatedWorld = await updateWorld(rootPath, world.id, request.updates);

    if (updatedWorld) {
      const message = Object.keys(request.updates).map(key =>
        `${key} updated`
      ).join(', ');

      return createSuccessResponse<UpdateWorldResponse>(
        request.id,
        'updateWorld',
        { message: `World ${message}`, refreshWorld: true }
      );
    } else {
      return createErrorResponse<UpdateWorldResponse>(
        request.id,
        'updateWorld',
        'Failed to update world'
      );
    }
  } catch (error) {
    logger.error('UpdateWorld command failed', {
      error: error instanceof Error ? error.message : error,
      requestId: request.id,
      worldName: request.worldName,
      updates: request.updates
    });
    return createErrorResponse<UpdateWorldResponse>(
      request.id,
      'updateWorld',
      `Failed to update world: ${error instanceof Error ? error.message : error}`
    );
  }
};

const handleCreateAgent = async (request: CreateAgentRequest, world?: World): Promise<CreateAgentResponse> => {
  try {
    if (!world) {
      return createErrorResponse<CreateAgentResponse>(
        request.id,
        'createAgent',
        'CreateAgent command requires world context'
      );
    }

    const agent = await world.createAgent({
      id: toKebabCase(request.name),
      name: request.name,
      type: 'assistant',
      systemPrompt: request.systemPrompt || `You are ${request.name}. ${request.description || 'A helpful assistant'}`,
      provider: (request.provider as LLMProvider) || LLMProvider.OPENAI,
      model: request.model || 'gpt-4o-mini'
    });

    const agentData = {
      id: agent.id,
      name: agent.name,
      status: agent.status || 'inactive',
      provider: agent.provider,
      model: agent.model,
      messageCount: agent.memory?.length || 0
    };

    return createSuccessResponse<CreateAgentResponse>(
      request.id,
      'createAgent',
      agentData
    );
  } catch (error) {
    logger.error('CreateAgent command failed', {
      error: error instanceof Error ? error.message : error,
      requestId: request.id,
      agentName: request.name,
      worldName: request.worldName
    });
    return createErrorResponse<CreateAgentResponse>(
      request.id,
      'createAgent',
      `Failed to create agent: ${error instanceof Error ? error.message : error}`
    );
  }
};

const handleUpdateAgentConfig = async (request: UpdateAgentConfigRequest, world?: World): Promise<UpdateAgentConfigResponse> => {
  try {
    if (!world) {
      return createErrorResponse<UpdateAgentConfigResponse>(
        request.id,
        'updateAgentConfig',
        'UpdateAgentConfig command requires world context'
      );
    }

    const agentId = toKebabCase(request.agentName);
    const updates: any = {};

    if (request.config.model) updates.model = request.config.model;
    if (request.config.status) updates.status = request.config.status;
    if (request.config.provider) {
      // Convert string to LLMProvider enum
      const providerMap: Record<string, LLMProvider> = {
        'openai': LLMProvider.OPENAI,
        'anthropic': LLMProvider.ANTHROPIC,
        'azure': LLMProvider.AZURE,
        'google': LLMProvider.GOOGLE,
        'xai': LLMProvider.XAI,
        'ollama': LLMProvider.OLLAMA
      };
      const provider = providerMap[request.config.provider.toLowerCase()];
      if (!provider) {
        return createErrorResponse<UpdateAgentConfigResponse>(
          request.id,
          'updateAgentConfig',
          `Invalid provider: ${request.config.provider}. Valid options: ${Object.keys(providerMap).join(', ')}`
        );
      }
      updates.provider = provider;
    }

    const updatedAgent = await world.updateAgent(agentId, updates);

    if (updatedAgent) {
      const configKeys = Object.keys(request.config).join(', ');
      return createSuccessResponse<UpdateAgentConfigResponse>(
        request.id,
        'updateAgentConfig',
        { message: `Agent '${request.agentName}' ${configKeys} updated`, refreshWorld: true }
      );
    } else {
      return createErrorResponse<UpdateAgentConfigResponse>(
        request.id,
        'updateAgentConfig',
        `Agent '${request.agentName}' not found`
      );
    }
  } catch (error) {
    logger.error('UpdateAgentConfig command failed', {
      error: error instanceof Error ? error.message : error,
      requestId: request.id,
      agentName: request.agentName,
      config: request.config
    });
    return createErrorResponse<UpdateAgentConfigResponse>(
      request.id,
      'updateAgentConfig',
      `Failed to update agent config: ${error instanceof Error ? error.message : error}`
    );
  }
};

const handleUpdateAgentPrompt = async (request: UpdateAgentPromptRequest, world?: World): Promise<UpdateAgentPromptResponse> => {
  try {
    if (!world) {
      return createErrorResponse<UpdateAgentPromptResponse>(
        request.id,
        'updateAgentPrompt',
        'UpdateAgentPrompt command requires world context'
      );
    }

    const agentId = toKebabCase(request.agentName);
    const updatedAgent = await world.updateAgent(agentId, { systemPrompt: request.systemPrompt });

    if (updatedAgent) {
      return createSuccessResponse<UpdateAgentPromptResponse>(
        request.id,
        'updateAgentPrompt',
        { message: `Agent '${request.agentName}' system prompt updated`, refreshWorld: true }
      );
    } else {
      return createErrorResponse<UpdateAgentPromptResponse>(
        request.id,
        'updateAgentPrompt',
        `Agent '${request.agentName}' not found`
      );
    }
  } catch (error) {
    logger.error('UpdateAgentPrompt command failed', {
      error: error instanceof Error ? error.message : error,
      requestId: request.id,
      agentName: request.agentName
    });
    return createErrorResponse<UpdateAgentPromptResponse>(
      request.id,
      'updateAgentPrompt',
      `Failed to update agent prompt: ${error instanceof Error ? error.message : error}`
    );
  }
};

const handleUpdateAgentMemory = async (request: UpdateAgentMemoryRequest, world?: World): Promise<UpdateAgentMemoryResponse> => {
  try {
    if (!world) {
      return createErrorResponse<UpdateAgentMemoryResponse>(
        request.id,
        'updateAgentMemory',
        'UpdateAgentMemory command requires world context'
      );
    }

    const agentId = toKebabCase(request.agentName);

    if (request.action === 'clear') {
      const clearedAgent = await world.clearAgentMemory(agentId);
      if (clearedAgent) {
        return createSuccessResponse<UpdateAgentMemoryResponse>(
          request.id,
          'updateAgentMemory',
          { message: `Agent '${request.agentName}' memory cleared`, refreshWorld: true }
        );
      } else {
        return createErrorResponse<UpdateAgentMemoryResponse>(
          request.id,
          'updateAgentMemory',
          `Agent '${request.agentName}' not found`
        );
      }
    } else if (request.action === 'add' && request.message) {
      const agent = await world.getAgent(agentId);
      if (!agent) {
        return createErrorResponse<UpdateAgentMemoryResponse>(
          request.id,
          'updateAgentMemory',
          `Agent '${request.agentName}' not found`
        );
      }

      const newMessage = {
        role: request.message.role,
        content: request.message.content,
        createdAt: new Date(),
        sender: request.message.role === 'user' ? 'human' : request.agentName
      };

      const updatedMemory = [...agent.memory, newMessage];
      const updatedAgent = await world.updateAgentMemory(agentId, updatedMemory);

      if (updatedAgent) {
        return createSuccessResponse<UpdateAgentMemoryResponse>(
          request.id,
          'updateAgentMemory',
          { message: `Message added to agent '${request.agentName}' memory`, refreshWorld: true }
        );
      } else {
        return createErrorResponse<UpdateAgentMemoryResponse>(
          request.id,
          'updateAgentMemory',
          'Failed to add message to agent memory'
        );
      }
    } else {
      return createErrorResponse<UpdateAgentMemoryResponse>(
        request.id,
        'updateAgentMemory',
        'Invalid action or missing message for add action'
      );
    }
  } catch (error) {
    logger.error('UpdateAgentMemory command failed', {
      error: error instanceof Error ? error.message : error,
      requestId: request.id,
      agentName: request.agentName,
      action: request.action
    });
    return createErrorResponse<UpdateAgentMemoryResponse>(
      request.id,
      'updateAgentMemory',
      `Failed to update agent memory: ${error instanceof Error ? error.message : error}`
    );
  }
};

const handleClearAgentMemory = async (request: ClearAgentMemoryRequest, world?: World): Promise<ClearAgentMemoryResponse> => {
  try {
    if (!world) {
      return createErrorResponse<ClearAgentMemoryResponse>(
        request.id,
        'clearAgentMemory',
        'ClearAgentMemory command requires world context'
      );
    }

    if (!request.agentName) {
      // Clear all agents
      const agents = Array.from(world.agents.values());
      if (agents.length === 0) {
        return createSuccessResponse<ClearAgentMemoryResponse>(
          request.id,
          'clearAgentMemory',
          { message: 'No agents to clear', refreshWorld: false }
        );
      }

      const clearPromises = agents.map(agentValue => {
        const agent = agentValue as Agent;
        return world.clearAgentMemory(agent.id);
      });
      await Promise.all(clearPromises);

      return createSuccessResponse<ClearAgentMemoryResponse>(
        request.id,
        'clearAgentMemory',
        { message: `Cleared memory for all ${agents.length} agents`, refreshWorld: true }
      );
    } else {
      // Clear specific agent
      const agentId = toKebabCase(request.agentName);
      const clearedAgent = await world.clearAgentMemory(agentId);

      if (clearedAgent) {
        return createSuccessResponse<ClearAgentMemoryResponse>(
          request.id,
          'clearAgentMemory',
          { message: `Cleared memory for agent: ${request.agentName}`, refreshWorld: true }
        );
      } else {
        return createErrorResponse<ClearAgentMemoryResponse>(
          request.id,
          'clearAgentMemory',
          `Agent not found: ${request.agentName}`
        );
      }
    }
  } catch (error) {
    logger.error('ClearAgentMemory command failed', {
      error: error instanceof Error ? error.message : error,
      requestId: request.id,
      agentName: request.agentName
    });
    return createErrorResponse<ClearAgentMemoryResponse>(
      request.id,
      'clearAgentMemory',
      `Failed to clear agent memory: ${error instanceof Error ? error.message : error}`
    );
  }
};

// Command handlers registry
export const commandHandlers: CommandHandlers = {
  getWorlds: handleGetWorlds as any,
  getWorld: handleGetWorld as any,
  createWorld: handleCreateWorld as any,
  updateWorld: handleUpdateWorld as any,
  createAgent: handleCreateAgent,
  updateAgentConfig: handleUpdateAgentConfig,
  updateAgentPrompt: handleUpdateAgentPrompt,
  updateAgentMemory: handleUpdateAgentMemory,
  clearAgentMemory: handleClearAgentMemory
};

// Main command processor
export const processCommandRequest = async (
  request: CommandRequest,
  world: World | null,
  rootPath: string
): Promise<CommandResponse> => {
  try {
    logger.debug('Processing command request', {
      type: request.type,
      requestId: request.id,
      hasWorld: !!world
    });

    switch (request.type) {
      case 'getWorlds':
        return await handleGetWorlds(request, rootPath);
      case 'getWorld':
        return await handleGetWorld(request, rootPath);
      case 'createWorld':
        return await handleCreateWorld(request, rootPath);
      case 'updateWorld':
        return await handleUpdateWorld(request, world!, rootPath);
      case 'createAgent':
        return await handleCreateAgent(request, world!);
      case 'updateAgentConfig':
        return await handleUpdateAgentConfig(request, world!);
      case 'updateAgentPrompt':
        return await handleUpdateAgentPrompt(request, world!);
      case 'updateAgentMemory':
        return await handleUpdateAgentMemory(request, world!);
      case 'clearAgentMemory':
        return await handleClearAgentMemory(request, world!);
      default:
        const unknownRequest = request as any;
        return createErrorResponse(
          unknownRequest.id || 'unknown',
          unknownRequest.type || 'unknown',
          `Unknown command type: ${unknownRequest.type || 'undefined'}`
        ) as CommandResponse;
    }
  } catch (error) {
    logger.error('Command processing failed', {
      error: error instanceof Error ? error.message : error,
      requestId: request.id,
      commandType: request.type
    });
    const unknownRequest = request as any;
    return createErrorResponse(
      unknownRequest.id || 'unknown',
      unknownRequest.type || 'unknown',
      `Command processing failed: ${error instanceof Error ? error.message : error}`
    ) as CommandResponse;
  }
};
