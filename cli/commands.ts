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

import {
  LLMProvider,
  createWorld,
  getWorld,
  updateWorld,
  publishMessage,
  listWorlds,
  deleteWorld,
  listAgents,
  getAgent,
  updateAgent,
  deleteAgent,
  createAgent,
  clearAgentMemory,
  listChats,
  updateChat,
  exportWorldToMarkdown,
  exportChatToMarkdown,
  newChat,
  restoreChat,
  deleteChat,
  getMemory
} from '../core/index.js';
import { World } from '../core/types.js';
import { createCategoryLogger } from '../core/logger.js';
import readline from 'readline';
import enquirer from 'enquirer';
import fs from 'fs';
import path from 'path';

// Create CLI logger
const logger = createCategoryLogger('cli');

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

// Color helpers (matching cli/index.ts styles)
const red = (text: string) => `\x1b[31m${text}\x1b[0m`;
const green = (text: string) => `\x1b[32m${text}\x1b[0m`;
const yellow = (text: string) => `\x1b[33m${text}\x1b[0m`;
const cyan = (text: string) => `\x1b[36m${text}\x1b[0m`;
const gray = (text: string) => `\x1b[90m${text}\x1b[0m`;

const boldGreen = (text: string) => `\x1b[1m\x1b[32m${text}\x1b[0m`;
const boldYellow = (text: string) => `\x1b[1m\x1b[33m${text}\x1b[0m`;
const boldRed = (text: string) => `\x1b[1m\x1b[31m${text}\x1b[0m`;

/**
 * Display chat messages in a formatted, readable way
 * Shows sender, timestamp, and content for each message
 * Logic:
 * - HUMAN messages: deduplicate by messageId (they're replicated across all agents)
 * - Agent messages: only show if sender matches agentId (the agent that created it)
 * - System messages: deduplicate by messageId
 */
export async function displayChatMessages(worldId: string, chatId?: string | null): Promise<void> {
  try {
    const messages = await getMemory(worldId, chatId);

    if (!messages || messages.length === 0) {
      console.log(gray('\n  No messages in current chat.\n'));
      return;
    }

    // Filter and deduplicate messages
    const humanMessageMap = new Map<string, typeof messages[0]>();
    const agentMessages: typeof messages = [];
    const messagesWithoutId: typeof messages = [];

    for (const msg of messages) {
      const isHumanMessage = msg.sender === 'HUMAN' || msg.sender === 'CLI' ||
        msg.role === 'user' ||
        (msg.sender || '').toLowerCase() === 'human';

      const isSystemMessage = msg.sender === 'system' || msg.role === 'system';

      if (isHumanMessage) {
        // Deduplicate HUMAN messages by messageId (exclude agent response copies with role=user)
        if (msg.messageId && (msg.sender === 'HUMAN' || msg.sender === 'CLI' || (msg.sender || '').toLowerCase() === 'human')) {
          if (!humanMessageMap.has(msg.messageId)) {
            humanMessageMap.set(msg.messageId, msg);
          }
        } else if (!msg.messageId && (msg.sender === 'HUMAN' || msg.sender === 'CLI')) {
          messagesWithoutId.push(msg);
        }
      } else if (isSystemMessage) {
        // Deduplicate system messages by messageId
        if (msg.messageId) {
          if (!humanMessageMap.has(msg.messageId)) {
            humanMessageMap.set(msg.messageId, msg);
          }
        } else {
          messagesWithoutId.push(msg);
        }
      } else if (msg.role === 'assistant') {
        // Agent response message: only show messages with role=assistant
        // This filters out copies stored in other agents' memories (which have role=user)
        agentMessages.push(msg);
      }
    }

    // Combine all message types
    const deduplicatedMessages = [
      ...Array.from(humanMessageMap.values()),
      ...agentMessages,
      ...messagesWithoutId
    ];

    // Sort by timestamp
    deduplicatedMessages.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateA - dateB;
    });

    console.log(cyan('\n=== Current Chat Messages ===\n'));

    for (const msg of deduplicatedMessages) {
      // Format timestamp if available
      const timestamp = msg.createdAt
        ? new Date(msg.createdAt).toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        })
        : '';

      // Determine sender display
      let senderDisplay = '';
      if (msg.sender) {
        // Color code by sender type
        const senderUpper = msg.sender.toUpperCase();
        if (senderUpper === 'HUMAN' || senderUpper === 'CLI') {
          senderDisplay = boldYellow(senderUpper);
        } else if (msg.sender === 'system') {
          senderDisplay = boldRed('system');
        } else {
          // Agent message
          senderDisplay = boldGreen(msg.sender);
        }
      } else {
        // Fallback to role if no sender
        senderDisplay = gray(msg.role || 'unknown');
      }

      // Display message
      const timestampPart = timestamp ? gray(`[${timestamp}]`) : '';
      console.log(`${timestampPart} ${senderDisplay}: ${msg.content}`);
    }

    console.log(gray(`\n  Total: ${deduplicatedMessages.length} message${deduplicatedMessages.length !== 1 ? 's' : ''}\n`));
  } catch (err) {
    console.error(red(`Failed to load chat messages: ${err instanceof Error ? err.message : String(err)}`));
  }
}

// CLI Command Mapping with Short Aliases
type CLICommandCategory = 'world' | 'agent' | 'chat' | 'system';

interface CLICommandParameter {
  name: string;
  required: boolean;
  description: string;
  type: 'string' | 'number' | 'boolean';
  options?: string[];
}

export interface CLICommandDefinition {
  type: string;
  requiresWorld: boolean;
  description: string;
  usage: string;
  parameters: CLICommandParameter[];
  aliases?: string[];
  category: CLICommandCategory;
}


export const CLI_COMMAND_MAP: Record<string, CLICommandDefinition> = {
  'world list': {
    type: 'listWorlds',
    requiresWorld: false,
    description: 'List all worlds with details (ID, name, description, agents count)',
    usage: '/world list',
    parameters: [],
    aliases: ['list-worlds', 'lsw'],
    category: 'world'
  },
  'world show': {
    type: 'showWorld',
    requiresWorld: false,
    description: 'Show details for a specific world',
    usage: '/world show <name>',
    parameters: [
      { name: 'name', required: true, description: 'World name or ID', type: 'string' }
    ],
    aliases: ['show-world'],
    category: 'world'
  },
  'world create': {
    type: 'createWorld',
    requiresWorld: false,
    description: 'Create a new world',
    usage: '/world create [name] [description] [turnLimit]',
    parameters: [
      { name: 'name', required: false, description: 'World name', type: 'string' },
      { name: 'description', required: false, description: 'World description', type: 'string' },
      { name: 'turnLimit', required: false, description: 'Turn limit for the world', type: 'number' }
    ],
    aliases: ['create-world', 'new'],
    category: 'world'
  },
  'world update': {
    type: 'updateWorld',
    requiresWorld: false,
    description: 'Update world properties interactively',
    usage: '/world update <name>',
    parameters: [
      { name: 'name', required: true, description: 'World name or ID', type: 'string' }
    ],
    aliases: ['update-world'],
    category: 'world'
  },
  'world delete': {
    type: 'deleteWorld',
    requiresWorld: false,
    description: 'Delete a world after confirmation',
    usage: '/world delete <name>',
    parameters: [
      { name: 'name', required: true, description: 'World name or ID', type: 'string' }
    ],
    aliases: ['delete-world'],
    category: 'world'
  },
  'world select': {
    type: 'selectWorld',
    requiresWorld: false,
    description: 'Show world selection menu to pick a world',
    usage: '/world select',
    parameters: [],
    aliases: ['select', 'sel'],
    category: 'world'
  },
  'world export': {
    type: 'exportWorld',
    requiresWorld: true,
    description: 'Export the current world and agents to a markdown file',
    usage: '/world export [file]',
    parameters: [
      { name: 'file', required: false, description: 'Output file path (defaults to [world]-timestamp.md)', type: 'string' }
    ],
    aliases: ['export'],
    category: 'world'
  },
  'agent list': {
    type: 'listAgents',
    requiresWorld: true,
    description: 'List all agents in the current world with details',
    usage: '/agent list',
    parameters: [],
    aliases: ['list-agents', 'lsa'],
    category: 'agent'
  },
  'agent show': {
    type: 'showAgent',
    requiresWorld: true,
    description: 'Show agent details including configuration and memory statistics',
    usage: '/agent show <name>',
    parameters: [
      { name: 'name', required: true, description: 'Agent name', type: 'string' }
    ],
    aliases: ['show-agent'],
    category: 'agent'
  },
  'agent create': {
    type: 'createAgent',
    requiresWorld: true,
    description: 'Create a new agent',
    usage: '/agent create [name] [prompt]',
    parameters: [
      { name: 'name', required: false, description: 'Agent name', type: 'string' },
      { name: 'prompt', required: false, description: 'Agent system prompt', type: 'string' }
    ],
    aliases: ['add-agent', 'add'],
    category: 'agent'
  },
  'agent update': {
    type: 'updateAgent',
    requiresWorld: true,
    description: 'Update agent properties interactively',
    usage: '/agent update <name>',
    parameters: [
      { name: 'name', required: true, description: 'Agent name', type: 'string' }
    ],
    aliases: ['update-agent'],
    category: 'agent'
  },
  'agent delete': {
    type: 'deleteAgent',
    requiresWorld: true,
    description: 'Delete an agent after confirmation',
    usage: '/agent delete <name>',
    parameters: [
      { name: 'name', required: true, description: 'Agent name', type: 'string' }
    ],
    aliases: ['delete-agent'],
    category: 'agent'
  },
  'agent clear': {
    type: 'clearAgentMemory',
    requiresWorld: true,
    description: 'Clear agent memory or all agents',
    usage: '/agent clear <agentName|all>',
    parameters: [
      { name: 'agentName', required: true, description: 'Agent name or "all" for all agents', type: 'string' }
    ],
    aliases: ['clear'],
    category: 'agent'
  },
  'chat list': {
    type: 'listChats',
    requiresWorld: true,
    description: 'List chat history for the current world',
    usage: '/chat list [--active]',
    parameters: [
      { name: 'filter', required: false, description: 'Optional filter (--active for current chat only)', type: 'string' }
    ],
    aliases: ['list-chats'],
    category: 'chat'
  },
  'chat create': {
    type: 'createChat',
    requiresWorld: true,
    description: 'Create a new chat history entry and make it current',
    usage: '/chat create',
    parameters: [],
    aliases: ['new-chat'],
    category: 'chat'
  },
  'chat select': {
    type: 'selectChat',
    requiresWorld: true,
    description: 'Show chat selection menu and display messages from selected chat',
    usage: '/chat select',
    parameters: [],
    category: 'chat'
  },
  'chat switch': {
    type: 'loadChat',
    requiresWorld: true,
    description: 'Load and restore state from a chat history entry',
    usage: '/chat switch <chatId>',
    parameters: [
      { name: 'chatId', required: true, description: 'Chat ID to load', type: 'string' }
    ],
    aliases: ['load-chat'],
    category: 'chat'
  },
  'chat delete': {
    type: 'deleteChat',
    requiresWorld: true,
    description: 'Delete a chat history entry after confirmation',
    usage: '/chat delete <chatId>',
    parameters: [
      { name: 'chatId', required: true, description: 'Chat ID to delete', type: 'string' }
    ],
    aliases: ['delete-chat'],
    category: 'chat'
  },
  'chat rename': {
    type: 'renameChat',
    requiresWorld: true,
    description: 'Rename a chat history entry and optionally update its description',
    usage: '/chat rename <chatId> <name> [description]',
    parameters: [
      { name: 'chatId', required: true, description: 'Chat ID to rename', type: 'string' },
      { name: 'name', required: true, description: 'New chat name', type: 'string' },
      { name: 'description', required: false, description: 'New chat description', type: 'string' }
    ],
    category: 'chat'
  },
  'chat export': {
    type: 'exportChat',
    requiresWorld: true,
    description: 'Export a chat history to markdown (defaults to current chat)',
    usage: '/chat export [chatId] [file]',
    parameters: [
      { name: 'chatId', required: false, description: 'Chat ID to export (defaults to current chat)', type: 'string' },
      { name: 'file', required: false, description: 'Output file path', type: 'string' }
    ],
    category: 'chat'
  },
  'help': {
    type: 'help',
    requiresWorld: false,
    description: 'Show available commands or category-specific help',
    usage: '/help [command|category]',
    parameters: [
      { name: 'command', required: false, description: 'Command or category to display', type: 'string' }
    ],
    category: 'system'
  },
  'quit': {
    type: 'quit',
    requiresWorld: false,
    description: 'Exit the CLI',
    usage: '/quit',
    parameters: [],
    category: 'system'
  },
  'exit': {
    type: 'exit',
    requiresWorld: false,
    description: 'Exit the CLI',
    usage: '/exit',
    parameters: [],
    category: 'system'
  }
};


export const CLI_COMMAND_ALIASES: Record<string, string> = Object.entries(CLI_COMMAND_MAP).reduce(
  (aliases, [key, command]) => {
    if (command.aliases) {
      for (const rawAlias of command.aliases) {
        const alias = rawAlias.replace(/^\//, '').toLowerCase();
        if (!aliases[alias]) {
          aliases[alias] = key;
        }
      }
    }
    return aliases;
  },
  {} as Record<string, string>
);

const CATEGORY_LABELS: Record<CLICommandCategory, string> = Object.freeze({
  world: 'World Management',
  agent: 'Agent Management',
  chat: 'Chat Management',
  system: 'System Commands'
});

const CATEGORY_ORDER: CLICommandCategory[] = ['world', 'agent', 'chat', 'system'];

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

  const tokens = parts.map(part => part.toLowerCase());

  let resolvedCommand: string | null = null;
  let consumedTokens = 0;

  if (tokens.length >= 2) {
    const twoWordCandidate = `${tokens[0]} ${tokens[1]}`;
    if (CLI_COMMAND_MAP[twoWordCandidate]) {
      resolvedCommand = twoWordCandidate;
      consumedTokens = 2;
    } else if (CLI_COMMAND_ALIASES[twoWordCandidate]) {
      resolvedCommand = CLI_COMMAND_ALIASES[twoWordCandidate];
      consumedTokens = 2;
    }
  }

  if (!resolvedCommand) {
    const singleWordCandidate = tokens[0];
    if (CLI_COMMAND_MAP[singleWordCandidate]) {
      resolvedCommand = singleWordCandidate;
      consumedTokens = 1;
    } else if (CLI_COMMAND_ALIASES[singleWordCandidate]) {
      resolvedCommand = CLI_COMMAND_ALIASES[singleWordCandidate];
      consumedTokens = 1;
    }
  }

  if (!resolvedCommand) {
    const availableCommands = Object.keys(CLI_COMMAND_MAP).sort().map(cmd => `/${cmd}`).join(', ');
    const attempted = tokens.slice(0, 2).join(' ');
    return {
      command: attempted,
      args: parts.slice(1),
      commandType: '',
      isValid: false,
      error: `Unknown command: ${attempted}. Available commands: ${availableCommands}`
    };
  }

  const args = parts.slice(consumedTokens);
  return {
    command: resolvedCommand,
    args,
    commandType: CLI_COMMAND_MAP[resolvedCommand].type,
    isValid: true
  };
}

export function generateHelpMessage(target?: string): string {
  const formatAliases = (definition: CLICommandDefinition): string => {
    if (!definition.aliases || definition.aliases.length === 0) {
      return '';
    }
    const aliasList = definition.aliases.map(alias => `/${alias}`).join(', ');
    return `Aliases: ${aliasList}\n`;
  };

  const formatParameters = (definition: CLICommandDefinition): string => {
    if (!definition.parameters.length) {
      return '';
    }
    let text = '\nParameters:\n';
    for (const param of definition.parameters) {
      const required = param.required ? 'required' : 'optional';
      const options = param.options ? ` (options: ${param.options.join(', ')})` : '';
      text += `  ${param.name} (${param.type}, ${required}): ${param.description}${options}\n`;
    }
    return text;
  };

  const formatCategorySection = (category: CLICommandCategory): string => {
    const commands = Object.entries(CLI_COMMAND_MAP)
      .filter(([, definition]) => definition.category === category)
      .sort((a, b) => a[1].usage.localeCompare(b[1].usage));

    if (commands.length === 0) {
      return '';
    }

    let section = `${CATEGORY_LABELS[category]}:\n`;
    for (const [, definition] of commands) {
      const aliasLabel = definition.aliases && definition.aliases.length
        ? ` (aliases: ${definition.aliases.map(alias => `/${alias}`).join(', ')})`
        : '';
      section += `  ${definition.usage.padEnd(28)} - ${definition.description}${aliasLabel}\n`;
    }
    return `${section}\n`;
  };

  const commandKeyFromTarget = (candidate: string): string | null => {
    if (CLI_COMMAND_MAP[candidate]) {
      return candidate;
    }
    if (CLI_COMMAND_ALIASES[candidate]) {
      return CLI_COMMAND_ALIASES[candidate];
    }
    return null;
  };

  if (target) {
    const normalized = target.toLowerCase();
    const category = CATEGORY_ORDER.find(cat => cat === normalized);

    if (category) {
      const section = formatCategorySection(category);
      return `\n${section}Use /help <command> for detailed information about a specific command.\n`;
    }

    const resolvedKey = commandKeyFromTarget(normalized);
    if (resolvedKey) {
      const definition = CLI_COMMAND_MAP[resolvedKey];
      let help = `\n${definition.usage}\n`;
      help += `Description: ${definition.description}\n`;
      help += `Category: ${CATEGORY_LABELS[definition.category]}\n`;
      help += formatAliases(definition);
      help += formatParameters(definition);
      return help;
    }

    return `\nUnknown command or category: ${target}. Try /help, /help world, /help agent, or /help chat.\n`;
  }

  let help = '\nCommand Guide\n';
  help += 'Commands are grouped by domain: /world …, /agent …, /chat …\n';
  help += 'Examples: /world list | /agent create Ava | /chat list --active\n\n';
  for (const category of CATEGORY_ORDER) {
    const section = formatCategorySection(category);
    if (section) {
      help += section;
    }
  }
  help += 'Use /help <command> for detailed information or /help <category> to filter by topic.\n';
  return help;
}

// Export world to markdown file (CLI wrapper)
async function exportWorldToMarkdownFile(
  worldName: string,
  outputPath: string
): Promise<CLIResponse> {
  try {
    // Use the core function to generate markdown
    const markdown = await exportWorldToMarkdown(worldName);

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

    // Write file
    await fs.promises.writeFile(filePath, markdown, 'utf8');

    // Get agent count for response data
    const worldData = await getWorld(worldName);
    const world = await getWorld(worldData!.id);
    if (!world) throw new Error(`World ${worldName} not found`);
    const agents = await listAgents(worldData!.id);

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

async function exportChatToMarkdownFile(
  worldId: string,
  worldName: string,
  chatId: string,
  outputPath?: string
): Promise<CLIResponse> {
  try {
    const markdown = await exportChatToMarkdown(worldId, chatId);

    const now = new Date();
    const datePart = now.toISOString().slice(0, 10);
    const timePart = now.toTimeString().slice(0, 8).replace(/:/g, '-');
    const timestamp = `${datePart}_${timePart}`;
    const sanitizedWorld = worldName.replace(/\s+/g, '-');

    const filePath = outputPath
      ? path.resolve(outputPath)
      : path.resolve(process.cwd(), `${sanitizedWorld}-${chatId}-${timestamp}.md`);

    await fs.promises.writeFile(filePath, markdown, 'utf8');

    return {
      success: true,
      message: `Chat '${chatId}' exported successfully to: ${filePath}`,
      data: {
        worldId,
        chatId,
        worldName,
        filePath,
        fileSize: markdown.length
      }
    };
  } catch (error) {
    return {
      success: false,
      message: 'Failed to export chat',
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
      case 'createWorld': {
        const shouldPrompt = collectedParams.name === undefined;

        if (shouldPrompt) {
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

            const newWorld = await createWorld({
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
          try {
            const newWorld = await createWorld({
              name: collectedParams.name,
              description: collectedParams.description || `A world named ${collectedParams.name}`,
              turnLimit: collectedParams.turnLimit
            });
            cliResponse = {
              success: true,
              message: `World '${collectedParams.name}' created successfully`,
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
      }

      case 'selectWorld':
        cliResponse = {
          success: true,
          message: 'Opening world selection...',
          data: { selectWorld: true }
        };
        break;

      case 'createAgent': {
        const worldError = requireWorldOrError(world, command);
        if (worldError) return worldError;

        const shouldPrompt = collectedParams.name === undefined;

        if (shouldPrompt) {
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

            const agent = await createAgent(world!.id, {
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
          try {
            const agent = await createAgent(world!.id, {
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
          } catch (error) {
            cliResponse = {
              success: false,
              message: 'Failed to create agent',
              error: error instanceof Error ? error.message : String(error)
            };
          }
        }
        break;
      }

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
            await clearAgentMemory(world!.id, agentName);
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
          const result = await clearAgentMemory(world!.id, collectedParams.agentName);
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
          const worlds = await listWorlds();
          if (worlds.length === 0) {
            cliResponse = {
              success: true,
              message: 'No worlds found.',
              data: { worlds: [] }
            };
          } else {
            let output = '\nAvailable Worlds:\n';
            worlds.forEach((worldInfo) => {
              output += `  ID: ${worldInfo.id}\n`;
              output += `  Name: ${worldInfo.name}\n`;
              output += `  Description: ${worldInfo.description || 'No description'}\n`;
              output += `  Turn Limit: ${worldInfo.turnLimit}\n`;
              output += `  Agents: ${worldInfo.totalAgents}\n`;
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
          const worldData = await getWorld(collectedParams.name);
          if (!worldData) {
            cliResponse = {
              success: false,
              message: `World '${collectedParams.name}' not found`
            };
          } else {
            // Get agent count
            const world = await getWorld(worldData.id);
            if (!world) throw new Error(`World ${collectedParams.name} not found`);
            const agents = await listAgents(worldData.id);
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
          const existingWorld = await getWorld(collectedParams.name);
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

          const updatedWorld = await updateWorld(existingWorld.id, {
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
          const existingWorld = await getWorld(collectedParams.name);
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

          const deleted = await deleteWorld(existingWorld.id);

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
          // Get world instance first
          const worldInstance = await getWorld(world!.id);
          if (!worldInstance) throw new Error(`World not found`);
          const agents = await listAgents(world!.id);
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
              output += `  Memory Size: ${agent.memory?.length || 0} messages\n`;
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
          const worldInstance = await getWorld(world!.id);
          if (!worldInstance) throw new Error(`World not found`);
          const agent = await getAgent(world!.id, collectedParams.name);
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
          const worldInstance = await getWorld(world!.id);
          if (!worldInstance) throw new Error(`World not found`);
          const existingAgent = await getAgent(world!.id, collectedParams.name);
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

          const updatedAgent = await updateAgent(world!.id, existingAgent.id, {
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
          const worldInstance = await getWorld(world!.id);
          if (!worldInstance) throw new Error(`World not found`);
          const existingAgent = await getAgent(world!.id, collectedParams.name);
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

          const deleted = await deleteAgent(world!.id, existingAgent.id);

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
          cliResponse = await exportWorldToMarkdownFile(world!.name, fileParam);
        } catch (error) {
          cliResponse = {
            success: false,
            message: 'Failed to export world',
            error: error instanceof Error ? error.message : String(error)
          };
        }
        break;

      // Chat history commands
      case 'listChats': {
        const worldError = requireWorldOrError(world, command);
        if (worldError) return worldError;

        const filter = collectedParams.filter ? String(collectedParams.filter).toLowerCase() : undefined;
        if (filter && filter !== '--active') {
          cliResponse = {
            success: false,
            message: `Unknown filter '${collectedParams.filter}'. Did you mean --active?`
          };
          break;
        }

        try {
          const chats = await listChats(world!.id);
          const worldState = await getWorld(world!.id);
          const currentChatId = worldState?.currentChatId || null;

          if (filter === '--active') {
            if (!currentChatId) {
              cliResponse = {
                success: true,
                message: `World '${world!.name}' does not have an active chat.`
              };
              break;
            }

            const activeChat = chats.find(chat => chat.id === currentChatId);
            if (!activeChat) {
              cliResponse = {
                success: false,
                message: `Active chat '${currentChatId}' not found.`,
                technicalDetails: 'Active chat ID missing from storage'
              };
              break;
            }

            let output = `\nCurrent chat in world '${world!.name}':\n`;
            output += `  ID: ${activeChat.id}\n`;
            output += `  Name: ${activeChat.name}\n`;
            if (activeChat.description) output += `  Description: ${activeChat.description}\n`;
            output += `  Messages: ${activeChat.messageCount}\n`;
            output += `  Updated: ${activeChat.updatedAt.toISOString()}\n`;

            cliResponse = {
              success: true,
              message: output,
              data: { chats: [activeChat], currentChatId }
            };
            break;
          }

          if (chats.length === 0) {
            cliResponse = {
              success: true,
              message: `No chat history found in world '${world!.name}'.`
            };
          } else {
            let output = `\nChat history in world '${world!.name}':\n`;
            chats.forEach((chat: any) => {
              const isCurrent = currentChatId && chat.id === currentChatId;
              output += `  ID: ${chat.id}${isCurrent ? ' (current)' : ''}\n`;
              output += `  Name: ${chat.name}\n`;
              if (chat.description) output += `  Description: ${chat.description}\n`;
              output += `  Messages: ${chat.messageCount}\n`;
              output += `  Created: ${chat.createdAt.toISOString().split('T')[0]}\n`;
              output += `  Updated: ${chat.updatedAt.toISOString().split('T')[0]}\n`;
              output += `  ---\n`;
            });
            cliResponse = {
              success: true,
              message: output,
              data: { chats, currentChatId }
            };
          }
        } catch (error) {
          cliResponse = {
            success: false,
            message: 'Failed to list chat history',
            error: error instanceof Error ? error.message : String(error)
          };
        }
        break;
      }

      case 'createChat':
        {
          const worldError = requireWorldOrError(world, command);
          if (worldError) return worldError;
        }
        try {
          // Create a simple new chat using the available API
          const updatedWorld = await newChat(world!.id);

          if (updatedWorld) {
            cliResponse = {
              success: true,
              message: `New chat created successfully for world '${updatedWorld.name}'`,
              data: { worldId: updatedWorld.id, currentChatId: updatedWorld.currentChatId }
            };
          } else {
            cliResponse = {
              success: false,
              message: 'Failed to create new chat',
              error: 'Unknown error occurred'
            };
          }
        } catch (error) {
          cliResponse = {
            success: false,
            message: 'Failed to create chat',
            error: error instanceof Error ? error.message : String(error)
          };
        }
        break;

      case 'selectChat':
        {
          const worldError = requireWorldOrError(world, command);
          if (worldError) return worldError;
        }
        try {
          // Get all chats for the world
          const chats = await listChats(world!.id);

          if (chats.length === 0) {
            cliResponse = {
              success: true,
              message: `No chat history found in world '${world!.name}'.`
            };
            break;
          }

          // Get current chat ID
          const worldState = await getWorld(world!.id);
          const currentChatId = worldState?.currentChatId || null;

          // If only one chat, auto-select it
          if (chats.length === 1) {
            const chat = chats[0];
            console.log(`\n${boldGreen('Auto-selecting the only available chat:')} ${cyan(chat.name)} (${gray(chat.id)})`);

            // Restore the chat
            const restored = await restoreChat(world!.id, chat.id);
            if (!restored) {
              cliResponse = {
                success: false,
                message: `Failed to restore chat '${chat.id}'`
              };
              break;
            }

            // Display chat messages
            await displayChatMessages(world!.id, chat.id);

            cliResponse = {
              success: true,
              message: `Chat '${chat.name}' selected and loaded`,
              data: { worldId: restored.id, currentChatId: restored.currentChatId },
              needsWorldRefresh: true
            };
            break;
          }

          // Return data for interactive chat selection in CLI
          cliResponse = {
            success: true,
            message: 'Opening chat selection...',
            data: {
              selectChat: true,
              chats,
              currentChatId
            }
          };
        } catch (error) {
          cliResponse = {
            success: false,
            message: 'Failed to select chat',
            error: error instanceof Error ? error.message : String(error)
          };
        }
        break;

      case 'loadChat':
        {
          const worldError = requireWorldOrError(world, command);
          if (worldError) return worldError;
        }
        try {
          // Simplified: use restoreChat function directly
          const restored = await restoreChat(world!.id, collectedParams.chatId);
          if (!restored) {
            cliResponse = {
              success: false,
              message: `Chat '${collectedParams.chatId}' not found or could not be restored`
            };
            break;
          }

          cliResponse = {
            success: true,
            message: `Successfully restored world state from chat '${collectedParams.chatId}'`,
            data: { worldId: restored.id, currentChatId: restored.currentChatId },
            needsWorldRefresh: true
          };
        } catch (error) {
          cliResponse = {
            success: false,
            message: 'Failed to load chat',
            error: error instanceof Error ? error.message : String(error)
          };
        }
        break;

      case 'deleteChat':
        {
          const worldError = requireWorldOrError(world, command);
          if (worldError) return worldError;
        }
        try {
          // Simplified: use deleteChat function directly
          const deleted = await deleteChat(world!.id, collectedParams.chatId);

          if (deleted) {
            cliResponse = {
              success: true,
              message: `Chat '${collectedParams.chatId}' deleted successfully`
            };
          } else {
            cliResponse = {
              success: false,
              message: 'Failed to delete chat - chat may not exist'
            };
          }
        } catch (error) {
          cliResponse = {
            success: false,
            message: 'Failed to delete chat',
            error: error instanceof Error ? error.message : String(error)
          };
        }
        break;

      case 'renameChat': {
        const worldError = requireWorldOrError(world, command);
        if (worldError) return worldError;

        try {
          const updatedChat = await updateChat(world!.id, collectedParams.chatId, {
            name: collectedParams.name,
            description: collectedParams.description
          });

          if (!updatedChat) {
            cliResponse = {
              success: false,
              message: `Chat '${collectedParams.chatId}' not found`
            };
            break;
          }

          cliResponse = {
            success: true,
            message: `Chat '${collectedParams.chatId}' renamed to '${updatedChat.name}'`,
            data: updatedChat,
            needsWorldRefresh: true
          };
        } catch (error) {
          cliResponse = {
            success: false,
            message: 'Failed to rename chat',
            error: error instanceof Error ? error.message : String(error)
          };
        }
        break;
      }

      case 'exportChat': {
        const worldError = requireWorldOrError(world, command);
        if (worldError) return worldError;

        const chatId = collectedParams.chatId || world!.currentChatId;
        if (!chatId) {
          cliResponse = {
            success: false,
            message: `No chat selected. Use /chat list --active to see the current chat.`
          };
          break;
        }

        try {
          cliResponse = await exportChatToMarkdownFile(world!.id, world!.name, chatId, collectedParams.file);
        } catch (error) {
          cliResponse = {
            success: false,
            message: 'Failed to export chat',
            error: error instanceof Error ? error.message : String(error)
          };
        }
        break;
      }

      case 'quit':
      case 'exit':
        cliResponse = {
          success: true,
          message: 'Exiting CLI...',
          data: { exit: true }
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

// Main CLI input processor - handles both commands and messages
export async function processCLIInput(
  input: string,
  world: World | null,
  sender: string = 'HUMAN'
): Promise<CLIResponse> {
  const context: CLIContext = {
    currentWorld: world,
    currentWorldName: world?.name
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
    const parsed = parseCLICommand(input);
    if (!parsed.isValid) {
      return {
        success: false,
        message: parsed.error || 'Invalid command',
        technicalDetails: `Failed to parse command: ${input}`
      };
    }

    return await processCLICommand(input, context, promptFunction);
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
    publishMessage(world as any, input, sender);
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
