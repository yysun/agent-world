/**
 * Server Commands Index
 * 
 * Features:
 * - Central export for all server WebSocket commands
 * - Command registry for WebSocket message handling
 * - Extensible structure for adding new commands
 * - Helper functions for common command operations
 * - All commands implemented in single file for simplicity
 * 
 * Commands:
 * - clear: Clear agent memory (individual or all)
 * - getWorlds: List all available worlds (requires rootPath)
 * - getWorld: Get world information and agents
 * - addWorld: Create a new world (requires rootPath)
 * - updateWorld: Update world configuration (requires rootPath)
 * - addAgent: Add a new agent to world
 * - updateAgentConfig: Update agent configuration
 * - updateAgentPrompt: Update agent system prompt
 * - updateAgentMemory: Update agent memory/conversation
 * 
 * Changes:
 * - Initial creation with clear command export
 * - Structured for easy command addition and management
 * - Consolidated all commands into single file
 * - Added helper functions for validation and responses
 * - Updated commands to use rootPath from args instead of environment variables
 * - Modified updateWorld command to require rootPath as first argument
 */

import { WebSocket } from 'ws';
import { World, Agent, LLMProvider } from '../../core/types.js';
import { WorldInfo, listWorlds, getWorld as getWorldFromManager, createWorld, updateWorld } from '../../core/world-manager.js';
import { ServerCommand, CommandResult, ValidationHelper, ResponseHelper, ErrorHelper } from './types.js';

// Helper functions
const validateArgs: ValidationHelper = (args, requiredCount = 0) => {
  if (args.length < requiredCount) {
    return createResponse(`Missing required arguments. Expected ${requiredCount}, got ${args.length}`, 'error');
  }
  return null;
};

const createResponse: ResponseHelper = (content, type = 'system', data = undefined, refreshWorld = false) => ({
  type,
  content: type !== 'error' ? content : undefined,
  error: type === 'error' ? content : undefined,
  data,
  timestamp: new Date().toISOString(),
  refreshWorld
});

const createError: ErrorHelper = (error) => ({
  type: 'error' as const,
  error: error instanceof Error ? error.message : error,
  timestamp: new Date().toISOString()
});

// Command implementations
const clearCommand: ServerCommand = async (args, world, ws) => {
  try {
    // Handle /clear command (no args) - clear all agents
    if (args.length === 0) {
      const agents = Array.from(world.agents.values());

      if (agents.length === 0) {
        return createResponse('No agents to clear.');
      }

      const clearPromises = agents.map(agent => world.clearAgentMemory(agent.name));
      await Promise.all(clearPromises);

      return createResponse(`Cleared memory for all ${agents.length} agents in ${world.name}`);
    }

    // Handle /clear <name> command - clear specific agent memory
    const agentName = args[0].trim();
    const clearedAgent = await world.clearAgentMemory(agentName);

    if (clearedAgent) {
      return createResponse(`Cleared memory for agent: ${agentName}`);
    } else {
      return createError(`Agent not found: ${agentName}`);
    }

  } catch (error) {
    return createError(`Failed to clear agent memory: ${error}`);
  }
};

const getWorldsCommand: ServerCommand = async (args, world, ws) => {
  try {
    const validationError = validateArgs(args, 1);
    if (validationError) return validationError;

    const ROOT_PATH = args[0].trim();
    const worlds = await listWorlds(ROOT_PATH);

    // Count agents for each world by loading and checking agents map
    const worldsWithAgentCount = await Promise.all(
      worlds.map(async (worldInfo) => {
        try {
          const fullWorld = await getWorldFromManager(ROOT_PATH, worldInfo.id);
          return {
            ...worldInfo,
            agentCount: fullWorld ? fullWorld.agents.size : 0
          };
        } catch (error) {
          // If world fails to load, keep original count (0)
          return worldInfo;
        }
      })
    );

    return createResponse('Worlds retrieved successfully', 'data', worldsWithAgentCount);
  } catch (error) {
    return createError(`Failed to get worlds: ${error}`);
  }
};

const getWorldCommand: ServerCommand = async (args, world, ws) => {
  try {
    // Return current world information with agent list
    const agents = Array.from(world.agents.values()).map(agent => ({
      id: agent.id,
      name: agent.name,
      status: agent.status,
      provider: agent.provider,
      model: agent.model,
      lastActive: agent.lastActive,
      messageCount: agent.memory?.length || 0
    }));

    const worldData = {
      id: world.id,
      name: world.name,
      description: world.description,
      turnLimit: world.turnLimit,
      agentCount: agents.length,
      agents: agents
    };

    return createResponse('World information retrieved successfully', 'data', worldData);
  } catch (error) {
    return createError(`Failed to get world: ${error}`);
  }
};

const addWorldCommand: ServerCommand = async (args, world, ws) => {
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

const updateWorldCommand: ServerCommand = async (args, world, ws) => {
  try {
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

const addAgentCommand: ServerCommand = async (args, world, ws) => {
  try {
    const validationError = validateArgs(args, 1);
    if (validationError) return validationError;

    const agentName = args[0].trim();
    const description = args.slice(1).join(' ').trim() || 'A helpful assistant';

    // Create agent using world method
    const agent = await world.createAgent({
      id: agentName.toLowerCase().replace(/\s+/g, '-'), // Convert to kebab-case
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
    return createError(`Failed to add agent: ${error}`);
  }
};

const updateAgentConfigCommand: ServerCommand = async (args, world, ws) => {
  try {
    const validationError = validateArgs(args, 2);
    if (validationError) return validationError;

    const agentName = args[0].trim();
    const configType = args[1].toLowerCase();

    if (configType === 'model' && args.length >= 3) {
      const model = args[2].trim();
      const updatedAgent = await world.updateAgent(agentName, { model });

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

      const updatedAgent = await world.updateAgent(agentName, { provider });

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

      const updatedAgent = await world.updateAgent(agentName, { status });

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

const updateAgentPromptCommand: ServerCommand = async (args, world, ws) => {
  try {
    const validationError = validateArgs(args, 2);
    if (validationError) return validationError;

    const agentName = args[0].trim();
    const systemPrompt = args.slice(1).join(' ').trim();

    if (!systemPrompt) {
      return createError('System prompt cannot be empty');
    }

    const updatedAgent = await world.updateAgent(agentName, { systemPrompt });

    if (updatedAgent) {
      return createResponse(`Agent '${agentName}' system prompt updated successfully`, 'system', undefined, true);
    } else {
      return createError(`Agent '${agentName}' not found`);
    }
  } catch (error) {
    return createError(`Failed to update agent prompt: ${error}`);
  }
};

const updateAgentMemoryCommand: ServerCommand = async (args, world, ws) => {
  try {
    const validationError = validateArgs(args, 2);
    if (validationError) return validationError;

    const agentName = args[0].trim();
    const action = args[1].toLowerCase();

    if (action === 'clear') {
      const clearedAgent = await world.clearAgentMemory(agentName);

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

      const agent = await world.getAgent(agentName);
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
      const updatedAgent = await world.updateAgentMemory(agentName, updatedMemory);

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

// Export individual commands
export { clearCommand };

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

/**
 * Execute a command by parsing the message and routing to appropriate command handler
 * @param message - The command message starting with '/'
 * @param world - The world context
 * @param ws - The WebSocket connection
 * @returns Promise<CommandResult> - The command execution result
 */
export async function executeCommand(message: string, world: World, ws: WebSocket): Promise<CommandResult> {
  try {
    // Remove leading '/' and split into command and arguments
    const commandLine = message.slice(1).trim();
    if (!commandLine) {
      return createError('Empty command');
    }

    const parts = commandLine.split(/\s+/);
    const commandName = parts[0] as CommandName; // Keep original case
    const args = parts.slice(1);

    // Check if command exists (case-insensitive lookup)
    const commandKey = Object.keys(commands).find(key =>
      key.toLowerCase() === commandName.toLowerCase()
    ) as CommandName;

    const command = commandKey ? commands[commandKey] : undefined;

    if (!command) {
      return createError(`Unknown command: /${commandName}`);
    }

    // Execute the command
    return await command(args, world, ws);
  } catch (error) {
    return createError(`Command execution failed: ${error}`);
  }
}
