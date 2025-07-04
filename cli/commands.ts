/**
 * CLI Commands Implementation - Direct Core Integration
 * 
 * Features:
 * - Direct command mapping system with interactive parameter collection
 * - Core function calls without command processing layer
 * - User-friendly messages with technical details for debugging
 * - Automatic world state management and refreshing
 * - Help message generation with command documentation
 * - Dual input handling for commands and messages
 * - World instance isolation and proper cleanup during refresh
 *
 * Available Commands:
 * - worlds, world, create-world, update-world
 * - create-agent, update-agent, update-prompt, clear
 * - help
 * 
 * World Refresh Mechanism:
 * - Commands that modify world state signal refresh requirement via `refreshWorld: true`
 * - CLI properly destroys old world instances and creates fresh ones
 * - Event subscriptions are cleanly transferred to new world instances
 * - Prevents memory leaks and ensures event isolation between old/new worlds
 * - Agent persistence maintained across refresh cycles
 */

import { World, Agent, LLMProvider, listWorlds, getWorld, createWorld, updateWorld, WorldInfo, publishMessage } from '../core/index.js';
import readline from 'readline';

// CLI response and context types
export interface CLIResponse {
  success: boolean;
  message: string;
  data?: any;
  technicalDetails?: string;
  needsWorldRefresh?: boolean;
  refreshWorld?: boolean;
  error?: string;
}

export interface CLIContext {
  currentWorldName?: string;
  currentWorld?: World | null;
  rootPath: string;
}

export type PromptFunction = (question: string, options?: string[]) => Promise<string>;

// CLI Command Mapping
export const CLI_COMMAND_MAP: Record<string, {
  type: string;
  requiresWorld: boolean;
  description: string;
  usage: string;
  parameters: Array<{
    name: string;
    required: boolean;
    description: string;
    type: 'string' | 'number' | 'boolean';
    options?: string[];
  }>;
}> = {
  'worlds': {
    type: 'getWorlds',
    requiresWorld: false,
    description: 'List all available worlds',
    usage: '/worlds',
    parameters: []
  },
  'world': {
    type: 'getWorld',
    requiresWorld: false,
    description: 'Get world information',
    usage: '/world [worldName]',
    parameters: [
      { name: 'worldName', required: false, description: 'World name (uses current if omitted)', type: 'string' }
    ]
  },
  'create-world': {
    type: 'createWorld',
    requiresWorld: false,
    description: 'Create a new world',
    usage: '/create-world <name> [description]',
    parameters: [
      { name: 'name', required: true, description: 'World name', type: 'string' },
      { name: 'description', required: false, description: 'World description', type: 'string' }
    ]
  },
  'update-world': {
    type: 'updateWorld',
    requiresWorld: true,
    description: 'Update world properties',
    usage: '/update-world <description>',
    parameters: [
      { name: 'description', required: true, description: 'New description', type: 'string' }
    ]
  },
  'create-agent': {
    type: 'createAgent',
    requiresWorld: true,
    description: 'Create a new agent',
    usage: '/create-agent <name> [prompt]',
    parameters: [
      { name: 'name', required: true, description: 'Agent name', type: 'string' },
      { name: 'prompt', required: false, description: 'Agent system prompt', type: 'string' }
    ]
  },
  'update-agent': {
    type: 'updateAgentConfig',
    requiresWorld: true,
    description: 'Update agent configuration',
    usage: '/update-agent <agentName> <config>',
    parameters: [
      { name: 'agentName', required: true, description: 'Agent name', type: 'string' },
      { name: 'config', required: true, description: 'Config JSON string', type: 'string' }
    ]
  },
  'update-prompt': {
    type: 'updateAgentPrompt',
    requiresWorld: true,
    description: 'Update agent system prompt',
    usage: '/update-prompt <agentName> <prompt>',
    parameters: [
      { name: 'agentName', required: true, description: 'Agent name', type: 'string' },
      { name: 'prompt', required: true, description: 'New system prompt', type: 'string' }
    ]
  },
  'clear': {
    type: 'clearAgentMemory',
    requiresWorld: true,
    description: 'Clear agent memory',
    usage: '/clear <agentName>',
    parameters: [
      { name: 'agentName', required: true, description: 'Agent name', type: 'string' }
    ]
  },
  'help': {
    type: 'help',
    requiresWorld: false,
    description: 'Show available commands',
    usage: '/help [command]',
    parameters: [
      { name: 'command', required: false, description: 'Show help for specific command', type: 'string' }
    ]
  }
};

// Legacy command aliases
const COMMAND_MAP: Record<string, string> = {
  'list': 'getWorlds',
  'get': 'getWorld',
  'create': 'createWorld',
  'update': 'updateWorld'
};

// Command parsing and help generation
export function parseCLICommand(input: string): {
  command: string;
  args: string[];
  commandType: string;
  isValid: boolean;
  error?: string;
} {
  const trimmed = input.trim();

  if (!trimmed.startsWith('/')) {
    return {
      command: '',
      args: [],
      commandType: '',
      isValid: false,
      error: 'Commands must start with /'
    };
  }

  const parts = trimmed.slice(1).split(/\s+/).filter(part => part.length > 0);
  if (parts.length === 0) {
    return {
      command: '',
      args: [],
      commandType: '',
      isValid: false,
      error: 'Empty command'
    };
  }

  const command = parts[0].toLowerCase();
  const args = parts.slice(1);

  if (!CLI_COMMAND_MAP[command]) {
    const directMatch = COMMAND_MAP[command];
    if (!directMatch) {
      const availableCommands = Object.keys(CLI_COMMAND_MAP).join(', ');
      return {
        command,
        args,
        commandType: '',
        isValid: false,
        error: `Unknown command: ${command}. Available commands: ${availableCommands}`
      };
    }
    return {
      command,
      args,
      commandType: directMatch,
      isValid: true
    };
  }

  return {
    command,
    args,
    commandType: CLI_COMMAND_MAP[command].type,
    isValid: true
  };
}

export function generateHelpMessage(command?: string): string {
  if (command && CLI_COMMAND_MAP[command]) {
    const cmd = CLI_COMMAND_MAP[command];
    let help = `\n${cmd.usage}\n`;
    help += `Description: ${cmd.description}\n`;
    if (cmd.parameters.length > 0) {
      help += `\nParameters:\n`;
      cmd.parameters.forEach(param => {
        const required = param.required ? 'required' : 'optional';
        const options = param.options ? ` (options: ${param.options.join(', ')})` : '';
        help += `  ${param.name} (${param.type}, ${required}): ${param.description}${options}\n`;
      });
    }
    return help;
  }

  let help = '\nAvailable Commands:\n';
  Object.entries(CLI_COMMAND_MAP).forEach(([cmd, info]) => {
    help += `  ${info.usage.padEnd(30)} - ${info.description}\n`;
  });
  help += '\nUse /help <command> for detailed information about a specific command.';
  return help;
}

// CLI Command Processor
export async function processCLICommand(
  input: string,
  context: CLIContext,
  promptFn: PromptFunction
): Promise<CLIResponse> {
  try {
    const { command, args, commandType, isValid, error } = parseCLICommand(input);

    if (!isValid) {
      return {
        success: false,
        message: error || 'Invalid command',
        technicalDetails: `Failed to parse: ${input}`
      };
    }

    if (command === 'help') {
      const helpCommand = args[0];
      return {
        success: true,
        message: generateHelpMessage(helpCommand),
        data: { command: helpCommand }
      };
    }

    const commandInfo = CLI_COMMAND_MAP[command];

    // Check world requirement
    if (commandInfo.requiresWorld && !context.currentWorldName) {
      const worldName = await promptFn('No world selected. Please enter world name:');
      if (!worldName.trim()) {
        return {
          success: false,
          message: 'World selection is required for this command',
          technicalDetails: `Command ${command} requires world context`
        };
      }
      context.currentWorldName = worldName.trim();
      context.currentWorld = null;
    }

    // Collect parameters through interactive prompts
    const collectedParams: Record<string, any> = {};

    for (let i = 0; i < commandInfo.parameters.length; i++) {
      const param = commandInfo.parameters[i];
      let value = args[i];

      if (!value && param.required) {
        const promptMessage = param.options
          ? `Enter ${param.description} (${param.options.join(', ')}):`
          : `Enter ${param.description}:`;

        value = await promptFn(promptMessage, param.options);

        if (!value.trim()) {
          return {
            success: false,
            message: `${param.name} is required but not provided`,
            technicalDetails: `Missing required parameter: ${param.name}`
          };
        }
      }

      if (value) {
        // Type conversion
        if (param.type === 'number') {
          const numValue = parseInt(value);
          if (isNaN(numValue)) {
            return {
              success: false,
              message: `${param.name} must be a number`,
              technicalDetails: `Invalid number: ${value}`
            };
          }
          collectedParams[param.name] = numValue;
        } else if (param.type === 'boolean') {
          collectedParams[param.name] = value.toLowerCase() === 'true';
        } else {
          collectedParams[param.name] = value;
        }

        // Validate options
        if (param.options && !param.options.includes(collectedParams[param.name])) {
          return {
            success: false,
            message: `Invalid ${param.name}. Valid options: ${param.options.join(', ')}`,
            technicalDetails: `Invalid option: ${value}`
          };
        }
      }
    }

    // Use already loaded world from context
    let world: World | null = null;
    if (commandInfo.requiresWorld) {
      if (context.currentWorld) {
        world = context.currentWorld;
      } else {
        return {
          success: false,
          message: 'No world available',
          technicalDetails: 'Command requires world context but no world is loaded'
        };
      }
    }

    // Execute command using core functions
    let cliResponse: CLIResponse;

    switch (commandInfo.type) {
      case 'getWorlds':
        const worlds = await listWorlds(context.rootPath);
        cliResponse = {
          success: true,
          message: 'Worlds retrieved successfully',
          data: worlds
        };
        break;

      case 'getWorld':
        const worldName = collectedParams.worldName || context.currentWorldName;
        if (!worldName) {
          cliResponse = { success: false, message: 'World name is required', data: null };
          break;
        }
        const worldData = await getWorld(context.rootPath, worldName);
        if (!worldData) {
          cliResponse = { success: false, message: `World '${worldName}' not found`, data: null };
          break;
        }
        cliResponse = {
          success: true,
          message: `World '${worldName}' retrieved successfully`,
          data: worldData
        };
        break;

      case 'createWorld':
        const newWorld = await createWorld(context.rootPath, {
          name: collectedParams.name,
          description: collectedParams.description || `A world named ${collectedParams.name}`
        });
        cliResponse = {
          success: true,
          message: `World '${collectedParams.name}' created successfully`,
          data: newWorld,
          needsWorldRefresh: true
        };
        break;

      case 'updateWorld':
        if (!world) {
          cliResponse = { success: false, message: 'No world selected', data: null };
          break;
        }
        const updates: any = {};
        if (collectedParams.description) updates.description = collectedParams.description;
        const updatedWorld = await updateWorld(context.rootPath, world.id, updates);
        cliResponse = {
          success: true,
          message: `World '${world.name}' updated successfully`,
          data: updatedWorld,
          needsWorldRefresh: true
        };
        break;

      case 'createAgent':
        if (!world) {
          cliResponse = { success: false, message: 'No world selected', data: null };
          break;
        }
        const agent = await world.createAgent({
          name: collectedParams.name,
          type: 'conversational',
          provider: LLMProvider.OPENAI,
          model: 'gpt-4',
          systemPrompt: collectedParams.prompt || `You are ${collectedParams.name}, an agent in the ${world.name} world.`
        });
        cliResponse = {
          success: true,
          message: `Agent '${collectedParams.name}' created successfully`,
          data: agent,
          needsWorldRefresh: true
        };
        break;

      case 'updateAgentConfig':
        if (!world) {
          cliResponse = { success: false, message: 'No world selected', data: null };
          break;
        }
        const agentToUpdate = world.agents.get(collectedParams.agentName);
        if (!agentToUpdate) {
          cliResponse = { success: false, message: `Agent '${collectedParams.agentName}' not found`, data: null };
          break;
        }
        let configUpdates = {};
        if (collectedParams.config) {
          try {
            configUpdates = JSON.parse(collectedParams.config);
          } catch {
            cliResponse = { success: false, message: 'Invalid JSON for config updates', data: null };
            break;
          }
        }
        const updatedAgent = await world.updateAgent(collectedParams.agentName, configUpdates);
        cliResponse = {
          success: true,
          message: `Agent '${collectedParams.agentName}' config updated successfully`,
          data: updatedAgent,
          needsWorldRefresh: true
        };
        break;

      case 'updateAgentPrompt':
        if (!world) {
          cliResponse = { success: false, message: 'No world selected', data: null };
          break;
        }
        const agentForPrompt = world.agents.get(collectedParams.agentName);
        if (!agentForPrompt) {
          cliResponse = { success: false, message: `Agent '${collectedParams.agentName}' not found`, data: null };
          break;
        }
        const agentWithNewPrompt = await world.updateAgent(collectedParams.agentName, {
          systemPrompt: collectedParams.prompt
        });
        cliResponse = {
          success: true,
          message: `Agent '${collectedParams.agentName}' prompt updated successfully`,
          data: agentWithNewPrompt,
          needsWorldRefresh: true
        };
        break;

      case 'clearAgentMemory':
        if (!world) {
          cliResponse = { success: false, message: 'No world selected', data: null };
          break;
        }
        const agentForClear = world.agents.get(collectedParams.agentName);
        if (!agentForClear) {
          cliResponse = { success: false, message: `Agent '${collectedParams.agentName}' not found`, data: null };
          break;
        }
        await world.clearAgentMemory(collectedParams.agentName);
        cliResponse = {
          success: true,
          message: `Agent '${collectedParams.agentName}' memory cleared successfully`,
          data: null,
          needsWorldRefresh: true
        };
        break;

      default:
        cliResponse = { success: false, message: `Unknown command type: ${commandInfo.type}`, data: null };
    }

    // Signal CLI to refresh subscription if needed
    if (cliResponse.needsWorldRefresh) {
      cliResponse.refreshWorld = true;
    }

    return cliResponse;

  } catch (error) {
    return {
      success: false,
      message: 'Command execution failed',
      technicalDetails: error instanceof Error ? error.message : String(error)
    };
  }
}

// Extract command and arguments from CLI input
function extractCommand(input: string): { command: string, args: string[] } {
  const cleanInput = input.startsWith('/') ? input.slice(1) : input;
  const parts = cleanInput.trim().split(/\s+/);
  const commandName = parts[0]?.toLowerCase() || '';
  const args = parts.slice(1);
  return { command: commandName, args };
}

// Main CLI input processor - handles both commands and messages
export async function processCLIInput(
  input: string,
  world: World | null,
  rootPath: string,
  sender: string = 'HUMAN'
): Promise<CLIResponse> {
  const context: CLIContext = {
    currentWorld: world,
    currentWorldName: world?.name,
    rootPath
  };

  // Simple prompt function for CLI
  const promptFunction: PromptFunction = async (question: string, options?: string[]): Promise<string> => {
    console.log(question);
    if (options && options.length > 0) {
      console.log(`Options: ${options.join(', ')}`);
    }

    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      rl.question('> ', (answer) => {
        rl.close();
        resolve(answer);
      });
    });
  };

  // Process commands (starting with '/')
  if (input.trim().startsWith('/')) {
    try {
      const { command, args } = extractCommand(input);

      if (!CLI_COMMAND_MAP[command]) {
        const matchedCommand = Object.keys(CLI_COMMAND_MAP).find(cmd => cmd === command);
        if (!matchedCommand) {
          return {
            success: false,
            message: `Unknown command: /${command}`,
            technicalDetails: `Valid commands: ${Object.keys(CLI_COMMAND_MAP).map(cmd => `/${cmd}`).join(', ')}`
          };
        }
      }

      return await processCLICommand(input, context, promptFunction);
    } catch (error) {
      return {
        success: false,
        message: 'Invalid command format',
        error: error instanceof Error ? error.message : String(error),
        technicalDetails: `Failed to parse command: ${input}`
      };
    }
  }

  // Handle messages to the current world
  if (!world) {
    return {
      success: false,
      message: 'Cannot send message - no world selected',
      technicalDetails: 'Message requires world context'
    };
  }

  try {
    publishMessage(world, input, sender);
    return {
      success: true,
      message: 'Message sent to world',
      data: { sender },
      technicalDetails: `Message published to world '${world.name}'`
    };
  } catch (error) {
    return {
      success: false,
      message: 'Failed to send message',
      error: error instanceof Error ? error.message : String(error),
      technicalDetails: `Error publishing message to world '${world.name}': ${error instanceof Error ? error.message : error}`
    };
  }
}
