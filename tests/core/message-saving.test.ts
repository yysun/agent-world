/**
 * Test: Message Saving to Agent Memory
 * 
 * Verifies that:
 * 1. All messages (human and agent) are saved with messageIds
 * 2. Messages are saved even when agents don't respond
 * 3. Reloading from storage preserves messageIds
 */

// Mock nanoid before any imports
jest.mock('nanoid', () => ({
  nanoid: () => `test-msg-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`
}));

import { EventEmitter } from 'events';
import type { World, Agent, WorldMessageEvent } from '../../core/types';
import { LLMProvider } from '../../core/types';

// Mock storage BEFORE imports
const mockStorageAPI = {
  savedAgents: new Map<string, any>(),

  async saveAgent(worldId: string, agent: Agent): Promise<void> {
    const key = `${worldId}:${agent.id}`;
    this.savedAgents.set(key, JSON.parse(JSON.stringify(agent)));
  },

  async loadAgent(worldId: string, agentId: string): Promise<Agent | null> {
    const key = `${worldId}:${agentId}`;
    return this.savedAgents.get(key) || null;
  },

  reset() {
    this.savedAgents.clear();
  }
};

// Mock getStorageWrappers
jest.mock('../../core/storage/storage-factory', () => ({
  getStorageWrappers: jest.fn().mockResolvedValue(mockStorageAPI),
  setStoragePath: jest.fn()
}));

import { publishMessage, subscribeAgentToMessages } from '../../core/events';

describe('Message Saving with MessageIds', () => {
  let world: World;
  let agent1: Agent;
  let agent2: Agent;
  let unsubscribe1: () => void;
  let unsubscribe2: () => void;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    mockStorageAPI.reset();

    world = {
      id: 'test-world',
      name: 'Test World',
      eventEmitter: new EventEmitter(),
      isProcessing: false,
      totalAgents: 2,
      totalMessages: 0,
      agents: new Map(),
      chats: new Map(),
      currentChatId: 'test-chat-123',
      turnLimit: 5,
      createdAt: new Date(),
      lastUpdated: new Date()
    };

    agent1 = {
      id: 'agent-1',
      name: 'Agent 1',
      type: 'assistant',
      provider: LLMProvider.OPENAI,
      model: 'gpt-4',
      systemPrompt: 'Test',
      memory: [],
      llmCallCount: 0,
      createdAt: new Date(),
      lastActive: new Date()
    };

    agent2 = {
      id: 'agent-2',
      name: 'Agent 2',
      type: 'assistant',
      provider: LLMProvider.OPENAI,
      model: 'gpt-4',
      systemPrompt: 'Test',
      memory: [],
      llmCallCount: 0,
      createdAt: new Date(),
      lastActive: new Date()
    };

    world.agents.set('agent-1', agent1);
    world.agents.set('agent-2', agent2);

    // Subscribe agents to messages
    unsubscribe1 = subscribeAgentToMessages(world, agent1);
    unsubscribe2 = subscribeAgentToMessages(world, agent2);
  });

  afterEach(() => {
    if (unsubscribe1) unsubscribe1();
    if (unsubscribe2) unsubscribe2();
  });

  test('should save human messages with messageId to all agents', async () => {
    // Send a human message
    const messageEvent = publishMessage(world, 'Hello everyone', 'HUMAN');

    // Wait for async handlers
    await new Promise(resolve => setTimeout(resolve, 100));

    // Filter for human messages only (sender must be HUMAN, not from agents)
    const agent1HumanMessages = agent1.memory.filter(m => m.sender === 'HUMAN');
    const agent2HumanMessages = agent2.memory.filter(m => m.sender === 'HUMAN');

    // Check agent1's memory
    expect(agent1HumanMessages).toHaveLength(1);
    expect(agent1HumanMessages[0]).toMatchObject({
      role: 'user',
      content: 'Hello everyone',
      sender: 'HUMAN',
      chatId: 'test-chat-123',
      messageId: messageEvent.messageId,
      agentId: 'agent-1'
    });
    expect(agent1HumanMessages[0].messageId).toBeTruthy();
    expect(typeof agent1HumanMessages[0].messageId).toBe('string');

    // Check agent2's memory
    expect(agent2HumanMessages).toHaveLength(1);
    expect(agent2HumanMessages[0]).toMatchObject({
      role: 'user',
      content: 'Hello everyone',
      sender: 'HUMAN',
      chatId: 'test-chat-123',
      messageId: messageEvent.messageId,
      agentId: 'agent-2'
    });
    expect(agent2HumanMessages[0].messageId).toBe(messageEvent.messageId);
  });

  test('should save messages even when agents do not respond', async () => {
    // Send a message
    const messageEvent = publishMessage(world, 'Test message', 'HUMAN');

    // Wait for async handlers
    await new Promise(resolve => setTimeout(resolve, 100));

    // Filter for human messages only
    const agent1HumanMessages = agent1.memory.filter(m => m.role === 'user' && m.sender === 'HUMAN');
    const agent2HumanMessages = agent2.memory.filter(m => m.role === 'user' && m.sender === 'HUMAN');

    // Messages should still be saved
    expect(agent1HumanMessages).toHaveLength(1);
    expect(agent1HumanMessages[0].messageId).toBe(messageEvent.messageId);

    expect(agent2HumanMessages).toHaveLength(1);
    expect(agent2HumanMessages[0].messageId).toBe(messageEvent.messageId);
  });

  test('should preserve messageIds when saving and loading from storage', async () => {
    // Send a message
    const messageEvent = publishMessage(world, 'Persistent message', 'HUMAN');

    // Wait for async handlers
    await new Promise(resolve => setTimeout(resolve, 100));

    // Filter for human message
    const humanMessage = agent1.memory.find(m => m.role === 'user' && m.sender === 'HUMAN');
    expect(humanMessage).toBeDefined();
    expect(humanMessage!.messageId).toBe(messageEvent.messageId);

    // Save agent to mock storage
    await mockStorageAPI.saveAgent('test-world', agent1);

    // Load from mock storage
    const loadedAgent = await mockStorageAPI.loadAgent('test-world', 'agent-1');

    // Verify messageId is preserved
    expect(loadedAgent).toBeTruthy();
    const loadedHumanMessage = loadedAgent!.memory.find(m => m.role === 'user' && m.sender === 'HUMAN');
    expect(loadedHumanMessage).toBeDefined();
    expect(loadedHumanMessage!.messageId).toBe(messageEvent.messageId);
    expect(loadedHumanMessage!.chatId).toBe('test-chat-123');
  });

  test('should include chatId in saved messages', async () => {
    const messageEvent = publishMessage(world, 'Chat message', 'HUMAN');

    await new Promise(resolve => setTimeout(resolve, 100));

    expect(agent1.memory[0].chatId).toBe('test-chat-123');
    expect(agent2.memory[0].chatId).toBe('test-chat-123');
  });

  test('should not save agent own messages', async () => {
    // Agent 1 sends a message
    const messageEvent = publishMessage(world, 'Message from agent1', 'agent-1');

    await new Promise(resolve => setTimeout(resolve, 100));

    // Agent 1 should NOT save its own message
    expect(agent1.memory).toHaveLength(0);

    // Agent 2 should receive and save the message
    expect(agent2.memory).toHaveLength(1);
    expect(agent2.memory[0].messageId).toBe(messageEvent.messageId);
  });
});
