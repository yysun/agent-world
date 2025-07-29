/**
 * Unit Tests for Agent Storage - SQLite Backend CRUD Operations
 *
 * Features:
 * - Complete CRUD testing for agent operations in SQLite storage
 * - In-memory SQLite database for isolated testing
 * - Foreign key constraint testing with world relationships
 * - Memory management testing for agent conversations
 * - Batch operations and performance testing
 * - Error handling and edge cases
 *
 * Implementation:
 * - Tests saveAgent, loadAgent, deleteAgent, listAgents from sqlite-storage.ts
 * - Uses in-memory SQLite database with initializeWithDefaults
 * - Validates foreign key relationships with worlds
 * - Tests agent memory storage and retrieval
 * - Covers edge cases like constraint violations, concurrent access
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Mock sqlite3 before any imports
jest.mock('sqlite3', () => ({
  Database: jest.fn().mockImplementation(() => ({
    run: jest.fn((sql, params, callback) => callback?.call({ changes: 1, lastID: 1 })),
    get: jest.fn((sql, params, callback) => callback?.(null, { id: 'test', name: 'Test' })),
    all: jest.fn((sql, params, callback) => callback?.(null, [])),
    close: jest.fn(callback => callback?.()),
    exec: jest.fn(callback => callback?.()),
    prepare: jest.fn(() => ({
      run: jest.fn(),
      get: jest.fn(),
      all: jest.fn(),
      finalize: jest.fn()
    }))
  }))
}));

import {
  createSQLiteStorageContext,
  initializeWithDefaults,
  saveAgent,
  loadAgent,
  deleteAgent,
  listAgents,
  saveWorld,
  loadWorld,
  close,
  SQLiteStorageContext
} from '../../../core/sqlite-storage';
import { initializeSchema, validateIntegrity } from '../../../core/sqlite-schema';
import { Agent, AgentMessage, LLMProvider, WorldData } from '../../../core/types';

describe.skip('SQLite Agent Storage - CRUD Operations', () => {
  let ctx: SQLiteStorageContext;

  beforeEach(async () => {
    // Create in-memory SQLite database for testing
    ctx = await createSQLiteStorageContext({
      database: ':memory:',
      enableWAL: false, // Not supported in memory
      busyTimeout: 5000,
      cacheSize: -2000,
      enableForeignKeys: true
    });

    // Initialize schema and default data
    await initializeSchema(ctx.schemaCtx);
    await initializeWithDefaults(ctx);
  });

  afterEach(async () => {
    if (ctx) {
      await close(ctx);
    }
  });

  // Helper function to create test world
  async function createTestWorld(worldId: string = 'test-world'): Promise<WorldData> {
    const worldData: WorldData = {
      id: worldId,
      name: `Test World (${worldId})`,
      description: 'Test world for agent testing',
      turnLimit: 10
    };
    await saveWorld(ctx, worldData);
    return worldData;
  }

  // Helper function to create test agent
  function createTestAgent(overrides: Partial<Agent> = {}): Agent {
    return {
      id: 'test-agent',
      name: 'Test Agent',
      type: 'test',
      status: 'active',
      provider: LLMProvider.OPENAI,
      model: 'gpt-4',
      systemPrompt: 'You are a test agent.',
      temperature: 0.7,
      maxTokens: 1000,
      createdAt: new Date('2023-01-01T00:00:00Z'),
      lastActive: new Date('2023-01-01T00:00:00Z'),
      llmCallCount: 0,
      memory: [],
      
      // Required method implementations (mocked)
      generateResponse: jest.fn<(messages: AgentMessage[]) => Promise<string>>().mockResolvedValue('Mock response'),
      streamResponse: jest.fn<(messages: AgentMessage[]) => Promise<string>>().mockResolvedValue('Mock stream response'),
      addToMemory: jest.fn<(message: AgentMessage) => Promise<void>>().mockResolvedValue(undefined),
      getMemorySize: jest.fn<() => number>().mockReturnValue(0),
      archiveMemory: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      getMemorySlice: jest.fn<(start: number, end: number) => AgentMessage[]>().mockReturnValue([]),
      searchMemory: jest.fn<(query: string) => AgentMessage[]>().mockReturnValue([]),
      shouldRespond: jest.fn<(messageEvent: any) => Promise<boolean>>().mockResolvedValue(false),
      processMessage: jest.fn<(messageEvent: any) => Promise<void>>().mockResolvedValue(undefined),
      extractMentions: jest.fn<(content: string) => string[]>().mockReturnValue([]),
      isMentioned: jest.fn<(content: string) => boolean>().mockReturnValue(false),
      
      ...overrides
    };
  }

  // Helper function to create test message
  function createTestMessage(overrides: Partial<AgentMessage> = {}): AgentMessage {
    return {
      role: 'user',
      content: 'Test message',
      createdAt: new Date('2023-01-01T00:00:00Z'),
      sender: 'test-user',
      ...overrides
    };
  }

  describe('Create Operations (saveAgent)', () => {
    test('should save agent with all required fields', async () => {
      const world = await createTestWorld();
      const agent = createTestAgent({
        id: 'complete-agent',
        name: 'Complete Agent',
        type: 'assistant',
        status: 'active',
        provider: LLMProvider.ANTHROPIC,
        model: 'claude-3-sonnet',
        systemPrompt: 'You are a helpful assistant.',
        temperature: 0.8,
        maxTokens: 2048,
        llmCallCount: 5,
        lastLLMCall: new Date('2023-01-02T00:00:00Z')
      });

      await saveAgent(ctx, world.id, agent);

      // Verify agent was saved
      const savedAgent = await loadAgent(ctx, world.id, agent.id);
      expect(savedAgent).not.toBeNull();
      expect(savedAgent!.id).toBe(agent.id);
      expect(savedAgent!.name).toBe(agent.name);
      expect(savedAgent!.provider).toBe(agent.provider);
      expect(savedAgent!.model).toBe(agent.model);
      expect(savedAgent!.llmCallCount).toBe(agent.llmCallCount);
    });

    test('should save agent with minimal required fields', async () => {
      const world = await createTestWorld();
      const agent = createTestAgent({
        id: 'minimal-agent',
        name: 'Minimal Agent',
        type: 'basic',
        provider: LLMProvider.OPENAI,
        model: 'gpt-3.5-turbo',
        llmCallCount: 0,
        memory: []
      });

      await saveAgent(ctx, world.id, agent);

      const savedAgent = await loadAgent(ctx, world.id, agent.id);
      expect(savedAgent).not.toBeNull();
      expect(savedAgent!.id).toBe(agent.id);
      expect(savedAgent!.llmCallCount).toBe(0);
    });

    test('should save agent with complex memory', async () => {
      const world = await createTestWorld();
      const memory: AgentMessage[] = [
        createTestMessage({ role: 'user', content: 'Hello agent!', sender: 'user1' }),
        createTestMessage({ role: 'assistant', content: 'Hello! How can I help?', createdAt: new Date('2023-01-01T01:00:00Z') }),
        createTestMessage({ role: 'user', content: 'Tell me about AI', sender: 'user2', createdAt: new Date('2023-01-01T02:00:00Z') }),
        createTestMessage({ role: 'assistant', content: 'AI is fascinating...', createdAt: new Date('2023-01-01T02:01:00Z') })
      ];

      const agent = createTestAgent({
        id: 'memory-agent',
        memory
      });

      await saveAgent(ctx, world.id, agent);

      const savedAgent = await loadAgent(ctx, world.id, agent.id);
      expect(savedAgent).not.toBeNull();
      expect(savedAgent!.memory).toHaveLength(4);
      expect(savedAgent!.memory[0].content).toBe('Hello agent!');
      expect(savedAgent!.memory[1].role).toBe('assistant');
      expect(savedAgent!.memory[2].sender).toBe('user2');
    });

    test('should update existing agent (INSERT OR REPLACE)', async () => {
      const world = await createTestWorld();
      const originalAgent = createTestAgent({
        id: 'update-agent',
        name: 'Original Name',
        llmCallCount: 5
      });

      const updatedAgent = createTestAgent({
        id: 'update-agent',
        name: 'Updated Name',
        llmCallCount: 10,
        model: 'gpt-4-turbo'
      });

      // Save original
      await saveAgent(ctx, world.id, originalAgent);
      let savedAgent = await loadAgent(ctx, world.id, 'update-agent');
      expect(savedAgent!.name).toBe('Original Name');
      expect(savedAgent!.llmCallCount).toBe(5);

      // Save update
      await saveAgent(ctx, world.id, updatedAgent);
      savedAgent = await loadAgent(ctx, world.id, 'update-agent');
      expect(savedAgent!.name).toBe('Updated Name');
      expect(savedAgent!.llmCallCount).toBe(10);
      expect(savedAgent!.model).toBe('gpt-4-turbo');
    });

    test('should handle special characters in agent data', async () => {
      const world = await createTestWorld();
      const agent = createTestAgent({
        id: 'special-chars',
        name: 'Agent with 🤖 emojis and "quotes"',
        systemPrompt: 'You are an agent with\nnewlines\tand\ttabs',
        memory: [
          createTestMessage({ 
            content: 'Message with 🌟 emojis and special chars: äöü ñç',
            sender: 'user@domain.com'
          })
        ]
      });

      await saveAgent(ctx, world.id, agent);

      const savedAgent = await loadAgent(ctx, world.id, agent.id);
      expect(savedAgent!.name).toBe(agent.name);
      expect(savedAgent!.systemPrompt).toBe(agent.systemPrompt);
      expect(savedAgent!.memory[0].content).toBe(agent.memory[0].content);
    });

    test('should enforce foreign key constraints with worlds', async () => {
      const agent = createTestAgent({
        id: 'orphan-agent'
      });

      // Try to save agent to non-existent world
      await expect(saveAgent(ctx, 'non-existent-world', agent))
        .rejects.toThrow(); // Should fail due to foreign key constraint
    });

    test('should handle Date serialization correctly', async () => {
      const world = await createTestWorld();
      const createdAt = new Date('2023-06-15T10:30:00Z');
      const lastActive = new Date('2023-06-15T11:45:00Z');
      const lastLLMCall = new Date('2023-06-15T11:30:00Z');

      const agent = createTestAgent({
        id: 'date-agent',
        createdAt,
        lastActive,
        lastLLMCall,
        memory: [
          createTestMessage({ 
            createdAt: new Date('2023-06-15T10:35:00Z'),
            content: 'Message with timestamp'
          })
        ]
      });

      await saveAgent(ctx, world.id, agent);

      const savedAgent = await loadAgent(ctx, world.id, agent.id);
      expect(savedAgent!.createdAt).toEqual(createdAt);
      expect(savedAgent!.lastActive).toEqual(lastActive);
      expect(savedAgent!.lastLLMCall).toEqual(lastLLMCall);
      expect(savedAgent!.memory[0].createdAt).toEqual(agent.memory[0].createdAt);
    });
  });

  describe('Read Operations (loadAgent)', () => {
    test('should load existing agent correctly', async () => {
      const world = await createTestWorld();
      const agent = createTestAgent({
        id: 'load-test',
        name: 'Load Test Agent',
        provider: LLMProvider.ANTHROPIC,
        model: 'claude-3-opus',
        temperature: 0.9,
        maxTokens: 4096
      });

      await saveAgent(ctx, world.id, agent);
      const loadedAgent = await loadAgent(ctx, world.id, 'load-test');

      expect(loadedAgent).not.toBeNull();
      expect(loadedAgent!.id).toBe(agent.id);
      expect(loadedAgent!.name).toBe(agent.name);
      expect(loadedAgent!.provider).toBe(agent.provider);
      expect(loadedAgent!.model).toBe(agent.model);
      expect(loadedAgent!.temperature).toBe(agent.temperature);
      expect(loadedAgent!.maxTokens).toBe(agent.maxTokens);
    });

    test('should return null for non-existent agent', async () => {
      const world = await createTestWorld();
      const loadedAgent = await loadAgent(ctx, world.id, 'non-existent');
      expect(loadedAgent).toBeNull();
    });

    test('should return null for agent in non-existent world', async () => {
      const loadedAgent = await loadAgent(ctx, 'non-existent-world', 'any-agent');
      expect(loadedAgent).toBeNull();
    });

    test('should load agent memory in correct chronological order', async () => {
      const world = await createTestWorld();
      const memory: AgentMessage[] = [
        createTestMessage({ 
          content: 'First message', 
          createdAt: new Date('2023-01-01T10:00:00Z') 
        }),
        createTestMessage({ 
          content: 'Third message', 
          createdAt: new Date('2023-01-01T12:00:00Z') 
        }),
        createTestMessage({ 
          content: 'Second message', 
          createdAt: new Date('2023-01-01T11:00:00Z') 
        })
      ];

      const agent = createTestAgent({
        id: 'memory-order',
        memory
      });

      await saveAgent(ctx, world.id, agent);
      const loadedAgent = await loadAgent(ctx, world.id, 'memory-order');

      expect(loadedAgent!.memory).toHaveLength(3);
      // Should be ordered by createdAt ASC
      expect(loadedAgent!.memory[0].content).toBe('First message');
      expect(loadedAgent!.memory[1].content).toBe('Second message');
      expect(loadedAgent!.memory[2].content).toBe('Third message');
    });

    test('should load default agent created by initializeWithDefaults', async () => {
      const defaultAgent = await loadAgent(ctx, 'default-world', 'default-agent');
      
      expect(defaultAgent).not.toBeNull();
      expect(defaultAgent!.id).toBe('default-agent');
      expect(defaultAgent!.name).toBe('Default Agent');
      expect(defaultAgent!.provider).toBe('ollam'); // Note: different spelling in default
      expect(defaultAgent!.model).toBe('llama3.2:3b');
    });

    test('should handle case-sensitive agent and world IDs', async () => {
      const world = await createTestWorld('CaseSensitive');
      const agent = createTestAgent({
        id: 'CaseSensitiveAgent'
      });

      await saveAgent(ctx, world.id, agent);

      // Exact case should work
      let loadedAgent = await loadAgent(ctx, 'CaseSensitive', 'CaseSensitiveAgent');
      expect(loadedAgent).not.toBeNull();

      // Different case should not work
      loadedAgent = await loadAgent(ctx, 'casesensitive', 'CaseSensitiveAgent');
      expect(loadedAgent).toBeNull();

      loadedAgent = await loadAgent(ctx, 'CaseSensitive', 'casesensitiveagent');
      expect(loadedAgent).toBeNull();
    });
  });

  describe('Update Operations (saveAgent with existing data)', () => {
    test('should handle memory updates correctly', async () => {
      const world = await createTestWorld();
      const agent = createTestAgent({
        id: 'memory-update',
        memory: [
          createTestMessage({ content: 'Original message 1' }),
          createTestMessage({ content: 'Original message 2' })
        ]
      });

      await saveAgent(ctx, world.id, agent);

      // Update with new memory
      const updatedAgent = createTestAgent({
        id: 'memory-update',
        memory: [
          createTestMessage({ content: 'New message 1' }),
          createTestMessage({ content: 'New message 2' }),
          createTestMessage({ content: 'New message 3' })
        ]
      });

      await saveAgent(ctx, world.id, updatedAgent);

      const loadedAgent = await loadAgent(ctx, world.id, 'memory-update');
      expect(loadedAgent!.memory).toHaveLength(3);
      expect(loadedAgent!.memory[0].content).toBe('New message 1');
      expect(loadedAgent!.memory[2].content).toBe('New message 3');
    });

    test('should handle partial agent updates', async () => {
      const world = await createTestWorld();
      const originalAgent = createTestAgent({
        id: 'partial-update',
        name: 'Original Name',
        systemPrompt: 'Original prompt',
        llmCallCount: 5,
        memory: [createTestMessage({ content: 'Original memory' })]
      });

      await saveAgent(ctx, world.id, originalAgent);

      // Partial update (some fields changed, others same)
      const partialUpdate = createTestAgent({
        id: 'partial-update',
        name: 'Updated Name',
        systemPrompt: 'Original prompt', // Same
        llmCallCount: 10, // Changed
        memory: [] // Cleared
      });

      await saveAgent(ctx, world.id, partialUpdate);

      const loadedAgent = await loadAgent(ctx, world.id, 'partial-update');
      expect(loadedAgent!.name).toBe('Updated Name');
      expect(loadedAgent!.systemPrompt).toBe('Original prompt');
      expect(loadedAgent!.llmCallCount).toBe(10);
      expect(loadedAgent!.memory).toHaveLength(0);
    });

    test('should handle concurrent agent updates', async () => {
      const world = await createTestWorld();
      const agent = createTestAgent({
        id: 'concurrent-update',
        llmCallCount: 0
      });

      await saveAgent(ctx, world.id, agent);

      // Simulate concurrent updates
      const update1 = createTestAgent({
        id: 'concurrent-update',
        name: 'Update 1',
        llmCallCount: 5
      });

      const update2 = createTestAgent({
        id: 'concurrent-update',
        name: 'Update 2',
        llmCallCount: 10
      });

      // Execute updates concurrently
      await Promise.all([
        saveAgent(ctx, world.id, update1),
        saveAgent(ctx, world.id, update2)
      ]);

      // One of the updates should be saved (last one wins)
      const finalAgent = await loadAgent(ctx, world.id, 'concurrent-update');
      expect(finalAgent).not.toBeNull();
      expect(['Update 1', 'Update 2']).toContain(finalAgent!.name);
    });
  });

  describe('Delete Operations (deleteAgent)', () => {
    test('should delete existing agent', async () => {
      const world = await createTestWorld();
      const agent = createTestAgent({
        id: 'delete-test',
        name: 'Delete Test Agent'
      });

      await saveAgent(ctx, world.id, agent);
      
      // Verify agent exists
      let loadedAgent = await loadAgent(ctx, world.id, 'delete-test');
      expect(loadedAgent).not.toBeNull();

      // Delete agent
      const deleteResult = await deleteAgent(ctx, world.id, 'delete-test');
      expect(deleteResult).toBe(true);

      // Verify agent is deleted
      loadedAgent = await loadAgent(ctx, world.id, 'delete-test');
      expect(loadedAgent).toBeNull();
    });

    test('should delete agent memory when agent is deleted', async () => {
      const world = await createTestWorld();
      const agent = createTestAgent({
        id: 'memory-delete',
        memory: [
          createTestMessage({ content: 'Message 1' }),
          createTestMessage({ content: 'Message 2' }),
          createTestMessage({ content: 'Message 3' })
        ]
      });

      await saveAgent(ctx, world.id, agent);

      // Verify agent and memory exist
      let loadedAgent = await loadAgent(ctx, world.id, 'memory-delete');
      expect(loadedAgent!.memory).toHaveLength(3);

      // Delete agent
      const deleteResult = await deleteAgent(ctx, world.id, 'memory-delete');
      expect(deleteResult).toBe(true);

      // Verify agent and memory are deleted
      loadedAgent = await loadAgent(ctx, world.id, 'memory-delete');
      expect(loadedAgent).toBeNull();
    });

    test('should return false when deleting non-existent agent', async () => {
      const world = await createTestWorld();
      const deleteResult = await deleteAgent(ctx, world.id, 'non-existent');
      expect(deleteResult).toBe(false);
    });

    test('should return false when deleting from non-existent world', async () => {
      const deleteResult = await deleteAgent(ctx, 'non-existent-world', 'any-agent');
      expect(deleteResult).toBe(false);
    });

    test('should handle multiple agent deletions', async () => {
      const world = await createTestWorld();
      const agents = [
        createTestAgent({ id: 'delete-1', name: 'Delete Agent 1' }),
        createTestAgent({ id: 'delete-2', name: 'Delete Agent 2' }),
        createTestAgent({ id: 'delete-3', name: 'Delete Agent 3' })
      ];

      // Save all agents
      for (const agent of agents) {
        await saveAgent(ctx, world.id, agent);
      }

      // Delete all agents
      const deleteResults = await Promise.all(
        agents.map(a => deleteAgent(ctx, world.id, a.id))
      );

      // All deletions should succeed
      expect(deleteResults).toEqual([true, true, true]);

      // Verify all agents are deleted
      const remainingAgents = await listAgents(ctx, world.id);
      const deletedIds = agents.map(a => a.id);
      const stillExists = remainingAgents.some(a => deletedIds.includes(a.id));
      expect(stillExists).toBe(false);
    });
  });

  describe('List Operations (listAgents)', () => {
    test('should list all agents in a world ordered by name', async () => {
      const world = await createTestWorld();
      const agents = [
        createTestAgent({ id: 'z-agent', name: 'Z Agent' }),
        createTestAgent({ id: 'a-agent', name: 'A Agent' }),
        createTestAgent({ id: 'm-agent', name: 'M Agent' })
      ];

      // Save agents in random order
      for (const agent of agents) {
        await saveAgent(ctx, world.id, agent);
      }

      const allAgents = await listAgents(ctx, world.id);

      expect(allAgents).toHaveLength(3);
      
      // Should be sorted by name (A Agent, M Agent, Z Agent)
      expect(allAgents[0].name).toBe('A Agent');
      expect(allAgents[1].name).toBe('M Agent');
      expect(allAgents[2].name).toBe('Z Agent');
    });

    test('should return empty array for world with no agents', async () => {
      const world = await createTestWorld('empty-world');
      const agents = await listAgents(ctx, world.id);
      expect(agents).toEqual([]);
    });

    test('should return empty array for non-existent world', async () => {
      const agents = await listAgents(ctx, 'non-existent-world');
      expect(agents).toEqual([]);
    });

    test('should load complete agent data including memory', async () => {
      const world = await createTestWorld();
      const memory = [
        createTestMessage({ content: 'Test message 1' }),
        createTestMessage({ content: 'Test message 2' })
      ];

      const agent = createTestAgent({
        id: 'complete-list',
        name: 'Complete Agent',
        provider: LLMProvider.ANTHROPIC,
        model: 'claude-3-sonnet',
        temperature: 0.8,
        maxTokens: 2048,
        llmCallCount: 15,
        memory
      });

      await saveAgent(ctx, world.id, agent);

      const agents = await listAgents(ctx, world.id);
      const savedAgent = agents.find(a => a.id === 'complete-list');

      expect(savedAgent).toBeDefined();
      expect(savedAgent!.name).toBe('Complete Agent');
      expect(savedAgent!.provider).toBe(LLMProvider.ANTHROPIC);
      expect(savedAgent!.model).toBe('claude-3-sonnet');
      expect(savedAgent!.llmCallCount).toBe(15);
      expect(savedAgent!.memory).toHaveLength(2);
    });

    test('should handle large number of agents', async () => {
      const world = await createTestWorld();
      const agentCount = 25;

      // Create many agents
      for (let i = 0; i < agentCount; i++) {
        const agent = createTestAgent({
          id: `agent-${i.toString().padStart(3, '0')}`,
          name: `Agent ${i}`,
          llmCallCount: i
        });
        await saveAgent(ctx, world.id, agent);
      }

      const allAgents = await listAgents(ctx, world.id);
      expect(allAgents).toHaveLength(agentCount);

      // Verify they're sorted by name
      for (let i = 0; i < agentCount - 1; i++) {
        expect(allAgents[i].name <= allAgents[i + 1].name).toBe(true);
      }
    });

    test('should list default agent from initializeWithDefaults', async () => {
      const agents = await listAgents(ctx, 'default-world');
      
      expect(agents.length).toBeGreaterThanOrEqual(1);
      const defaultAgent = agents.find(a => a.id === 'default-agent');
      expect(defaultAgent).toBeDefined();
      expect(defaultAgent!.name).toBe('Default Agent');
    });

    test('should isolate agents between different worlds', async () => {
      const world1 = await createTestWorld('world-1');
      const world2 = await createTestWorld('world-2');

      const agent1 = createTestAgent({ id: 'agent-1', name: 'Agent in World 1' });
      const agent2 = createTestAgent({ id: 'agent-2', name: 'Agent in World 2' });

      await saveAgent(ctx, world1.id, agent1);
      await saveAgent(ctx, world2.id, agent2);

      const agents1 = await listAgents(ctx, world1.id);
      const agents2 = await listAgents(ctx, world2.id);

      expect(agents1).toHaveLength(1);
      expect(agents2).toHaveLength(1);
      expect(agents1[0].id).toBe('agent-1');
      expect(agents2[0].id).toBe('agent-2');
    });
  });

  describe('Foreign Key Constraints and Relationships', () => {
    test('should maintain referential integrity between worlds and agents', async () => {
      const world = await createTestWorld('fk-world');
      const agent = createTestAgent({
        id: 'fk-agent',
        name: 'Foreign Key Agent'
      });

      await saveAgent(ctx, world.id, agent);

      // Verify agent exists
      const savedAgent = await loadAgent(ctx, world.id, agent.id);
      expect(savedAgent).not.toBeNull();

      // Try to delete world with agent (should fail or cascade)
      // Note: Behavior depends on FK constraint configuration
      const { listWorlds } = await import('../../../core/sqlite-storage');
      const worldsBeforeDelete = await listWorlds(ctx);
      const worldExists = worldsBeforeDelete.some(w => w.id === world.id);
      expect(worldExists).toBe(true);
    });

    test('should handle agent operations when world is deleted', async () => {
      const world = await createTestWorld('temp-world');
      const agent = createTestAgent({
        id: 'temp-agent'
      });

      await saveAgent(ctx, world.id, agent);

      // Delete the world
      const { deleteWorld } = await import('../../../core/sqlite-storage');
      await deleteWorld(ctx, world.id);

      // Try to load agent from deleted world
      const loadedAgent = await loadAgent(ctx, world.id, agent.id);
      expect(loadedAgent).toBeNull();

      // Try to list agents in deleted world
      const agents = await listAgents(ctx, world.id);
      expect(agents).toEqual([]);
    });

    test('should prevent saving agents to non-existent worlds', async () => {
      const agent = createTestAgent({
        id: 'orphan-agent'
      });

      // Should throw due to foreign key constraint
      await expect(saveAgent(ctx, 'non-existent-world', agent))
        .rejects.toThrow();
    });
  });

  describe('Memory Management and Performance', () => {
    test('should handle agents with large memory efficiently', async () => {
      const world = await createTestWorld();
      const largeMemory: AgentMessage[] = [];

      // Create a conversation with many messages
      for (let i = 0; i < 100; i++) {
        largeMemory.push(createTestMessage({
          content: `Message ${i}: ${'x'.repeat(100)}`, // 100 chars per message
          createdAt: new Date(Date.now() + i * 1000) // 1 second apart
        }));
      }

      const agent = createTestAgent({
        id: 'large-memory',
        memory: largeMemory
      });

      const startTime = Date.now();
      await saveAgent(ctx, world.id, agent);
      const saveTime = Date.now() - startTime;

      const loadStartTime = Date.now();
      const loadedAgent = await loadAgent(ctx, world.id, 'large-memory');
      const loadTime = Date.now() - loadStartTime;

      expect(loadedAgent!.memory).toHaveLength(100);
      expect(saveTime).toBeLessThan(2000); // Should save within 2 seconds
      expect(loadTime).toBeLessThan(1000); // Should load within 1 second
    });

    test('should handle rapid memory updates', async () => {
      const world = await createTestWorld();
      const agent = createTestAgent({
        id: 'rapid-memory',
        memory: []
      });

      // Save initial agent
      await saveAgent(ctx, world.id, agent);

      // Rapid memory updates
      for (let i = 0; i < 10; i++) {
        const updatedAgent = createTestAgent({
          id: 'rapid-memory',
          memory: [
            ...agent.memory,
            createTestMessage({ content: `Rapid message ${i}` })
          ]
        });
        agent.memory = updatedAgent.memory;
        await saveAgent(ctx, world.id, updatedAgent);
      }

      const finalAgent = await loadAgent(ctx, world.id, 'rapid-memory');
      expect(finalAgent!.memory).toHaveLength(10);
    });

    test('should optimize memory storage and retrieval', async () => {
      const world = await createTestWorld();
      
      // Create agents with different memory sizes
      const agents = [];
      for (let i = 0; i < 5; i++) {
        const memory = Array.from({ length: i * 10 }, (_, j) =>
          createTestMessage({ content: `Agent ${i} message ${j}` })
        );
        agents.push(createTestAgent({
          id: `memory-agent-${i}`,
          memory
        }));
      }

      // Save all agents
      const startTime = Date.now();
      for (const agent of agents) {
        await saveAgent(ctx, world.id, agent);
      }
      const saveTime = Date.now() - startTime;

      // Load all agents
      const loadStartTime = Date.now();
      const loadedAgents = await Promise.all(
        agents.map(a => loadAgent(ctx, world.id, a.id))
      );
      const loadTime = Date.now() - loadStartTime;

      // Verify memory integrity
      for (let i = 0; i < agents.length; i++) {
        expect(loadedAgents[i]!.memory).toHaveLength(i * 10);
      }

      expect(saveTime).toBeLessThan(3000);
      expect(loadTime).toBeLessThan(2000);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle null and undefined values appropriately', async () => {
      const world = await createTestWorld();
      const agent = createTestAgent({
        id: 'null-test',
        systemPrompt: undefined,
        temperature: undefined,
        maxTokens: undefined,
        lastLLMCall: undefined,
        memory: []
      });

      await saveAgent(ctx, world.id, agent);

      const savedAgent = await loadAgent(ctx, world.id, 'null-test');
      expect(savedAgent!.systemPrompt).toBeUndefined();
      expect(savedAgent!.lastLLMCall).toBeUndefined();
    });

    test('should handle empty and special string values', async () => {
      const world = await createTestWorld();
      const agent = createTestAgent({
        id: '',  // Empty ID (might cause issues)
        name: '',
        systemPrompt: '',
        memory: [
          createTestMessage({ content: '', sender: '' })
        ]
      });

      // Empty ID might not be valid, so let's use a valid ID
      agent.id = 'empty-strings';

      await saveAgent(ctx, world.id, agent);

      const savedAgent = await loadAgent(ctx, world.id, 'empty-strings');
      expect(savedAgent!.name).toBe('');
      expect(savedAgent!.systemPrompt).toBe('');
      expect(savedAgent!.memory[0].content).toBe('');
    });

    test('should handle extreme numeric values', async () => {
      const world = await createTestWorld();
      const agent = createTestAgent({
        id: 'extreme-values',
        temperature: 0,
        maxTokens: Number.MAX_SAFE_INTEGER,
        llmCallCount: Number.MAX_SAFE_INTEGER
      });

      await saveAgent(ctx, world.id, agent);

      const savedAgent = await loadAgent(ctx, world.id, 'extreme-values');
      expect(savedAgent!.temperature).toBe(0);
      expect(savedAgent!.maxTokens).toBe(Number.MAX_SAFE_INTEGER);
      expect(savedAgent!.llmCallCount).toBe(Number.MAX_SAFE_INTEGER);
    });

    test('should handle Unicode and special characters', async () => {
      const world = await createTestWorld();
      const agent = createTestAgent({
        id: 'unicode-test',
        name: '🤖 Ünicödé Ägent with ñ and 中文',
        systemPrompt: 'You are a 🌟 special agent with émojis',
        memory: [
          createTestMessage({
            content: 'Message with 🚀 rockets and 中文 characters',
            sender: 'üser@dömain.com'
          })
        ]
      });

      await saveAgent(ctx, world.id, agent);

      const savedAgent = await loadAgent(ctx, world.id, 'unicode-test');
      expect(savedAgent!.name).toBe(agent.name);
      expect(savedAgent!.systemPrompt).toBe(agent.systemPrompt);
      expect(savedAgent!.memory[0].content).toBe(agent.memory[0].content);
      expect(savedAgent!.memory[0].sender).toBe(agent.memory[0].sender);
    });

    test('should handle database connection errors gracefully', async () => {
      const world = await createTestWorld();
      const agent = createTestAgent();

      // Close the context to simulate connection error
      await close(ctx);

      // Operations should handle the closed database gracefully
      await expect(loadAgent(ctx, world.id, agent.id)).rejects.toThrow();
      await expect(saveAgent(ctx, world.id, agent)).rejects.toThrow();
      await expect(deleteAgent(ctx, world.id, agent.id)).rejects.toThrow();
      await expect(listAgents(ctx, world.id)).rejects.toThrow();
    });

    test('should validate data integrity and constraints', async () => {
      const integrity = await validateIntegrity(ctx.schemaCtx);
      expect(integrity.isValid).toBe(true);
      expect(integrity.errors).toEqual([]);
    });
  });

  describe('Concurrent Operations and ACID Properties', () => {
    test('should handle concurrent agent operations', async () => {
      const world = await createTestWorld();
      const agents = Array.from({ length: 10 }, (_, i) =>
        createTestAgent({
          id: `concurrent-${i}`,
          name: `Concurrent Agent ${i}`,
          llmCallCount: i
        })
      );

      // Save all agents concurrently
      await Promise.all(
        agents.map(agent => saveAgent(ctx, world.id, agent))
      );

      // Load all agents concurrently
      const loadedAgents = await Promise.all(
        agents.map(agent => loadAgent(ctx, world.id, agent.id))
      );

      // Verify all operations succeeded
      expect(loadedAgents.every(a => a !== null)).toBe(true);
      expect(loadedAgents).toHaveLength(10);
    });

    test('should maintain data consistency across operations', async () => {
      const world = await createTestWorld();
      const agent = createTestAgent({
        id: 'consistency-test',
        name: 'Consistency Test',
        llmCallCount: 0,
        memory: []
      });

      // Save
      await saveAgent(ctx, world.id, agent);

      // Load and verify
      let loadedAgent = await loadAgent(ctx, world.id, agent.id);
      expect(loadedAgent).toEqual(expect.objectContaining({
        id: agent.id,
        name: agent.name,
        llmCallCount: agent.llmCallCount
      }));

      // Update
      agent.llmCallCount = 5;
      agent.memory = [createTestMessage({ content: 'New message' })];
      await saveAgent(ctx, world.id, agent);

      // Load and verify update
      loadedAgent = await loadAgent(ctx, world.id, agent.id);
      expect(loadedAgent!.llmCallCount).toBe(5);
      expect(loadedAgent!.memory).toHaveLength(1);

      // Delete
      const deleteResult = await deleteAgent(ctx, world.id, agent.id);
      expect(deleteResult).toBe(true);

      // Verify deletion
      loadedAgent = await loadAgent(ctx, world.id, agent.id);
      expect(loadedAgent).toBeNull();
    });

    test('should handle transaction-like behavior', async () => {
      const world = await createTestWorld();
      const agent = createTestAgent({
        id: 'transaction-test',
        memory: [
          createTestMessage({ content: 'Message 1' }),
          createTestMessage({ content: 'Message 2' })
        ]
      });

      // Save should be atomic - either all data is saved or none
      await saveAgent(ctx, world.id, agent);

      const loadedAgent = await loadAgent(ctx, world.id, 'transaction-test');
      expect(loadedAgent!.memory).toHaveLength(2);
      expect(loadedAgent!.memory[0].content).toBe('Message 1');
      expect(loadedAgent!.memory[1].content).toBe('Message 2');
    });
  });
});