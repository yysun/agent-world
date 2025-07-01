/**
 * WebSocket Integration Tests for Server Commands
 * 
 * Features:
 * - Integration tests for all WebSocket server commands
 * - Real WebSocket connection testing with ws library
 * - World and agent lifecycle testing
 * - Command validation and error handling tests
 * - Cleanup and teardown management
 * 
 * Test Coverage:
 * - Connection and subscription management
 * - World commands: getWorlds, getWorld, addWorld, updateWorld
 * - Agent commands: addAgent, updateAgentConfig, updateAgentPrompt, updateAgentMemory
 * - Clear command functionality
 * - Error handling and validation
 * - World refresh after modifications
 * 
 * Test Data:
 * - Uses test-data directory for isolated testing
 * - Creates and cleans up test worlds and agents
 * - Validates command responses and data integrity
 */

import WebSocket from 'ws';
import { createServer, Server } from 'http';
import { createWorld, deleteWorld, listWorlds } from '../core/world-manager.js';
import { promises as fs } from 'fs';
import path from 'path';

// Test configuration
const TEST_PORT = 3000;
const TEST_DATA_PATH = './data/worlds'; // Use the same path as WebSocket server
const TEST_WORLD_NAME = 'test-world';
const TEST_AGENT_NAME = 'test-agent';

let server: Server;
let wsServer: any;

// Setup test environment
async function setupTestEnvironment(): Promise<void> {
  // Clean up any existing test data
  try {
    await fs.rm(TEST_DATA_PATH, { recursive: true, force: true });
  } catch (error) {
    // Directory doesn't exist, which is fine
  }

  // Create test data directory
  await fs.mkdir(TEST_DATA_PATH, { recursive: true });

  // Import WebSocket server (use default path)
  const { createWebSocketServer } = await import('./ws.js');

  // Create HTTP server
  server = createServer();

  // Setup WebSocket server (no custom root path)
  wsServer = createWebSocketServer(server);

  // Start server
  await new Promise<void>((resolve) => {
    server.listen(TEST_PORT, resolve);
  });

  console.log(`Test server started on port ${TEST_PORT}`);
}

// Cleanup test environment
async function cleanupTestEnvironment(): Promise<void> {
  // Close server
  if (server) {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }

  // Clean up test data
  try {
    await fs.rm(TEST_DATA_PATH, { recursive: true, force: true });
  } catch (error) {
    console.warn('Failed to clean up test data:', error);
  }

  console.log('Test environment cleaned up');
}

// Helper function to create WebSocket connection
function createWebSocketConnection(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${TEST_PORT}`);

    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

// Helper function to send command and wait for response
function sendCommand(ws: WebSocket, command: string, worldName: string = TEST_WORLD_NAME): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Command timeout'));
    }, 5000);

    ws.once('message', (data) => {
      clearTimeout(timeout);
      try {
        const response = JSON.parse(data.toString());
        resolve(response);
      } catch (error) {
        reject(error);
      }
    });

    ws.send(JSON.stringify({
      type: 'system',
      payload: {
        worldName: worldName,
        message: command
      }
    }));
  });
}

// Helper function to subscribe to world
function subscribeToWorld(ws: WebSocket, worldName: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Subscription timeout'));
    }, 5000);

    ws.once('message', (data) => {
      clearTimeout(timeout);
      try {
        const response = JSON.parse(data.toString());
        resolve(response);
      } catch (error) {
        reject(error);
      }
    });

    ws.send(JSON.stringify({
      type: 'subscribe',
      payload: {
        worldName: worldName
      }
    }));
  });
}

// Test cases
async function runTests(): Promise<void> {
  console.log('Starting WebSocket integration tests...\n');

  let testCount = 0;
  let passedCount = 0;

  const test = async (name: string, testFn: () => Promise<void>) => {
    testCount++;
    try {
      console.log(`🧪 Test ${testCount}: ${name}`);
      await testFn();
      passedCount++;
      console.log(`✅ PASSED\n`);
    } catch (error) {
      console.log(`❌ FAILED: ${error}\n`);
    }
  };

  // Test 1: Basic connection and welcome
  await test('Basic WebSocket connection', async () => {
    const ws = await createWebSocketConnection();

    // Wait for welcome message
    const welcome = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('No welcome message')), 2000);
      ws.once('message', (data) => {
        clearTimeout(timeout);
        try {
          const parsed = JSON.parse(data.toString());
          console.log('Welcome message received:', parsed);
          resolve(parsed);
        } catch (error) {
          reject(error);
        }
      });
    });

    if ((welcome as any).type !== 'welcome') {
      throw new Error(`Expected welcome message, got: ${JSON.stringify(welcome)}`);
    }

    ws.close();
  });

  // Test 2: Create test world first
  await test('Create test world', async () => {
    const testWorld = await createWorld(TEST_DATA_PATH, {
      name: TEST_WORLD_NAME,
      description: 'Test world for WebSocket tests',
      turnLimit: 5
    });

    if (!testWorld || testWorld.name !== TEST_WORLD_NAME) {
      throw new Error('Failed to create test world');
    }
  });

  // Test 3: World subscription
  await test('World subscription', async () => {
    const ws = await createWebSocketConnection();

    // Skip welcome message
    await new Promise((resolve) => {
      ws.once('message', resolve);
    });

    console.log(`Attempting to subscribe to world: ${TEST_WORLD_NAME}`);
    console.log(`Test data path: ${TEST_DATA_PATH}`);

    const response = await subscribeToWorld(ws, TEST_WORLD_NAME);
    console.log('Subscription response:', response);

    if (response.type !== 'subscribed' || response.worldName !== TEST_WORLD_NAME) {
      throw new Error(`Failed to subscribe to world. Response: ${JSON.stringify(response)}`);
    }

    ws.close();
  });

  // Test 4: getWorlds command
  await test('getWorlds command', async () => {
    const ws = await createWebSocketConnection();

    // Skip welcome and subscription
    await new Promise((resolve) => {
      ws.once('message', resolve);
    });
    await subscribeToWorld(ws, TEST_WORLD_NAME);

    // Don't pass TEST_DATA_PATH since the helper function will add ROOT_PATH automatically
    const response = await sendCommand(ws, '/getWorlds');
    console.log('getWorlds response:', response);

    if (response.type !== 'data' || !Array.isArray(response.data)) {
      throw new Error(`getWorlds should return data array. Response: ${JSON.stringify(response)}`);
    }

    const testWorldExists = response.data.some((world: any) => world.name === TEST_WORLD_NAME);
    if (!testWorldExists) {
      throw new Error('Test world not found in worlds list');
    }

    ws.close();
  });

  // Test 5: getWorld command
  await test('getWorld command', async () => {
    const ws = await createWebSocketConnection();

    // Skip welcome and subscription
    await new Promise((resolve) => {
      ws.once('message', resolve);
    });
    await subscribeToWorld(ws, TEST_WORLD_NAME);

    const response = await sendCommand(ws, '/getWorld');

    if (response.type !== 'data' || !response.data) {
      throw new Error('getWorld should return data object');
    }

    if (response.data.name !== TEST_WORLD_NAME) {
      throw new Error('getWorld returned wrong world');
    }

    ws.close();
  });

  // Test 6: addAgent command
  await test('addAgent command', async () => {
    const ws = await createWebSocketConnection();

    // Skip welcome and subscription
    await new Promise((resolve) => {
      ws.once('message', resolve);
    });
    await subscribeToWorld(ws, TEST_WORLD_NAME);

    const response = await sendCommand(ws, `/addAgent ${TEST_AGENT_NAME} A helpful test agent`);

    if (response.type !== 'data' || !response.data) {
      throw new Error('addAgent should return data object');
    }

    if (response.data.name !== TEST_AGENT_NAME) {
      throw new Error('addAgent returned wrong agent name');
    }

    if (!response.refreshWorld) {
      throw new Error('addAgent should trigger world refresh');
    }

    ws.close();
  });

  // Test 7: Verify agent was created with getWorld
  await test('Verify agent creation', async () => {
    const ws = await createWebSocketConnection();

    // Skip welcome and subscription
    await new Promise((resolve) => {
      ws.once('message', resolve);
    });
    await subscribeToWorld(ws, TEST_WORLD_NAME);

    const response = await sendCommand(ws, '/getWorld');

    if (response.type !== 'data' || !response.data.agents) {
      throw new Error('getWorld should return agents array');
    }

    const testAgentExists = response.data.agents.some((agent: any) => agent.name === TEST_AGENT_NAME);
    if (!testAgentExists) {
      throw new Error('Test agent not found in world');
    }

    ws.close();
  });

  // Test 8: updateAgentConfig command
  await test('updateAgentConfig command', async () => {
    const ws = await createWebSocketConnection();

    // Skip welcome and subscription
    await new Promise((resolve) => {
      ws.once('message', resolve);
    });
    await subscribeToWorld(ws, TEST_WORLD_NAME);

    const response = await sendCommand(ws, `/updateAgentConfig ${TEST_AGENT_NAME} model gpt-4`);

    if (response.type !== 'system') {
      throw new Error('updateAgentConfig should return system response');
    }

    if (!response.content?.includes('model updated')) {
      throw new Error('updateAgentConfig should confirm model update');
    }

    ws.close();
  });

  // Test 9: updateAgentPrompt command
  await test('updateAgentPrompt command', async () => {
    const ws = await createWebSocketConnection();

    // Skip welcome and subscription
    await new Promise((resolve) => {
      ws.once('message', resolve);
    });
    await subscribeToWorld(ws, TEST_WORLD_NAME);

    const response = await sendCommand(ws, `/updateAgentPrompt ${TEST_AGENT_NAME} You are a helpful test assistant with updated instructions.`);

    if (response.type !== 'system') {
      throw new Error('updateAgentPrompt should return system response');
    }

    if (!response.content?.includes('prompt updated')) {
      throw new Error('updateAgentPrompt should confirm prompt update');
    }

    ws.close();
  });

  // Test 10: updateAgentMemory add command
  await test('updateAgentMemory add command', async () => {
    const ws = await createWebSocketConnection();

    // Skip welcome and subscription
    await new Promise((resolve) => {
      ws.once('message', resolve);
    });
    await subscribeToWorld(ws, TEST_WORLD_NAME);

    const response = await sendCommand(ws, `/updateAgentMemory ${TEST_AGENT_NAME} add user Hello test agent!`);

    if (response.type !== 'system') {
      throw new Error('updateAgentMemory should return system response');
    }

    if (!response.content?.includes('Message added')) {
      throw new Error('updateAgentMemory should confirm message addition');
    }

    ws.close();
  });

  // Test 11: clear command (specific agent)
  await test('clear specific agent command', async () => {
    const ws = await createWebSocketConnection();

    // Skip welcome and subscription
    await new Promise((resolve) => {
      ws.once('message', resolve);
    });
    await subscribeToWorld(ws, TEST_WORLD_NAME);

    const response = await sendCommand(ws, `/clear ${TEST_AGENT_NAME}`);

    if (response.type !== 'system') {
      throw new Error('clear should return system response');
    }

    if (!response.content?.includes('Cleared memory')) {
      throw new Error('clear should confirm memory cleared');
    }

    ws.close();
  });

  // Test 12: addWorld command
  await test('addWorld command', async () => {
    const ws = await createWebSocketConnection();

    // Skip welcome and subscription
    await new Promise((resolve) => {
      ws.once('message', resolve);
    });
    await subscribeToWorld(ws, TEST_WORLD_NAME);

    // Don't pass TEST_DATA_PATH since the helper function will add ROOT_PATH automatically
    const response = await sendCommand(ws, `/addWorld new-test-world A second test world`);

    if (response.type !== 'data' || !response.data) {
      throw new Error('addWorld should return data object');
    }

    if (response.data.name !== 'new-test-world') {
      throw new Error('addWorld returned wrong world name');
    }

    ws.close();
  });

  // Test 13: updateWorld command
  await test('updateWorld command', async () => {
    const ws = await createWebSocketConnection();

    // Skip welcome and subscription
    await new Promise((resolve) => {
      ws.once('message', resolve);
    });
    await subscribeToWorld(ws, TEST_WORLD_NAME);

    const response = await sendCommand(ws, '/updateWorld description Updated test world description');

    if (response.type !== 'system') {
      throw new Error('updateWorld should return system response');
    }

    if (!response.content?.includes('description updated')) {
      throw new Error('updateWorld should confirm description update');
    }

    ws.close();
  });

  // Test 14: Error handling for invalid commands
  await test('Error handling for invalid command', async () => {
    const ws = await createWebSocketConnection();

    // Skip welcome and subscription
    await new Promise((resolve) => {
      ws.once('message', resolve);
    });
    await subscribeToWorld(ws, TEST_WORLD_NAME);

    const response = await sendCommand(ws, '/invalidCommand');

    if (response.type !== 'error') {
      throw new Error('Invalid command should return error');
    }

    if (!response.error?.includes('Unknown command')) {
      throw new Error('Invalid command should return unknown command error');
    }

    ws.close();
  });

  // Test 15: Error handling for missing arguments
  await test('Error handling for missing arguments', async () => {
    const ws = await createWebSocketConnection();

    // Skip welcome and subscription
    await new Promise((resolve) => {
      ws.once('message', resolve);
    });
    await subscribeToWorld(ws, TEST_WORLD_NAME);

    // Test a command that doesn't get ROOT_PATH automatically added and requires arguments
    const response = await sendCommand(ws, '/updateAgentConfig');

    if (response.type !== 'error') {
      throw new Error('Command with missing args should return error');
    }

    if (!response.error?.includes('Missing required arguments')) {
      throw new Error('Missing args should return appropriate error');
    }

    ws.close();
  });

  // Print test results
  console.log(`\n📊 Test Results: ${passedCount}/${testCount} tests passed`);

  if (passedCount === testCount) {
    console.log('🎉 All tests passed!');
  } else {
    console.log(`❌ ${testCount - passedCount} tests failed`);
    process.exit(1);
  }
}

// Main test runner
async function main(): Promise<void> {
  try {
    await setupTestEnvironment();
    await runTests();
  } catch (error) {
    console.error('Test setup failed:', error);
    process.exit(1);
  } finally {
    await cleanupTestEnvironment();
  }
}

// Export for use as module or run directly
export { runTests, setupTestEnvironment, cleanupTestEnvironment };

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
