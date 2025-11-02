/**
 * WebSocket Integration Test - CRUD and Export Operations
 *
 * Purpose: End-to-end WebSocket server testing with manual server startup
 *
 * Features:
 * - Connects to manually started WS server (AGENT_WORLD_STORAGE_TYPE=memory)
 * - Tests World, Agent, and Chat CRUD operations via WebSocket commands
 * - Tests world export and verification
 * - No message processing or LLM integration required
 *
 * Prerequisites:
 * - Start WS server manually: AGENT_WORLD_STORAGE_TYPE=memory npm run ws:watch
 *
 * Test Flow:
 * 1. Setup: Connect to running WS server
 * 2. World CRUD: Create, list, get world via WebSocket commands
 * 3. Chat CRUD: List, create, delete chats via WebSocket commands
 * 4. Agent CRUD: Create, list, get, delete agents via WebSocket commands
 * 5. Export: Export world and verify structure (config, agents, chats)
 * 6. Cleanup: Delete world and close WebSocket connection
 *
 * Implementation:
 * - WebSocket commands for all CRUD operations
 * - No LLM or message processing dependencies
 * - Comprehensive assertions for each operation
 *
 * Changes:
 * - 2025-11-01: Initial WebSocket integration test
 * - 2025-11-02: Remove automatic server lifecycle, require manual startup
 * - 2025-11-02: Remove message processing tests, focus on CRUD and export
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import WebSocket from 'ws';

// Test configuration
const WS_PORT = 3001;
const WS_URL = `ws://localhost:${WS_PORT}`;
const TEST_WORLD_ID = 'ws-test-world';
const TEST_TIMEOUT = 10000; // 10 seconds for CRUD operations

interface WSMessage {
  type: string;
  worldId?: string;
  chatId?: string;
  messageId?: string;
  seq?: number;
  payload?: any;
  error?: string;
  timestamp?: number;
}

describe('WebSocket Integration Tests', () => {
  let ws: WebSocket;
  let currentChatId: string | null = null;

  // Helper to send CLI command via WebSocket
  async function sendCommand(command: string, params: any = {}, worldId?: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timeout waiting for command: ${command}`));
      }, 10000);

      const messageHandler = (data: Buffer) => {
        try {
          const response: WSMessage = JSON.parse(data.toString());

          if (response.type === 'status' && response.payload?.command === command) {
            clearTimeout(timeout);
            ws.off('message', messageHandler);
            resolve(response.payload);
          }
        } catch (error) {
          // Ignore parse errors, keep waiting
        }
      };

      ws.on('message', messageHandler);
      ws.send(JSON.stringify({
        type: 'command',
        worldId,
        payload: {
          command,
          params
        }
      }));
    });
  }

  beforeAll(async () => {
    // Connect to manually started WS server
    ws = new WebSocket(WS_URL);

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Failed to connect to WS server. Please ensure the server is running with: npm run ws:watch'));
      }, 5000);

      ws.on('open', () => {
        clearTimeout(timeout);
        resolve(undefined);
      });

      ws.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }, TEST_TIMEOUT);

  afterAll(async () => {
    // Close WebSocket connection
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  });

  describe('World CRUD Operations', () => {
    it('should create a new world', async () => {
      // Try to delete if it already exists (cleanup from previous runs)
      try {
        await sendCommand('delete-world', {}, TEST_WORLD_ID);
      } catch (error) {
        // Ignore if world doesn't exist
      }

      const response = await sendCommand('create-world', {
        name: TEST_WORLD_ID,
        description: 'WebSocket integration test world',
        turnLimit: 5
      });

      expect(response.status).toBe('success');
      expect(response.data).toBeDefined();
      expect(response.data.id).toBe(TEST_WORLD_ID);
    }, TEST_TIMEOUT);

    it('should list worlds and find the created world', async () => {
      const response = await sendCommand('list-worlds');

      expect(response.status).toBe('success');
      expect(response.data).toBeDefined();
      expect(Array.isArray(response.data)).toBe(true);
      expect(response.data.some((w: any) => w.id === TEST_WORLD_ID)).toBe(true);
    });

    it('should get the created world', async () => {
      const response = await sendCommand('get-world', {}, TEST_WORLD_ID);

      expect(response.status).toBe('success');
      expect(response.data).toBeDefined();
      expect(response.data.id).toBe(TEST_WORLD_ID);
      expect(response.data.name).toBe(TEST_WORLD_ID);
    });
  });

  describe('Chat CRUD Operations', () => {
    it('should list chats (should have default "New Chat")', async () => {
      const response = await sendCommand('list-chats', {}, TEST_WORLD_ID);

      expect(response.status).toBe('success');
      expect(response.data).toBeDefined();
      expect(Array.isArray(response.data)).toBe(true);
      expect(response.data.length).toBeGreaterThan(0);

      // Store current chat ID
      currentChatId = response.data[0].id;
    });

    it('should create a new chat', async () => {
      const response = await sendCommand('new-chat', {}, TEST_WORLD_ID);

      expect(response.status).toBe('success');
      expect(response.data).toBeDefined();
      expect(response.data.id).toBeDefined();

      // Update current chat ID
      currentChatId = response.data.id;
    });

    it('should delete a chat', async () => {
      // Create a chat to delete
      const createResponse = await sendCommand('new-chat', {}, TEST_WORLD_ID);
      const chatIdToDelete = createResponse.data.id;

      // Delete it
      const deleteResponse = await sendCommand('delete-chat', {
        chatId: chatIdToDelete
      }, TEST_WORLD_ID);

      expect(deleteResponse.status).toBe('success');
    });
  }); describe('Agent CRUD Operations', () => {
    it('should create agent "alice"', async () => {
      const response = await sendCommand('create-agent', {
        id: 'alice',
        name: 'Alice',
        type: 'assistant',
        provider: 'ollama',
        model: 'llama3.2:3b',
        systemPrompt: 'You are Alice, a helpful assistant. Keep responses brief.',
        temperature: 0.7,
        maxTokens: 100
      }, TEST_WORLD_ID);

      expect(response.status).toBe('success');
      expect(response.data).toBeDefined();
      expect(response.data.id).toBe('alice');
    });

    it('should create agent "bob"', async () => {
      const response = await sendCommand('create-agent', {
        id: 'bob',
        name: 'Bob',
        type: 'analyst',
        provider: 'ollama',
        model: 'llama3.2:3b',
        systemPrompt: 'You are Bob, an analytical assistant. Keep responses brief.',
        temperature: 0.5,
        maxTokens: 100
      }, TEST_WORLD_ID);

      expect(response.status).toBe('success');
      expect(response.data).toBeDefined();
      expect(response.data.id).toBe('bob');
    });

    it('should list agents and find both created agents', async () => {
      const response = await sendCommand('list-agents', {}, TEST_WORLD_ID);

      expect(response.status).toBe('success');
      expect(response.data).toBeDefined();
      expect(Array.isArray(response.data)).toBe(true);
      expect(response.data.length).toBe(2);
      expect(response.data.some((a: any) => a.id === 'alice')).toBe(true);
      expect(response.data.some((a: any) => a.id === 'bob')).toBe(true);
    });

    it('should get agent "alice"', async () => {
      const response = await sendCommand('get-agent', {
        agentId: 'alice'
      }, TEST_WORLD_ID);

      expect(response.status).toBe('success');
      expect(response.data).toBeDefined();
      expect(response.data.id).toBe('alice');
      expect(response.data.name).toBe('Alice');
      expect(response.data.model).toBe('llama3.2:3b');
    });

    it('should delete agent "bob"', async () => {
      // Delete bob
      const deleteResponse = await sendCommand('delete-agent', {
        agentId: 'bob'
      }, TEST_WORLD_ID);

      expect(deleteResponse.status).toBe('success');
    });
  });

  describe('Export and Verification', () => {
    it('should export world to markdown', async () => {
      const response = await sendCommand('export-world', {}, TEST_WORLD_ID);

      expect(response.status).toBe('success');
      expect(response.data).toBeDefined();
      expect(typeof response.data).toBe('string');
      expect(response.data.length).toBeGreaterThan(0);
    });

    it('should verify export contains world configuration', async () => {
      const response = await sendCommand('export-world', {}, TEST_WORLD_ID);
      const markdown = response.data;

      expect(markdown).toContain('# World Export:');
      expect(markdown).toContain(TEST_WORLD_ID);
      expect(markdown).toContain('## World Configuration');
      expect(markdown).toContain('WebSocket integration test world');
      expect(markdown).toContain('Turn Limit');
    });

    it('should verify export contains agents', async () => {
      const response = await sendCommand('export-world', {}, TEST_WORLD_ID);
      const markdown = response.data;

      expect(markdown).toContain('## Agents');
      expect(markdown).toContain('Alice');
      // Bob was deleted in previous test, so we only check for Alice
      expect(markdown).toContain('llama3.2:3b');
    });

    it('should verify export contains current chat', async () => {
      const response = await sendCommand('export-world', {}, TEST_WORLD_ID);
      const markdown = response.data;

      expect(markdown).toContain('## Current Chat');
    });
  });

  describe('Cleanup Operations', () => {
    it('should delete test world', async () => {
      const response = await sendCommand('delete-world', {}, TEST_WORLD_ID);
      expect(response.status).toBe('success');
    });
  });
});
