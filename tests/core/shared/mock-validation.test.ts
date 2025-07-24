/**
 * Mock Validation Test
 * 
 * Tests to verify that our mock infrastructure is working correctly
 * during the test reorganization process.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { setupAllMocks } from './mock-setup';
import { validateCompleteMockSetup } from './mock-validation';
import { TestDataPresets, AgentTestBuilder, WorldTestBuilder, MessageTestBuilder } from './test-data-builders';

describe('Mock Infrastructure Validation', () => {
  beforeEach(() => {
    setupAllMocks();
  });

  describe('Mock Setup Validation', () => {
    it('should have all required mocks configured', () => {
      const validation = validateCompleteMockSetup();
      expect(validation.success).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });
  });

  describe('Test Data Builders Validation', () => {
    it('should create valid Agent instances', () => {
      const agent = TestDataPresets.createBasicAgent();
      expect(agent).toBeDefined();
      expect(agent.id).toBeDefined();
      expect(agent.name).toBeDefined();
      expect(agent.generateResponse).toBeDefined();
      expect(typeof agent.generateResponse).toBe('function');
    });

    it('should create valid World instances', () => {
      const world = TestDataPresets.createWorld();
      expect(world).toBeDefined();
      expect(world.id).toBeDefined();
      expect(world.name).toBeDefined();
      expect(world.agents).toBeDefined();
      expect(world.agents instanceof Map).toBe(true);
    });

    it('should create valid AgentMessage instances', () => {
      const message = TestDataPresets.createMessage();
      expect(message).toBeDefined();
      expect(message.role).toBeDefined();
      expect(message.content).toBeDefined();
      expect(message.createdAt).toBeInstanceOf(Date);
    });

    it('should support builder pattern fluent interface', () => {
      const agent = new AgentTestBuilder()
        .withId('test-id')
        .withName('Test Agent')
        .withStatus('active')
        .build();

      expect(agent.id).toBe('test-id');
      expect(agent.name).toBe('Test Agent');
      expect(agent.status).toBe('active');
    });

    it('should create conversation sequences', () => {
      const conversation = TestDataPresets.createConversation(5);
      expect(conversation).toHaveLength(5);
      conversation.forEach((message, index) => {
        expect(message.content).toContain(`Message ${index + 1}`);
      });
    });
  });

  describe('Mock Function Behavior', () => {
    it('should mock LLM calls without actual API requests', async () => {
      const agent = TestDataPresets.createBasicAgent();
      const messages = TestDataPresets.createConversation(2);

      // This should be mocked and not make actual LLM API calls
      const response = await agent.generateResponse(messages);
      expect(typeof response).toBe('string');
      expect(response).toBe('Mock response');
    });

    it('should support custom mock responses', async () => {
      const customResponses = ['Response 1', 'Response 2', 'Response 3'];
      const agent = new AgentTestBuilder()
        .withMockResponses(customResponses)
        .build();

      // Should return responses in order
      await expect(agent.generateResponse([])).resolves.toBe('Response 1');
      await expect(agent.generateResponse([])).resolves.toBe('Response 2');
      await expect(agent.generateResponse([])).resolves.toBe('Response 3');
      await expect(agent.generateResponse([])).resolves.toBe('Default mock response');
    });
  });

  describe('Cross-Builder Integration', () => {
    it('should support complex test scenarios', () => {
      const agents = [
        new AgentTestBuilder().withId('agent-1').withName('Agent 1').build(),
        new AgentTestBuilder().withId('agent-2').withName('Agent 2').build()
      ];

      const world = new WorldTestBuilder()
        .withName('Integration Test World')
        .withAgents(agents)
        .build();

      expect(world.agents.size).toBe(2);
      expect(world.agents.get('agent-1')?.name).toBe('Agent 1');
      expect(world.agents.get('agent-2')?.name).toBe('Agent 2');
    });

    it('should handle agent-world relationships', () => {
      const agent = TestDataPresets.createBasicAgent();
      const world = TestDataPresets.createWorldWithAgents([agent]);

      expect(world.agents.has(agent.id)).toBe(true);
      expect(world.agents.get(agent.id)).toEqual(agent);
    });
  });

  describe('Type Safety Validation', () => {
    it('should maintain TypeScript type safety', () => {
      const agent = TestDataPresets.createBasicAgent();
      const message = TestDataPresets.createUserMessage('Hello');

      // These should compile without TypeScript errors
      expect(agent.id).toBeDefined();
      expect(agent.memory).toBeInstanceOf(Array);
      expect(message.role).toBe('user');
      expect(message.content).toBe('Hello');
    });

    it('should support enum values correctly', () => {
      const agentParams = TestDataPresets.createAgentParams();
      expect(agentParams.provider).toBe('openai');
      expect(typeof agentParams.provider).toBe('string');
    });
  });
});
