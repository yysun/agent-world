/**
 * Tests for class-based Agent implementation
 * 
 * These tests validate the new Agent class functionality including:
 * - Agent initialization and lifecycle management
 * - Memory management operations
 * - LLM response generation (mocked)
 * - Message processing and response logic
 * - Metrics collection and performance monitoring
 */

import { Agent, AgentConfig } from '../../../core/classes/Agent.js';
import { LLMProvider } from '../../../core/types.js';

// Mock storage manager for testing
const mockStorageManager = {
  saveAgent: jest.fn().mockResolvedValue(undefined),
  loadAgent: jest.fn().mockResolvedValue(null),
  saveAgentMemory: jest.fn().mockResolvedValue(undefined),
  archiveAgentMemory: jest.fn().mockResolvedValue(undefined),
} as any;

describe('Agent Class', () => {
  let agent: Agent;
  const testConfig: AgentConfig = {
    id: 'test-agent',
    name: 'Test Agent',
    type: 'test',
    provider: LLMProvider.OPENAI,
    model: 'gpt-4',
    systemPrompt: 'You are a helpful assistant',
    temperature: 0.7,
    maxTokens: 1000
  };

  beforeEach(() => {
    agent = new Agent(testConfig);
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should create agent with correct configuration', () => {
      expect(agent.id).toBe(testConfig.id);
      expect(agent.name).toBe(testConfig.name);
      expect(agent.type).toBe(testConfig.type);
      expect(agent.provider).toBe(testConfig.provider);
      expect(agent.model).toBe(testConfig.model);
      expect(agent.systemPrompt).toBe(testConfig.systemPrompt);
      expect(agent.temperature).toBe(testConfig.temperature);
      expect(agent.maxTokens).toBe(testConfig.maxTokens);
      expect(agent.memory).toEqual([]);
      expect(agent.llmCallCount).toBe(0);
      expect(agent.status).toBe('inactive');
    });

    it('should initialize agent with storage manager', async () => {
      await agent.initialize(mockStorageManager, 'test-world');
      
      expect(agent.status).toBe('active');
      expect(mockStorageManager.loadAgent).toHaveBeenCalledWith('test-world', 'test-agent');
    });

    it('should throw error when calling methods before initialization', async () => {
      await expect(agent.addToMemory({ role: 'user', content: 'test' }))
        .rejects.toThrow('Agent not initialized');
    });
  });

  describe('Memory Management', () => {
    beforeEach(async () => {
      await agent.initialize(mockStorageManager, 'test-world');
    });

    it('should add message to memory', async () => {
      const message = { role: 'user' as const, content: 'Hello' };
      
      await agent.addToMemory(message);
      
      expect(agent.memory).toHaveLength(1);
      expect(agent.memory[0].content).toBe('Hello');
      expect(agent.memory[0].createdAt).toBeInstanceOf(Date);
      expect(mockStorageManager.saveAgentMemory).toHaveBeenCalled();
    });

    it('should return correct memory size', async () => {
      await agent.addToMemory({ role: 'user', content: 'Message 1' });
      await agent.addToMemory({ role: 'assistant', content: 'Response 1' });
      
      expect(agent.getMemorySize()).toBe(2);
    });

    it('should return memory slice', async () => {
      await agent.addToMemory({ role: 'user', content: 'Message 1' });
      await agent.addToMemory({ role: 'assistant', content: 'Response 1' });
      await agent.addToMemory({ role: 'user', content: 'Message 2' });
      
      const slice = agent.getMemorySlice(1, 3);
      expect(slice).toHaveLength(2);
      expect(slice[0].content).toBe('Response 1');
      expect(slice[1].content).toBe('Message 2');
    });

    it('should search memory by content', async () => {
      await agent.addToMemory({ role: 'user', content: 'Hello world' });
      await agent.addToMemory({ role: 'assistant', content: 'Hi there' });
      await agent.addToMemory({ role: 'user', content: 'How are you?' });
      
      const results = agent.searchMemory('hello');
      expect(results).toHaveLength(1);
      expect(results[0].content).toBe('Hello world');
    });

    it('should archive memory and clear', async () => {
      await agent.addToMemory({ role: 'user', content: 'Message 1' });
      await agent.addToMemory({ role: 'assistant', content: 'Response 1' });
      
      await agent.archiveMemory();
      
      expect(agent.memory).toHaveLength(0);
      expect(mockStorageManager.archiveAgentMemory).toHaveBeenCalled();
      expect(mockStorageManager.saveAgentMemory).toHaveBeenCalledWith('test-world', 'test-agent', []);
    });
  });

  describe('Message Processing', () => {
    beforeEach(async () => {
      await agent.initialize(mockStorageManager, 'test-world');
    });

    it('should extract mentions from content', () => {
      const content = 'Hello @test-agent, how are you? Also @other-agent';
      const mentions = agent.extractMentions(content);
      
      expect(mentions).toEqual(['test-agent', 'other-agent']);
    });

    it('should detect if agent is mentioned', () => {
      const content1 = 'Hello @test-agent, how are you?';
      const content2 = 'Hello @Test-Agent, how are you?'; // Case insensitive
      const content3 = 'Hello @other-agent, how are you?';
      
      expect(agent.isMentioned(content1)).toBe(true);
      expect(agent.isMentioned(content2)).toBe(true);
      expect(agent.isMentioned(content3)).toBe(false);
    });

    it('should detect mentions by agent name', () => {
      const content = 'Hello @Test Agent, how are you?';
      expect(agent.isMentioned(content)).toBe(false); // Names with spaces aren't valid mentions
      
      const validContent = 'Hello @test-agent, how are you?';
      expect(agent.isMentioned(validContent)).toBe(true);
    });
  });

  describe('Serialization', () => {
    beforeEach(async () => {
      await agent.initialize(mockStorageManager, 'test-world');
      await agent.addToMemory({ role: 'user', content: 'Test message' });
      agent.llmCallCount = 5;
      agent.lastLLMCall = new Date();
    });

    it('should serialize to JSON correctly', () => {
      const json = agent.toJSON();
      
      expect(json.id).toBe(agent.id);
      expect(json.name).toBe(agent.name);
      expect(json.type).toBe(agent.type);
      expect(json.provider).toBe(agent.provider);
      expect(json.model).toBe(agent.model);
      expect(json.llmCallCount).toBe(5);
      expect(json.memory).toHaveLength(1);
      expect(json.memory[0].content).toBe('Test message');
    });

    it('should create agent from JSON', () => {
      const json = agent.toJSON();
      const restoredAgent = Agent.fromJSON(json);
      
      expect(restoredAgent.id).toBe(agent.id);
      expect(restoredAgent.name).toBe(agent.name);
      expect(restoredAgent.llmCallCount).toBe(agent.llmCallCount);
      expect(restoredAgent.memory).toHaveLength(agent.memory.length);
    });
  });

  describe('Metrics', () => {
    beforeEach(async () => {
      await agent.initialize(mockStorageManager, 'test-world');
    });

    it('should initialize metrics correctly', () => {
      const metrics = agent.getMetrics();
      
      expect(metrics.llmCallCount).toBe(0);
      expect(metrics.totalTokensUsed).toBe(0);
      expect(metrics.averageResponseTime).toBe(0);
      expect(metrics.messageCount).toBe(0);
      expect(metrics.errorCount).toBe(0);
      expect(metrics.lastActivity).toBeNull();
    });

    it('should update message count when adding to memory', async () => {
      await agent.addToMemory({ role: 'user', content: 'Test' });
      
      const metrics = agent.getMetrics();
      expect(metrics.messageCount).toBe(1);
    });
  });

  describe('Event Emission', () => {
    beforeEach(async () => {
      await agent.initialize(mockStorageManager, 'test-world');
    });

    it('should emit initialization event', (done) => {
      const newAgent = new Agent(testConfig);
      
      newAgent.on('initialized', (data) => {
        expect(data.agentId).toBe('test-agent');
        expect(data.worldId).toBe('test-world');
        done();
      });
      
      newAgent.initialize(mockStorageManager, 'test-world');
    });

    it('should emit memory events', (done) => {
      agent.on('memoryAdded', (data) => {
        expect(data.agentId).toBe('test-agent');
        expect(data.messageRole).toBe('user');
        expect(data.memorySize).toBe(1);
        done();
      });
      
      agent.addToMemory({ role: 'user', content: 'Test' });
    });
  });

  describe('Cleanup', () => {
    beforeEach(async () => {
      await agent.initialize(mockStorageManager, 'test-world');
    });

    it('should cleanup agent properly', async () => {
      await agent.addToMemory({ role: 'user', content: 'Test' });
      
      await agent.cleanup();
      
      expect(agent.status).toBe('inactive');
      expect(mockStorageManager.saveAgent).toHaveBeenCalled();
    });

    it('should emit cleanup event', (done) => {
      agent.on('cleanup', (data) => {
        expect(data.agentId).toBe('test-agent');
        done();
      });
      
      agent.cleanup();
    });
  });
});