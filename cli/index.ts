/**
 * CLI Interface - Interactive Command Line Tool with Real-time Agent Streaming
 * 
 * Core Features:
 * - Interactive command interface with world/agent management
 * - External input handling (piped input and CLI args)
 * - Real-time multi-agent streaming with content accumulation
 * - Natural prompt flow with automatic restoration after streaming
 * - World integration for agent persistence and message broadcasting
 * - Graceful shutdown and cleanup handling
 * 
 * Architecture:
 * - Function-based design with readline integration
 * - Natural prompt flow without positioning or boxes
 * - Command routing with core module function imports
 * - SSE event subscription for real-time agent streaming
 * - Global world object management for efficient execution
 * - Automatic prompt restoration with fallback mechanisms
 * 
 * Implementation:
 * - Core module migration from src/ to core/ architecture
 * - ID-based operations with name-to-ID conversion
 * - Smart world selection with automatic discovery
 * - Object-based data access for agent prompts and memory
 * - World-specific event subscriptions
 * - Clean streaming content accumulation with newline preservation
 * - Robust prompt management with streaming coordination
 */

// Set the data path for core modules
if (!process.env.AGENT_WORLD_DATA_PATH) {
  process.env.AGENT_WORLD_DATA_PATH = './data/worlds';
}

// Core module imports
import { createWorld, getWorld, listWorlds } from '../core/world-manager';
import { publishMessage, subscribeToSSE, subscribeToMessages } from '../core/world-events';
import { World, Agent } from '../core/types';
import { toKebabCase } from '../core/utils';

// CLI command imports
import { addCommand } from './commands/add';
import { clearCommand } from './commands/clear';
import { exportCommand } from './commands/export';
import { showCommand } from './commands/show';
import { stopCommand } from './commands/stop';
import { useCommand } from './commands/use';

// Basic command implementations
const helpCommand = async (args: string[], world: World) => {
  displayUnifiedMessage({
    type: 'instruction',
    content: `Agent World CLI - ${world.name}
    
Available commands:
- /add <name> - Create a new agent
- /show <agent> - Display agent conversation history
- /clear <agent|all> - Clear agent memory
- /stop <agent|all> - Deactivate agents
- /use <agent> - Activate agent
- /export <filename> - Export conversation history
- /agents - List all agents
- /help - Show this help
- /quit - Exit CLI

Type messages to broadcast to all agents, or use commands above.`,
    metadata: { source: 'cli', messageType: 'command' }
  });
};

const listCommand = async (args: string[], world: World) => {
  try {
    const agents = Array.from(world.agents.values());
    if (agents.length === 0) {
      displayUnifiedMessage({
        type: 'instruction',
        content: 'No agents found in current world.',
        metadata: { source: 'cli', messageType: 'command' }
      });
    } else {
      const agentList = agents.map(agent => `• ${agent.name} (${agent.type}) - ${agent.status || 'active'}`).join('\n');
      displayUnifiedMessage({
        type: 'instruction',
        content: `Agents in current world:\n${agentList}`,
        metadata: { source: 'cli', messageType: 'command' }
      });
    }
  } catch (error) {
    displayUnifiedMessage({
      type: 'error',
      content: `Error listing agents: ${error}`,
      metadata: { source: 'cli', messageType: 'error' }
    });
  }
};

const quitCommand = async (args: string[], world: World): Promise<void> => {
  displayUnifiedMessage({
    type: 'instruction',
    content: 'Goodbye!',
    metadata: { source: 'cli', messageType: 'command' }
  });
  process.exit(0);
};

// UI module imports
import { colors } from './ui/colors';
import {
  displayUnifiedMessage, setCurrentWorldName, initializeDisplay,
  startStreaming, addStreamingContent, endStreaming, markStreamingError,
  setStreamingUsage, isStreamingActive,
  setOnStreamingStartCallback, setOnAllStreamingEndCallback, handleExternalInputDisplay,
  showInitialPrompt, setIsPipedInput
} from './ui/display';
import {
  detectPipedInput, readPipedInput, performShutdown
} from './ui/terminal-lifecycle';

// Simple readline for user input only
import * as readline from 'readline';

// Global state
const DEFAULT_WORLD_NAME = 'Default World';
let currentWorld: World | null = null;

// World and agent utilities
async function loadWorldsWithSmartSelection(): Promise<{ worlds: string[], action: string, defaultWorld?: string }> {
  try {
    const rootPath = process.env.AGENT_WORLD_DATA_PATH || './data/worlds';
    const worldInfos = await listWorlds(rootPath);
    const worlds = worldInfos.map(info => info.name);

    if (worlds.length === 0) return { worlds: [], action: 'create' };
    if (worlds.length === 1) return { worlds, action: 'use', defaultWorld: worlds[0] };
    return { worlds, action: 'select' };
  } catch (error) {
    console.error('Error loading worlds:', error);
    return { worlds: [], action: 'create' };
  }
}

async function loadWorldByName(worldName: string): Promise<void> {
  try {
    const worldId = toKebabCase(worldName);
    const rootPath = process.env.AGENT_WORLD_DATA_PATH || './data/worlds';
    currentWorld = await getWorld(rootPath, worldId);
    if (!currentWorld) throw new Error(`World "${worldName}" not found`);
  } catch (error) {
    console.error(`Error loading world "${worldName}":`, error);
    throw error;
  }
}

function getAgentsFromCurrentWorld(): Agent[] {
  return currentWorld ? Array.from(currentWorld.agents.values()) : [];
}

function getAgentFromCurrentWorld(agentName: string): Agent | null {
  if (!currentWorld) return null;
  const agentId = toKebabCase(agentName);
  return currentWorld.agents.get(agentId) || null;
}

async function broadcastMessageToCurrentWorld(message: string, sender: string): Promise<void> {
  if (!currentWorld) throw new Error('No world loaded');
  publishMessage(currentWorld, message, sender);
}
// Load agents and display initial welcome
async function loadAgents(worldName: string): Promise<void> {
  try {
    await loadWorldByName(worldName);
    const agents = Array.from(currentWorld!.agents.values());
    const agentCount = agents.length;

    displayUnifiedMessage({
      type: 'instruction',
      content: `Agent World CLI - ${worldName}

${agentCount === 0 ? 'No agents found. Use /add <name> to create your first agent.' :
          `${agentCount} agent${agentCount === 1 ? '' : 's'} available. Use /agents to list them.`}

Type /help for available commands or start typing to broadcast a message.`,
      metadata: { source: 'cli', messageType: 'command' }
    });
  } catch (error) {
    displayUnifiedMessage({
      type: 'error',
      content: `Failed to load agents: ${error}`,
      metadata: { source: 'cli', messageType: 'error' }
    });
    console.error('Failed to load agents during CLI startup:', error);
    throw error;
  }
}

// Command registry
const commands: Record<string, (args: string[], world: World) => Promise<void>> = {
  add: addCommand,
  agents: listCommand,
  clear: clearCommand,
  export: exportCommand,
  help: helpCommand,
  show: showCommand,
  stop: stopCommand,
  use: useCommand,
  quit: quitCommand,
};

// Interactive world selection
async function selectWorldInteractively(worlds: string[]): Promise<string> {
  console.log('Multiple worlds found:');
  worlds.forEach((world, index) => {
    console.log(`  ${index + 1}. ${world}`);
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    const askForSelection = () => {
      rl.question(`Select a world (1-${worlds.length}): `, (answer) => {
        const selection = parseInt(answer || '');

        if (isNaN(selection) || selection < 1 || selection > worlds.length) {
          console.log('Invalid selection. Please try again.');
          askForSelection();
          return;
        }

        rl.close();
        resolve(worlds[selection - 1]);
      });
    };

    askForSelection();
  });
}

// Token estimation for streaming display
async function estimateInputTokens(agentName: string): Promise<number> {
  try {
    const agent = getAgentFromCurrentWorld(agentName);
    if (!agent) return 50;

    const systemPrompt = agent.systemPrompt || '';
    const conversationHistory = agent.memory.slice(-10);

    // Token estimation: ~0.75 tokens per word
    const systemPromptTokens = Math.ceil(systemPrompt.split(/\s+/).length * 0.75);
    const conversationTokens = conversationHistory.reduce((total: number, msg) => {
      return total + Math.ceil(msg.content.split(/\s+/).length * 0.75);
    }, 0 as number);

    return Math.max(50, systemPromptTokens + conversationTokens + 50);
  } catch (error) {
    return 50;
  }
}

async function main() {
  // Detect piped input first
  const hasPipedInputDetected = await detectPipedInput();

  // Set piped input state in display module
  setIsPipedInput(hasPipedInputDetected);

  // Initialize simple terminal (inline)
  if (!hasPipedInputDetected) {
    process.stdout.write('\x1b[?25l'); // Hide cursor for streaming
  }

  // Create simple terminal object for display compatibility
  const term = {
    write: (text: string) => process.stdout.write(text),
    clear: () => process.stdout.write('\x1b[2J\x1b[H'),
    showCursor: () => process.stdout.write('\x1b[?25h'),
    hideCursor: () => process.stdout.write('\x1b[?25l')
  };

  initializeDisplay(term);

  // Setup graceful shutdown handlers (inline)
  const shutdown = async () => {
    await performShutdown();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Load worlds with smart selection (also initializes file storage)
  const { worlds, action, defaultWorld } = await loadWorldsWithSmartSelection();

  let worldName: string;
  const rootPath = process.env.AGENT_WORLD_DATA_PATH || './data/worlds';

  switch (action) {
    case 'create':
      // No worlds found - create default world
      const newWorld = await createWorld(rootPath, { name: DEFAULT_WORLD_NAME });
      worldName = newWorld.name;
      currentWorld = newWorld;
      break;

    case 'use':
      // One world found - use it automatically
      await loadWorldByName(defaultWorld!);
      worldName = defaultWorld!;
      break;

    case 'select':
      // Multiple worlds found - let user pick
      const selectedWorld = await selectWorldInteractively(worlds);
      await loadWorldByName(selectedWorld);
      worldName = selectedWorld;
      break;

    default:
      throw new Error('Unexpected world loading action');
  }

  // Set world name in streaming display
  setCurrentWorldName(worldName);

  // Load agents and display current state
  await loadAgents(worldName);

  // Handle external input (piped or CLI arguments)
  let hasExternalInput = false;
  let externalMessage = '';

  if (hasPipedInputDetected) {
    hasExternalInput = true;
    externalMessage = await readPipedInput();
  } else {
    // Check for command line arguments
    const args = process.argv.slice(2);
    if (args.length > 0) {
      hasExternalInput = true;
      externalMessage = args.join(' ');
    }
  }

  // Setup graceful shutdown (after hasPipedInputDetected is defined)
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  if (hasPipedInputDetected) {
    displayUnifiedMessage({
      type: 'instruction',
      content: 'Note: Interactive mode not available after piped input.',
      metadata: { source: 'cli', messageType: 'notification' }
    });
  }

  // If we have external input, broadcast it
  if (hasExternalInput && externalMessage) {
    displayUnifiedMessage({
      type: 'human',
      content: externalMessage,
      sender: 'you',
      metadata: { source: 'cli', messageType: 'command' }
    });
    try {
      await broadcastMessageToCurrentWorld(externalMessage, 'HUMAN');
    } catch (error) {
      displayUnifiedMessage({
        type: 'error',
        content: `Error broadcasting message: ${error}`,
        metadata: { source: 'cli', messageType: 'error' }
      });
    }
  }

  // Simple readline interface for user input
  if (!hasPipedInputDetected) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    let isPrompting = false;

    const promptUser = () => {
      // Prevent multiple concurrent prompts
      if (isPrompting) return;

      isPrompting = true;
      rl.question('> ', async (input) => {
        isPrompting = false;

        if (!input.trim()) {
          promptUser();
          return;
        }

        if (input.startsWith('/')) {
          // Handle commands
          const parts = input.slice(1).split(' ');
          const commandName = parts[0];
          const commandArgs = parts.slice(1);

          if (commands[commandName]) {
            try {
              await commands[commandName](commandArgs, currentWorld!);
            } catch (error) {
              displayUnifiedMessage({
                type: 'error',
                content: `Error executing command: ${error}`,
                metadata: { source: 'cli', messageType: 'error' }
              });
            }
          } else {
            displayUnifiedMessage({
              type: 'command',
              content: `Unknown command: /${commandName}`,
              commandSubtype: 'warning',
              metadata: { source: 'cli', messageType: 'command' }
            });
            await helpCommand([], currentWorld!);
          }

          // Prompt again after command
          promptUser();
        } else {
          // Broadcast message to all agents
          displayUnifiedMessage({
            type: 'human',
            content: input,
            sender: 'you',
            metadata: { source: 'cli', messageType: 'command' }
          });
          try {
            await broadcastMessageToCurrentWorld(input, 'HUMAN');

            // Check if there are any agents to respond
            const agents = getAgentsFromCurrentWorld();
            if (agents.length === 0) {
              // No agents to respond, prompt immediately
              promptUser();
            } else {
              // Set up fallback in case streaming doesn't start
              setupFallbackPrompt();
            }
            // If there are agents, the streaming end callback will handle prompting
          } catch (error) {
            displayUnifiedMessage({
              type: 'error',
              content: `Error broadcasting message: ${error}`,
              metadata: { source: 'cli', messageType: 'error' }
            });
            // Prompt again after error
            promptUser();
          }

          // Don't prompt immediately after broadcasting - wait for streaming to complete
          // The streaming end callback will handle prompting
        }
      });
    };

    // Set up callback to prompt after streaming completes
    setOnAllStreamingEndCallback(() => {
      // Clear any fallback timeout since streaming completed
      if (fallbackTimeout) {
        clearTimeout(fallbackTimeout);
        fallbackTimeout = null;
      }

      // Add a small delay to ensure display has settled
      setTimeout(() => {
        if (!hasPipedInputDetected) {
          promptUser();
        }
      }, 100);
    });

    // Set up callback when streaming starts to clear fallback
    setOnStreamingStartCallback(() => {
      if (fallbackTimeout) {
        clearTimeout(fallbackTimeout);
        fallbackTimeout = null;
      }
    });

    // Set up a fallback timeout to ensure prompt returns even if no streaming occurs
    let fallbackTimeout: NodeJS.Timeout | null = null;

    const setupFallbackPrompt = () => {
      if (fallbackTimeout) clearTimeout(fallbackTimeout);
      fallbackTimeout = setTimeout(() => {
        if (!isStreamingActive() && !hasPipedInputDetected && !isPrompting) {
          promptUser();
        }
      }, 5000); // 5 second fallback
    };

    // Start the input loop
    promptUser();
  }

  // Subscribe to SSE events for streaming responses
  const unsubscribe = subscribeToSSE(currentWorld!, async (event) => {
    if (event.type === 'start' || event.type === 'chunk' || event.type === 'end' || event.type === 'error') {
      const sseData = event;

      // Get agent name for display
      const agents = getAgentsFromCurrentWorld();
      const agent = agents.find(a => a.name === sseData.agentName);
      const agentName = agent?.name || 'Unknown Agent';

      switch (sseData.type) {
        case 'start':
          const estimatedInputTokens = await estimateInputTokens(sseData.agentName);
          startStreaming(sseData.agentName, agentName, estimatedInputTokens);
          break;
        case 'chunk':
          addStreamingContent(sseData.agentName, sseData.content || '');
          break;
        case 'end':
          // Set usage information before ending streaming
          if (sseData.usage) {
            setStreamingUsage(sseData.agentName, sseData.usage);
          }
          endStreaming(sseData.agentName);
          break;
        case 'error':
          markStreamingError(sseData.agentName);
          break;
      }
    }
  });

  // Subscribe to MESSAGE events for system notifications
  subscribeToMessages(currentWorld!, async (event) => {
    // Display @human messages (e.g., turn limit notifications)
    if (event.content.startsWith('@human')) {
      displayUnifiedMessage({
        type: 'system',
        content: event.content,
        sender: event.sender,
        metadata: { source: 'system', messageType: 'notification' }
      });
    }
  });

  // Handle piped input exit or interactive mode
  handleExternalInputDisplay(hasExternalInput, hasPipedInputDetected);

  if (!hasExternalInput) {
    showInitialPrompt();
    if (!hasPipedInputDetected) {
      setInterval(() => { }, 1000); // Keep process alive
    }
  }
}

// Run the CLI
main().catch((error) => {
  displayUnifiedMessage({
    type: 'error',
    content: `Fatal error: ${error}`,
    metadata: { source: 'cli', messageType: 'error' }
  });
  console.error('Fatal CLI error occurred:', error);
  process.exit(1);
});
