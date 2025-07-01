/**
 * WebSocket Integration Tests for Server Commands
 * 
 * Comprehensive test suite for WebSocket server commands with real connection testing,
 * world/agent lifecycle management, command validation, and error handling.
 * 
 * Test Coverage: Connection/subscription, world commands (getWorlds, getWorld, addWorld, updateWorld),
 * agent commands (addAgent, updateAgentConfig, updateAgentPrompt, updateAgentMemory), clear functionality,
 * error handling and validation, world refresh after modifications.
 * 
 * Protocol: Inbound { type: "subscribe"|"system", payload: {...} }, 
 * Outbound { type: "success", message, data: commandResult, timestamp }
 * 
 * Implementation: Uses isolated test data directory with automatic setup/cleanup.
 * Consolidated helper functions reduce code duplication and improve maintainability.
 */

import WebSocket from 'ws';
import { createServer, Server } from 'http';
import { createWorld } from '../core/world-manager.js';
import { promises as fs } from 'fs';

// Test configuration
const TEST_PORT = 3000;
const TEST_DATA_PATH = './data/worlds';
const TEST_WORLD_NAME = 'test-world';
const TEST_AGENT_NAME = 'test-agent';

let server: Server;
let wsServer: any;

// Setup test environment
async function setupTestEnvironment(): Promise<void> {
  // Clean up and create test data directory
  try {
    await fs.rm(TEST_DATA_PATH, { recursive: true, force: true });
  } catch (error) {
    // Directory doesn't exist, ignore
  }
  await fs.mkdir(TEST_DATA_PATH, { recursive: true });

  // Import and setup WebSocket server
  const { createWebSocketServer } = await import('./ws.js');
  server = createServer();
  wsServer = createWebSocketServer(server);

  // Start server
  await new Promise<void>((resolve) => {
    server.listen(TEST_PORT, resolve);
  });

  console.log(`Test server started on port ${TEST_PORT}`);
}

// Cleanup test environment
async function cleanupTestEnvironment(): Promise<void> {
  if (server) {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }

  try {
    await fs.rm(TEST_DATA_PATH, { recursive: true, force: true });
  } catch (error) {
    console.warn('Failed to clean up test data:', error);
  }

  console.log('Test environment cleaned up');
}

// Helper functions
function createWebSocketConnection(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${TEST_PORT}`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

function sendCommand(ws: WebSocket, command: string, worldName: string = TEST_WORLD_NAME): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Command timeout')), 1000);

    ws.once('message', (data) => {
      clearTimeout(timeout);
      try {
        resolve(JSON.parse(data.toString()));
      } catch (error) {
        reject(error);
      }
    });

    ws.send(JSON.stringify({
      type: 'system',
      payload: { worldName, message: command }
    }));
  });
}

function subscribeToWorld(ws: WebSocket, worldName: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Subscription timeout')), 5000);

    ws.once('message', (data) => {
      clearTimeout(timeout);
      try {
        resolve(JSON.parse(data.toString()));
      } catch (error) {
        reject(error);
      }
    });

    ws.send(JSON.stringify({
      type: 'subscribe',
      payload: { worldName }
    }));
  });
}

// Helper to setup connection and subscription for tests
async function setupTestConnection(): Promise<WebSocket> {
  const ws = await createWebSocketConnection();
  // Skip connected message
  await new Promise((resolve) => ws.once('message', resolve));
  await subscribeToWorld(ws, TEST_WORLD_NAME);
  return ws;
}

// Validation helpers
function validateSuccessResponse(response: any, dataRequired: boolean = true): void {
  if (response.type !== 'success') {
    throw new Error(`Expected success response, got: ${JSON.stringify(response)}`);
  }
  if (dataRequired && !response.data) {
    throw new Error('Success response should include data');
  }
}

function validateCommandSuccess(response: any, confirmationText?: string): void {
  validateSuccessResponse(response);
  if (confirmationText && !response.message?.includes('executed successfully') &&
    !response.data.content?.includes(confirmationText)) {
    throw new Error(`Command should confirm: ${confirmationText}`);
  }
}

function validateErrorResponse(response: any, errorText: string): void {
  if (response.type !== 'success' || response.message !== 'Command failed') {
    throw new Error('Error should return success with "Command failed" message');
  }
  if (response.data?.type !== 'error' || !response.data?.error?.includes(errorText)) {
    throw new Error(`Error should contain: ${errorText}`);
  }
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

  // Basic connection test
  await test('Basic WebSocket connection', async () => {
    const ws = await createWebSocketConnection();
    if (ws.readyState !== ws.OPEN) {
      throw new Error('WebSocket connection failed');
    }
    ws.close();
  });

  // Create test world
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

  // World subscription
  await test('World subscription', async () => {
    const ws = await createWebSocketConnection();
    await new Promise((resolve) => ws.once('message', resolve)); // Skip connected message

    console.log(`Attempting to subscribe to world: ${TEST_WORLD_NAME}`);
    const response = await subscribeToWorld(ws, TEST_WORLD_NAME);
    console.log('Subscription response:', response);

    if (response.type !== 'success' || response.data?.worldName !== TEST_WORLD_NAME) {
      throw new Error(`Failed to subscribe to world. Response: ${JSON.stringify(response)}`);
    }
    ws.close();
  });

  // World commands
  await test('getWorlds command', async () => {
    const ws = await setupTestConnection();
    const response = await sendCommand(ws, '/getWorlds');

    validateSuccessResponse(response);
    if (!Array.isArray(response.data.data)) {
      throw new Error('getWorlds should return data.data array');
    }

    const testWorldExists = response.data.data.some((world: any) => world.name === TEST_WORLD_NAME);
    if (!testWorldExists) {
      throw new Error('Test world not found in worlds list');
    }
    ws.close();
  });

  await test('getWorld command', async () => {
    const ws = await setupTestConnection();
    const response = await sendCommand(ws, '/getWorld');

    validateSuccessResponse(response);
    if (response.data.data.name !== TEST_WORLD_NAME) {
      throw new Error('getWorld returned wrong world');
    }
    ws.close();
  });

  // Agent commands
  await test('addAgent command', async () => {
    const ws = await setupTestConnection();
    const response = await sendCommand(ws, `/addAgent ${TEST_AGENT_NAME} A helpful test agent`);

    validateSuccessResponse(response);
    if (response.data.data.name !== TEST_AGENT_NAME) {
      throw new Error('addAgent returned wrong agent name');
    }
    if (!response.data.refreshWorld) {
      throw new Error('addAgent should trigger world refresh');
    }
    ws.close();
  });

  await test('Verify agent creation', async () => {
    const ws = await setupTestConnection();
    const response = await sendCommand(ws, '/getWorld');

    validateSuccessResponse(response);
    if (!response.data.data.agents) {
      throw new Error('getWorld should return agents array');
    }

    const testAgentExists = response.data.data.agents.some((agent: any) => agent.name === TEST_AGENT_NAME);
    if (!testAgentExists) {
      throw new Error('Test agent not found in world');
    }
    ws.close();
  });

  await test('updateAgentConfig command', async () => {
    const ws = await setupTestConnection();
    const response = await sendCommand(ws, `/updateAgentConfig ${TEST_AGENT_NAME} model gpt-4`);
    validateCommandSuccess(response, 'model updated');
    ws.close();
  });

  await test('updateAgentPrompt command', async () => {
    const ws = await setupTestConnection();
    const response = await sendCommand(ws, `/updateAgentPrompt ${TEST_AGENT_NAME} You are a helpful test assistant with updated instructions.`);
    validateCommandSuccess(response, 'prompt updated');
    ws.close();
  });

  await test('updateAgentMemory add command', async () => {
    const ws = await setupTestConnection();
    const response = await sendCommand(ws, `/updateAgentMemory ${TEST_AGENT_NAME} add user Hello test agent!`);
    validateCommandSuccess(response, 'Message added');
    ws.close();
  });

  await test('clear specific agent command', async () => {
    const ws = await setupTestConnection();
    const response = await sendCommand(ws, `/clear ${TEST_AGENT_NAME}`);
    validateCommandSuccess(response, 'Cleared memory');
    ws.close();
  });

  await test('addWorld command', async () => {
    const ws = await setupTestConnection();
    const response = await sendCommand(ws, `/addWorld new-test-world A second test world`);

    validateSuccessResponse(response);
    if (response.data.data.name !== 'new-test-world') {
      throw new Error('addWorld returned wrong world name');
    }
    ws.close();
  });

  await test('updateWorld command', async () => {
    const ws = await setupTestConnection();
    const response = await sendCommand(ws, '/updateWorld description Updated test world description');
    validateCommandSuccess(response, 'description updated');
    ws.close();
  });

  // Error handling tests
  await test('Error handling for invalid command', async () => {
    const ws = await setupTestConnection();
    const response = await sendCommand(ws, '/invalidCommand');
    console.log('Invalid command response:', JSON.stringify(response, null, 2));
    validateErrorResponse(response, 'Unknown command');
    ws.close();
  });

  await test('Error handling for missing arguments', async () => {
    const ws = await setupTestConnection();
    const response = await sendCommand(ws, '/updateAgentConfig');
    console.log('Missing args response:', JSON.stringify(response, null, 2));
    validateErrorResponse(response, 'Missing required arguments');
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
