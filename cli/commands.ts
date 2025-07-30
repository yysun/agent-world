// Helper for world-required command validation
function requireWorldOrError(world: World | null, command: string): CLIResponse | undefined {
  if (!world) {
    return {
      success: false,
      message: 'No world selected. World is required for this command.',
      technicalDetails: `Command ${command} requires world context`
    };
  }
  return undefined;
}
/**
 * CLI Commands Implementation - Direct Core Integration with Short Aliases
 * 
 * Features:
 * - Direct command mapping system with interactive parameter collection
 * - Core function calls without command processing layer
 * - User-friendly messages with technical details for debugging
 * - Automatic world state management and refreshing
 * - Help message generation with command documentation
 * - Dual input handling for commands and messages
 * - World instance isolation and proper cleanup during refresh
 * - Short command aliases for improved usability
 * - Context-sensitive commands that adapt based on world selection
 *
 * Available Commands:
 * - Legacy: new (create-world), add (create-agent), clear, select
 * - System: help, quit, exit
 * - Short Context-Sensitive: list, show, edit, delete, create (adapt to context)
 * - Short Explicit: lsw (list-worlds), lsa (list-agents)
 * - Full CRUD: list-worlds, create-world, show-world, update-world, delete-world
 * - Full CRUD: list-agents, add-agent, show-agent, update-agent, delete-agent
 * 
 * Short Alias System:
 * - Context-sensitive aliases adapt behavior based on whether a world is selected
 * - /list shows agents if world selected, worlds if no world selected
 * - /show, /edit, /delete work on agents or worlds based on context
 * - /create creates agents if world selected, worlds if no world selected
 * - Explicit aliases like /lsw, /lsa provide unambiguous targeting
 * 
 * World Refresh Mechanism:
 * - Commands that modify world state signal refresh requirement via `refreshWorld: true`
 * - CLI properly destroys old world instances and creates fresh ones
 * - Event subscriptions are cleanly transferred to new world instances
 * - Prevents memory leaks and ensures event isolation between old/new worlds
 * - Agent persistence maintained across refresh cycles
 */

import { World, Agent, LLMProvider, createWorld, updateWorld, WorldInfo, publishMessage, listWorlds, getWorldConfig, deleteWorld, listAgents, getAgent, updateAgent, deleteAgent } from '../core/index.js';
import { createCategoryLogger } from '../core/logger.js';
import readline from 'readline';
import enquirer from 'enquirer';
import fs from 'fs';
import path from 'path';

// Create CLI logger
const logger = createCategoryLogger('cli');

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

// Enquirer prompt response interfaces
interface WorldCreateAnswers {
  name: string;
  description: string;
  turnLimit: number;
}

interface AgentCreateAnswers {
  name: string;
  provider: LLMProvider;
  model: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
}

interface ConfirmationAnswer {
  confirmed: boolean;
}

// CLI Command Mapping with Short Aliases
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
  aliases?: string[];
}> = {
  'select': {
    type: 'selectWorld',
    requiresWorld: false,
    description: 'Show world selection menu to pick a world',
    usage: '/select',
    parameters: [],
    aliases: ['/sel']
  },
  'new': {
    type: 'createWorld',
    requiresWorld: false,
    description: 'Create a new world',
    usage: '/new <name> [description]',
    parameters: [
      { name: 'name', required: true, description: 'World name', type: 'string' },
      { name: 'description', required: false, description: 'World description', type: 'string' }
    ]
  },
  'add': {
    type: 'createAgent',
    requiresWorld: true,
    description: 'Create a new agent',
    usage: '/add <name> [prompt]',
    parameters: [
      { name: 'name', required: true, description: 'Agent name', type: 'string' },
      { name: 'prompt', required: false, description: 'Agent system prompt', type: 'string' }
    ]
  },
  'clear': {
    type: 'clearAgentMemory',
    requiresWorld: true,
    description: 'Clear agent memory or all agents',
    usage: '/clear <agentName|all>',
    parameters: [
      { name: 'agentName', required: true, description: 'Agent name or "all" for all agents', type: 'string' }
    ]
  },

  // World CRUD commands
  'list-worlds': {
    type: 'listWorlds',
    requiresWorld: false,
    description: 'List all worlds with details (ID, name, description, agents count)',
    usage: '/list-worlds',
    parameters: []
  },
  'create-world': {
    type: 'createWorld',
    requiresWorld: false,
    description: 'Create a new world with interactive prompts',
    usage: '/create-world',
    parameters: []
  },
  'show-world': {
    type: 'showWorld',
    requiresWorld: false,
    description: 'Show details for a specific world',
    usage: '/show-world <name>',
    parameters: [
      { name: 'name', required: true, description: 'World name or ID', type: 'string' }
    ]
  },
  'update-world': {
    type: 'updateWorld',
    requiresWorld: false,
    description: 'Update world properties interactively',
    usage: '/update-world <name>',
    parameters: [
      { name: 'name', required: true, description: 'World name or ID', type: 'string' }
    ]
  },
  'delete-world': {
    type: 'deleteWorld',
    requiresWorld: false,
    description: 'Delete a world after confirmation',
    usage: '/delete-world <name>',
    parameters: [
      { name: 'name', required: true, description: 'World name or ID', type: 'string' }
    ]
  },

  // Agent CRUD commands (within a world)
  'list-agents': {
    type: 'listAgents',
    requiresWorld: true,
    description: 'List all agents in the current world with details',
    usage: '/list-agents',
    parameters: []
  },
  'add-agent': {
    type: 'createAgent',
    requiresWorld: true,
    description: 'Create a new agent with interactive prompts (supports multiline via copy/paste)',
    usage: '/add-agent',
    parameters: []
  },
  'show-agent': {
    type: 'showAgent',
    requiresWorld: true,
    description: 'Show agent details including configuration and memory statistics',
    usage: '/show-agent <name>',
    parameters: [
      { name: 'name', required: true, description: 'Agent name', type: 'string' }
    ]
  },
  'update-agent': {
    type: 'updateAgent',
    requiresWorld: true,
    description: 'Update agent properties interactively (supports multiline via copy/paste)',
    usage: '/update-agent <name>',
    parameters: [
      { name: 'name', required: true, description: 'Agent name', type: 'string' }
    ]
  },
  'delete-agent': {
    type: 'deleteAgent',
    requiresWorld: true,
    description: 'Delete an agent after confirmation',
    usage: '/delete-agent <name>',
    parameters: [
      { name: 'name', required: true, description: 'Agent name', type: 'string' }
    ]
  },
  'export': {
    type: 'exportWorld',
    requiresWorld: true,
    description: 'Export the current world and agents to a markdown file',
    usage: '/export [file]',
    parameters: [
      { name: 'file', required: false, description: 'Output file path (defaults to [world]-timestamp.md)', type: 'string' }
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
  },
  'quit': {
    type: 'quit',
    requiresWorld: false,
    description: 'Exit the CLI',
    usage: '/quit',
    parameters: []
  },
  'exit': {
    type: 'exit',
    requiresWorld: false,
    description: 'Exit the CLI',
    usage: '/exit',
    parameters: []
  },

  // Short aliases for CRUD commands
  'list': {
    type: 'contextualList',
    requiresWorld: false,
    description: 'List agents (if world selected) or worlds (if no world)',
    usage: '/list',
    parameters: [],
    aliases: ['/ls']
  },
  'ls': {
    type: 'contextualList',
    requiresWorld: false,
    description: 'List agents (if world selected) or worlds (if no world)',
    usage: '/ls',
    parameters: []
  },
  'show': {
    type: 'contextualShow',
    requiresWorld: false,
    description: 'Show agent details (if world selected) or world details (if no world)',
    usage: '/show <name>',
    parameters: [
      { name: 'name', required: true, description: 'Agent or world name', type: 'string' }
    ]
  },
  'edit': {
    type: 'contextualEdit',
    requiresWorld: false,
    description: 'Edit agent (if world selected) or world (if no world)',
    usage: '/edit <name>',
    parameters: [
      { name: 'name', required: true, description: 'Agent or world name', type: 'string' }
    ]
  },
  'delete': {
    type: 'contextualDelete',
    requiresWorld: false,
    description: 'Delete agent (if world selected) or world (if no world)',
    usage: '/delete <name>',
    parameters: [
      { name: 'name', required: true, description: 'Agent or world name', type: 'string' }
    ],
    aliases: ['/del']
  },
  'del': {
    type: 'contextualDelete',
    requiresWorld: false,
    description: 'Delete agent (if world selected) or world (if no world)',
    usage: '/del <name>',
    parameters: [
      { name: 'name', required: true, description: 'Agent or world name', type: 'string' }
    ]
  },
  'create': {
    type: 'contextualCreate',
    requiresWorld: false,
    description: 'Create agent (if world selected) or world (if no world)',
    usage: '/create',
    parameters: []
  },

  // Explicit world aliases
  'lsw': {
    type: 'listWorlds',
    requiresWorld: false,
    description: 'List all worlds',
    usage: '/lsw',
    parameters: []
  },
  'lsa': {
    type: 'listAgents',
    requiresWorld: true,
    description: 'List all agents in current world',
    usage: '/lsa',
    parameters: []
  }
};

// Legacy command aliases
const COMMAND_MAP: Record<string, string> = {
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
    
    // Show aliases if they exist
    if (cmd.aliases && cmd.aliases.length > 0) {
      help += `Aliases: ${cmd.aliases.join(', ')}\n`;
    }
    
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

  let help = '\nAvailable Commands:\n\n';

  // Short Context-Sensitive Aliases (NEW)
  help += 'Short Context-Sensitive Aliases:\n';
  help += `  ${CLI_COMMAND_MAP['list'].usage.padEnd(30)} - ${CLI_COMMAND_MAP['list'].description}\n`;
  help += `  ${CLI_COMMAND_MAP['show'].usage.padEnd(30)} - ${CLI_COMMAND_MAP['show'].description}\n`;
  help += `  ${CLI_COMMAND_MAP['edit'].usage.padEnd(30)} - ${CLI_COMMAND_MAP['edit'].description}\n`;
  help += `  ${CLI_COMMAND_MAP['delete'].usage.padEnd(30)} - ${CLI_COMMAND_MAP['delete'].description}\n`;
  help += `  ${CLI_COMMAND_MAP['create'].usage.padEnd(30)} - ${CLI_COMMAND_MAP['create'].description}\n`;

  help += '\nShort Explicit Aliases:\n';
  help += `  ${CLI_COMMAND_MAP['lsw'].usage.padEnd(30)} - ${CLI_COMMAND_MAP['lsw'].description}\n`;
  help += `  ${CLI_COMMAND_MAP['lsa'].usage.padEnd(30)} - ${CLI_COMMAND_MAP['lsa'].description}\n`;
  help += `  /ls                           - Alias for /list\n`;
  help += `  /del                          - Alias for /delete\n`;

  help += '\nWorld Management:\n';
  help += `  ${CLI_COMMAND_MAP['list-worlds'].usage.padEnd(30)} - ${CLI_COMMAND_MAP['list-worlds'].description}\n`;
  help += `  ${CLI_COMMAND_MAP['create-world'].usage.padEnd(30)} - ${CLI_COMMAND_MAP['create-world'].description}\n`;
  help += `  ${CLI_COMMAND_MAP['show-world'].usage.padEnd(30)} - ${CLI_COMMAND_MAP['show-world'].description}\n`;
  help += `  ${CLI_COMMAND_MAP['update-world'].usage.padEnd(30)} - ${CLI_COMMAND_MAP['update-world'].description}\n`;
  help += `  ${CLI_COMMAND_MAP['delete-world'].usage.padEnd(30)} - ${CLI_COMMAND_MAP['delete-world'].description}\n`;
  help += `  ${CLI_COMMAND_MAP['select'].usage.padEnd(30)} - ${CLI_COMMAND_MAP['select'].description}\n`;

  help += '\nAgent Management:\n';
  help += `  ${CLI_COMMAND_MAP['list-agents'].usage.padEnd(30)} - ${CLI_COMMAND_MAP['list-agents'].description}\n`;
  help += `  ${CLI_COMMAND_MAP['add-agent'].usage.padEnd(30)} - ${CLI_COMMAND_MAP['add-agent'].description}\n`;
  help += `  ${CLI_COMMAND_MAP['show-agent'].usage.padEnd(30)} - ${CLI_COMMAND_MAP['show-agent'].description}\n`;
  help += `  ${CLI_COMMAND_MAP['update-agent'].usage.padEnd(30)} - ${CLI_COMMAND_MAP['update-agent'].description}\n`;
  help += `  ${CLI_COMMAND_MAP['delete-agent'].usage.padEnd(30)} - ${CLI_COMMAND_MAP['delete-agent'].description}\n`;
  help += `  ${CLI_COMMAND_MAP['clear'].usage.padEnd(30)} - ${CLI_COMMAND_MAP['clear'].description}\n`;

  help += '\nData Export:\n';
  help += `  ${CLI_COMMAND_MAP['export'].usage.padEnd(30)} - ${CLI_COMMAND_MAP['export'].description}\n`;

  help += '\nLegacy Commands (for backward compatibility):\n';
  help += `  ${CLI_COMMAND_MAP['new'].usage.padEnd(30)} - ${CLI_COMMAND_MAP['new'].description}\n`;
  help += `  ${CLI_COMMAND_MAP['add'].usage.padEnd(30)} - ${CLI_COMMAND_MAP['add'].description}\n`;

  help += '\nSystem Commands:\n';
  help += `  ${CLI_COMMAND_MAP['help'].usage.padEnd(30)} - ${CLI_COMMAND_MAP['help'].description}\n`;
  help += `  ${CLI_COMMAND_MAP['quit'].usage.padEnd(30)} - ${CLI_COMMAND_MAP['quit'].description}\n`;
  help += `  ${CLI_COMMAND_MAP['exit'].usage.padEnd(30)} - ${CLI_COMMAND_MAP['exit'].description}\n`;

  help += '\nUse /help <command> for detailed information about a specific command.';
  help += '\nNote: Interactive commands support rich prompts. For multiline input, use copy/paste.';
  help += '\nContext-sensitive aliases (like /list, /show) behave differently based on whether a world is selected.';
  return help;
}

// Export world to markdown file
async function exportWorldToMarkdown(
  worldName: string,
  outputPath: string,
  rootPath: string
): Promise<CLIResponse> {
  try {
    // Load world configuration
    const worldData = await getWorldConfig(rootPath, worldName);
    if (!worldData) {
      return {
        success: false,
        message: `World '${worldName}' not found`
      };
    }

    // Load all agents in the world
    const agents = await listAgents(rootPath, worldData.id);

    // Generate timestamp for default filename (YYYY-MM-DD_HH-MM-SS)
    const now = new Date();
    const datePart = now.toISOString().slice(0, 10); // YYYY-MM-DD
    const timePart = now
      .toTimeString()
      .slice(0, 8)
      .replace(/:/g, '-'); // HH-MM-SS
    const timestamp = `${datePart}_${timePart}`;

    // Determine output file path
    let filePath: string;
    if (outputPath) {
      filePath = path.resolve(outputPath);
    } else {
      filePath = path.resolve(process.cwd(), `${worldName}-${timestamp}.md`);
    }

    // Generate markdown content
    let markdown = `# World Export: ${worldData.name}\n\n`;
    markdown += `**Exported on:** ${new Date().toISOString()}\n\n`;

    // World information
    markdown += `## World Configuration\n\n`;
    markdown += `- **Name:** ${worldData.name}\n`;
    markdown += `- **ID:** ${worldData.id}\n`;
    markdown += `- **Description:** ${worldData.description || 'No description'}\n`;
    markdown += `- **Turn Limit:** ${worldData.turnLimit}\n`;
    markdown += `- **Total Agents:** ${agents.length}\n\n`;

    // Agents section
    if (agents.length > 0) {
      markdown += `## Agents (${agents.length})\n\n`;

      for (const agentInfo of agents) {
        // Load full agent data to get memory
        const fullAgent = await getAgent(rootPath, worldData.id, agentInfo.name);
        if (!fullAgent) continue;

        markdown += `### ${fullAgent.name}\n\n`;
        markdown += `**Configuration:**\n`;
        markdown += `- **ID:** ${fullAgent.id}\n`;
        markdown += `- **Type:** ${fullAgent.type}\n`;
        markdown += `- **LLM Provider:** ${fullAgent.provider}\n`;
        markdown += `- **Model:** ${fullAgent.model}\n`;
        markdown += `- **Status:** ${fullAgent.status || 'active'}\n`;
        markdown += `- **Temperature:** ${fullAgent.temperature || 'default'}\n`;
        markdown += `- **Max Tokens:** ${fullAgent.maxTokens || 'default'}\n`;
        markdown += `- **LLM Calls:** ${fullAgent.llmCallCount}\n`;
        markdown += `- **Created:** ${fullAgent.createdAt ? fullAgent.createdAt.toISOString() : 'Unknown'}\n`;
        markdown += `- **Last Active:** ${fullAgent.lastActive ? fullAgent.lastActive.toISOString() : 'Unknown'}\n\n`;

        if (fullAgent.systemPrompt) {
          markdown += `**System Prompt:**\n`;
          markdown += `\`\`\`\n${fullAgent.systemPrompt}\n\`\`\`\n\n`;
        }

        // Agent memory
        if (fullAgent.memory && fullAgent.memory.length > 0) {
          markdown += `**Memory (${fullAgent.memory.length} messages):**\n\n`;

          fullAgent.memory.forEach((message, index) => {
            markdown += `${index + 1}. **${message.role}** ${message.sender ? `(${message.sender})` : ''}\n`;
            if (message.createdAt) {
              markdown += `   *${message.createdAt.toISOString()}*\n`;
            }
            markdown += '   ```markdown\n';
            // Pad each line of content with 4 spaces, preserving original newlines
            let paddedContent = '';
            if (typeof message.content === 'string') {
              // Split by /(?<=\n)/ to preserve empty lines and trailing newlines
              paddedContent = message.content
                .split(/(\n)/)
                .map(part => part === '\n' ? '\n' : '    ' + part)
                .join('');
            }
            markdown += `${paddedContent}\n`;
            markdown += '   ```\n\n';
          });
        } else {
          markdown += `**Memory:** No messages\n\n`;
        }

        markdown += `---\n\n`;
      }
    } else {
      markdown += `## Agents\n\nNo agents found in this world.\n\n`;
    }

    // Write file
    await fs.promises.writeFile(filePath, markdown, 'utf8');

    return {
      success: true,
      message: `World '${worldName}' exported successfully to: ${filePath}`,
      data: {
        worldName,
        filePath,
        agentCount: agents.length,
        fileSize: markdown.length
      }
    };

  } catch (error) {
    return {
      success: false,
      message: 'Failed to export world',
      error: error instanceof Error ? error.message : String(error)
    };
  }
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
      return {
        success: false,
        message: 'No world selected. World is required for this command.',
        technicalDetails: `Command ${command} requires world context`
      };
    }

    // Collect parameters from command arguments
    const collectedParams: Record<string, any> = {};

    for (let i = 0; i < commandInfo.parameters.length; i++) {
      const param = commandInfo.parameters[i];
      let value = args[i];

      if (!value && param.required) {
        return {
          success: false,
          message: `Missing required parameter: ${param.name}`,
          technicalDetails: `Usage: ${commandInfo.usage}`
        };
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
      case 'createWorld':
        // Check if this is the interactive version (/create-world) or legacy (/new)
        if (command === 'create-world' || collectedParams.name === undefined) {
          // Interactive mode using enquirer
          try {
            const prompts = [
              {
                type: 'input',
                name: 'name',
                message: 'World name:',
                required: true
              },
              {
                type: 'input',
                name: 'description',
                message: 'World description:'
              },
              {
                type: 'numeral',
                name: 'turnLimit',
                message: 'Turn limit:',
                initial: 5
              }
            ];

            const answers = await enquirer.prompt(prompts) as WorldCreateAnswers;

            const newWorld = await createWorld(context.rootPath, {
              name: answers.name,
              description: answers.description || `A world named ${answers.name}`,
              turnLimit: answers.turnLimit
            });

            cliResponse = {
              success: true,
              message: `World '${answers.name}' created successfully`,
              data: newWorld,
              needsWorldRefresh: true
            };
          } catch (error) {
            cliResponse = {
              success: false,
              message: 'Failed to create world',
              error: error instanceof Error ? error.message : String(error)
            };
          }
        } else {
          // Legacy mode with command arguments
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
        }
        break;

      case 'selectWorld':
        cliResponse = {
          success: true,
          message: 'Opening world selection...',
          data: { selectWorld: true }
        };
        break;

      case 'createAgent':
        {
          const worldError = requireWorldOrError(world, command);
          if (worldError) return worldError;
        }
        // Check if this is the interactive version (/add-agent) or legacy (/add)
        if (command === 'add-agent' || collectedParams.name === undefined) {
          // Interactive mode using enquirer
          try {
            const prompts = [
              {
                type: 'input',
                name: 'name',
                message: 'Agent name:',
                required: true
              },
              {
                type: 'select',
                name: 'provider',
                message: 'LLM Provider:',
                choices: Object.values(LLMProvider),
                initial: 'openai'
              },
              {
                type: 'input',
                name: 'model',
                message: 'Model:',
                initial: 'gpt-4'
              },
              {
                type: 'input',
                name: 'systemPrompt',
                message: 'System prompt (or press Enter for default):'
              },
              {
                type: 'numeral',
                name: 'temperature',
                message: 'Temperature (0.0-2.0):',
                initial: 0.7
              },
              {
                type: 'numeral',
                name: 'maxTokens',
                message: 'Max tokens:',
                initial: 4096
              }
            ];

            const answers = await enquirer.prompt(prompts) as AgentCreateAnswers;

            const agent = await world!.createAgent({
              name: answers.name,
              type: 'conversational',
              provider: answers.provider,
              model: answers.model,
              systemPrompt: answers.systemPrompt || `You are ${answers.name}, an agent in the ${world!.name} world.`,
              temperature: answers.temperature,
              maxTokens: answers.maxTokens
            });

            cliResponse = {
              success: true,
              message: `Agent '${answers.name}' created successfully`,
              data: agent,
              needsWorldRefresh: true
            };
          } catch (error) {
            cliResponse = {
              success: false,
              message: 'Failed to create agent',
              error: error instanceof Error ? error.message : String(error)
            };
          }
        } else {
          // Legacy mode with command arguments
          const agent = await world!.createAgent({
            name: collectedParams.name,
            type: 'conversational',
            provider: LLMProvider.OPENAI,
            model: 'gpt-4',
            systemPrompt: collectedParams.prompt || `You are ${collectedParams.name}, an agent in the ${world!.name} world.`
          });
          cliResponse = {
            success: true,
            message: `Agent '${collectedParams.name}' created successfully`,
            data: agent,
            needsWorldRefresh: true
          };
        }
        break;

      case 'clearAgentMemory':
        {
          const worldError = requireWorldOrError(world, command);
          if (worldError) return worldError;
        }
        logger.debug('clearAgentMemory command started', {
          agentName: collectedParams.agentName,
          worldName: world!.name,
          worldId: world!.id,
          agentsInWorld: Array.from(world!.agents.keys())
        });

        // Handle /clear all to clear all agents' memory
        if (collectedParams.agentName.toLowerCase() === 'all') {
          const clearedAgents: string[] = [];
          for (const [agentName] of world!.agents) {
            logger.debug('Clearing memory for agent', { agentName });
            await world!.clearAgentMemory(agentName);
            clearedAgents.push(agentName);
          }
          cliResponse = {
            success: true,
            message: `Memory cleared for all agents: ${clearedAgents.join(', ')}`,
            data: { clearedAgents },
            needsWorldRefresh: true
          };
          break;
        }

        // Handle single agent clear
        logger.debug('Looking for agent in world.agents Map', {
          searchName: collectedParams.agentName,
          availableAgents: Array.from(world!.agents.keys()),
          agentExists: world!.agents.has(collectedParams.agentName)
        });

        const agentForClear = world!.agents.get(collectedParams.agentName);
        if (!agentForClear) {
          logger.debug('Agent not found in world.agents Map');
          cliResponse = { success: false, message: `Agent '${collectedParams.agentName}' not found`, data: null };
          break;
        }

        logger.debug('Found agent, calling clearAgentMemory', {
          agentName: agentForClear.name,
          agentId: agentForClear.id,
          memoryCount: agentForClear.memory?.length || 0
        });

        try {
          const result = await world!.clearAgentMemory(collectedParams.agentName);
          logger.debug('clearAgentMemory result', {
            success: !!result,
            resultAgentId: result?.id,
            resultMemoryCount: result?.memory?.length || 0
          });

          cliResponse = {
            success: true,
            message: `Agent '${collectedParams.agentName}' memory cleared successfully`,
            data: null,
            needsWorldRefresh: true
          };
        } catch (error) {
          logger.error('clearAgentMemory error', { agentName: collectedParams.agentName, error: error instanceof Error ? error.message : error });
          cliResponse = {
            success: false,
            message: `Failed to clear agent memory: ${error instanceof Error ? error.message : error}`,
            data: null
          };
        }
        break;

      // New World CRUD commands
      case 'listWorlds':
        try {
          const worlds = await listWorlds(context.rootPath);
          if (worlds.length === 0) {
            cliResponse = {
              success: true,
              message: 'No worlds found.',
              data: { worlds: [] }
            };
          } else {
            let output = '\nAvailable Worlds:\n';
            worlds.forEach((worldInfo: WorldInfo) => {
              output += `  ID: ${worldInfo.id}\n`;
              output += `  Name: ${worldInfo.name}\n`;
              output += `  Description: ${worldInfo.description || 'No description'}\n`;
              output += `  Turn Limit: ${worldInfo.turnLimit}\n`;
              output += `  Agents: ${worldInfo.agentCount}\n`;
              output += `  ---\n`;
            });
            cliResponse = {
              success: true,
              message: output,
              data: { worlds }
            };
          }
        } catch (error) {
          cliResponse = {
            success: false,
            message: 'Failed to list worlds',
            error: error instanceof Error ? error.message : String(error)
          };
        }
        break;

      case 'showWorld':
        try {
          const worldData = await getWorldConfig(context.rootPath, collectedParams.name);
          if (!worldData) {
            cliResponse = {
              success: false,
              message: `World '${collectedParams.name}' not found`
            };
          } else {
            // Get agent count
            const agents = await listAgents(context.rootPath, worldData.id);
            let output = `\nWorld Details:\n`;
            output += `  ID: ${worldData.id}\n`;
            output += `  Name: ${worldData.name}\n`;
            output += `  Description: ${worldData.description || 'No description'}\n`;
            output += `  Turn Limit: ${worldData.turnLimit}\n`;
            output += `  Agents: ${agents.length}\n`;

            if (agents.length > 0) {
              output += `\nAgents in this world:\n`;
              agents.forEach(agent => {
                output += `  - ${agent.name} (${agent.id}) - ${agent.status || 'active'}\n`;
              });
            }

            cliResponse = {
              success: true,
              message: output,
              data: { world: worldData, agents }
            };
          }
        } catch (error) {
          cliResponse = {
            success: false,
            message: 'Failed to get world details',
            error: error instanceof Error ? error.message : String(error)
          };
        }
        break;

      case 'updateWorld':
        try {
          const existingWorld = await getWorldConfig(context.rootPath, collectedParams.name);
          if (!existingWorld) {
            cliResponse = {
              success: false,
              message: `World '${collectedParams.name}' not found`
            };
            break;
          }

          // Use enquirer for interactive prompts
          const prompts = [
            {
              type: 'input',
              name: 'name',
              message: 'World name:',
              initial: existingWorld.name
            },
            {
              type: 'input',
              name: 'description',
              message: 'World description:',
              initial: existingWorld.description || ''
            },
            {
              type: 'numeral',
              name: 'turnLimit',
              message: 'Turn limit:',
              initial: existingWorld.turnLimit
            }
          ];

          const answers = await enquirer.prompt(prompts) as WorldCreateAnswers;

          const updatedWorld = await updateWorld(context.rootPath, existingWorld.id, {
            name: answers.name,
            description: answers.description,
            turnLimit: answers.turnLimit
          });

          if (updatedWorld) {
            cliResponse = {
              success: true,
              message: `World '${answers.name}' updated successfully`,
              data: updatedWorld,
              needsWorldRefresh: true
            };
          } else {
            cliResponse = {
              success: false,
              message: 'Failed to update world'
            };
          }
        } catch (error) {
          cliResponse = {
            success: false,
            message: 'Failed to update world',
            error: error instanceof Error ? error.message : String(error)
          };
        }
        break;

      case 'deleteWorld':
        try {
          const existingWorld = await getWorldConfig(context.rootPath, collectedParams.name);
          if (!existingWorld) {
            cliResponse = {
              success: false,
              message: `World '${collectedParams.name}' not found`
            };
            break;
          }

          // Confirmation prompt
          const confirmPrompt = {
            type: 'confirm',
            name: 'confirmed',
            message: `Are you sure you want to delete world '${existingWorld.name}'? This action cannot be undone.`,
            initial: false
          };

          const { confirmed } = await enquirer.prompt(confirmPrompt) as ConfirmationAnswer;

          if (!confirmed) {
            cliResponse = {
              success: true,
              message: 'World deletion cancelled'
            };
            break;
          }

          const deleted = await deleteWorld(context.rootPath, existingWorld.id);

          if (deleted) {
            cliResponse = {
              success: true,
              message: `World '${existingWorld.name}' deleted successfully`,
              needsWorldRefresh: true
            };
          } else {
            cliResponse = {
              success: false,
              message: 'Failed to delete world'
            };
          }
        } catch (error) {
          cliResponse = {
            success: false,
            message: 'Failed to delete world',
            error: error instanceof Error ? error.message : String(error)
          };
        }
        break;

      // New Agent CRUD commands
      case 'listAgents':
        {
          const worldError = requireWorldOrError(world, command);
          if (worldError) return worldError;
        }
        try {
          const agents = await listAgents(context.rootPath, world!.id);
          if (agents.length === 0) {
            cliResponse = {
              success: true,
              message: `No agents found in world '${world!.name}'.`
            };
          } else {
            let output = `\nAgents in world '${world!.name}':\n`;
            agents.forEach(agent => {
              output += `  Name: ${agent.name} (${agent.id})\n`;
              output += `  Type: ${agent.type}\n`;
              output += `  Model: ${agent.model}\n`;
              output += `  Status: ${agent.status || 'active'}\n`;
              output += `  Memory Size: ${agent.memorySize} messages\n`;
              output += `  LLM Calls: ${agent.llmCallCount}\n`;
              output += `  Created: ${agent.createdAt ? agent.createdAt.toISOString().split('T')[0] : 'Unknown'}\n`;
              output += `  Last Active: ${agent.lastActive ? agent.lastActive.toISOString().split('T')[0] : 'Unknown'}\n`;
              output += `  ---\n`;
            });
            cliResponse = {
              success: true,
              message: output,
              data: { agents }
            };
          }
        } catch (error) {
          cliResponse = {
            success: false,
            message: 'Failed to list agents',
            error: error instanceof Error ? error.message : String(error)
          };
        }
        break;

      case 'showAgent':
        {
          const worldError = requireWorldOrError(world, command);
          if (worldError) return worldError;
        }
        try {
          const agent = await getAgent(context.rootPath, world!.id, collectedParams.name);
          if (!agent) {
            cliResponse = {
              success: false,
              message: `Agent '${collectedParams.name}' not found`
            };
          } else {
            let output = `\nAgent Details:\n`;
            output += `  Name: ${agent.name}\n`;
            output += `  ID: ${agent.id}\n`;
            output += `  Type: ${agent.type}\n`;
            output += `  Provider: ${agent.provider}\n`;
            output += `  Model: ${agent.model}\n`;
            output += `  Status: ${agent.status || 'active'}\n`;
            output += `  Temperature: ${agent.temperature || 'default'}\n`;
            output += `  Max Tokens: ${agent.maxTokens || 'default'}\n`;
            output += `  Memory Size: ${agent.memory.length} messages\n`;
            output += `  LLM Calls: ${agent.llmCallCount}\n`;
            output += `  Created: ${agent.createdAt ? agent.createdAt.toISOString() : 'Unknown'}\n`;
            output += `  Last Active: ${agent.lastActive ? agent.lastActive.toISOString() : 'Unknown'}\n`;

            if (agent.systemPrompt) {
              output += `\nSystem Prompt:\n${agent.systemPrompt}\n`;
            }

            cliResponse = {
              success: true,
              message: output,
              data: { agent }
            };
          }
        } catch (error) {
          cliResponse = {
            success: false,
            message: 'Failed to get agent details',
            error: error instanceof Error ? error.message : String(error)
          };
        }
        break;

      case 'updateAgent':
        {
          const worldError = requireWorldOrError(world, command);
          if (worldError) return worldError;
        }
        try {
          const existingAgent = await getAgent(context.rootPath, world!.id, collectedParams.name);
          if (!existingAgent) {
            cliResponse = {
              success: false,
              message: `Agent '${collectedParams.name}' not found`
            };
            break;
          }

          // Use enquirer for interactive prompts with multiline support
          const prompts = [
            {
              type: 'input',
              name: 'name',
              message: 'Agent name:',
              initial: existingAgent.name
            },
            {
              type: 'select',
              name: 'provider',
              message: 'LLM Provider:',
              choices: Object.values(LLMProvider),
              initial: existingAgent.provider
            },
            {
              type: 'input',
              name: 'model',
              message: 'Model:',
              initial: existingAgent.model
            },
            {
              type: 'input',
              name: 'systemPrompt',
              message: 'System prompt (or press Enter for default):',
              initial: existingAgent.systemPrompt || ''
            },
            {
              type: 'numeral',
              name: 'temperature',
              message: 'Temperature (0.0-2.0):',
              initial: existingAgent.temperature || 0.7
            },
            {
              type: 'numeral',
              name: 'maxTokens',
              message: 'Max tokens:',
              initial: existingAgent.maxTokens || 4096
            }
          ];

          const answers = await enquirer.prompt(prompts) as AgentCreateAnswers;

          const updatedAgent = await updateAgent(context.rootPath, world!.id, existingAgent.id, {
            name: answers.name,
            provider: answers.provider,
            model: answers.model,
            systemPrompt: answers.systemPrompt,
            temperature: answers.temperature,
            maxTokens: answers.maxTokens
          });

          if (updatedAgent) {
            cliResponse = {
              success: true,
              message: `Agent '${answers.name}' updated successfully`,
              data: updatedAgent,
              needsWorldRefresh: true
            };
          } else {
            cliResponse = {
              success: false,
              message: 'Failed to update agent'
            };
          }
        } catch (error) {
          cliResponse = {
            success: false,
            message: 'Failed to update agent',
            error: error instanceof Error ? error.message : String(error)
          };
        }
        break;

      case 'deleteAgent':
        {
          const worldError = requireWorldOrError(world, command);
          if (worldError) return worldError;
        }
        try {
          const existingAgent = await getAgent(context.rootPath, world!.id, collectedParams.name);
          if (!existingAgent) {
            cliResponse = {
              success: false,
              message: `Agent '${collectedParams.name}' not found`
            };
            break;
          }

          // Confirmation prompt
          const confirmPrompt = {
            type: 'confirm',
            name: 'confirmed',
            message: `Are you sure you want to delete agent '${existingAgent.name}'? This action cannot be undone.`,
            initial: false
          };

          const { confirmed } = await enquirer.prompt(confirmPrompt) as ConfirmationAnswer;

          if (!confirmed) {
            cliResponse = {
              success: true,
              message: 'Agent deletion cancelled'
            };
            break;
          }

          const deleted = await deleteAgent(context.rootPath, world!.id, existingAgent.id);

          if (deleted) {
            cliResponse = {
              success: true,
              message: `Agent '${existingAgent.name}' deleted successfully`,
              needsWorldRefresh: true
            };
          } else {
            cliResponse = {
              success: false,
              message: 'Failed to delete agent'
            };
          }
        } catch (error) {
          cliResponse = {
            success: false,
            message: 'Failed to delete agent',
            error: error instanceof Error ? error.message : String(error)
          };
        }
        break;

      case 'exportWorld':
        {
          const worldError = requireWorldOrError(world, command);
          if (worldError) return worldError;
        }
        try {
          const fileParam = collectedParams.file;
          cliResponse = await exportWorldToMarkdown(world!.name, fileParam, context.rootPath);
        } catch (error) {
          cliResponse = {
            success: false,
            message: 'Failed to export world',
            error: error instanceof Error ? error.message : String(error)
          };
        }
        break;

      case 'quit':
      case 'exit':
        cliResponse = {
          success: true,
          message: 'Exiting CLI...',
          data: { exit: true }
        };
        break;

      // Contextual short alias handlers
      case 'contextualList':
        if (context.currentWorld) {
          // If world is selected, list agents
          try {
            const agents = await listAgents(context.rootPath, context.currentWorld.id);
            if (agents.length === 0) {
              cliResponse = {
                success: true,
                message: `No agents found in world '${context.currentWorld.name}'.`
              };
            } else {
              let output = `\nAgents in world '${context.currentWorld.name}':\n`;
              agents.forEach(agent => {
                output += `  Name: ${agent.name} (${agent.id})\n`;
                output += `  Type: ${agent.type}\n`;
                output += `  Model: ${agent.model}\n`;
                output += `  Status: ${agent.status || 'active'}\n`;
                output += `  Memory Size: ${agent.memorySize} messages\n`;
                output += `  LLM Calls: ${agent.llmCallCount}\n`;
                output += `  Created: ${agent.createdAt ? agent.createdAt.toISOString().split('T')[0] : 'Unknown'}\n`;
                output += `  Last Active: ${agent.lastActive ? agent.lastActive.toISOString().split('T')[0] : 'Unknown'}\n`;
                output += `  ---\n`;
              });
              cliResponse = {
                success: true,
                message: output,
                data: { agents }
              };
            }
          } catch (error) {
            cliResponse = {
              success: false,
              message: 'Failed to list agents',
              error: error instanceof Error ? error.message : String(error)
            };
          }
        } else {
          // If no world selected, list worlds
          try {
            const worlds = await listWorlds(context.rootPath);
            if (worlds.length === 0) {
              cliResponse = {
                success: true,
                message: 'No worlds found.',
                data: { worlds: [] }
              };
            } else {
              let output = '\nAvailable Worlds:\n';
              worlds.forEach((worldInfo: WorldInfo) => {
                output += `  ID: ${worldInfo.id}\n`;
                output += `  Name: ${worldInfo.name}\n`;
                output += `  Description: ${worldInfo.description || 'No description'}\n`;
                output += `  Turn Limit: ${worldInfo.turnLimit}\n`;
                output += `  Agents: ${worldInfo.agentCount}\n`;
                output += `  ---\n`;
              });
              cliResponse = {
                success: true,
                message: output,
                data: { worlds }
              };
            }
          } catch (error) {
            cliResponse = {
              success: false,
              message: 'Failed to list worlds',
              error: error instanceof Error ? error.message : String(error)
            };
          }
        }
        break;

      case 'contextualShow':
        if (context.currentWorld) {
          // If world is selected, show agent
          try {
            const agent = await getAgent(context.rootPath, context.currentWorld.id, collectedParams.name);
            if (!agent) {
              cliResponse = {
                success: false,
                message: `Agent '${collectedParams.name}' not found`
              };
            } else {
              let output = `\nAgent Details:\n`;
              output += `  Name: ${agent.name}\n`;
              output += `  ID: ${agent.id}\n`;
              output += `  Type: ${agent.type}\n`;
              output += `  Provider: ${agent.provider}\n`;
              output += `  Model: ${agent.model}\n`;
              output += `  Status: ${agent.status || 'active'}\n`;
              output += `  Temperature: ${agent.temperature || 'default'}\n`;
              output += `  Max Tokens: ${agent.maxTokens || 'default'}\n`;
              output += `  Memory Size: ${agent.memory.length} messages\n`;
              output += `  LLM Calls: ${agent.llmCallCount}\n`;
              output += `  Created: ${agent.createdAt ? agent.createdAt.toISOString() : 'Unknown'}\n`;
              output += `  Last Active: ${agent.lastActive ? agent.lastActive.toISOString() : 'Unknown'}\n`;

              if (agent.systemPrompt) {
                output += `\nSystem Prompt:\n${agent.systemPrompt}\n`;
              }

              cliResponse = {
                success: true,
                message: output,
                data: { agent }
              };
            }
          } catch (error) {
            cliResponse = {
              success: false,
              message: 'Failed to get agent details',
              error: error instanceof Error ? error.message : String(error)
            };
          }
        } else {
          // If no world selected, show world
          try {
            const worldData = await getWorldConfig(context.rootPath, collectedParams.name);
            if (!worldData) {
              cliResponse = {
                success: false,
                message: `World '${collectedParams.name}' not found`
              };
            } else {
              // Get agent count
              const agents = await listAgents(context.rootPath, worldData.id);
              let output = `\nWorld Details:\n`;
              output += `  ID: ${worldData.id}\n`;
              output += `  Name: ${worldData.name}\n`;
              output += `  Description: ${worldData.description || 'No description'}\n`;
              output += `  Turn Limit: ${worldData.turnLimit}\n`;
              output += `  Agents: ${agents.length}\n`;

              if (agents.length > 0) {
                output += `\nAgents in this world:\n`;
                agents.forEach(agent => {
                  output += `  - ${agent.name} (${agent.id}) - ${agent.status || 'active'}\n`;
                });
              }

              cliResponse = {
                success: true,
                message: output,
                data: { world: worldData, agents }
              };
            }
          } catch (error) {
            cliResponse = {
              success: false,
              message: 'Failed to get world details',
              error: error instanceof Error ? error.message : String(error)
            };
          }
        }
        break;

      case 'contextualEdit':
        if (context.currentWorld) {
          // If world is selected, edit agent (redirect to updateAgent)
          try {
            const existingAgent = await getAgent(context.rootPath, context.currentWorld.id, collectedParams.name);
            if (!existingAgent) {
              cliResponse = {
                success: false,
                message: `Agent '${collectedParams.name}' not found`
              };
              break;
            }

            // Use enquirer for interactive prompts with multiline support
            const prompts = [
              {
                type: 'input',
                name: 'name',
                message: 'Agent name:',
                initial: existingAgent.name
              },
              {
                type: 'select',
                name: 'provider',
                message: 'LLM Provider:',
                choices: Object.values(LLMProvider),
                initial: existingAgent.provider
              },
              {
                type: 'input',
                name: 'model',
                message: 'Model:',
                initial: existingAgent.model
              },
              {
                type: 'input',
                name: 'systemPrompt',
                message: 'System prompt (or press Enter for default):',
                initial: existingAgent.systemPrompt || ''
              },
              {
                type: 'numeral',
                name: 'temperature',
                message: 'Temperature (0.0-2.0):',
                initial: existingAgent.temperature || 0.7
              },
              {
                type: 'numeral',
                name: 'maxTokens',
                message: 'Max tokens:',
                initial: existingAgent.maxTokens || 4096
              }
            ];

            const answers = await enquirer.prompt(prompts) as AgentCreateAnswers;

            const updatedAgent = await updateAgent(context.rootPath, context.currentWorld.id, existingAgent.id, {
              name: answers.name,
              provider: answers.provider,
              model: answers.model,
              systemPrompt: answers.systemPrompt,
              temperature: answers.temperature,
              maxTokens: answers.maxTokens
            });

            if (updatedAgent) {
              cliResponse = {
                success: true,
                message: `Agent '${answers.name}' updated successfully`,
                data: updatedAgent,
                needsWorldRefresh: true
              };
            } else {
              cliResponse = {
                success: false,
                message: 'Failed to update agent'
              };
            }
          } catch (error) {
            cliResponse = {
              success: false,
              message: 'Failed to update agent',
              error: error instanceof Error ? error.message : String(error)
            };
          }
        } else {
          // If no world selected, edit world (redirect to updateWorld)
          try {
            const existingWorld = await getWorldConfig(context.rootPath, collectedParams.name);
            if (!existingWorld) {
              cliResponse = {
                success: false,
                message: `World '${collectedParams.name}' not found`
              };
              break;
            }

            // Use enquirer for interactive prompts
            const prompts = [
              {
                type: 'input',
                name: 'name',
                message: 'World name:',
                initial: existingWorld.name
              },
              {
                type: 'input',
                name: 'description',
                message: 'World description:',
                initial: existingWorld.description || ''
              },
              {
                type: 'numeral',
                name: 'turnLimit',
                message: 'Turn limit:',
                initial: existingWorld.turnLimit
              }
            ];

            const answers = await enquirer.prompt(prompts) as WorldCreateAnswers;

            const updatedWorld = await updateWorld(context.rootPath, existingWorld.id, {
              name: answers.name,
              description: answers.description,
              turnLimit: answers.turnLimit
            });

            if (updatedWorld) {
              cliResponse = {
                success: true,
                message: `World '${answers.name}' updated successfully`,
                data: updatedWorld,
                needsWorldRefresh: true
              };
            } else {
              cliResponse = {
                success: false,
                message: 'Failed to update world'
              };
            }
          } catch (error) {
            cliResponse = {
              success: false,
              message: 'Failed to update world',
              error: error instanceof Error ? error.message : String(error)
            };
          }
        }
        break;

      case 'contextualDelete':
        if (context.currentWorld) {
          // If world is selected, delete agent
          try {
            const existingAgent = await getAgent(context.rootPath, context.currentWorld.id, collectedParams.name);
            if (!existingAgent) {
              cliResponse = {
                success: false,
                message: `Agent '${collectedParams.name}' not found`
              };
              break;
            }

            // Confirmation prompt
            const confirmPrompt = {
              type: 'confirm',
              name: 'confirmed',
              message: `Are you sure you want to delete agent '${existingAgent.name}'? This action cannot be undone.`,
              initial: false
            };

            const { confirmed } = await enquirer.prompt(confirmPrompt) as ConfirmationAnswer;

            if (!confirmed) {
              cliResponse = {
                success: true,
                message: 'Agent deletion cancelled'
              };
              break;
            }

            const deleted = await deleteAgent(context.rootPath, context.currentWorld.id, existingAgent.id);

            if (deleted) {
              cliResponse = {
                success: true,
                message: `Agent '${existingAgent.name}' deleted successfully`,
                needsWorldRefresh: true
              };
            } else {
              cliResponse = {
                success: false,
                message: 'Failed to delete agent'
              };
            }
          } catch (error) {
            cliResponse = {
              success: false,
              message: 'Failed to delete agent',
              error: error instanceof Error ? error.message : String(error)
            };
          }
        } else {
          // If no world selected, delete world
          try {
            const existingWorld = await getWorldConfig(context.rootPath, collectedParams.name);
            if (!existingWorld) {
              cliResponse = {
                success: false,
                message: `World '${collectedParams.name}' not found`
              };
              break;
            }

            // Confirmation prompt
            const confirmPrompt = {
              type: 'confirm',
              name: 'confirmed',
              message: `Are you sure you want to delete world '${existingWorld.name}'? This action cannot be undone.`,
              initial: false
            };

            const { confirmed } = await enquirer.prompt(confirmPrompt) as ConfirmationAnswer;

            if (!confirmed) {
              cliResponse = {
                success: true,
                message: 'World deletion cancelled'
              };
              break;
            }

            const deleted = await deleteWorld(context.rootPath, existingWorld.id);

            if (deleted) {
              cliResponse = {
                success: true,
                message: `World '${existingWorld.name}' deleted successfully`,
                needsWorldRefresh: true
              };
            } else {
              cliResponse = {
                success: false,
                message: 'Failed to delete world'
              };
            }
          } catch (error) {
            cliResponse = {
              success: false,
              message: 'Failed to delete world',
              error: error instanceof Error ? error.message : String(error)
            };
          }
        }
        break;

      case 'contextualCreate':
        if (context.currentWorld) {
          // If world is selected, create agent (redirect to add-agent)
          try {
            const prompts = [
              {
                type: 'input',
                name: 'name',
                message: 'Agent name:',
                required: true
              },
              {
                type: 'select',
                name: 'provider',
                message: 'LLM Provider:',
                choices: Object.values(LLMProvider),
                initial: 'openai'
              },
              {
                type: 'input',
                name: 'model',
                message: 'Model:',
                initial: 'gpt-4'
              },
              {
                type: 'input',
                name: 'systemPrompt',
                message: 'System prompt (or press Enter for default):'
              },
              {
                type: 'numeral',
                name: 'temperature',
                message: 'Temperature (0.0-2.0):',
                initial: 0.7
              },
              {
                type: 'numeral',
                name: 'maxTokens',
                message: 'Max tokens:',
                initial: 4096
              }
            ];

            const answers = await enquirer.prompt(prompts) as AgentCreateAnswers;

            const agent = await context.currentWorld.createAgent({
              name: answers.name,
              type: 'conversational',
              provider: answers.provider,
              model: answers.model,
              systemPrompt: answers.systemPrompt || `You are ${answers.name}, an agent in the ${context.currentWorld.name} world.`,
              temperature: answers.temperature,
              maxTokens: answers.maxTokens
            });

            cliResponse = {
              success: true,
              message: `Agent '${answers.name}' created successfully`,
              data: agent,
              needsWorldRefresh: true
            };
          } catch (error) {
            cliResponse = {
              success: false,
              message: 'Failed to create agent',
              error: error instanceof Error ? error.message : String(error)
            };
          }
        } else {
          // If no world selected, create world (redirect to create-world)
          try {
            const prompts = [
              {
                type: 'input',
                name: 'name',
                message: 'World name:',
                required: true
              },
              {
                type: 'input',
                name: 'description',
                message: 'World description:'
              },
              {
                type: 'numeral',
                name: 'turnLimit',
                message: 'Turn limit:',
                initial: 5
              }
            ];

            const answers = await enquirer.prompt(prompts) as WorldCreateAnswers;

            const newWorld = await createWorld(context.rootPath, {
              name: answers.name,
              description: answers.description || `A world named ${answers.name}`,
              turnLimit: answers.turnLimit
            });

            cliResponse = {
              success: true,
              message: `World '${answers.name}' created successfully`,
              data: newWorld,
              needsWorldRefresh: true
            };
          } catch (error) {
            cliResponse = {
              success: false,
              message: 'Failed to create world',
              error: error instanceof Error ? error.message : String(error)
            };
          }
        }
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
