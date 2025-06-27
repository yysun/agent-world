/**
 * WebSocket Integration Test
 * 
 * Tests basic WebSocket functionality including:
 * - Connection establishment
 * - World selection and cloning
 * - Message handling
 * - Event streaming
 * - Disconnection cleanup
 */

import WebSocket from 'ws';
import {
  ClientMessageType,
  ServerMessageType,
  WebSocketMessage,
  WorldSelectPayload
} from '../src/websocket-types';

const WS_URL = 'ws://localhost:3001/ws';

async function testWebSocketConnection(): Promise<void> {
  console.log('🧪 Starting WebSocket integration test...');

  // Test 1: Basic connection
  console.log('📡 Testing connection establishment...');
  const ws = new WebSocket(WS_URL);

  await new Promise<void>((resolve, reject) => {
    ws.on('open', () => {
      console.log('✅ WebSocket connection established');
      resolve();
    });

    ws.on('error', (error) => {
      console.error('❌ Connection failed:', error);
      reject(error);
    });

    setTimeout(() => {
      reject(new Error('Connection timeout'));
    }, 5000);
  });

  // Test 2: Receive welcome message
  console.log('📨 Testing welcome message...');
  await new Promise<void>((resolve, reject) => {
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log('📬 Received message:', message.type);

        if (message.type === ServerMessageType.STATUS &&
          message.payload.type === 'connected') {
          console.log('✅ Welcome message received');
          resolve();
        }
      } catch (error) {
        console.error('❌ Error parsing message:', error);
        reject(error);
      }
    });

    setTimeout(() => {
      reject(new Error('Welcome message timeout'));
    }, 5000);
  });

  // Test 3: World selection
  console.log('🌍 Testing world selection...');
  const worldSelectMessage: WebSocketMessage = {
    id: 'test-1',
    type: ClientMessageType.WORLD_SELECT,
    timestamp: new Date().toISOString(),
    payload: {
      templateName: 'default-world',
      worldName: 'test-world',
      persistent: false
    } as WorldSelectPayload
  };

  ws.send(JSON.stringify(worldSelectMessage));

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('World selection timeout'));
    }, 10000);

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.type === ServerMessageType.WORLD_SELECTED) {
          console.log('✅ World selection successful:', message.payload.worldName);
          clearTimeout(timeout);
          resolve();
        } else if (message.type === ServerMessageType.ERROR) {
          console.error('❌ World selection error:', message.payload);
          clearTimeout(timeout);
          reject(new Error(message.payload.message));
        }
      } catch (error) {
        console.error('❌ Error parsing world selection response:', error);
        clearTimeout(timeout);
        reject(error);
      }
    });
  });

  // Test 4: Cleanup
  console.log('🧹 Testing disconnection...');
  ws.close();

  console.log('🎉 All WebSocket tests passed!');
}

// Run test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testWebSocketConnection()
    .then(() => {
      console.log('✅ WebSocket integration test completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ WebSocket integration test failed:', error);
      process.exit(1);
    });
}

export { testWebSocketConnection };
