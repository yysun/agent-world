/**
 * getMemory Integration Test
 * 
 * Tests for the getMemory functionality across different storage backends.
 */
import { createStorageWithWrappers } from '../../../core/storage/storage-factory.js';
import type { StorageAPI, World, Agent } from '../../../core/types.js';
import { LLMProvider } from '../../../core/types.js';
import { EventEmitter } from 'events';

describe('getMemory Integration', () => {
  let storage: StorageAPI;

  beforeEach(async () => {
    storage = await createStorageWithWrappers();
  });

  const testWorld: World = {
    id: 'test-world',
    name: 'Test World',
    description: 'A test world',
    turnLimit: 3,
    currentChatId: 'chat-1',
    createdAt: new Date(),
    lastUpdated: new Date(),
    totalAgents: 0,
    totalMessages: 0,
    eventEmitter: new EventEmitter(),
    agents: new Map(),
    chats: new Map()
  };

  test('should aggregate memory across multiple agents', async () => {
    // Setup world
    await storage.saveWorld(testWorld);

    // Create agents with memory
    const agent1: Agent = {
      id: 'agent-1',
      name: 'Agent 1',
      type: 'assistant',
      provider: LLMProvider.OPENAI,
      model: 'gpt-4',
      systemPrompt: 'Test prompt',
      memory: [
        {
          role: 'user',
          content: 'First message',
          sender: 'human',
          createdAt: new Date('2024-01-01T10:00:00Z'),
          chatId: 'chat-1'
        },
        {
          role: 'assistant',
          content: 'First response',
          sender: 'agent-1',
          createdAt: new Date('2024-01-01T10:01:00Z'),
          chatId: 'chat-1'
        }
      ],
      llmCallCount: 0,
      createdAt: new Date(),
      lastActive: new Date()
    };

    const agent2: Agent = {
      id: 'agent-2',
      name: 'Agent 2',
      type: 'assistant',
      provider: LLMProvider.OPENAI,
      model: 'gpt-4',
      systemPrompt: 'Test prompt',
      memory: [
        {
          role: 'user',
          content: 'Second message',
          sender: 'human',
          createdAt: new Date('2024-01-01T10:02:00Z'),
          chatId: 'chat-1'
        },
        {
          role: 'user',
          content: 'Different chat message',
          sender: 'human',
          createdAt: new Date('2024-01-01T10:03:00Z'),
          chatId: 'chat-2'
        }
      ],
      llmCallCount: 0,
      createdAt: new Date(),
      lastActive: new Date()
    };

    await storage.saveAgent('test-world', agent1);
    await storage.saveAgent('test-world', agent2);

    // Test getMemory functionality
    const memoryChat1 = await (storage as any).getMemory('test-world', 'chat-1');
    expect(memoryChat1).toHaveLength(3);
    
    // Should be sorted by createdAt
    expect(memoryChat1[0].content).toBe('First message');
    expect(memoryChat1[1].content).toBe('First response');
    expect(memoryChat1[2].content).toBe('Second message');

    // Test filtering by different chatId
    const memoryChat2 = await (storage as any).getMemory('test-world', 'chat-2');
    expect(memoryChat2).toHaveLength(1);
    expect(memoryChat2[0].content).toBe('Different chat message');

    // Test getting all memory (empty string)
    const allMemory = await (storage as any).getMemory('test-world', '');
    expect(allMemory).toHaveLength(4);
  });

  test('should handle empty results gracefully', async () => {
    // Test non-existent world
    const noMemory = await (storage as any).getMemory('non-existent-world', 'chat-1');
    expect(noMemory).toEqual([]);

    // Test world with no agents
    await storage.saveWorld(testWorld);
    const emptyMemory = await (storage as any).getMemory('test-world', 'chat-1');
    expect(emptyMemory).toEqual([]);
  });

  test('should handle agents with no memory', async () => {
    await storage.saveWorld(testWorld);

    const agentNoMemory: Agent = {
      id: 'agent-no-memory',
      name: 'Agent No Memory',
      type: 'assistant',
      provider: LLMProvider.OPENAI,
      model: 'gpt-4',
      systemPrompt: 'Test prompt',
      memory: [],
      llmCallCount: 0,
      createdAt: new Date(),
      lastActive: new Date()
    };

    await storage.saveAgent('test-world', agentNoMemory);

    const memory = await (storage as any).getMemory('test-world', 'chat-1');
    expect(memory).toEqual([]);
  });
});
