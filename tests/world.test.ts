/*
 * World Management Tests - Unit tests for function-based world system
 * 
 * Features:
 * - Tests all core world management functions
 * - Validates world creation, deletion, and info retrieval
 * - Tests agent management within worlds (CRUD operations)
 * - Tests event system integration (publish, subscribe, messaging)
 * - Tests persistence functionality (save/load world state)
 * - Tests error handling and edge cases
 * - Tests world discovery and listing functionality
 * 
 * Logic:
 * - Uses Jest for testing framework
 * - Mocks file system and event-bus dependencies
 * - Tests both success and error scenarios
 * - Validates world state consistency
 * - Tests agent lifecycle within world context
 * - Validates event publishing and subscription
 * 
 * Changes:
 * - Initial comprehensive test suite for world management
 * - Covers all function-based API operations
 * - Tests integration with event-bus system
 * - Validates persistence and error handling
 * - Tests world and agent state management
 */

import * as fs from 'fs/promises';
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
  publishWorldEvent,
  broadcastMessage,
  sendMessage,
  subscribeToWorldEvents,
  subscribeToAgentMessages,
  _clearAllWorldsForTesting
} from '../src/world';
import { AgentConfig, WorldOptions, LLMProvider } from '../src/types';
import * as eventBus from '../src/event-bus';

// Mock dependencies
jest.mock('fs/promises');
jest.mock('../src/event-bus');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockEventBus = eventBus as jest.Mocked<typeof eventBus>;

describe('World Management', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Clear world storage for clean state
    _clearAllWorldsForTesting();
  });

  describe('World Creation and Management', () => {
    it('should create a world with default options', async () => {
      jest.spyOn(mockFs, 'mkdir').mockResolvedValue(undefined);
      jest.spyOn(mockFs, 'writeFile').mockResolvedValue(undefined);
      
      const worldId = await createWorld();

      expect(worldId).toBeDefined();
      expect(worldId).toMatch(/^world_/);
      expect(mockEventBus.publishWorld).toHaveBeenCalledWith({
        type: 'WORLD_CREATED',
        worldId,
        name: expect.stringContaining('World'),
        timestamp: expect.any(String)
      });
    });

    it('should create a world with custom options', async () => {
      jest.spyOn(mockFs, 'mkdir').mockResolvedValue(undefined);
      jest.spyOn(mockFs, 'writeFile').mockResolvedValue(undefined);
      
      const options: WorldOptions = {
        name: 'Test World',
        metadata: { creator: 'test-user' }
      };

      const worldId = await createWorld(options);
      const worldInfo = getWorldInfo(worldId);

      expect(worldInfo).toBeDefined();
      expect(worldInfo!.name).toBe('Test World');
      expect(worldInfo!.metadata.creator).toBe('test-user');
      expect(worldInfo!.agentCount).toBe(0);
      expect(worldInfo!.createdAt).toBeInstanceOf(Date);
    });

    it('should return world info for existing world', async () => {
      jest.spyOn(mockFs, 'mkdir').mockResolvedValue(undefined);
      jest.spyOn(mockFs, 'writeFile').mockResolvedValue(undefined);
      
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
      jest.spyOn(mockFs, 'mkdir').mockResolvedValue(undefined);
      jest.spyOn(mockFs, 'writeFile').mockResolvedValue(undefined);
      jest.spyOn(mockFs, 'rm').mockResolvedValue(undefined);
      
      const worldId = await createWorld({ name: 'Delete Test' });
      const result = await deleteWorld(worldId);

      expect(result).toBe(true);
      expect(mockEventBus.publishWorld).toHaveBeenCalledWith({
        type: 'WORLD_DELETED',
        worldId,
        timestamp: expect.any(String)
      });

      // Verify world is deleted
      const worldInfo = getWorldInfo(worldId);
      expect(worldInfo).toBeNull();
    });

    it('should return false when deleting non-existent world', async () => {
      const result = await deleteWorld('non-existent-world');
      expect(result).toBe(false);
    });

    it('should list all worlds', async () => {
      jest.spyOn(mockFs, 'mkdir').mockResolvedValue(undefined);
      jest.spyOn(mockFs, 'writeFile').mockResolvedValue(undefined);
      
      const world1 = await createWorld({ name: 'World 1' });
      const world2 = await createWorld({ name: 'World 2' });
      const world3 = await createWorld({ name: 'World 3' });

      const worlds = listWorlds();
      expect(worlds).toHaveLength(3);
      expect(worlds).toEqual([world1, world2, world3]);
    });

    it('should return empty array when no worlds exist', () => {
      const worlds = listWorlds();
      expect(worlds).toEqual([]);
    });
  });

  describe('World Persistence', () => {
    beforeEach(() => {
      jest.spyOn(mockFs, 'mkdir').mockResolvedValue(undefined);
      jest.spyOn(mockFs, 'writeFile').mockResolvedValue(undefined);
      jest.spyOn(mockFs, 'readFile').mockResolvedValue('{}');
    });

    it('should save world state to disk', async () => {
      const worldId = await createWorld({ name: 'Save Test' });

      await saveWorld(worldId);

      expect(mockFs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('data/worlds'),
        { recursive: true }
      );
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining(`${worldId}/config.json`),
        expect.any(String)
      );
      expect(mockEventBus.publishWorld).toHaveBeenCalledWith({
        type: 'WORLD_SAVED',
        worldId,
        timestamp: expect.any(String)
      });
    });

    it('should throw error when saving non-existent world', async () => {
      await expect(saveWorld('non-existent-world'))
        .rejects.toThrow('World non-existent-world not found');
    });

    it('should load world state from disk', async () => {
      const worldData = {
        id: 'test-world',
        name: 'Loaded World',
        agents: {},
        createdAt: new Date().toISOString(),
        metadata: { loaded: true }
      };

      jest.spyOn(mockFs, 'readFile').mockResolvedValue(JSON.stringify(worldData));

      await loadWorld('test-world');

      expect(mockFs.readFile).toHaveBeenCalledWith(
        expect.stringContaining('test-world/config.json'),
        'utf-8'
      );
      expect(mockEventBus.publishWorld).toHaveBeenCalledWith({
        type: 'WORLD_LOADED',
        worldId: 'test-world',
        timestamp: expect.any(String)
      });

      // Verify world was loaded
      const worldInfo = getWorldInfo('test-world');
      expect(worldInfo).toBeDefined();
      expect(worldInfo!.name).toBe('Loaded World');
      expect(worldInfo!.metadata.loaded).toBe(true);
    });

    it('should throw error when loading fails', async () => {
      jest.spyOn(mockFs, 'readFile').mockRejectedValue(new Error('File not found'));

      await expect(loadWorld('missing-world'))
        .rejects.toThrow('Failed to load world missing-world');
    });
  });

  describe('Agent Management', () => {
    let worldId: string;

    beforeEach(async () => {
      jest.spyOn(mockFs, 'mkdir').mockResolvedValue(undefined);
      jest.spyOn(mockFs, 'writeFile').mockResolvedValue(undefined);
      worldId = await createWorld({ name: 'Agent Test World' });
    });

    it('should create agent in world', async () => {
      const agentConfig: AgentConfig = {
        id: 'test-agent',
        name: 'Test Agent',
        type: 'ai',
        provider: LLMProvider.OPENAI,
        model: 'gpt-4',
        temperature: 0.7
      };

      const agent = await createAgent(worldId, agentConfig);

      expect(agent).toBeDefined();
      expect(agent!.id).toMatch(/^agent_/);
      expect(agent!.name).toBe('Test Agent');
      expect(agent!.type).toBe('ai');
      expect(agent!.status).toBe('active');
      expect(agent!.config).toEqual(agentConfig);
      expect(agent!.createdAt).toBeInstanceOf(Date);
      expect(agent!.lastActive).toBeInstanceOf(Date);

      expect(mockEventBus.publishWorld).toHaveBeenCalledWith({
        type: 'AGENT_CREATED',
        worldId,
        agentId: agent!.id,
        agentName: 'Test Agent',
        agentType: 'ai',
        timestamp: expect.any(String)
      });
    });

    it('should return null when creating agent in non-existent world', async () => {
      const agentConfig: AgentConfig = {
        id: 'test-agent-2',
        name: 'Test Agent',
        type: 'ai',
        provider: LLMProvider.OPENAI,
        model: 'gpt-4'
      };

      const agent = await createAgent('non-existent-world', agentConfig);
      expect(agent).toBeNull();
    });

    it('should remove agent from world', async () => {
      const agentConfig: AgentConfig = { 
        id: 'remove-test-agent',
        name: 'Remove Test', 
        type: 'ai',
        provider: LLMProvider.OPENAI,
        model: 'gpt-4'
      };
      const agent = await createAgent(worldId, agentConfig);

      const result = await removeAgent(worldId, agent!.id);

      expect(result).toBe(true);
      expect(mockEventBus.publishWorld).toHaveBeenCalledWith({
        type: 'AGENT_REMOVED',
        worldId,
        agentId: agent!.id,
        agentName: 'Remove Test',
        timestamp: expect.any(String)
      });

      // Verify agent is removed
      const retrievedAgent = getAgent(worldId, agent!.id);
      expect(retrievedAgent).toBeNull();
    });

    it('should return false when removing non-existent agent', async () => {
      const result = await removeAgent(worldId, 'non-existent-agent');
      expect(result).toBe(false);
    });

    it('should return false when removing from non-existent world', async () => {
      const result = await removeAgent('non-existent-world', 'some-agent');
      expect(result).toBe(false);
    });

    it('should get all agents in world', () => {
      const agent1 = createAgent(worldId, { id: 'agent-1', name: 'Agent 1', type: 'ai', provider: LLMProvider.OPENAI, model: 'gpt-4' });
      const agent2 = createAgent(worldId, { id: 'agent-2', name: 'Agent 2', type: 'human', provider: LLMProvider.OPENAI, model: 'gpt-4' });
      const agent3 = createAgent(worldId, { id: 'agent-3', name: 'Agent 3', type: 'ai', provider: LLMProvider.OPENAI, model: 'gpt-4' });

      const agents = getAgents(worldId);

      expect(agents).toHaveLength(3);
      expect(agents.map(a => a.name)).toEqual(['Agent 1', 'Agent 2', 'Agent 3']);
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
      const agent = await createAgent(worldId, { id: 'specific-agent', name: 'Specific Agent', type: 'ai', provider: LLMProvider.OPENAI, model: 'gpt-4' });

      const retrievedAgent = getAgent(worldId, agent!.id);

      expect(retrievedAgent).toBeDefined();
      expect(retrievedAgent!.id).toBe(agent!.id);
      expect(retrievedAgent!.name).toBe('Specific Agent');
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
      const agent = await createAgent(worldId, { id: 'update-test-agent', name: 'Update Test', type: 'ai', provider: LLMProvider.OPENAI, model: 'gpt-4' });

      // Small delay to ensure lastActive timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));

      const updates = {
        name: 'Updated Agent',
        status: 'inactive' as const,
        metadata: { updated: true }
      };

      const updatedAgent = await updateAgent(worldId, agent!.id, updates);

      expect(updatedAgent).toBeDefined();
      expect(updatedAgent!.name).toBe('Updated Agent');
      expect(updatedAgent!.status).toBe('inactive');
      expect(updatedAgent!.metadata!.updated).toBe(true);
      expect(updatedAgent!.id).toBe(agent!.id); // ID should not change
      expect(updatedAgent!.lastActive!.getTime()).toBeGreaterThan(agent!.lastActive!.getTime()); // Should be updated

      expect(mockEventBus.publishWorld).toHaveBeenCalledWith({
        type: 'AGENT_UPDATED',
        worldId,
        agentId: agent!.id,
        updates: ['name', 'status', 'metadata'],
        timestamp: expect.any(String)
      });
    });

    it('should return null when updating non-existent agent', async () => {
      const result = await updateAgent(worldId, 'non-existent-agent', { name: 'Updated' });
      expect(result).toBeNull();
    });

    it('should return null when updating agent in non-existent world', async () => {
      const result = await updateAgent('non-existent-world', 'some-agent', { name: 'Updated' });
      expect(result).toBeNull();
    });

    it('should update world info agent count', async () => {
      await createAgent(worldId, { id: 'count-agent-1', name: 'Agent 1', type: 'ai', provider: LLMProvider.OPENAI, model: 'gpt-4' });
      await createAgent(worldId, { id: 'count-agent-2', name: 'Agent 2', type: 'human', provider: LLMProvider.OPENAI, model: 'gpt-4' });

      const worldInfo = getWorldInfo(worldId);
      expect(worldInfo!.agentCount).toBe(2);

      const agent3 = await createAgent(worldId, { id: 'count-agent-3', name: 'Agent 3', type: 'ai', provider: LLMProvider.OPENAI, model: 'gpt-4' });
      const updatedWorldInfo = getWorldInfo(worldId);
      expect(updatedWorldInfo!.agentCount).toBe(3);

      await removeAgent(worldId, agent3!.id);
      const finalWorldInfo = getWorldInfo(worldId);
      expect(finalWorldInfo!.agentCount).toBe(2);
    });
  });

  describe('Event System Integration', () => {
    let worldId: string;

    beforeEach(async () => {
      jest.spyOn(mockFs, 'mkdir').mockResolvedValue(undefined);
      jest.spyOn(mockFs, 'writeFile').mockResolvedValue(undefined);
      worldId = await createWorld({ name: 'Event Test World' });
    });

    it('should publish world event', async () => {
      const eventData = { action: 'test', data: 'value' };

      await publishWorldEvent(worldId, 'CUSTOM_EVENT', eventData);

      expect(mockEventBus.publishWorld).toHaveBeenCalledWith({
        type: 'CUSTOM_EVENT',
        worldId,
        data: eventData,
        timestamp: expect.any(String)
      });
    });

    it('should throw error when publishing to non-existent world', async () => {
      await expect(publishWorldEvent('non-existent-world', 'TEST', {}))
        .rejects.toThrow('World non-existent-world not found');
    });

    it('should broadcast message to all agents', async () => {
      await broadcastMessage(worldId, 'Hello everyone!', 'system');

      expect(mockEventBus.publishMessage).toHaveBeenCalledWith({
        name: 'broadcast',
        payload: { message: 'Hello everyone!', worldId },
        id: expect.stringMatching(/^[a-f0-9-]{36}$/),
        sender: 'system',
        senderType: 'system',
        content: 'Hello everyone!',
        timestamp: expect.any(String),
        worldId
      });
    });

    it('should broadcast message with default sender', async () => {
      await broadcastMessage(worldId, 'Hello everyone!');

      expect(mockEventBus.publishMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          sender: 'system',
          senderType: 'system'
        })
      );
    });

    it('should throw error when broadcasting to non-existent world', async () => {
      await expect(broadcastMessage('non-existent-world', 'Hello'))
        .rejects.toThrow('World non-existent-world not found');
    });

    it('should send direct message to specific agent', async () => {
      const agent = await createAgent(worldId, { id: 'target-agent', name: 'Target Agent', type: 'ai', provider: LLMProvider.OPENAI, model: 'gpt-4' });

      await sendMessage(worldId, agent!.id, 'Hello agent!', 'user');

      expect(mockEventBus.publishMessage).toHaveBeenCalledWith({
        name: 'direct_message',
        payload: { message: 'Hello agent!', worldId, targetId: agent!.id },
        id: expect.stringMatching(/^[a-f0-9-]{36}$/),
        sender: 'user',
        senderType: 'system',
        recipient: agent!.id,
        content: 'Hello agent!',
        timestamp: expect.any(String),
        worldId
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
      const mockUnsubscribe = jest.fn();

      mockEventBus.subscribeToWorld.mockReturnValue(mockUnsubscribe);
      mockEventBus.subscribeToMessages.mockReturnValue(mockUnsubscribe);

      const unsubscribe = subscribeToWorldEvents(worldId, callback);

      expect(mockEventBus.subscribeToWorld).toHaveBeenCalledWith(expect.any(Function));
      expect(mockEventBus.subscribeToMessages).toHaveBeenCalledWith(expect.any(Function));

      // Test unsubscribe
      unsubscribe();
      expect(mockUnsubscribe).toHaveBeenCalledTimes(2);
    });

    it('should subscribe to agent messages with filtering', async () => {
      const agent = await createAgent(worldId, { id: 'message-agent', name: 'Message Agent', type: 'ai', provider: LLMProvider.OPENAI, model: 'gpt-4' });
      const callback = jest.fn();
      const mockUnsubscribe = jest.fn();

      mockEventBus.subscribeToMessages.mockReturnValue(mockUnsubscribe);

      const unsubscribe = subscribeToAgentMessages(worldId, agent!.id, callback);

      expect(mockEventBus.subscribeToMessages).toHaveBeenCalledWith(expect.any(Function));

      // Test unsubscribe
      unsubscribe();
      expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle concurrent world creation', async () => {
      jest.spyOn(mockFs, 'mkdir').mockResolvedValue(undefined);
      jest.spyOn(mockFs, 'writeFile').mockResolvedValue(undefined);
      
      const worlds = await Promise.all(Array.from({ length: 10 }, () => createWorld()));

      // All worlds should have unique IDs
      const uniqueIds = new Set(worlds);
      expect(uniqueIds.size).toBe(10);
    });

    it('should handle concurrent agent creation', async () => {
      jest.spyOn(mockFs, 'mkdir').mockResolvedValue(undefined);
      jest.spyOn(mockFs, 'writeFile').mockResolvedValue(undefined);
      
      const worldId = await createWorld();
      const agents = await Promise.all(Array.from({ length: 5 }, (_, i) =>
        createAgent(worldId, { id: `concurrent-agent-${i}`, name: `Agent ${i}`, type: 'ai', provider: LLMProvider.OPENAI, model: 'gpt-4' })
      ));

      // All agents should be created successfully
      expect(agents.every(agent => agent !== null)).toBe(true);

      // All agents should have unique IDs
      const uniqueIds = new Set(agents.map(agent => agent!.id));
      expect(uniqueIds.size).toBe(5);
    });

    it('should handle empty world operations gracefully', async () => {
      jest.spyOn(mockFs, 'mkdir').mockResolvedValue(undefined);
      jest.spyOn(mockFs, 'writeFile').mockResolvedValue(undefined);
      
      const worldId = await createWorld();

      expect(getAgents(worldId)).toEqual([]);
      expect(getAgent(worldId, 'non-existent')).toBeNull();
      expect(await removeAgent(worldId, 'non-existent')).toBe(false);
      expect(await updateAgent(worldId, 'non-existent', {})).toBeNull();
    });

    it('should handle malformed agent config', async () => {
      jest.spyOn(mockFs, 'mkdir').mockResolvedValue(undefined);
      jest.spyOn(mockFs, 'writeFile').mockResolvedValue(undefined);
      
      const worldId = await createWorld();
      const malformedConfig = {} as AgentConfig; // Missing required fields

      // Function should still work with malformed config
      const agent = await createAgent(worldId, malformedConfig);
      expect(agent).toBeDefined();
      expect(agent!.name).toBe(undefined); // Will be undefined but not crash
    });
  });
});
