/**
 * WebSocket Client Demo - Interactive Mode
 * 
 * Interactive WebSocket client that:
 * 1. Connects to WebSocket server
 * 2. Prints all incoming WebSocket messages
 * 3. Enters a loop: waits for user input and sends it through WebSocket
 * 
 * Usage: 
 * - Start server: npm run ws
 * - Run demo: npm run demo [worldId] [chatId]
 * - Type messages at prompt, press Enter to send
 * - Type 'exit' or 'quit' to disconnect and exit
 */

import { createWSClient, AgentWorldWSClient } from './client.js';
import * as readline from 'readline';

/**
 * Handle slash commands
 */
async function handleSlashCommand(input: string, worldId: string, chatId: string | undefined, client: AgentWorldWSClient): Promise<void> {
  const parts = input.substring(1).split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1);

  try {
    let result: any;

    switch (cmd) {
      case 'help':
        console.log('\n=== Available Commands ===');
        console.log('World commands:');
        console.log('  /list-worlds          - List all worlds');
        console.log('  /world                - Show current world info');
        console.log('');
        console.log('Agent commands:');
        console.log('  /list-agents          - List agents in current world');
        console.log('  /agent <id>           - Show agent details');
        console.log('');
        console.log('Chat commands:');
        console.log('  /list-chats           - List chats in current world');
        console.log('  /new-chat             - Create new chat');
        console.log('');
        console.log('Export:');
        console.log('  /export               - Export current world to markdown');
        console.log('');
        console.log('Other:');
        console.log('  /help                 - Show this help');
        console.log('  exit, quit            - Exit the program\n');
        break;

      case 'list-worlds':
      case 'worlds':
        result = await client.sendCommand(undefined, 'list-worlds');
        console.log(`\n=== Worlds (${result.length}) ===`);
        result.forEach((w: any) => {
          console.log(`  ${w.id} - ${w.name}`);
        });
        console.log('');
        break;

      case 'world':
        result = await client.sendCommand(worldId, 'get-world');
        const worldAgents = Array.isArray(result.agents)
          ? result.agents
          : (result.agents ? Object.values(result.agents) : []);
        console.log('\n=== World Info ===');
        console.log(`  ID: ${result.id}`);
        console.log(`  Name: ${result.name}`);
        console.log(`  Description: ${result.description || 'N/A'}`);
        console.log(`  Agents: ${worldAgents.length}`);
        if (worldAgents.length === 0) {
          console.log('  ⚠️  WARNING: No agents configured - messages will not be processed!');
        }
        console.log('');
        break;

      case 'list-agents':
      case 'agents':
        result = await client.sendCommand(worldId, 'list-agents');
        console.log(`\n=== Agents (${result.length}) ===`);
        result.forEach((a: any) => {
          console.log(`  ${a.id} - ${a.name}${a.enabled ? '' : ' (disabled)'}`);
        });
        console.log('');
        break;

      case 'agent':
        if (args.length === 0) {
          console.log('[Error] Usage: /agent <agent-id>\n');
          break;
        }
        result = await client.sendCommand(worldId, 'get-agent', { agentId: args[0] });
        console.log('\n=== Agent Info ===');
        console.log(`  ID: ${result.id}`);
        console.log(`  Name: ${result.name}`);
        console.log(`  Enabled: ${result.enabled}`);
        console.log(`  Prompt: ${result.prompt?.substring(0, 100)}...`);
        console.log('');
        break;

      case 'list-chats':
      case 'chats':
        result = await client.sendCommand(worldId, 'list-chats');
        console.log(`\n=== Chats (${result.length}) ===`);
        result.forEach((c: any) => {
          console.log(`  ${c.id} - ${c.name}`);
        });
        console.log('');
        break;

      case 'new-chat':
        result = await client.sendCommand(worldId, 'new-chat');
        console.log(`\n[Created] Chat: ${result.id} - ${result.name}\n`);
        break;

      case 'export':
        result = await client.sendCommand(worldId, 'export-world');
        console.log(`\n[Exported] ${result.length} characters\n`);
        console.log(result.substring(0, 500) + '...\n');
        break;

      default:
        console.log(`[Error] Unknown command: /${cmd}`);
        console.log('Type /help for available commands\n');
    }
  } catch (error) {
    console.error(`[Error] Command failed:`, error instanceof Error ? error.message : error);
    console.log('');
  }
}

/**
 * Select world interactively
 */
async function selectWorld(client: AgentWorldWSClient, rl: readline.Interface): Promise<string> {
  // List available worlds
  const worlds = await client.sendCommand(undefined, 'list-worlds');

  if (worlds.length === 0) {
    throw new Error('No worlds available. Please create a world first.');
  }

  console.log('\n=== Available Worlds ===');
  worlds.forEach((w: any, idx: number) => {
    console.log(`  ${idx + 1}. ${w.id} - ${w.name}`);
  });
  console.log('');

  return new Promise((resolve) => {
    rl.question('Select world (number or ID): ', async (answer) => {
      const input = answer.trim();

      // Check if input is a number
      const num = parseInt(input, 10);
      if (!isNaN(num) && num >= 1 && num <= worlds.length) {
        resolve(worlds[num - 1].id);
        return;
      }

      // Check if input matches a world ID
      const world = worlds.find((w: any) => w.id === input);
      if (world) {
        resolve(world.id);
        return;
      }

      // Default to first world if invalid input
      console.log(`Invalid selection. Using first world: ${worlds[0].id}`);
      resolve(worlds[0].id);
    });
  });
}

/**
 * Setup event listeners for WebSocket messages
 */
function setupClientEventListeners(client: AgentWorldWSClient): void {
  client.on('connecting', () => {
    console.log('[WS] Connecting to server...');
  });

  client.on('connected', () => {
    console.log('[WS] ✓ Connected to server');
  });

  client.on('disconnected', () => {
    console.log('[WS] Disconnected from server');
  });

  client.on('reconnecting', ({ attempt, delay }) => {
    console.log(`[WS] Reconnecting (attempt ${attempt}, delay ${delay}ms)...`);
  });

  client.on('error', (error) => {
    console.error('[WS] Error:', error.message);
  });

  client.on('server-error', (error) => {
    console.error('[WS] Server error:', error.message);
  });

  client.on('event', (event) => {
    // Event payload structure varies by event type
    const payload = event.payload;

    // Determine event type - could be at top level or nested
    const eventType = payload?.type || event.type;

    // Handle different event types
    if (eventType === 'message') {
      // Agent or human message
      const sender = payload?.sender || 'unknown';
      const content = payload?.content || '';

      console.log(`\n[${sender}]: ${content}\n`);
    }
    else if (eventType === 'chunk') {
      // SSE streaming chunk
      const agentName = payload?.agentName || 'Agent';
      const content = payload?.content || '';

      // Print chunk without newline to accumulate
      if (content) {
        process.stdout.write(content);
      }
    }
    else if (eventType === 'start') {
      // Stream start - print agent name
      const agentName = payload?.agentName || 'Agent';
      process.stdout.write(`\n[${agentName}]: `);
    }
    else if (eventType === 'end') {
      // Stream end - add newline
      console.log('\n');
    }
    else if (eventType === 'error') {
      // Stream error
      const error = payload?.error || 'Unknown error';
      console.log(`\n[Error]: ${error}\n`);
    }
    else if (eventType === 'response-start' || eventType === 'response-end' || eventType === 'idle') {
      // Activity tracking events - suppress for cleaner output
    }
    else if (eventType === 'event') {
      // Generic event wrapper - suppress
    }
    else {
      // Other unknown events - suppress for cleaner output
    }
  });

  client.on('status', (status) => {
    // Only show important status updates
    if (status.payload.status === 'processing' || status.payload.status === 'completed' || status.payload.status === 'failed') {
      console.log(`[${status.payload.status.toUpperCase()}]${status.messageId ? ` Message: ${status.messageId}` : ''}`);
      if (status.payload.error) {
        console.log(`  Error: ${status.payload.error}`);
      }
    }
  });
}

async function demo() {
  console.log('=== Agent World WebSocket Interactive Client ===\n');

  // Create client
  const client = createWSClient({
    url: 'ws://localhost:3001',
    autoReconnect: true,
    reconnectDelay: 1000,
    maxReconnectDelay: 10000
  });

  // Setup event listeners
  setupClientEventListeners(client);

  try {
    // 1. Connect to WebSocket server
    console.log('Connecting to WebSocket server...');
    await client.connect();
    console.log(`Connected (state: ${client.getState()})\n`);

    // 2. Create readline interface for world selection
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    // 3. Select world (either from args or interactively)
    let worldId: string;
    let chatId: string | undefined = process.argv[3];

    if (process.argv[2]) {
      worldId = process.argv[2];
      console.log(`Using world from command line: ${worldId}\n`);
    } else {
      worldId = await selectWorld(client, rl);
      console.log(`\nSelected world: ${worldId}\n`);
    }

    // 4. Load and display world info
    console.log('Loading world...');
    const worldInfo = await client.sendCommand(worldId, 'get-world');
    console.log(`✓ World loaded: ${worldInfo.name}`);

    // Convert agents object to array if needed
    const agents = Array.isArray(worldInfo.agents)
      ? worldInfo.agents
      : (worldInfo.agents ? Object.values(worldInfo.agents) : []);

    console.log(`  Agents: ${agents.length}`);

    if (agents.length === 0) {
      console.log('\n⚠️  WARNING: This world has no agents configured!');
      console.log('    Messages will be queued but no agents will respond.');
      console.log('    Use the CLI to add agents: npm run cli -- create-agent ' + worldId + ' --name "Agent Name"\n');
    } else {
      console.log('  Agents:');
      agents.forEach((a: any) => {
        const statusInfo = a.status === 'error' ? ' [error]' : '';
        console.log(`    - ${a.name} (${a.id})${statusInfo}`);
      });
      console.log('');
    }

    // 5. Subscribe to world
    console.log(`Subscribing to world events${chatId ? ` (chat: ${chatId})` : ''}...`);
    await client.subscribe(worldId, chatId);
    console.log('✓ Subscribed\n');

    // 6. Enter interactive loop
    rl.setPrompt('> ');
    console.log('--- Interactive Mode ---');
    console.log('Type your message and press Enter to send.');
    console.log('Type /help for commands, or "exit"/"quit" to disconnect.\n');

    rl.prompt();

    rl.on('line', async (line) => {
      const input = line.trim();

      if (input === 'exit' || input === 'quit') {
        console.log('\nExiting...');
        rl.close();
        return;
      }

      if (input) {
        try {
          // Check if input is a slash command
          if (input.startsWith('/')) {
            await handleSlashCommand(input, worldId, chatId, client);
          } else {
            // Regular message - send to agent processing queue
            const messageId = await client.sendMessage(worldId, input, chatId);
            console.log(`[Sent] Message ID: ${messageId}\n`);
          }
        } catch (error) {
          console.error('[Error] Failed to send:', error);
        }
      }

      rl.prompt();
    });

    rl.on('close', async () => {
      console.log('\nCleaning up...');
      await client.disconnect();
      console.log('Disconnected. Goodbye!\n');
      process.exit(0);
    });

  } catch (error) {
    console.error('\n[Demo Error]:', error);
    client.disconnect();
    process.exit(1);
  }
}

// Run demo
demo().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
