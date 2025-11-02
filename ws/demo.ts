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
 * 
 * Changes:
 * - 2025-11-02: Update to handle clean event structure (eventType at top level, payload contains data directly)
 * - 2025-11-02: Add color-coded world event display matching CLI format
 * - 2025-11-02: Update to handle consolidated event structure (all events wrapped consistently)
 * - 2025-11-02: Update event handler to properly access SSE event fields (agentName, content) from payload
 */

import { createWSClient, AgentWorldWSClient } from './ws-client.js';
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
    // Flattened structure: { type: 'event', eventType: 'world'|'message'|etc, payload: <data> }
    const eventType = event.eventType;
    const payload = event.payload;

    // Debug logging
    if (process.env.DEBUG_EVENTS) {
      console.log('[DEBUG] Raw event:', JSON.stringify(event, null, 2));
      console.log('[DEBUG] eventType:', eventType);
      console.log('[DEBUG] payload:', JSON.stringify(payload, null, 2));
    }

    // Handle different event types
    if (eventType === 'message') {
      // Message event from world (agent or human)
      const sender = payload?.sender || 'unknown';
      const content = payload?.content || '';

      console.log(`\n[${sender}]: ${content}\n`);
    }
    else if (eventType === 'world') {
      // World event (system, tool execution, activity tracking)
      // For world events, payload.type tells us the specific world event type
      const subType = payload?.type;

      // Handle tool events with color formatting
      if (subType === 'tool-start' && payload.toolExecution) {
        const toolName = payload.toolExecution.toolName;
        const agentName = payload.agentName || payload.sender || 'agent';
        console.log(`\n\x1b[36m${agentName}\x1b[0m \x1b[90mcalling tool -\x1b[0m \x1b[33m${toolName}\x1b[0m \x1b[90m...\x1b[0m`);
      }
      else if (subType === 'tool-progress' && payload.toolExecution) {
        const toolName = payload.toolExecution.toolName;
        const agentName = payload.agentName || payload.sender || 'agent';
        console.log(`\x1b[36m${agentName}\x1b[0m \x1b[90mcontinuing tool -\x1b[0m \x1b[33m${toolName}\x1b[0m \x1b[90m...\x1b[0m`);
      }
      else if (subType === 'tool-result' && payload.toolExecution) {
        const { toolName, duration, resultSize } = payload.toolExecution;
        const durationText = duration ? `${Math.round(duration)}ms` : 'completed';
        const sizeText = resultSize ? `, ${resultSize} chars` : '';
        const agentName = payload.agentName || payload.sender || 'agent';
        console.log(`\x1b[36m${agentName}\x1b[0m \x1b[90mtool finished -\x1b[0m \x1b[33m${toolName}\x1b[0m \x1b[90m(${durationText}${sizeText})\x1b[0m`);
      }
      else if (subType === 'tool-error' && payload.toolExecution) {
        const { toolName, error: toolError } = payload.toolExecution;
        const agentName = payload.agentName || payload.sender || 'agent';
        console.log(`\x1b[1m\x1b[31m✗\x1b[0m ${agentName} tool failed - ${toolName}: ${toolError}`);
      }
      // Handle activity events with same format as CLI
      else if (subType === 'response-start' || subType === 'response-end' || subType === 'idle') {
        const source = payload.source || '';
        const pending = payload.pendingOperations || 0;
        const activityId = payload.activityId || 0;
        const activeSources = payload.activeSources || [];
        const sourceName = source.startsWith('agent:') ? source.slice('agent:'.length) : source;

        if (subType === 'response-start') {
          const message = sourceName ? `${sourceName} started processing` : 'started';
          console.log(`\x1b[90m[World]\x1b[0m ${message} \x1b[90m| pending: ${pending} | activityId: ${activityId} | source: ${sourceName}\x1b[0m`);
        } else if (subType === 'idle' && pending === 0) {
          console.log(`\x1b[90m[World]\x1b[0m All processing complete \x1b[90m| pending: ${pending} | activityId: ${activityId} | source: ${sourceName}\x1b[0m`);
        } else if (subType === 'response-end' && pending > 0) {
          if (activeSources.length > 0) {
            const activeList = activeSources.map((s: string) => s.startsWith('agent:') ? s.slice('agent:'.length) : s).join(', ');
            console.log(`\x1b[90m[World]\x1b[0m Active: ${activeList} (${pending} pending) \x1b[90m| pending: ${pending} | activityId: ${activityId} | source: ${sourceName}\x1b[0m`);
          }
        }
      }
      else if (process.env.DEBUG_EVENTS) {
        console.log(`[World Event: ${subType}]`, payload);
      }
    }
    else if (eventType === 'sse') {
      // SSE streaming events - payload contains the SSE event (start, chunk, end, error)
      const sseType = payload?.type;

      if (sseType === 'start') {
        // Stream start - print agent name
        const agentName = payload?.agentName || 'Agent';
        process.stdout.write(`\n[${agentName}]: `);
      }
      else if (sseType === 'chunk') {
        // SSE streaming chunk
        const content = payload?.content || '';
        // Print chunk without newline to accumulate
        if (content) {
          process.stdout.write(content);
        }
      }
      else if (sseType === 'end') {
        // Stream end - add newline
        console.log('\n');
      }
      else if (sseType === 'error') {
        // Stream error
        const error = payload?.error || 'Unknown error';
        console.log(`\n[Error]: ${error}\n`);
      }
    }
    else if (eventType === 'chunk') {
      // DEPRECATED: Legacy SSE chunk event (for backward compatibility)
      // New format uses eventType='sse' with payload.type='chunk'
      const content = payload?.content || '';
      if (content) {
        process.stdout.write(content);
      }
    }
    else if (eventType === 'start') {
      // DEPRECATED: Legacy SSE start event (for backward compatibility)
      const agentName = payload?.agentName || 'Agent';
      process.stdout.write(`\n[${agentName}]: `);
    }
    else if (eventType === 'end') {
      // DEPRECATED: Legacy SSE end event (for backward compatibility)
      console.log('\n');
    }
    else if (eventType === 'error') {
      // DEPRECATED: Legacy SSE error event (for backward compatibility)
      const error = payload?.error || 'Unknown error';
      console.log(`\n[Error]: ${error}\n`);
    }
    else {
      // Other events - log for debugging
      if (process.env.DEBUG_EVENTS) {
        console.log(`[DEBUG] Unknown event type: ${eventType}`, payload);
      }
    }
  });

  client.on('status', (status) => {
    // Show all status updates for debugging
    console.log(`[STATUS: ${status.payload.status.toUpperCase()}]${status.messageId ? ` Message: ${status.messageId}` : ''}`);
    if (status.payload.error) {
      console.log(`  Error: ${status.payload.error}`);
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
