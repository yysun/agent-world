/**
 * WebSocket Client Demo
 * 
 * Demonstrates the complete async world processing workflow:
 * 1. Connect to WebSocket server
 * 2. Subscribe to world events
 * 3. Send a message
 * 4. Receive real-time event updates
 * 5. Handle completion
 * 
 * Usage: npm run ws (in one terminal), then run this demo
 */

import { createWSClient, ConnectionState } from './client.js';

async function demo() {
  console.log('=== Agent World WebSocket Client Demo ===\n');

  // Create client
  const client = createWSClient({
    url: 'ws://localhost:3001',
    autoReconnect: true,
    reconnectDelay: 1000,
    maxReconnectDelay: 10000
  });

  // Connection event handlers
  client.on('connecting', () => {
    console.log('[Client] Connecting to server...');
  });

  client.on('connected', () => {
    console.log('[Client] ✓ Connected to server\n');
  });

  client.on('disconnected', () => {
    console.log('[Client] Disconnected from server');
  });

  client.on('reconnecting', ({ attempt, delay }) => {
    console.log(`[Client] Reconnecting (attempt ${attempt}, delay ${delay}ms)...`);
  });

  client.on('error', (error) => {
    console.error('[Client] Error:', error.message);
  });

  client.on('server-error', (error) => {
    console.error('[Client] Server error:', error.message);
  });

  // Event handlers
  client.on('event', (event) => {
    console.log(`[Event] ${event.payload.type} (seq: ${event.seq})`);
    if (event.payload.payload) {
      console.log('  Data:', JSON.stringify(event.payload.payload, null, 2));
    }
  });

  client.on('status', (status) => {
    console.log(`[Status] ${status.payload.status}`, status.messageId ? `(message: ${status.messageId})` : '');
  });

  try {
    // 1. Connect
    console.log('Step 1: Connecting to WebSocket server...');
    await client.connect();
    console.log(`State: ${client.getState()}\n`);

    // 2. Subscribe to world
    const worldId = process.argv[2] || 'default-world';
    const chatId = process.argv[3];

    console.log(`Step 2: Subscribing to world "${worldId}"${chatId ? ` (chat: ${chatId})` : ''}...`);
    await client.subscribe(worldId, chatId);
    console.log('✓ Subscribed\n');

    // 3. Send a message
    const message = process.argv[4] || 'Hello from WebSocket client!';
    console.log(`Step 3: Sending message: "${message}"...`);
    const messageId = await client.sendMessage(worldId, message, chatId);
    console.log(`✓ Message queued (ID: ${messageId})\n`);

    console.log('Step 4: Waiting for events and completion...\n');
    console.log('--- Event Stream ---\n');

    // Wait for completion
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        console.log('\n[Timeout] No completion received within 60 seconds');
        resolve();
      }, 60000);

      client.on('status', (status) => {
        if (status.messageId === messageId && status.payload.status === 'completed') {
          clearTimeout(timeout);
          console.log('\n--- Event Stream Complete ---\n');
          console.log('✓ Message processing completed!');
          resolve();
        } else if (status.messageId === messageId && status.payload.status === 'failed') {
          clearTimeout(timeout);
          console.log('\n--- Event Stream Complete ---\n');
          console.log('✗ Message processing failed:', status.payload.error);
          resolve();
        }
      });
    });

    // 5. Show final state
    console.log(`\nFinal state: ${client.getState()}`);
    console.log(`Active subscriptions: ${client.getSubscriptions().length}`);

    // Optional: Unsubscribe and disconnect
    console.log('\nStep 5: Cleaning up...');
    await client.unsubscribe(worldId, chatId);
    client.disconnect();
    console.log('✓ Disconnected\n');

    console.log('=== Demo Complete ===');
    process.exit(0);

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
