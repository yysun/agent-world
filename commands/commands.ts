/**
 * Server Commands Index
 * 
 * Features:
 * - Central export for all server commands with command registry
 * - Global commands (getWorlds, getWorld, addWorld) and world-context commands
 * - Transport-agnostic using optional world parameter
 * - Pino logging for error tracking and debugging
 * 
 * Commands:
 * - clear: Clear agent memory (individual or all)
 * - getWorlds/getWorld/addWorld: Global commands using rootPath from args
 * - updateWorld/addAgent/updateAgent*: Commands requiring world context
 * 
 * Implementation:
 * - Uses getWorld() from world-manager which auto-loads agents and subscribes to events
 * - Helper functions for validation, responses, and error handling
 * - Structured logging with configurable levels
 */

import pino from 'pino';
import { World, Agent, LLMProvider } from '../core/types.js';
import { WorldInfo, listWorlds, getWorld, createWorld, updateWorld } from '../core/world-manager.js';
import { toKebabCase } from '../core/utils.js';
import { ServerCommand, CommandResult, ValidationHelper, ResponseHelper, ErrorHelper } from './types.js';
import { handleMessagePublish, prepareCommandWithRootPath } from './events.js';

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

// Helper functions
const createResponse: ResponseHelper = (content, type = 'system', data = undefined, refreshWorld = false) => {
  if (type === 'data') {
    return { data, message: content, refreshWorld, timestamp: new Date().toISOString() };
  }
  return {
    type,
    content: type !== 'error' ? content : undefined,
    error: type === 'error' ? content : undefined,
    data,
    timestamp: new Date().toISOString(),
    refreshWorld
  };
};

const createError: ErrorHelper = (error) => ({
  type: 'error' as const,
  error: error instanceof Error ? error.message : error,
  timestamp: new Date().toISOString()
});

const validateArgs: ValidationHelper = (args, requiredCount = 0) => {
  if (args.length < requiredCount) {
    return createError(`Missing required arguments. Expected ${requiredCount}, got ${args.length}`);
  }
  return null;
};

// Command registry for validation and mapping
const commandRegistry = {
  // Global commands (no world context required)
  '/getWorlds': { command: 'getWorlds', global: true, minArgs: 0 },
  '/addWorld': { command: 'addWorld', global: true, minArgs: 1 },
  '/getWorld': { command: 'getWorld', global: true, minArgs: 0 },

  // World-specific commands (require world context)
  '/clear': { command: 'clear', global: false, minArgs: 0 },
  '/addAgent': { command: 'addAgent', global: false, minArgs: 1 },
  '/updateWorld': { command: 'updateWorld', global: false, minArgs: 2 },
  '/updateAgentConfig': { command: 'updateAgentConfig', global: false, minArgs: 2 },
  '/updateAgentPrompt': { command: 'updateAgentPrompt', global: false, minArgs: 2 },
  '/updateAgentMemory': { command: 'updateAgentMemory', global: false, minArgs: 2 }
} as const;

// Command validation function
function validateCommand(input: string): { isValid: boolean; error?: string; commandInfo?: typeof commandRegistry[keyof typeof commandRegistry] } {
  if (!input?.trim()) {
    return { isValid: false, error: 'Empty command' };
  }

  const trimmedInput = input.trim();
  if (!trimmedInput.startsWith('/')) {
    return { isValid: false, error: 'Commands must start with /' };
  }

  const parts = trimmedInput.split(/\s+/);
  const commandKey = parts[0] as keyof typeof commandRegistry;
  const args = parts.slice(1);

  if (!commandRegistry[commandKey]) {
    const availableCommands = Object.keys(commandRegistry).join(', ');
    return {
      isValid: false,
      error: `Unknown command: ${commandKey}. Available commands: ${availableCommands}`
    };
  }

  const commandInfo = commandRegistry[commandKey];
  if (args.length < commandInfo.minArgs) {
    return {
      isValid: false,
      error: `Command ${commandKey} requires at least ${commandInfo.minArgs} arguments, got ${args.length}`
    };
  }

  return { isValid: true, commandInfo };
}

// Command implementations
const clearCommand: ServerCommand = async (args, world) => {
  try {
    if (!world) return createError('Clear command requires world context');

    if (args.length === 0) {
      // Clear all agents
      const agents = Array.from(world.agents.values());
      if (agents.length === 0) return createResponse('No agents to clear.');

      const clearPromises = agents.map(agentValue => {
        const agent = agentValue as Agent;
        return world.clearAgentMemory(agent.id); // Use agent.id directly since it's already in kebab-case
      });
      await Promise.all(clearPromises);
      return createResponse(`Cleared memory for all ${agents.length} agents in ${world.name}`);
    }

    // Clear specific agent
    const agentName = args[0].trim();
    const agentId = toKebabCase(agentName); // Convert to kebab-case for lookup
    const clearedAgent = await world.clearAgentMemory(agentId);

    return clearedAgent
      ? createResponse(`Cleared memory for agent: ${agentName}`)
      : createError(`Agent not found: ${agentName}`);

  } catch (error) {
    logger.error('Clear command failed', { error: error instanceof Error ? error.message : error, args });
    return createError(`Failed to clear agent memory: ${error}`);
  }
};

const getWorldsCommand: ServerCommand = async (args) => {
  try {
    const validationError = validateArgs(args, 1);
    if (validationError) return validationError;

    const ROOT_PATH = args[0].trim();
    const worlds = await listWorlds(ROOT_PATH);

    // Load each world to get agent details
    const worldsWithAgentDetails = await Promise.all(
      worlds.map(async (worldInfo) => {
        try {
          const fullWorld = await getWorld(ROOT_PATH, worldInfo.id);
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

    return createResponse('Worlds retrieved successfully', 'data', worldsWithAgentDetails);
  } catch (error) {
    logger.error('GetWorlds command failed', {
      error: error instanceof Error ? error.message : error,
      args
    });
    return createError(`Failed to get worlds: ${error}`);
  }
};

const getWorldCommand: ServerCommand = async (args) => {
  try {
    const validationError = validateArgs(args, 2);
    if (validationError) return validationError;

    const ROOT_PATH = args[0].trim();
    const worldIdentifier = args[1].trim();
    const worldId = toKebabCase(worldIdentifier); // Convert to kebab-case for core function

    const world = await getWorld(ROOT_PATH, worldId);
    if (!world) return createError(`World not found: ${worldIdentifier}`);

    const agents = Array.from(world.agents.values()).map((agentValue) => agentValue as Agent);
    const worldData = {
      id: world.id,
      name: world.name,
      description: world.description,
      turnLimit: world.turnLimit,
      agentCount: agents.length,
      agents
    };

    return createResponse('World information retrieved successfully', 'data', worldData);
  } catch (error) {
    logger.error('GetWorld command failed', { error: error instanceof Error ? error.message : error, args });
    return createError(`Failed to get world: ${error}`);
  }
};

const addWorldCommand: ServerCommand = async (args, world) => {
  try {
    const validationError = validateArgs(args, 2);
    if (validationError) return validationError;

    const ROOT_PATH = args[0].trim();
    const worldName = args[1].trim();
    const description = args.slice(2).join(' ').trim() || `A new world called ${worldName}`;

    const newWorld = await createWorld(ROOT_PATH, {
      name: worldName,
      description: description,
      turnLimit: 5
    });

    const worldData = {
      id: newWorld.id,
      name: newWorld.name,
      description: newWorld.description,
      turnLimit: newWorld.turnLimit,
      agentCount: 0,
      agents: []
    };

    return createResponse(`World '${worldName}' created successfully`, 'data', worldData, true);
  } catch (error) {
    return createError(`Failed to add world: ${error}`);
  }
};

const updateWorldCommand: ServerCommand = async (args, world) => {
  try {
    if (!world) {
      return createError('UpdateWorld command requires world context');
    }

    const validationError = validateArgs(args, 2);
    if (validationError) return validationError;

    const ROOT_PATH = args[0].trim();
    const updateType = args[1].toLowerCase();

    if (updateType === 'name' && args.length >= 3) {
      const newName = args.slice(2).join(' ').trim();
      await world.save(); // Save current state first

      // Note: Updating world name requires core manager function as it affects ID
      const updatedWorld = await updateWorld(ROOT_PATH, world.id, {
        name: newName
      });

      if (updatedWorld) {
        return createResponse(`World name updated to '${newName}'`, 'system', undefined, true);
      } else {
        return createError('Failed to update world name');
      }
    } else if (updateType === 'description' && args.length >= 3) {
      const newDescription = args.slice(2).join(' ').trim();

      const updatedWorld = await updateWorld(ROOT_PATH, world.id, {
        description: newDescription
      });

      if (updatedWorld) {
        return createResponse(`World description updated`, 'system', undefined, true);
      } else {
        return createError('Failed to update world description');
      }
    } else if (updateType === 'turnlimit' && args.length >= 3) {
      const turnLimit = parseInt(args[2]);

      if (isNaN(turnLimit) || turnLimit < 1) {
        return createError('Turn limit must be a positive number');
      }

      const updatedWorld = await updateWorld(ROOT_PATH, world.id, {
        turnLimit: turnLimit
      });

      if (updatedWorld) {
        return createResponse(`World turn limit updated to ${turnLimit}`, 'system', undefined, true);
      } else {
        return createError('Failed to update world turn limit');
      }
    } else {
      return createError('Usage: updateWorld <rootPath> <name|description|turnLimit> <value>');
    }
  } catch (error) {
    return createError(`Failed to update world: ${error}`);
  }
};

const addAgentCommand: ServerCommand = async (args, world) => {
  try {
    if (!world) {
      return createError('AddAgent command requires world context');
    }

    const validationError = validateArgs(args, 1);
    if (validationError) return validationError;

    const agentName = args[0].trim();
    const description = args.slice(1).join(' ').trim() || 'A helpful assistant';

    // Create agent using world method
    const agent = await world.createAgent({
      id: toKebabCase(agentName), // Convert to kebab-case using utility
      name: agentName,
      type: 'assistant',
      systemPrompt: `You are ${agentName}. ${description}`,
      provider: LLMProvider.OPENAI, // Default provider
      model: 'gpt-4o-mini' // Default model
    });

    const agentData = {
      id: agent.id,
      name: agent.name,
      status: agent.status,
      provider: agent.provider,
      model: agent.model,
      messageCount: agent.memory?.length || 0
    };

    return createResponse(`Agent '${agentName}' created successfully`, 'data', agentData, true);
  } catch (error) {
    logger.error('AddAgent command failed', { error: error instanceof Error ? error.message : error, args, world: world?.name });
    return createError(`Failed to add agent: ${error}`);
  }
};

const updateAgentConfigCommand: ServerCommand = async (args, world) => {
  try {
    if (!world) {
      return createError('UpdateAgentConfig command requires world context');
    }

    const validationError = validateArgs(args, 2);
    if (validationError) return validationError;

    const agentName = args[0].trim();
    const agentId = toKebabCase(agentName); // Convert to kebab-case for lookup
    const configType = args[1].toLowerCase();

    if (configType === 'model' && args.length >= 3) {
      const model = args[2].trim();
      const updatedAgent = await world.updateAgent(agentId, { model });

      if (updatedAgent) {
        return createResponse(`Agent '${agentName}' model updated to '${model}'`, 'system', undefined, true);
      } else {
        return createError(`Agent '${agentName}' not found`);
      }
    } else if (configType === 'provider' && args.length >= 3) {
      const providerStr = args[2].toLowerCase();
      let provider: LLMProvider;

      switch (providerStr) {
        case 'openai':
          provider = LLMProvider.OPENAI;
          break;
        case 'anthropic':
          provider = LLMProvider.ANTHROPIC;
          break;
        case 'azure':
          provider = LLMProvider.AZURE;
          break;
        case 'google':
          provider = LLMProvider.GOOGLE;
          break;
        case 'xai':
          provider = LLMProvider.XAI;
          break;
        case 'ollama':
          provider = LLMProvider.OLLAMA;
          break;
        default:
          return createError(`Invalid provider: ${providerStr}. Valid options: openai, anthropic, azure, google, xai, ollama`);
      }

      const updatedAgent = await world.updateAgent(agentId, { provider });

      if (updatedAgent) {
        return createResponse(`Agent '${agentName}' provider updated to '${providerStr}'`, 'system', undefined, true);
      } else {
        return createError(`Agent '${agentName}' not found`);
      }
    } else if (configType === 'status' && args.length >= 3) {
      const status = args[2].toLowerCase() as 'active' | 'inactive' | 'error';

      if (!['active', 'inactive', 'error'].includes(status)) {
        return createError('Status must be: active, inactive, or error');
      }

      const updatedAgent = await world.updateAgent(agentId, { status });

      if (updatedAgent) {
        return createResponse(`Agent '${agentName}' status updated to '${status}'`, 'system', undefined, true);
      } else {
        return createError(`Agent '${agentName}' not found`);
      }
    } else {
      return createError('Usage: updateAgentConfig <agentName> <model|provider|status> <value>');
    }
  } catch (error) {
    return createError(`Failed to update agent config: ${error}`);
  }
};

const updateAgentPromptCommand: ServerCommand = async (args, world) => {
  try {
    if (!world) {
      return createError('UpdateAgentPrompt command requires world context');
    }

    const validationError = validateArgs(args, 2);
    if (validationError) return validationError;

    const agentName = args[0].trim();
    const agentId = toKebabCase(agentName); // Convert to kebab-case for lookup
    const systemPrompt = args.slice(1).join(' ').trim();

    if (!systemPrompt) {
      return createError('System prompt cannot be empty');
    }

    const updatedAgent = await world.updateAgent(agentId, { systemPrompt });

    if (updatedAgent) {
      return createResponse(`Agent '${agentName}' system prompt updated successfully`, 'system', undefined, true);
    } else {
      return createError(`Agent '${agentName}' not found`);
    }
  } catch (error) {
    return createError(`Failed to update agent prompt: ${error}`);
  }
};

const updateAgentMemoryCommand: ServerCommand = async (args, world) => {
  try {
    if (!world) {
      return createError('UpdateAgentMemory command requires world context');
    }

    const validationError = validateArgs(args, 2);
    if (validationError) return validationError;

    const agentName = args[0].trim();
    const agentId = toKebabCase(agentName); // Convert to kebab-case for lookup
    const action = args[1].toLowerCase();

    if (action === 'clear') {
      const clearedAgent = await world.clearAgentMemory(agentId);

      if (clearedAgent) {
        return createResponse(`Agent '${agentName}' memory cleared successfully`, 'system', undefined, true);
      } else {
        return createError(`Agent '${agentName}' not found`);
      }
    } else if (action === 'add' && args.length >= 4) {
      const role = args[2].toLowerCase() as 'user' | 'assistant' | 'system';
      const content = args.slice(3).join(' ').trim();

      if (!['user', 'assistant', 'system'].includes(role)) {
        return createError('Role must be: user, assistant, or system');
      }

      if (!content) {
        return createError('Message content cannot be empty');
      }

      const agent = await world.getAgent(agentId);
      if (!agent) {
        return createError(`Agent '${agentName}' not found`);
      }

      // Add message to agent memory
      const newMessage = {
        role: role as 'user' | 'assistant' | 'system',
        content: content,
        createdAt: new Date(),
        sender: role === 'user' ? 'human' : agentName
      };

      const updatedMemory = [...agent.memory, newMessage];
      const updatedAgent = await world.updateAgentMemory(agentId, updatedMemory);

      if (updatedAgent) {
        return createResponse(`Message added to agent '${agentName}' memory`, 'system', undefined, true);
      } else {
        return createError('Failed to add message to agent memory');
      }
    } else {
      return createError('Usage: updateAgentMemory <agentName> clear OR updateAgentMemory <agentName> add <user|assistant|system> <message>');
    }
  } catch (error) {
    return createError(`Failed to update agent memory: ${error}`);
  }
};

// Shared input processing function for CLI and WebSocket
export const processInput = async (
  input: string,
  world: World | null,
  rootPath: string,
  sender: string = 'HUMAN'
): Promise<any> => {
  if (!input?.trim()) {
    return {
      success: false,
      error: 'Empty input',
      timestamp: new Date().toISOString()
    };
  }

  const trimmedInput = input.trim();

  if (trimmedInput.startsWith('/')) {
    // Process as command - prepare with rootPath for global commands
    const preparedCommand = prepareCommandWithRootPath(trimmedInput, rootPath);
    return await executeCommand(preparedCommand, world);
  } else {
    // Process as message to world
    if (!world) {
      return {
        success: false,
        error: 'World required for message input',
        timestamp: new Date().toISOString()
      };
    }

    // Check if world has required properties
    if (!world.eventEmitter) {
      logger.error('World eventEmitter not initialized', {
        worldId: world.id,
        worldName: world.name,
        hasEventEmitter: !!world.eventEmitter,
        worldKeys: Object.keys(world)
      });
      return {
        success: false,
        error: 'World eventEmitter not initialized',
        timestamp: new Date().toISOString()
      };
    }

    try {
      handleMessagePublish(world, trimmedInput, sender);

      return {
        success: true,
        message: 'Message sent to world',
        data: { message: trimmedInput, sender },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Error publishing message to world', {
        error: error instanceof Error ? error.message : error,
        worldId: world.id,
        worldName: world.name,
        message: trimmedInput,
        sender
      });
      return {
        success: false,
        error: `Failed to send message: ${error instanceof Error ? error.message : error}`,
        timestamp: new Date().toISOString()
      };
    }
  }
};

// Process system commands (/) with validation
export const processSystemCommand = async (
  input: string,
  world: World | null,
  rootPath: string,
  sender: string = 'SYSTEM'
): Promise<CommandResult> => {
  try {
    // Validate command format and existence
    const validation = validateCommand(input);
    if (!validation.isValid) {
      return createError(validation.error!);
    }

    const commandInfo = validation.commandInfo!;

    // Validate world context for non-global commands
    if (!commandInfo.global && !world) {
      return createError(`Command requires world context: ${input.split(/\s+/)[0]}`);
    }

    // Prepare command with rootPath for global commands
    const preparedCommand = prepareCommandWithRootPath(input, rootPath);
    return await executeCommand(preparedCommand, world);

  } catch (error) {
    logger.error('System command processing failed', {
      error: error instanceof Error ? error.message : error,
      input,
      sender
    });
    return createError(`System command failed: ${error instanceof Error ? error.message : error}`);
  }
};

// Process user messages (plain text)
export const processUserMessage = async (
  input: string,
  world: World | null,
  rootPath: string,
  sender: string = 'HUMAN'
): Promise<any> => {
  if (!input?.trim()) {
    return {
      success: false,
      error: 'Empty message',
      timestamp: new Date().toISOString()
    };
  }

  if (!world) {
    return {
      success: false,
      error: 'World required for user messages',
      timestamp: new Date().toISOString()
    };
  }

  // Check if world has required properties
  if (!world.eventEmitter) {
    logger.error('World eventEmitter not initialized', {
      worldId: world.id,
      worldName: world.name,
      hasEventEmitter: !!world.eventEmitter
    });
    return {
      success: false,
      error: 'World eventEmitter not initialized',
      timestamp: new Date().toISOString()
    };
  }

  try {
    handleMessagePublish(world, input.trim(), sender);

    return {
      success: true,
      message: 'Message sent to world',
      data: { message: input.trim(), sender },
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    logger.error('Error publishing user message to world', {
      error: error instanceof Error ? error.message : error,
      worldId: world.id,
      worldName: world.name,
      message: input.trim(),
      sender
    });
    return {
      success: false,
      error: `Failed to send message: ${error instanceof Error ? error.message : error}`,
      timestamp: new Date().toISOString()
    };
  }
};

// CLI input processor - routes to appropriate channel
export const processCLIInput = async (
  input: string,
  world: World | null,
  rootPath: string,
  sender: string = 'HUMAN'
): Promise<any> => {
  if (!input?.trim()) {
    return {
      success: false,
      error: 'Empty input',
      timestamp: new Date().toISOString()
    };
  }

  const trimmedInput = input.trim();

  if (trimmedInput.startsWith('/')) {
    // Route to system command processing
    return await processSystemCommand(trimmedInput, world, rootPath, sender);
  } else {
    // Route to user message processing
    return await processUserMessage(trimmedInput, world, rootPath, sender);
  }
};

// WebSocket input processor - enforces channel restrictions
export const processWSInput = async (
  input: string,
  world: World | null,
  rootPath: string,
  sender: string = 'WebSocket',
  eventType: 'system' | 'world' | 'message' = 'message'
): Promise<any> => {
  if (!input?.trim()) {
    return {
      success: false,
      error: 'Empty input',
      timestamp: new Date().toISOString()
    };
  }

  const trimmedInput = input.trim();
  const isCommand = trimmedInput.startsWith('/');

  // Enforce channel restrictions
  if (eventType === 'system' || eventType === 'world') {
    if (!isCommand) {
      return {
        success: false,
        error: `${eventType} events require commands starting with /`,
        timestamp: new Date().toISOString()
      };
    }
    // Process as system command
    return await processSystemCommand(trimmedInput, world, rootPath, sender);
  } else if (eventType === 'message') {
    if (isCommand) {
      return {
        success: false,
        error: 'Message events cannot contain commands. Use system events for commands.',
        timestamp: new Date().toISOString()
      };
    }
    // Process as user message
    return await processUserMessage(trimmedInput, world, rootPath, sender);
  }

  return {
    success: false,
    error: `Unknown event type: ${eventType}`,
    timestamp: new Date().toISOString()
  };
};

// Command registry for easy lookup
export const commands = {
  clear: clearCommand,
  getWorlds: getWorldsCommand,
  getWorld: getWorldCommand,
  addWorld: addWorldCommand,
  updateWorld: updateWorldCommand,
  addAgent: addAgentCommand,
  updateAgentConfig: updateAgentConfigCommand,
  updateAgentPrompt: updateAgentPromptCommand,
  updateAgentMemory: updateAgentMemoryCommand
} as const;

export type CommandName = keyof typeof commands;

export const executeCommand = async (message: string, world: World | null): Promise<CommandResult> => {
  try {
    const commandLine = message.slice(1).trim();
    if (!commandLine) return createError('Empty command');

    const parts = commandLine.split(/\s+/);
    const commandName = parts[0] as CommandName;
    const args = parts.slice(1);

    const commandKey = Object.keys(commands).find(key =>
      key.toLowerCase() === commandName.toLowerCase()
    ) as CommandName;

    const command = commandKey ? commands[commandKey] : undefined;
    if (!command) return createError(`Unknown command: /${commandName}`);

    // Global commands
    const globalCommands = ['getworlds', 'addworld', 'getworld'];
    if (globalCommands.includes(commandKey.toLowerCase())) {
      return await command(args, commandKey.toLowerCase() === 'addworld' ? (null as any) : undefined);
    }

    // World-context commands
    if (!world) return createError(`Command '${commandName}' requires world context`);
    return await command(args, world);

  } catch (error) {
    logger.error('Command execution failed', { error: error instanceof Error ? error.message : error, message });
    return createError(`Command execution failed: ${error}`);
  }
};
