/**
 * Storage Factory for Tests
 * 
 * Purpose: Provide factory functions for creating in-memory storage instances
 * 
 * Features:
 * - Creates real MemoryStorage instances (not mocks)
 * - Pre-populated storage for common test scenarios
 * - Consistent data patterns across tests
 * - Easy cleanup and reset
 * 
 * Usage:
 * ```typescript
 * import { createTestStorage, createStorageWithWorld } from '../helpers/storage-factory';
 * 
 * test('my test', async () => {
 *   const storage = createTestStorage();
 *   // ... test code
 * });
 * 
 * test('with world', async () => {
 *   const { storage, worldId } = await createStorageWithWorld();
 *   // ... test code
 * });
 * ```
 * 
 * Changes:
 * - 2025-11-07: Initial implementation for test deduplication
 */

import { MemoryStorage } from '../../core/storage/memory-storage.js';
import type { StorageAPI, World, Agent, Chat } from '../../core/types.js';
import { LLMProvider } from '../../core/types.js';

/**
 * Create a clean in-memory storage instance
 */
export function createTestStorage(): StorageAPI {
  return new MemoryStorage();
}

/**
 * Create a test world object with default values
 */
export function createTestWorldData(overrides: Partial<World> = {}): World {
  const now = new Date();
  return {
    id: `test-world-${Date.now()}`,
    name: 'Test World',
    description: 'A test world',
    turnLimit: 5,
    chatLLMProvider: 'openai',
    chatLLMModel: 'gpt-4',
    currentChatId: null,
    mcpConfig: null,
    isProcessing: false,
    createdAt: now,
    lastUpdated: now,
    totalAgents: 0,
    totalMessages: 0,
    ...overrides
  } as World;
}

/**
 * Create a test agent object with default values
 */
export function createTestAgentData(overrides: Partial<Agent> = {}): Agent {
  const now = new Date();
  return {
    id: `test-agent-${Date.now()}`,
    name: 'Test Agent',
    type: 'assistant',
    status: 'active',
    provider: LLMProvider.OPENAI,
    model: 'gpt-4',
    systemPrompt: 'You are a helpful assistant.',
    temperature: 0.7,
    maxTokens: 1000,
    createdAt: now,
    lastActive: now,
    llmCallCount: 0,
    memory: [],
    ...overrides
  };
}

/**
 * Create a test chat object with default values
 */
export function createTestChatData(worldId: string, overrides: Partial<Chat> = {}): Chat {
  const now = new Date();
  return {
    id: `test-chat-${Date.now()}`,
    worldId,
    name: 'Test Chat',
    description: 'A test chat',
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
    ...overrides
  };
}

/**
 * Create storage with a pre-populated world
 */
export async function createStorageWithWorld(
  worldData?: Partial<World>
): Promise<{ storage: StorageAPI; worldId: string; world: World }> {
  const storage = createTestStorage();
  const world = createTestWorldData(worldData);
  await storage.saveWorld(world);

  return { storage, worldId: world.id, world };
}

/**
 * Create storage with world and agents
 */
export async function createStorageWithAgents(
  agentCount: number = 1,
  worldData?: Partial<World>
): Promise<{
  storage: StorageAPI;
  worldId: string;
  world: World;
  agents: Agent[];
}> {
  const { storage, worldId, world } = await createStorageWithWorld(worldData);
  const agents: Agent[] = [];

  for (let i = 0; i < agentCount; i++) {
    const agent = createTestAgentData({
      id: `agent-${i + 1}`,
      name: `Agent ${i + 1}`
    });
    await storage.saveAgent(worldId, agent);
    agents.push(agent);
  }

  return { storage, worldId, world, agents };
}

/**
 * Create storage with world, agents, and chat
 */
export async function createStorageWithChat(
  agentCount: number = 1,
  worldData?: Partial<World>
): Promise<{
  storage: StorageAPI;
  worldId: string;
  world: World;
  agents: Agent[];
  chatId: string;
  chat: Chat;
}> {
  const { storage, worldId, world, agents } = await createStorageWithAgents(
    agentCount,
    worldData
  );

  const chat = createTestChatData(worldId);
  await storage.saveChatData(worldId, chat);

  // Update world with current chat
  world.currentChatId = chat.id;
  await storage.saveWorld(world);

  return { storage, worldId, world, agents, chatId: chat.id, chat };
}

/**
 * Reset storage by clearing all data
 */
export async function resetStorage(storage: StorageAPI): Promise<void> {
  if (storage instanceof MemoryStorage) {
    await storage.clear();
  } else {
    throw new Error('resetStorage only works with MemoryStorage instances');
  }
}
