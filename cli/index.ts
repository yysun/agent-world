/**
 * CLI Interface - Interactive Command Line Tool with Real-time Agent Streaming
 * 
 * Core Features:
 * - Interactive command interface (/agents, /show, /add, /help, etc.)
 * - External input handling (piped input and CLI args as broadcast messages)
 * - Real-time streaming with visual indicators and token tracking
 * - Multi-agent concurrent streaming with dedicated display management
 * - Modular terminal UI with separated display, lifecycle, and coordination concerns
 * - World integration for agent loading, persistence, and message broadcasting
 * - Graceful shutdown and cleanup handling
 * 
 * Architecture:
 * - Function-based design with modular UI components (ui/terminal-display.ts, ui/terminal-lifecycle.ts, ui/display-manager.ts)
 * - Terminal-kit integration with dynamic import for ES module compatibility
 * - Command routing with direct core module function imports
 * - SSE event subscription for real-time agent response streaming
 * - External input processing for both piped and CLI argument inputs
 * - Separated concerns: display logic, terminal lifecycle, and display coordination
 * - Global world object management for efficient access during program execution
 * 
 * UI Architecture:
 * - terminal-display.ts: Input box drawing, positioning, and visibility management
 * - terminal-lifecycle.ts: Terminal setup, shutdown, signal handling, and piped input detection
 * - display-manager.ts: Coordination between streaming, input prompts, and exit timing
 * - streaming-display.ts: Real-time streaming content and agent response management
 * - unified-display.ts: Consistent message formatting and spacing across all display types
 * 
 * Migration Changes:
 * - Migrated from src/ to core/ module architecture
 * - Implemented ID-based operations with name-to-ID conversion
 * - Added global world object management for program execution
 * - Smart world selection with automatic world discovery and selection
 * - Object-based data access for agent system prompts and memory
 * - World-specific event subscriptions replacing global event bus
 * - Preserved all existing CLI functionality and user experience
 */

// npm run dev || echo "Test completed"
// echo "final piped test" | npx tsx cli/index.ts

// Set the data path for core modules
if (!process.env.AGENT_WORLD_DATA_PATH) {
  process.env.AGENT_WORLD_DATA_PATH = './data/worlds';
}

// Core module imports
import { createWorld, getWorld, listWorlds } from '../core/world-manager';
import { getAgent } from '../core/agent-manager';
import { publishMessage, subscribeToSSE, subscribeToMessages } from '../core/world-events';
import { EventType, SSEEventPayload, SystemEventPayload, MessageEventPayload, World, Agent } from '../core/types';
import { toKebabCase } from '../core/utils';

// CLI command imports - MIGRATED TO CORE MODULES ✅
import { addCommand } from './commands/add';
import { clearCommand } from './commands/clear';
import { exportCommand } from './commands/export';
// import { helpCommand } from './commands/help'; // TODO: Implement help command
// import { listCommand } from './commands/list'; // TODO: Implement list command (use /agents instead)
import { showCommand } from './commands/show';
import { stopCommand } from './commands/stop';
import { useCommand } from './commands/use';

// Remove temporary stub implementations (no longer needed)
// Basic help command implementation
const helpCommand = async (args: string[], world: World) => {
  displayUnifiedMessage({
    type: 'instruction',
    content: `Agent World CLI - Core Module Architecture
    
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

Current world: ${world.name}
Type messages to broadcast to all agents, or use commands above.`,
    metadata: { source: 'cli', messageType: 'command' }
  });
};

// Basic list command implementation  
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
      const agentList = agents.map(agent => {
        const memoryCount = agent.memory ? agent.memory.length : 0;
        const statusText = agent.status || 'active';
        return `• ${agent.name} (${agent.type}) - ${statusText} - ${memoryCount} messages`;
      }).join('\n');

      const totalMessages = agents.reduce((total, agent) => total + (agent.memory ? agent.memory.length : 0), 0);

      displayUnifiedMessage({
        type: 'instruction',
        content: `Agents in current world:\n${agentList}\n\nTotal: ${agents.length} agents, ${totalMessages} messages in memory`,
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

// UI module imports
import { colors } from './ui/colors';
import * as StreamingDisplay from './ui/streaming-display';
import { displayUnifiedMessage, setCurrentWorldName } from './ui/unified-display';
import {
  initializeTerminalDisplay,
  hideInputBox,
  showInputPrompt
} from './ui/terminal-display';
import {
  initializeTerminal,
  setupShutdownHandlers,
  getTerminal,
  detectPipedInput,
  readPipedInput,
  performShutdown,
  hasPipedInput
} from './ui/terminal-lifecycle';
import {
  setupStreamingEndCallback,
  handleExternalInputDisplay,
  showInitialPrompt,
  handlePostCommandDisplay,
  handlePostBroadcastDisplay
} from './ui/display-manager';

// Global constants
const DEFAULT_WORLD_NAME = 'Default World';

// Global world object for program execution
let currentWorld: World | null = null;

// Helper function to get root directory path
function getRootPath(): string {
  return process.env.AGENT_WORLD_DATA_PATH || './data/worlds';
}

// Smart world selection - equivalent to loadWorlds() from src
async function loadWorldsWithSmartSelection(): Promise<{ worlds: string[], action: string, defaultWorld?: string }> {
  try {
    const worldInfos = await listWorlds(getRootPath());
    const worlds = worldInfos.map(info => info.name);

    if (worlds.length === 0) {
      return { worlds: [], action: 'create' };
    } else if (worlds.length === 1) {
      return { worlds, action: 'use', defaultWorld: worlds[0] };
    } else {
      return { worlds, action: 'select' };
    }
  } catch (error) {
    console.error('Error loading worlds:', error);
    return { worlds: [], action: 'create' };
  }
}

// Load world by name and set as current global world
async function loadWorldByName(worldName: string): Promise<void> {
  try {
    const worldId = toKebabCase(worldName);
    currentWorld = await getWorld(getRootPath(), worldId);

    if (!currentWorld) {
      throw new Error(`World "${worldName}" not found`);
    }

    // Agents are automatically loaded by getWorld() - no need for loadAgentsIntoWorld()
  } catch (error) {
    console.error(`Error loading world "${worldName}":`, error);
    throw error;
  }
}

// Get agents from current world
function getAgentsFromCurrentWorld(): Agent[] {
  if (!currentWorld) {
    return [];
  }
  return Array.from(currentWorld.agents.values());
}

// Get single agent from current world by name
function getAgentFromCurrentWorld(agentName: string): Agent | null {
  if (!currentWorld) {
    return null;
  }

  const agentId = toKebabCase(agentName);
  return currentWorld.agents.get(agentId) || null;
}

// Broadcast message using current world
async function broadcastMessageToCurrentWorld(message: string, sender: string): Promise<void> {
  if (!currentWorld) {
    throw new Error('No world loaded');
  }

  publishMessage(currentWorld, message, sender);
}
// Load agents and display current state
async function loadAgents(worldName: string): Promise<void> {
  try {
    // Load world by name and set as current
    await loadWorldByName(worldName);

    await listCommand([], currentWorld!); // Display loaded agents
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

// Quit command implementation
async function quitCommand(args: string[], world: World): Promise<void> {
  displayUnifiedMessage({
    type: 'instruction',
    content: 'Goodbye! 👋',
    metadata: { source: 'cli', messageType: 'command' }
  });
  process.exit(0);
}

// Command registry - Updated to pass World objects instead of worldName strings
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
  const term = getTerminal();
  return new Promise((resolve) => {
    displayUnifiedMessage({
      type: 'instruction',
      content: 'Multiple worlds found:\n' + worlds.map((world, index) => `  ${index + 1}. ${world}`).join('\n'),
      metadata: { source: 'cli', messageType: 'command' }
    });

    let input = '';

    const handleKey = (name: string, matches: any, data: any) => {
      if (name === 'ENTER') {
        const selection = parseInt(input.trim());

        if (isNaN(selection) || selection < 1 || selection > worlds.length) {
          displayUnifiedMessage({
            type: 'command',
            content: 'Invalid selection. Please try again.',
            commandSubtype: 'warning',
            metadata: { source: 'cli', messageType: 'command' }
          });
          console.log(colors.cyan(`\nSelect a world (1-${worlds.length}): `));
          input = '';
          return;
        }

        term.removeAllListeners('key');
        resolve(worlds[selection - 1]);
      } else if (name === 'BACKSPACE') {
        if (input.length > 0) {
          input = input.slice(0, -1);
          process.stdout.write('\b \b');
        }
      } else if (data.isCharacter) {
        input += String.fromCharCode(data.codepoint);
        process.stdout.write(String.fromCharCode(data.codepoint));
      }
    };

    term.on('key', handleKey);
    console.log(colors.cyan(`\nSelect a world (1-${worlds.length}): `));
  });
}

// Estimate input tokens for streaming display
async function estimateInputTokens(agentName: string, worldName: string): Promise<number> {
  try {
    const agent = getAgentFromCurrentWorld(agentName);
    if (!agent) return 50;

    // Load system prompt from agent config and recent conversation history from memory
    const systemPrompt = agent.systemPrompt || '';
    const conversationHistory = agent.memory.slice(-10); // Get last 10 messages

    // Token estimation: ~0.75 tokens per word
    const systemPromptTokens = Math.ceil(systemPrompt.split(/\s+/).length * 0.75);
    const conversationTokens = conversationHistory.reduce((total: number, msg) => {
      return total + Math.ceil(msg.content.split(/\s+/).length * 0.75);
    }, 0 as number);

    // Add buffer for formatting and context
    return Math.max(50, systemPromptTokens + conversationTokens + 50);
  } catch (error) {
    return 50;
  }
}

async function main() {
  // Detect piped input first
  const hasPipedInputDetected = await detectPipedInput();

  // Initialize terminal
  const term = await initializeTerminal(hasPipedInputDetected);
  initializeTerminalDisplay(term);

  // Setup graceful shutdown handlers
  setupShutdownHandlers();

  // Load worlds with smart selection (also initializes file storage)
  const { worlds, action, defaultWorld } = await loadWorldsWithSmartSelection();

  let worldName: string;

  switch (action) {
    case 'create':
      // No worlds found - create default world
      const newWorld = await createWorld(getRootPath(), { name: DEFAULT_WORLD_NAME });
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

  // Set up callback to show prompt when streaming ends
  setupStreamingEndCallback();

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
  const shutdown = async () => {
    await performShutdown();
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Create terminal-kit input interface
  let inputHandler: any;
  let currentInput = '';

  if (hasPipedInputDetected) {
    displayUnifiedMessage({
      type: 'instruction',
      content: 'Note: Interactive mode not available after piped input.',
      metadata: { source: 'cli', messageType: 'notification' }
    });
  } else {
    // Terminal is already initialized for interactive mode in initializeTerminal()
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

  // Handle input with terminal-kit
  if (!hasPipedInputDetected) {
    const term = getTerminal();
    term.on('key', async (name: string, matches: any, data: any) => {
      if (name === 'CTRL_C') {
        await shutdown();
        return;
      }

      if (name === 'ENTER') {
        const trimmedInput = currentInput.trim();
        currentInput = '';

        if (!trimmedInput) {
          showInputPrompt('> ', '');
          return;
        }

        // Hide the input box immediately after Enter is pressed
        hideInputBox();

        if (trimmedInput.startsWith('/')) {
          // Handle commands
          const parts = trimmedInput.slice(1).split(' ');
          const commandName = parts[0];
          const commandArgs = parts.slice(1);

          if (commands[commandName]) {
            try {
              await commands[commandName](commandArgs, currentWorld!);

              // Auto-run /agents command after clear command to show updated state
              if (commandName === 'clear') {
                await listCommand([], currentWorld!);
              }
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

          // Reset position and show input prompt immediately after command execution
          handlePostCommandDisplay();
        } else {
          // Broadcast message to all agents
          displayUnifiedMessage({
            type: 'human',
            content: trimmedInput,
            sender: 'you',
            metadata: { source: 'cli', messageType: 'command' }
          });
          try {
            await broadcastMessageToCurrentWorld(trimmedInput, 'HUMAN');
          } catch (error) {
            displayUnifiedMessage({
              type: 'error',
              content: `Error broadcasting message: ${error}`,
              metadata: { source: 'cli', messageType: 'error' }
            });
          }

          // For broadcast messages, wait for streaming to complete or show prompt if no streaming
          handlePostBroadcastDisplay();
        }

      } else if (name === 'BACKSPACE') {
        if (currentInput.length > 0) {
          currentInput = currentInput.slice(0, -1);
          showInputPrompt('> ', currentInput);
        }
      } else if (data.isCharacter) {
        currentInput += String.fromCharCode(data.codepoint);
        showInputPrompt('> ', currentInput);
      }
    });
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
          const estimatedInputTokens = await estimateInputTokens(sseData.agentName, worldName);
          StreamingDisplay.startStreaming(sseData.agentName, agentName, estimatedInputTokens);
          break;
        case 'chunk':
          StreamingDisplay.addStreamingContent(sseData.agentName, sseData.content || '');
          break;
        case 'end':
          // Set usage information before ending streaming
          if (sseData.usage) {
            StreamingDisplay.setStreamingUsage(sseData.agentName, sseData.usage);
            StreamingDisplay.updateFinalPreview(sseData.agentName);
          }
          StreamingDisplay.endStreaming(sseData.agentName);
          break;
        case 'error':
          StreamingDisplay.markStreamingError(sseData.agentName);
          break;
      }
    }
  });

  // Subscribe to SYSTEM events for debug messages (not available in core, using message events instead)
  // subscribeToSystem(async (event) => {
  //   if (event.type === EventType.SYSTEM) {
  //     const systemData = event.payload as SystemEventPayload;
  //     if (systemData.action === 'debug' && systemData.content) {
  //       StreamingDisplay.displayDebugMessage(colors.gray(systemData.content));
  //     }
  //   }
  // });

  // Subscribe to MESSAGE events for system notifications
  subscribeToMessages(currentWorld!, async (event) => {
    // Display @human messages (e.g., turn limit notifications)
    if (event.content.startsWith('@human')) {
      // Convert to MessageEventPayload format for display
      const messageData: MessageEventPayload = {
        content: event.content,
        sender: event.sender
      };
      StreamingDisplay.displayMessage(messageData);
    }
  });

  // Handle piped input exit or show prompt
  handleExternalInputDisplay(hasExternalInput, hasPipedInputDetected);

  if (!hasExternalInput) {
    showInitialPrompt();

    // Keep the process alive for interactive mode
    if (!hasPipedInputDetected) {
      setInterval(() => { }, 1000);
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
