/**
 * Test Data Builders for Agent World Test Suite
 * 
 * Provides centralized builders for creating test data across all reorganized test files.
 * These builders ensure consistency and reduce duplication in test setup.
 */

import type {
  Agent,
  AgentMessage,
  World,
  WorldMessageEvent,
  LLMProvider,
  CreateAgentParams,
  CreateWorldParams,
  WorldData,
  StorageManager,
  MessageProcessor
} from '../../../core/types';
import { EventEmitter } from 'events';

// Basic test data defaults
export const DEFAULT_AGENT_ID = 'test-agent-123';
export const DEFAULT_WORLD_ID = 'test-world-456';
export const DEFAULT_WORLD_PATH = '/tmp/test-worlds/test-world';

/**
 * Builder class for creating test Agent instances with proper mock functions
 */
export class AgentTestBuilder {
  private agent: Partial<Agent> = {};

  constructor() {
    this.reset();
  }

  reset(): AgentTestBuilder {
    this.agent = {
      id: DEFAULT_AGENT_ID,
      name: 'Test Agent',
      type: 'test-agent',
      status: 'active',
      provider: 'openai' as LLMProvider,
      model: 'gpt-3.5-turbo',
      systemPrompt: 'You are a test agent.',
      temperature: 0.7,
      maxTokens: 1000,
      createdAt: new Date(),
      lastActive: new Date(),
      llmCallCount: 0,
      lastLLMCall: new Date(),
      memory: [],
      generateResponse: jest.fn().mockResolvedValue('Mock response'),
      streamResponse: jest.fn().mockResolvedValue('Mock stream response'),
      addToMemory: jest.fn().mockResolvedValue(undefined),
      getMemorySize: jest.fn().mockReturnValue(0),
      archiveMemory: jest.fn().mockResolvedValue(undefined),
      getMemorySlice: jest.fn().mockReturnValue([]),
      searchMemory: jest.fn().mockReturnValue([]),
      shouldRespond: jest.fn().mockResolvedValue(false),
      processMessage: jest.fn().mockResolvedValue(undefined),
      extractMentions: jest.fn().mockReturnValue([]),
      isMentioned: jest.fn().mockReturnValue(false),
    };
    return this;
  }

  withId(id: string): AgentTestBuilder {
    this.agent.id = id;
    return this;
  }

  withName(name: string): AgentTestBuilder {
    this.agent.name = name;
    return this;
  }

  withType(type: string): AgentTestBuilder {
    this.agent.type = type;
    return this;
  }

  withStatus(status: 'active' | 'inactive' | 'error'): AgentTestBuilder {
    this.agent.status = status;
    return this;
  }

  withProvider(provider: LLMProvider): AgentTestBuilder {
    this.agent.provider = provider;
    return this;
  }

  withModel(model: string): AgentTestBuilder {
    this.agent.model = model;
    return this;
  }

  withMemory(memory: AgentMessage[]): AgentTestBuilder {
    this.agent.memory = memory;
    return this;
  }

  withLLMCallCount(count: number): AgentTestBuilder {
    this.agent.llmCallCount = count;
    return this;
  }

  withMockResponses(responses: string[]): AgentTestBuilder {
    const responseQueue = [...responses];
    this.agent.generateResponse = jest.fn().mockImplementation(() => {
      return Promise.resolve(responseQueue.shift() || 'Default mock response');
    });
    return this;
  }

  build(): Agent {
    return { ...this.agent } as Agent;
  }
}

/**
 * Builder class for creating test World instances
 */
export class WorldTestBuilder {
  private world: Partial<World> = {};

  constructor() {
    this.reset();
  }

  reset(): WorldTestBuilder {
    const mockEventEmitter = new EventEmitter();
    const mockAgentsMap = new Map<string, Agent>();

    // Create mock storage manager
    const mockStorage: StorageManager = {
      saveWorld: jest.fn(),
      loadWorld: jest.fn(),
      deleteWorld: jest.fn(),
      listWorlds: jest.fn(),
      saveAgent: jest.fn(),
      loadAgent: jest.fn(),
      deleteAgent: jest.fn(),
      listAgents: jest.fn(),
      saveAgentsBatch: jest.fn(),
      loadAgentsBatch: jest.fn(),
      validateIntegrity: jest.fn(),
      repairData: jest.fn(),
    };

    // Create mock message processor
    const mockMessageProcessor: MessageProcessor = {
      extractMentions: jest.fn().mockReturnValue([]),
      extractParagraphBeginningMentions: jest.fn().mockReturnValue([]),
      determineSenderType: jest.fn().mockReturnValue('agent'),
      shouldAutoMention: jest.fn().mockReturnValue(false),
      addAutoMention: jest.fn().mockReturnValue(''),
      removeSelfMentions: jest.fn().mockReturnValue(''),
    };

    this.world = {
      id: DEFAULT_WORLD_ID,
      rootPath: DEFAULT_WORLD_PATH,
      name: 'Test World',
      description: 'A test world for unit testing',
      turnLimit: 10,
      eventEmitter: mockEventEmitter,
      agents: mockAgentsMap,
      storage: mockStorage,
      messageProcessor: mockMessageProcessor,
      createAgent: jest.fn(),
      getAgent: jest.fn(),
      updateAgent: jest.fn(),
      deleteAgent: jest.fn(),
      clearAgentMemory: jest.fn(),
      listAgents: jest.fn(),
      updateAgentMemory: jest.fn(),
      saveAgentConfig: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
      reload: jest.fn(),
      getTurnLimit: jest.fn().mockReturnValue(10),
      getCurrentTurnCount: jest.fn().mockReturnValue(0),
      hasReachedTurnLimit: jest.fn().mockReturnValue(false),
      resetTurnCount: jest.fn(),
      publishMessage: jest.fn(),
      subscribeToMessages: jest.fn().mockReturnValue(() => { }),
      broadcastMessage: jest.fn(),
      publishSSE: jest.fn(),
      subscribeToSSE: jest.fn().mockReturnValue(() => { }),
      subscribeAgent: jest.fn().mockReturnValue(() => { }),
      unsubscribeAgent: jest.fn(),
      getSubscribedAgents: jest.fn().mockReturnValue([]),
      isAgentSubscribed: jest.fn().mockReturnValue(false),
    };
    return this;
  }

  withId(id: string): WorldTestBuilder {
    this.world.id = id;
    return this;
  }

  withName(name: string): WorldTestBuilder {
    this.world.name = name;
    return this;
  }

  withDescription(description: string): WorldTestBuilder {
    this.world.description = description;
    return this;
  }

  withRootPath(path: string): WorldTestBuilder {
    this.world.rootPath = path;
    return this;
  }

  withTurnLimit(limit: number): WorldTestBuilder {
    this.world.turnLimit = limit;
    return this;
  }

  withAgents(agents: Agent[]): WorldTestBuilder {
    const agentsMap = new Map<string, Agent>();
    agents.forEach(agent => agentsMap.set(agent.id, agent));
    this.world.agents = agentsMap;
    return this;
  }

  build(): World {
    return { ...this.world } as World;
  }
}

/**
 * Builder class for creating test AgentMessage instances
 */
export class MessageTestBuilder {
  private message: Partial<AgentMessage> = {};

  constructor() {
    this.reset();
  }

  reset(): MessageTestBuilder {
    this.message = {
      role: 'user',
      content: 'Test message content',
      createdAt: new Date(),
      sender: 'Test Agent'
    };
    return this;
  }

  withRole(role: 'system' | 'user' | 'assistant'): MessageTestBuilder {
    this.message.role = role;
    return this;
  }

  withContent(content: string): MessageTestBuilder {
    this.message.content = content;
    return this;
  }

  withSender(sender: string): MessageTestBuilder {
    this.message.sender = sender;
    return this;
  }

  withTimestamp(timestamp: Date): MessageTestBuilder {
    this.message.createdAt = timestamp;
    return this;
  }

  asSystemMessage(content: string): MessageTestBuilder {
    this.message.role = 'system';
    this.message.content = content;
    return this;
  }

  asUserMessage(content: string): MessageTestBuilder {
    this.message.role = 'user';
    this.message.content = content;
    return this;
  }

  asAssistantMessage(content: string): MessageTestBuilder {
    this.message.role = 'assistant';
    this.message.content = content;
    return this;
  }

  build(): AgentMessage {
    return { ...this.message } as AgentMessage;
  }
}

/**
 * Builder class for creating WorldMessageEvent instances
 */
export class WorldMessageEventTestBuilder {
  private event: Partial<WorldMessageEvent> = {};

  constructor() {
    this.reset();
  }

  reset(): WorldMessageEventTestBuilder {
    this.event = {
      content: 'Test world message',
      sender: 'Test Agent',
      timestamp: new Date(),
      messageId: `msg-${Date.now()}`
    };
    return this;
  }

  withContent(content: string): WorldMessageEventTestBuilder {
    this.event.content = content;
    return this;
  }

  withSender(sender: string): WorldMessageEventTestBuilder {
    this.event.sender = sender;
    return this;
  }

  withTimestamp(timestamp: Date): WorldMessageEventTestBuilder {
    this.event.timestamp = timestamp;
    return this;
  }

  withMessageId(messageId: string): WorldMessageEventTestBuilder {
    this.event.messageId = messageId;
    return this;
  }

  build(): WorldMessageEvent {
    return { ...this.event } as WorldMessageEvent;
  }
}

/**
 * Preset configurations for common test scenarios
 */
export class TestDataPresets {
  static createBasicAgent(): Agent {
    return new AgentTestBuilder().build();
  }

  static createActiveAgent(id: string = DEFAULT_AGENT_ID): Agent {
    return new AgentTestBuilder()
      .withId(id)
      .withStatus('active')
      .build();
  }

  static createInactiveAgent(id: string = DEFAULT_AGENT_ID): Agent {
    return new AgentTestBuilder()
      .withId(id)
      .withStatus('inactive')
      .build();
  }

  static createAgentWithMemory(messages: AgentMessage[]): Agent {
    return new AgentTestBuilder()
      .withMemory(messages)
      .build();
  }

  static createWorld(): World {
    return new WorldTestBuilder().build();
  }

  static createWorldWithAgents(agents: Agent[]): World {
    return new WorldTestBuilder()
      .withAgents(agents)
      .build();
  }

  static createMessage(): AgentMessage {
    return new MessageTestBuilder().build();
  }

  static createSystemMessage(content: string): AgentMessage {
    return new MessageTestBuilder()
      .asSystemMessage(content)
      .build();
  }

  static createUserMessage(content: string): AgentMessage {
    return new MessageTestBuilder()
      .asUserMessage(content)
      .build();
  }

  static createAssistantMessage(content: string): AgentMessage {
    return new MessageTestBuilder()
      .asAssistantMessage(content)
      .build();
  }

  static createConversation(messageCount: number = 3): AgentMessage[] {
    const messages: AgentMessage[] = [];
    for (let i = 0; i < messageCount; i++) {
      messages.push(
        new MessageTestBuilder()
          .withContent(`Message ${i + 1} content`)
          .withTimestamp(new Date(Date.now() + i * 1000))
          .build()
      );
    }
    return messages;
  }

  static createWorldMessageEvent(): WorldMessageEvent {
    return new WorldMessageEventTestBuilder().build();
  }

  static createAgentParams(): CreateAgentParams {
    return {
      name: 'Test Agent',
      type: 'test-agent',
      provider: 'openai' as LLMProvider,
      model: 'gpt-3.5-turbo',
      systemPrompt: 'You are a test agent.'
    };
  }

  static createWorldParams(): CreateWorldParams {
    return {
      name: 'Test World',
      description: 'A test world',
      turnLimit: 10
    };
  }

  static createWorldData(): WorldData {
    return {
      id: DEFAULT_WORLD_ID,
      name: 'Test World',
      description: 'A test world',
      turnLimit: 10
    };
  }
}
