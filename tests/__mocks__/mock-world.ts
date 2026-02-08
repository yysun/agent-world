/**
 * Purpose: Create reusable mock world/agent/chat fixtures for tests.
 * Key features:
 * - Provides default world, agent, and chat structures
 * - Supports partial override injection for scenario-specific fixtures
 * - Provides pre-wired world data helper with one agent and one chat
 * Implementation notes:
 * - Uses EventEmitter-backed world fixture to match runtime event behavior
 * - Keeps default fixture values deterministic for repeatable tests
 * Recent changes:
 * - Reworded fixture descriptions to remove legacy manual-intervention references
 */

import { EventEmitter } from 'events';
import type { World, Agent, Chat } from '../../core/types.js';
import { LLMProvider } from '../../core/types.js';

/**
 * Create a mock world with default properties
 */
export function createMockWorld(overrides: Partial<World> = {}): World {
  const defaultWorld: World = {
    id: 'test-world-123',
    name: 'Test World',
    description: 'A test world for integration testing',
    turnLimit: 10,
    chatLLMProvider: 'openai',
    chatLLMModel: 'gpt-4',
    currentChatId: null,
    mcpConfig: null,
    isProcessing: false,
    createdAt: new Date(),
    lastUpdated: new Date(),
    totalAgents: 0,
    totalMessages: 0,
    eventEmitter: new EventEmitter(),
    agents: new Map<string, Agent>(),
    chats: new Map<string, Chat>()
  };

  return { ...defaultWorld, ...overrides };
}

/**
 * Create a mock agent
 */
export function createMockAgent(overrides: Partial<Agent> = {}): Agent {
  const defaultAgent: Agent = {
    id: 'test-agent-123',
    name: 'Test Agent',
    type: 'assistant',
    status: 'active',
    provider: LLMProvider.OPENAI,
    model: 'gpt-4',
    systemPrompt: 'You are a helpful assistant.',
    temperature: 0.7,
    maxTokens: 1000,
    createdAt: new Date(),
    lastActive: new Date(),
    llmCallCount: 0,
    memory: []
  };

  return { ...defaultAgent, ...overrides };
}

/**
 * Create a mock chat
 */
export function createMockChat(overrides: Partial<Chat> = {}): Chat {
  const defaultChat: Chat = {
    id: 'test-chat-123',
    worldId: 'test-world-123',
    name: 'Test Chat',
    description: 'A test chat for integration testing',
    createdAt: new Date(),
    updatedAt: new Date(),
    messageCount: 0
  };

  return { ...defaultChat, ...overrides };
}

/**
 * Create a world with agents and chats
 */
export function createMockWorldWithData(): World {
  const agent = createMockAgent();
  const chat = createMockChat();

  const world = createMockWorld({
    currentChatId: chat.id,
    totalAgents: 1,
    totalMessages: 0
  });

  world.agents.set(agent.id, agent);
  world.chats.set(chat.id, chat);

  return world;
}
