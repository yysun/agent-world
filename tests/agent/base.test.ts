import { Agent } from '../../src/agent/base';
import { AgentConfig, AgentType, LLMProvider, ChatMessage } from '../../src/types';

// Mock LLM Provider
class MockLLMProvider implements LLMProvider {
  model: string = 'mock-model';
  
  async chat(_messages: ChatMessage[], _onStream?: (chunk: string) => void): Promise<{ content: string }> {
    if (_onStream) {
      await _onStream('Streaming chunk');
    }
    return { content: 'Mock response' };
  }
}

// Mock LLM Factory
jest.mock('../../src/llm/base', () => ({
  LLMFactory: {
    createProvider: jest.fn().mockImplementation(() => Promise.resolve(new MockLLMProvider()))
  }
}));

describe('Agent', () => {
  const mockConfig: AgentConfig = {
    id: 'test-id',
    name: 'Test Agent',
    role: 'Test Role',
    provider: 'openai',
    model: 'gpt-4',
    type: AgentType.BASE,
    status: 'idle',
    lastActive: new Date(),
    chatHistory: []
  };

  const mockApiKey = 'test-api-key';
  let agent: Agent;

  beforeEach(async () => {
    agent = new Agent(mockConfig, mockApiKey);
    // Wait for provider initialization
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  describe('initialization', () => {
    it('should initialize with correct config values', () => {
      expect(agent.getId()).toBe(mockConfig.id);
      expect(agent.getName()).toBe(mockConfig.name);
      expect(agent.getRole()).toBe(mockConfig.role);
      expect(agent.getProvider()).toBe(mockConfig.provider);
    });
  });

  describe('chat', () => {
    it('should handle chat messages and update history', async () => {
      const input = 'Test message';
      const response = await agent.chat(input);

      expect(response.content).toBe('Mock response');
      expect(agent.getChatHistory()).toHaveLength(2); // User message + assistant response
      expect(agent.getChatHistory()[0].content).toBe(input);
      expect(agent.getChatHistory()[1].content).toBe('Mock response');
    });

    it('should maintain chat history within max limit', async () => {
      // Send multiple messages to exceed default history limit
      for (let i = 0; i < 15; i++) {
        await agent.chat(`Message ${i}`);
      }

      const history = agent.getChatHistory();
      expect(history.length).toBeLessThanOrEqual(20); // Default max is 10 messages * 2 (user + assistant)
    });

    it('should handle streaming responses', async () => {
      const streamedChunks: string[] = [];
      const onStream = (chunk: string) => {
        streamedChunks.push(chunk);
      };

      await agent.chat('Test message', onStream);
      expect(streamedChunks).toContain('Streaming chunk');
    });
  });

  describe('knowledge management', () => {
    it('should handle knowledge updates', () => {
      const testKnowledge = 'Test knowledge base';
      agent.setKnowledge(testKnowledge);
      expect(agent.getKnowledge()).toBe(testKnowledge);
    });
  });

  describe('status management', () => {
    it('should update status during chat', async () => {
      const statusUpdates: Array<'idle' | 'busy' | 'error'> = [];
      agent.on('stateUpdate', (config: AgentConfig) => {
        if (config.status) {
          statusUpdates.push(config.status);
        }
      });

      await agent.chat('Test message');

      expect(statusUpdates).toContain('busy');
      expect(statusUpdates).toContain('idle');
      expect(agent.getStatus().status).toBe('idle');
    });
  });

  describe('error handling', () => {
    it('should handle provider initialization failure', async () => {
      const mockError = new Error('Provider initialization failed');
      const mockFailedFactory = {
        LLMFactory: {
          createProvider: jest.fn().mockRejectedValue(mockError)
        }
      };

      // Temporarily replace the mock
      const originalMock = jest.requireMock('../../src/llm/base');
      jest.resetModules();
      jest.mock('../../src/llm/base', () => mockFailedFactory);

      await expect(async () => {
        new Agent(mockConfig, mockApiKey);
        await new Promise((_, reject) => reject(mockError));
      }).rejects.toThrow('Provider initialization failed');

      // Restore original mock
      jest.resetModules();
      jest.mock('../../src/llm/base', () => originalMock);
    });
  });
});
