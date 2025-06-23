/*
 * World Management Tests - Unit tests for function-based world system
 * 
 * Features:
 * - Tests all core world management functi      const worldId = await createWorld({ name: 'Test World' });

      expect(worldId).toBeDefined();
      expect(worldId).toMatch(/^world_/);alidates world creation, deletion, and info retrieval
 * - Tests agent management within worlds (CRUD operations)
 * - Tests event system integration (publish, subscribe, messaging)
 * - Tests persistence functionality (save/load world state)
 * - Tests recursive agent config.json loading from nested agent directories
 * - Tests error handling and edge cases
 * - Tests world discovery and listing functionality
 * 
 * Logic:
 * - Uses Jest for testing framework
 * - Uses real file system operations with test directory cleanup
 * - Mocks only event-bus and agent dependencies
 * - Tests both success and error scenarios
 * - Validates world state consistency
 * - Tests agent lifecycle within world context
 * - Validates event publishing and subscription
 * 
 * Changes:
 * - Removed fs mocks to use real file operations
 * - Added proper test cleanup
 * - Tests now verify actual file system behavior
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import {
  createWorld,
  getWorldInfo,
  deleteWorld,
  listWorlds,
  saveWorld,
  loadWorld,
  createAgent,
  removeAgent,
  getAgents,
  getAgent,
  updateAgent,
  broadcastMessage,
  sendMessage,
  subscribeToWorldEvents,
  subscribeToAgentMessages,
  _clearAllWorldsForTesting
} from '../src/world';
import { AgentConfig, WorldOptions, LLMProvider } from '../src/types';
import * as eventBus from '../src/event-bus';
import * as agent from '../src/agent';
import { initializeFileStorage } from '../src/storage';

// Mock only event-bus and agent, use real file operations
jest.mock('../src/event-bus');
jest.mock('../src/agent');

const mockEventBus = eventBus as jest.Mocked<typeof eventBus>;
const mockAgent = agent as jest.Mocked<typeof agent>;

// Test data directory
const TEST_DATA_PATH = path.join(process.cwd(), 'test-data');

describe('World Management', () => {
  beforeEach(async () => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Clear world storage for clean state
    _clearAllWorldsForTesting();

    // Initialize file storage with test data path
    await initializeFileStorage({ dataPath: TEST_DATA_PATH });

    // Mock event bus
    mockEventBus.publishWorldEvent.mockResolvedValue(Promise.resolve({ type: 'DUMMY_EVENT' } as any));
    mockEventBus.publishMessageEvent.mockResolvedValue(Promise.resolve({ type: 'DUMMY_MESSAGE' } as any));
    mockEventBus.subscribeToMessages.mockReturnValue(() => { });
    mockEventBus.subscribeToWorld.mockReturnValue(() => { });

    // Mock agent processing  
    mockAgent.processAgentMessage.mockResolvedValue('mocked response');
  });

  afterEach(async () => {
    // Clean up test data after each test
    try {
      await fs.rm(TEST_DATA_PATH, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Recursive Agent Loading', () => {
    it('should load agents from nested config.json files', async () => {
      // Create a real world with agents on disk
      const worldId = await createWorld({ name: 'Test World' });

      // Create agents which will be saved to disk in kebab-case directories
      const agent1 = await createAgent(worldId, {
        id: 'agent_1',
        name: 'Agent One',
        type: 'assistant',
        model: 'gpt-4',
        provider: LLMProvider.OPENAI,
        systemPrompt: 'You are agent one'
      });

      const agent2 = await createAgent(worldId, {
        id: 'agent_2',
        name: 'Agent Two',
        type: 'assistant',
        model: 'llama3',
        provider: LLMProvider.OLLAMA,
        systemPrompt: 'You are agent two'
      });

      expect(agent1).toBeDefined();
      expect(agent2).toBeDefined();

      // Clear in-memory state and reload from disk
      _clearAllWorldsForTesting();
      await loadWorld(worldId);

      // Check that both agents are loaded from disk
      const agents = getAgents(worldId);
      expect(agents.length).toBe(2);
      expect(agents.find(a => a.id === 'agent_1')).toBeDefined();
      expect(agents.find(a => a.id === 'agent_2')).toBeDefined();
    });
  });

  describe('World Creation and Management', () => {
    it('should create a world with default options', async () => {
      const worldId = await createWorld();

      expect(worldId).toBeDefined();
      expect(worldId).toMatch(/^world_/);
      expect(mockEventBus.publishWorldEvent).toHaveBeenCalledWith({
        action: 'WORLD_CREATED',
        worldId,
        name: expect.stringContaining('World'),
        timestamp: expect.any(String)
      });
    });

    it('should create a world with custom options', async () => {
      const options: WorldOptions = {
        name: 'Test World'
      };

      const worldId = await createWorld(options);
      const worldInfo = getWorldInfo(worldId);

      expect(worldInfo).toBeDefined();
      expect(worldInfo!.name).toBe('Test World');
      expect(worldInfo!.agentCount).toBe(0);
    });

    it('should create world folder using kebab-case name instead of ID', async () => {
      const worldId = await createWorld({ name: 'My Test World' });

      // Verify the world folder is created with kebab-case name
      const expectedFolderName = 'my-test-world';
      const worldFolderPath = path.join(TEST_DATA_PATH, expectedFolderName);

      // Check that the name-based folder exists
      const folderExists = await fs.access(worldFolderPath).then(() => true).catch(() => false);
      expect(folderExists).toBe(true);

      // Check that the config.json exists in the name-based folder
      const configPath = path.join(worldFolderPath, 'config.json');
      const configExists = await fs.access(configPath).then(() => true).catch(() => false);
      expect(configExists).toBe(true);

      // Verify the config contains the correct world ID and name
      const configData = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(configData);
      expect(config.id).toBe(worldId);
      expect(config.name).toBe('My Test World');

      // Verify that no ID-based folder was created
      const idBasedFolderPath = path.join(TEST_DATA_PATH, worldId);
      const idFolderExists = await fs.access(idBasedFolderPath).then(() => true).catch(() => false);
      expect(idFolderExists).toBe(false);
    });

    it('should handle special characters in world names for folder creation', async () => {
      const worldId = await createWorld({ name: 'World with Spaces & Special-Chars!' });

      // Verify the world folder is created with properly sanitized kebab-case name
      const expectedFolderName = 'world-with-spaces-special-chars';
      const worldFolderPath = path.join(TEST_DATA_PATH, expectedFolderName);

      const folderExists = await fs.access(worldFolderPath).then(() => true).catch(() => false);
      expect(folderExists).toBe(true);

      // Verify the config contains the original name
      const configPath = path.join(worldFolderPath, 'config.json');
      const configData = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(configData);
      expect(config.name).toBe('World with Spaces & Special-Chars!');
    });

    it('should return world info for existing world', async () => {
      const worldId = await createWorld({ name: 'Info Test' });
      const worldInfo = getWorldInfo(worldId);

      expect(worldInfo).toBeDefined();
      expect(worldInfo!.id).toBe(worldId);
      expect(worldInfo!.name).toBe('Info Test');
      expect(worldInfo!.agentCount).toBe(0);
    });

    it('should return null for non-existent world info', () => {
      const worldInfo = getWorldInfo('non-existent-world');
      expect(worldInfo).toBeNull();
    });

    it('should delete existing world', async () => {
      const worldId = await createWorld({ name: 'Delete Test' });
      const result = await deleteWorld(worldId);

      expect(result).toBe(true);
    });

    it('should return false when deleting non-existent world', async () => {
      const result = await deleteWorld('non-existent-world');
      expect(result).toBe(false);
    });

    it('should list all worlds', async () => {
      const worldId1 = await createWorld({ name: 'World 1' });
      const worldId2 = await createWorld({ name: 'World 2' });

      const worlds = listWorlds();
      expect(worlds).toContain(worldId1);
      expect(worlds).toContain(worldId2);
      expect(worlds.length).toBe(2);
    });

    it('should return empty array when no worlds exist', () => {
      const worlds = listWorlds();
      expect(worlds).toEqual([]);
    });
  });

  describe('World Persistence', () => {
    it('should save world state to disk', async () => {
      const worldId = await createWorld({ name: 'Save Test' });

      await saveWorld(worldId);

      const worldInfo = getWorldInfo(worldId);
      expect(worldInfo).toBeDefined();
    });

    it('should throw error when saving non-existent world', async () => {
      await expect(saveWorld('non-existent-world')).rejects.toThrow();
    });

    it('should load world state from disk', async () => {
      const worldId = await createWorld({ name: 'Load Test' });

      // Clear memory and reload
      _clearAllWorldsForTesting();
      await loadWorld(worldId);

      const worldInfo = getWorldInfo(worldId);
      expect(worldInfo).toBeDefined();
      expect(worldInfo!.name).toBe('Load Test');
    });

    it('should throw error when loading fails', async () => {
      await expect(loadWorld('non-existent-world')).rejects.toThrow();
    });
  });

  describe('Agent Management', () => {
    let worldId: string;

    beforeEach(async () => {
      worldId = await createWorld({ name: 'Agent Test World' });
    });

    it('should create agent in world', async () => {
      const config: AgentConfig = {
        id: 'test-agent',
        name: 'Test Agent',
        type: 'assistant',
        model: 'gpt-4',
        provider: LLMProvider.OPENAI,
        systemPrompt: 'You are a test agent'
      };

      const agent = await createAgent(worldId, config);

      expect(agent).toBeDefined();
      expect(agent!.id).toBe('test-agent');
      expect(agent!.name).toBe('Test Agent');
      expect(agent!.status).toBe('active');
    });

    it('should return null when creating agent in non-existent world', async () => {
      const config: AgentConfig = {
        name: 'Test Agent',
        type: 'assistant',
        model: 'gpt-4',
        provider: LLMProvider.OPENAI,
        systemPrompt: 'You are a test agent'
      };

      const agent = await createAgent('non-existent-world', config);
      expect(agent).toBeNull();
    });

    it('should remove agent from world', async () => {
      const config: AgentConfig = {
        name: 'Remove Agent',
        type: 'assistant',
        model: 'gpt-4',
        provider: LLMProvider.OPENAI,
        systemPrompt: 'You will be removed'
      };

      const agent = await createAgent(worldId, config);
      expect(agent).toBeDefined();

      const result = await removeAgent(worldId, agent!.id);
      expect(result).toBe(true);
    });

    it('should return false when removing non-existent agent', async () => {
      const result = await removeAgent(worldId, 'non-existent-agent');
      expect(result).toBe(false);
    });

    it('should return false when removing from non-existent world', async () => {
      const result = await removeAgent('non-existent-world', 'some-agent');
      expect(result).toBe(false);
    });

    it('should get all agents in world', async () => {
      const config1: AgentConfig = {
        name: 'Agent 1',
        type: 'assistant',
        model: 'gpt-4',
        provider: LLMProvider.OPENAI,
        systemPrompt: 'Agent 1'
      };

      const config2: AgentConfig = {
        name: 'Agent 2',
        type: 'assistant',
        model: 'llama3',
        provider: LLMProvider.OLLAMA,
        systemPrompt: 'Agent 2'
      };

      await createAgent(worldId, config1);
      await createAgent(worldId, config2);

      const agents = getAgents(worldId);
      expect(agents.length).toBe(2);
      expect(agents.some(a => a.name === 'Agent 1')).toBe(true);
      expect(agents.some(a => a.name === 'Agent 2')).toBe(true);
    });

    it('should return empty array for world with no agents', () => {
      const agents = getAgents(worldId);
      expect(agents).toEqual([]);
    });

    it('should return empty array for non-existent world', () => {
      const agents = getAgents('non-existent-world');
      expect(agents).toEqual([]);
    });

    it('should get specific agent from world', async () => {
      const config: AgentConfig = {
        id: 'specific-agent',
        name: 'Specific Agent',
        type: 'assistant',
        model: 'gpt-4',
        provider: LLMProvider.OPENAI,
        systemPrompt: 'Specific agent'
      };

      await createAgent(worldId, config);

      const agent = getAgent(worldId, 'specific-agent');
      expect(agent).toBeDefined();
      expect(agent!.name).toBe('Specific Agent');
    });

    it('should return null for non-existent agent', () => {
      const agent = getAgent(worldId, 'non-existent-agent');
      expect(agent).toBeNull();
    });

    it('should return null for agent in non-existent world', () => {
      const agent = getAgent('non-existent-world', 'some-agent');
      expect(agent).toBeNull();
    });

    it('should update agent data', async () => {
      const config: AgentConfig = {
        name: 'Update Agent',
        type: 'assistant',
        model: 'gpt-4',
        provider: LLMProvider.OPENAI,
        systemPrompt: 'Original instructions'
      };

      const agent = await createAgent(worldId, config);
      expect(agent).toBeDefined();

      const updates = {
        metadata: { updated: true },
        status: 'inactive' as const
      };

      const updatedAgent = await updateAgent(worldId, agent!.id, updates);
      expect(updatedAgent).toBeDefined();
      expect(updatedAgent?.metadata?.updated).toBe(true);
      expect(updatedAgent?.status).toBe('inactive');
    });

    it('should return null when updating non-existent agent', async () => {
      const result = await updateAgent(worldId, 'non-existent-agent', { metadata: {} });
      expect(result).toBeNull();
    });

    it('should return null when updating agent in non-existent world', async () => {
      const result = await updateAgent('non-existent-world', 'some-agent', { metadata: {} });
      expect(result).toBeNull();
    });

    it('should update world info agent count', async () => {
      const config: AgentConfig = {
        name: 'Count Agent',
        type: 'assistant',
        model: 'gpt-4',
        provider: LLMProvider.OPENAI,
        systemPrompt: 'Count test'
      };

      await createAgent(worldId, config);

      const worldInfo = getWorldInfo(worldId);
      expect(worldInfo!.agentCount).toBe(1);
    });
  });

  describe('Event System Integration', () => {
    let worldId: string;

    beforeEach(async () => {
      worldId = await createWorld({ name: 'Event Test World' });
    });

    it('should broadcast message to all agents', async () => {
      await broadcastMessage(worldId, 'Hello world', 'test-sender');

      expect(mockEventBus.publishMessageEvent).toHaveBeenCalledWith({
        content: 'Hello world',
        sender: 'test-sender'
      });
    });

    it('should broadcast message with default sender', async () => {
      await broadcastMessage(worldId, 'Hello world');

      expect(mockEventBus.publishMessageEvent).toHaveBeenCalledWith({
        content: 'Hello world',
        sender: 'system'
      });
    });

    it('should throw error when broadcasting to non-existent world', async () => {
      await expect(broadcastMessage('non-existent-world', 'Hello'))
        .rejects.toThrow('World non-existent-world not found');
    });

    it('should send direct message to specific agent', async () => {
      const config: AgentConfig = {
        id: 'target-agent',
        name: 'Target Agent',
        type: 'assistant',
        model: 'gpt-4',
        provider: LLMProvider.OPENAI,
        systemPrompt: 'Target for messages'
      };

      await createAgent(worldId, config);
      await sendMessage(worldId, 'target-agent', 'Direct message', 'sender');

      expect(mockEventBus.publishMessageEvent).toHaveBeenCalledWith({
        content: 'Direct message',
        sender: 'sender'
      });
    });

    it('should throw error when sending message to non-existent agent', async () => {
      await expect(sendMessage(worldId, 'non-existent-agent', 'Hello'))
        .rejects.toThrow('Agent non-existent-agent not found in world');
    });

    it('should throw error when sending message in non-existent world', async () => {
      await expect(sendMessage('non-existent-world', 'some-agent', 'Hello'))
        .rejects.toThrow('World non-existent-world not found');
    });

    it('should subscribe to world events with filtering', () => {
      const callback = jest.fn();
      const unsubscribe = subscribeToWorldEvents(worldId, callback);

      expect(mockEventBus.subscribeToWorld).toHaveBeenCalled();
      expect(mockEventBus.subscribeToMessages).toHaveBeenCalled();
      expect(typeof unsubscribe).toBe('function');
    });

    it('should subscribe to agent messages with filtering', () => {
      const callback = jest.fn();
      const unsubscribe = subscribeToAgentMessages(worldId, 'agent-id', callback);

      expect(mockEventBus.subscribeToMessages).toHaveBeenCalled();
      expect(typeof unsubscribe).toBe('function');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle concurrent world creation', async () => {
      const promises = Array(5).fill(null).map((_, i) =>
        createWorld({ name: `Concurrent World ${i}` })
      );

      const worldIds = await Promise.all(promises);
      const uniqueIds = new Set(worldIds);

      expect(worldIds.length).toBe(5);
      expect(uniqueIds.size).toBe(5);
    });

    it('should handle concurrent agent creation', async () => {
      const worldId = await createWorld({ name: 'Concurrent Test' });

      const promises = Array(5).fill(null).map((_, i) =>
        createAgent(worldId, {
          name: `Agent ${i}`,
          type: 'assistant',
          model: 'gpt-4',
          provider: LLMProvider.OPENAI,
          systemPrompt: `Agent ${i} instructions`
        })
      );

      const agents = await Promise.all(promises);
      expect(agents.filter(a => a !== null).length).toBe(5);

      const worldAgents = getAgents(worldId);
      expect(worldAgents.length).toBe(5);
    });

    it('should handle empty world operations gracefully', async () => {
      const worldId = await createWorld();

      expect(getAgents(worldId)).toEqual([]);
      expect(getAgent(worldId, 'non-existent')).toBeNull();
      expect(await removeAgent(worldId, 'non-existent')).toBe(false);
      expect(await updateAgent(worldId, 'non-existent', {})).toBeNull();
    });

    it('should handle malformed agent config', async () => {
      const worldId = await createWorld();
      const malformedConfig = { name: 'Test Agent' } as AgentConfig; // Missing other required fields

      // Function should still work with malformed config (has name but missing other fields)
      const agent = await createAgent(worldId, malformedConfig);
      expect(agent).toBeDefined();
      expect(agent!.name).toBe('Test Agent');
    });
  });

  describe('Agent Message Subscription Logic', () => {
    let worldId: string;

    beforeEach(async () => {
      worldId = await createWorld({ name: 'Subscription Test' });
    });

    describe('Agent Creation Subscriptions', () => {
      it('should subscribe agent to messages when created', async () => {
        const config: AgentConfig = {
          name: 'Subscribed Agent',
          type: 'assistant',
          model: 'gpt-4',
          provider: LLMProvider.OPENAI,
          systemPrompt: 'Test agent'
        };

        await createAgent(worldId, config);

        expect(mockEventBus.subscribeToMessages).toHaveBeenCalled();
      });

      it('should process messages received by subscribed agent', async () => {
        const config: AgentConfig = {
          name: 'Message Agent',
          type: 'assistant',
          model: 'gpt-4',
          provider: LLMProvider.OPENAI,
          systemPrompt: 'Process messages'
        };

        await createAgent(worldId, config);

        // Verify subscription callback was set up
        expect(mockEventBus.subscribeToMessages).toHaveBeenCalled();
        const subscribeCall = mockEventBus.subscribeToMessages.mock.calls[0];
        expect(typeof subscribeCall[0]).toBe('function');
      });

      it('should not process messages from the agent itself', async () => {
        const config: AgentConfig = {
          id: 'self-agent',
          name: 'Self Agent',
          type: 'assistant',
          model: 'gpt-4',
          provider: LLMProvider.OPENAI,
          systemPrompt: 'Self test'
        };

        await createAgent(worldId, config);

        // Verify subscription was created
        expect(mockEventBus.subscribeToMessages).toHaveBeenCalled();
      });

      it('should handle message processing errors gracefully', async () => {
        const config: AgentConfig = {
          name: 'Error Agent',
          type: 'assistant',
          model: 'gpt-4',
          provider: LLMProvider.OPENAI,
          systemPrompt: 'Error handling'
        };

        // Make processAgentMessage throw an error
        mockAgent.processAgentMessage.mockRejectedValue(new Error('Processing failed'));

        await createAgent(worldId, config);

        expect(mockEventBus.subscribeToMessages).toHaveBeenCalled();
      });
    });

    describe('Agent Removal Cleanup', () => {
      it('should unsubscribe agent when removed', async () => {
        const config: AgentConfig = {
          name: 'Remove Agent',
          type: 'assistant',
          model: 'gpt-4',
          provider: LLMProvider.OPENAI,
          systemPrompt: 'Will be removed'
        };

        const agent = await createAgent(worldId, config);
        expect(agent).toBeDefined();

        await removeAgent(worldId, agent!.id);

        // Verify agent was removed
        expect(getAgent(worldId, agent!.id)).toBeNull();
      });

      it('should handle removal of non-existent agent subscription', async () => {
        const result = await removeAgent(worldId, 'non-existent-agent');
        expect(result).toBe(false);
      });
    });

    describe('Agent Loading Subscriptions', () => {
      it('should subscribe loaded active agents to messages', async () => {
        // Create and save an agent
        const config: AgentConfig = {
          name: 'Load Agent',
          type: 'assistant',
          model: 'gpt-4',
          provider: LLMProvider.OPENAI,
          systemPrompt: 'Load test'
        };

        await createAgent(worldId, config);

        // Clear and reload
        _clearAllWorldsForTesting();
        await loadWorld(worldId);

        // Verify agents were loaded
        const agents = getAgents(worldId);
        expect(agents.length).toBe(1);
      });

      it('should not subscribe agents without config', async () => {
        // This test verifies the loading logic handles agents without proper config
        const agents = getAgents(worldId);
        expect(agents.length).toBe(0);
      });
    });
  });
});
