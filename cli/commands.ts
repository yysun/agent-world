/**
 * CLI Commands Implementation
 * 
 * Features:
 * - Direct command mapping system (/clear maps to clear command)
 * - CLI command routing to typed command requests
 * - Interactive prompt for missing parameters
 * - User-friendly messages with technical details for debugging
 * - Automatic world state management and refreshing
 * - Help message generation
 * - Dual input handling for commands (/command) and messages
 * - Direct message handling without system event overhead
 * 
 * Commands:
 * - worlds: List all available worlds
 * - world: Get specific world information
 * - create-world: Create a new world with parameters
 * - update-world: Update world properties
 * - create-agent: Create a new agent in the current world
 * - update-agent: Update agent configuration
 * - update-prompt: Update agent system prompt
 * - clear: Clear agent memory (specific agent or all)
 * - help: Show command help and documentation
 * 
 * Implementation:
 * - Maps CLI commands directly to internal command types
 * - Handles interactive parameter collection with validation
 * - Processes commands through the command layer
 * - Direct command execution without system event overhead
 * - Direct message sending to message events
 * - Maintains world context between commands
 * - Provides both simple and detailed error messages
 * 
 * Changes:
 * - Added direct command mapping system for inputs starting with /
 * - Added direct message handling for non-command inputs
 * - Enhanced command parsing with command type detection
 * - Added support for command aliases
 * - Improved error handling for unknown commands
 * - Simplified message publishing flow
 */

import {
  CommandRequest,
  CommandResponse,
  GetWorldsRequest,
  GetWorldRequest,
  CreateWorldRequest,
  UpdateWorldRequest,
  CreateAgentRequest,
  UpdateAgentConfigRequest,
  UpdateAgentPromptRequest,
  ClearAgentMemoryRequest
} from '../commands/types.js';
import { World } from '../core/types.js';
import { processCommandRequest } from '../commands/commands.js';
import { getWorld } from '../core/world-manager.js';
import { toKebabCase } from '../core/utils.js';
import readline from 'readline';
import { publishMessage } from '../core/world-events.js';

// Import ClientConnection interface for consistency with existing code
export { ClientConnection } from '../commands/events.js';

// CLI Response types for user-friendly output
export interface CLIResponse {
  success: boolean;
  message: string;
  data?: any;
  technicalDetails?: string;
  needsWorldRefresh?: boolean;
  refreshWorld?: boolean;
  error?: string;
}

// CLI Context for maintaining state
export interface CLIContext {
  currentWorldName?: string;
  currentWorld?: World | null; // Can be null or undefined
  rootPath: string;
}

// Interactive prompt function type
export type PromptFunction = (question: string, options?: string[]) => Promise<string>;

// CLI Command Mapping - Maps CLI commands to typed command types
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
    usage: '/create-world <name> [description] [turnLimit]',
    parameters: [
      { name: 'name', required: true, description: 'World name', type: 'string' },
      { name: 'description', required: false, description: 'World description', type: 'string' },
      { name: 'turnLimit', required: false, description: 'Turn limit (default: 5)', type: 'number' }
    ]
  },
  'update-world': {
    type: 'updateWorld',
    requiresWorld: true,
    description: 'Update world properties',
    usage: '/update-world <property> <value>',
    parameters: [
      { name: 'property', required: true, description: 'Property to update', type: 'string', options: ['name', 'description', 'turnLimit'] },
      { name: 'value', required: true, description: 'New value', type: 'string' }
    ]
  },
  'create-agent': {
    type: 'createAgent',
    requiresWorld: true,
    description: 'Create a new agent',
    usage: '/create-agent <name> [description]',
    parameters: [
      { name: 'name', required: true, description: 'Agent name', type: 'string' },
      { name: 'description', required: false, description: 'Agent description', type: 'string' }
    ]
  },
  'update-agent': {
    type: 'updateAgentConfig',
    requiresWorld: true,
    description: 'Update agent configuration',
    usage: '/update-agent <agentName> <property> <value>',
    parameters: [
      { name: 'agentName', required: true, description: 'Agent name', type: 'string' },
      { name: 'property', required: true, description: 'Property to update', type: 'string', options: ['model', 'provider', 'status'] },
      { name: 'value', required: true, description: 'New value', type: 'string' }
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
    usage: '/clear [agentName]',
    parameters: [
      { name: 'agentName', required: false, description: 'Agent name (clears all if omitted)', type: 'string' }
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

// Parse CLI command input
export function parseCLICommand(input: string): {
  command: string;
  args: string[];
  commandType: string; // Added command type for direct mapping
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

  // Check for command in CLI command map
  if (!CLI_COMMAND_MAP[command]) {
    // Check for direct matches with COMMAND_MAP (aliases)
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

    // Found a direct match in the command map
    return {
      command,
      args,
      commandType: directMatch,
      isValid: true
    };
  }

  // Use the command type from CLI_COMMAND_MAP
  return {
    command,
    args,
    commandType: CLI_COMMAND_MAP[command].type,
    isValid: true
  };
}

// Generate help message for commands
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

// CLI Command Processor with interactive prompts and world state management
export async function processCLICommand(
  input: string,
  context: CLIContext,
  promptFn: PromptFunction
): Promise<CLIResponse> {
  try {
    // Parse the command with enhanced parsing
    const { command, args, commandType, isValid, error } = parseCLICommand(input);

    if (!isValid) {
      return {
        success: false,
        message: error || 'Invalid command',
        technicalDetails: `Failed to parse: ${input}`
      };
    }

    // Handle help command directly
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
      // Try to get world name from user
      const worldName = await promptFn('No world selected. Please enter world name:');
      if (!worldName.trim()) {
        return {
          success: false,
          message: 'World selection is required for this command',
          technicalDetails: `Command ${command} requires world context`
        };
      }
      context.currentWorldName = worldName.trim();
      context.currentWorld = null; // Will be loaded below
    }

    // Collect required parameters through interactive prompts
    const collectedParams: Record<string, any> = {};

    for (let i = 0; i < commandInfo.parameters.length; i++) {
      const param = commandInfo.parameters[i];
      let value = args[i];

      // If parameter is missing and required, prompt for it
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

      // Set parameter value if provided
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

    // Load world if needed
    let world: World | null = null;
    if (commandInfo.requiresWorld && context.currentWorldName) {
      try {
        world = await getWorld(context.rootPath, toKebabCase(context.currentWorldName));
        if (!world) {
          return {
            success: false,
            message: `World '${context.currentWorldName}' not found`,
            technicalDetails: `Failed to load world: ${context.currentWorldName}`
          };
        }
        context.currentWorld = world;
      } catch (error) {
        return {
          success: false,
          message: `Failed to load world '${context.currentWorldName}'`,
          technicalDetails: error instanceof Error ? error.message : String(error)
        };
      }
    }

    // Create typed command request
    const request = await createCLICommandRequest(commandInfo.type, collectedParams, context);

    // Execute command
    const response = await processCommandRequest(request, world, context.rootPath);

    // Convert to CLI response
    const cliResponse = convertToCliResponse(response, commandInfo.type);

    // Check if world refresh is needed
    if (cliResponse.needsWorldRefresh && context.currentWorldName) {
      try {
        const refreshedWorld = await getWorld(context.rootPath, toKebabCase(context.currentWorldName));
        context.currentWorld = refreshedWorld; // Type is World | null, matching the interface
      } catch (error) {
        // Don't fail the command, just log the refresh issue
        cliResponse.technicalDetails = (cliResponse.technicalDetails || '') +
          `\nWorld refresh failed: ${error instanceof Error ? error.message : error}`;
      }
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

// Create typed command request from CLI parameters
async function createCLICommandRequest(
  commandType: string,
  params: Record<string, any>,
  context: CLIContext
): Promise<CommandRequest> {
  const requestId = `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const timestamp = new Date().toISOString();

  const baseRequest = {
    id: requestId,
    timestamp
  };

  switch (commandType) {
    case 'getWorlds':
      return {
        ...baseRequest,
        type: 'getWorlds'
      } as GetWorldsRequest;

    case 'getWorld':
      return {
        ...baseRequest,
        type: 'getWorld',
        worldName: params.worldName || context.currentWorldName
      } as GetWorldRequest;

    case 'createWorld':
      return {
        ...baseRequest,
        type: 'createWorld',
        name: params.name,
        description: params.description,
        turnLimit: params.turnLimit
      } as CreateWorldRequest;

    case 'updateWorld':
      const updates: any = {};
      if (params.property === 'name') updates.name = params.value;
      else if (params.property === 'description') updates.description = params.value;
      else if (params.property === 'turnLimit') updates.turnLimit = parseInt(params.value);

      return {
        ...baseRequest,
        type: 'updateWorld',
        worldName: context.currentWorldName!,
        updates
      } as UpdateWorldRequest;

    case 'createAgent':
      return {
        ...baseRequest,
        type: 'createAgent',
        worldName: context.currentWorldName!,
        name: params.name,
        description: params.description
      } as CreateAgentRequest;

    case 'updateAgentConfig':
      const config: any = {};
      config[params.property] = params.value;

      return {
        ...baseRequest,
        type: 'updateAgentConfig',
        worldName: context.currentWorldName!,
        agentName: params.agentName,
        config
      } as UpdateAgentConfigRequest;

    case 'updateAgentPrompt':
      return {
        ...baseRequest,
        type: 'updateAgentPrompt',
        worldName: context.currentWorldName!,
        agentName: params.agentName,
        systemPrompt: params.prompt
      } as UpdateAgentPromptRequest;

    case 'clearAgentMemory':
      return {
        ...baseRequest,
        type: 'clearAgentMemory',
        worldName: context.currentWorldName!,
        agentName: params.agentName
      } as ClearAgentMemoryRequest;

    default:
      throw new Error(`Unknown command type: ${commandType}`);
  }
}

// Convert command response to CLI response
function convertToCliResponse(response: CommandResponse, commandType: string): CLIResponse {
  const needsRefresh = response.success &&
    ['updateWorld', 'createAgent', 'updateAgentConfig', 'updateAgentPrompt', 'updateAgentMemory', 'clearAgentMemory']
      .includes(response.type);

  if (response.success) {
    let message = '';
    let data = response.data;

    switch (commandType) {
      case 'getWorlds':
        const worlds = response.data as any[];
        message = `Found ${worlds.length} worlds`;
        break;

      case 'getWorld':
        const world = response.data as any;
        message = `World: ${world.name} (${world.agentCount} agents)`;
        break;

      case 'createWorld':
        const newWorld = response.data as any;
        message = `Created world: ${newWorld.name}`;
        break;

      default:
        message = (response.data as any)?.message || 'Command completed successfully';
    }

    return {
      success: true,
      message,
      data,
      needsWorldRefresh: needsRefresh,
      refreshWorld: needsRefresh,
      technicalDetails: `Request ID: ${response.requestId}, Type: ${response.type}`
    };
  } else {
    return {
      success: false,
      message: response.error || 'Command failed',
      error: response.error,
      technicalDetails: `Request ID: ${response.requestId}, Type: ${response.type}, Error: ${response.error}`
    };
  }
}

// Command mapping object - maps CLI command names to internal command types
const COMMAND_MAP: Record<string, string> = {
  'clear': 'clearAgentMemory',
  'world': 'getWorld',
  'worlds': 'getWorlds',
  'create-world': 'createWorld',
  'update-world': 'updateWorld',
  'create-agent': 'createAgent',
  'update-agent': 'updateAgentConfig',
  'update-prompt': 'updateAgentPrompt',
  'help': 'help'
};

/**
 * Extract command name and parameters from input string
 * @param input Command string starting with '/'
 * @returns Object with command name and parameters
 */
function extractCommand(input: string): { command: string, args: string[] } {
  const trimmed = input.trim();

  if (!trimmed.startsWith('/')) {
    throw new Error('Command must start with /');
  }

  // Remove leading slash and split by spaces
  const parts = trimmed.slice(1).split(/\s+/);
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
  // Create a simple CLI context
  const context: CLIContext = {
    currentWorld: world,
    currentWorldName: world?.name,
    rootPath
  };

  // Simple prompt function for single-line CLI prompts
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

  // If input starts with '/', process as command
  if (input.trim().startsWith('/')) {
    // Extract command and parameters
    try {
      const { command, args } = extractCommand(input);

      // Check if command exists in CLI command map
      if (!CLI_COMMAND_MAP[command]) {
        // Try to match with command map for alias support
        const matchedCommand = Object.keys(CLI_COMMAND_MAP).find(cmd => cmd === command);

        if (!matchedCommand) {
          return {
            success: false,
            message: `Unknown command: /${command}`,
            technicalDetails: `Valid commands: ${Object.keys(CLI_COMMAND_MAP).map(cmd => `/${cmd}`).join(', ')}`
          };
        }
      }

      // Direct command execution - bypassing system events
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

  // Otherwise, handle as a message to the current world
  if (!world) {
    return {
      success: false,
      message: 'Cannot send message - no world selected',
      technicalDetails: 'Message requires world context'
    };
  }

  try {
    // Send message directly to message event (not through system event)
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
