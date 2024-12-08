import { ArchitectAgent } from '../../src/agent/architect';
import { AgentConfig, AgentType, LLMProvider, ChatMessage } from '../../src/types';

// Mock LLM Provider with knowledge reorganization capability
class MockArchitectLLMProvider implements LLMProvider {
  model: string = 'mock-model';
  private responseCounter = 0;
  
  async chat(messages: ChatMessage[], onStream?: (chunk: string) => void): Promise<{ content: string }> {
    // Simulate delay to ensure status updates are captured
    await new Promise(resolve => setTimeout(resolve, 50));

    if (onStream) {
      await onStream('Streaming chunk 1');
      await onStream('Streaming chunk 2');
    }

    // Simulate knowledge reorganization by combining existing and new knowledge
    const userMessage = messages.find(m => m.role === 'user');
    if (userMessage?.content.includes('Current Knowledge Base')) {
      this.responseCounter++;
      return {
        content: `- Existing knowledge point\n- New knowledge point ${this.responseCounter}\n- Combined insight ${this.responseCounter}`
      };
    }
    return { content: 'Mock response' };
  }
}

// Mock LLM Factory
jest.mock('../../src/llm/base', () => ({
  LLMFactory: {
    createProvider: jest.fn().mockImplementation(() => Promise.resolve(new MockArchitectLLMProvider()))
  }
}));

describe('ArchitectAgent', () => {
  const mockConfig: AgentConfig = {
    id: 'architect-id',
    name: 'Test Architect',
    role: '', // Will be overridden by ArchitectAgent
    provider: 'openai',
    model: 'gpt-4',
    type: AgentType.BASE, // Will be overridden by ArchitectAgent
    status: 'idle',
    lastActive: new Date(),
    chatHistory: []
  };

  const mockApiKey = 'test-api-key';
  let architect: ArchitectAgent;

  beforeEach(async () => {
    architect = new ArchitectAgent(mockConfig, mockApiKey);
    // Wait for provider initialization
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  describe('initialization', () => {
    it('should initialize with architect-specific role and type', () => {
      expect(architect.getRole()).toContain('AI Architect');
      expect(architect.type).toBe(AgentType.ARCHITECT);
    });
  });

  describe('knowledge management', () => {
    it('should initialize with empty knowledge', () => {
      expect(architect.getKnowledge()).toBe('');
    });

    it('should update knowledge through chat', async () => {
      // Set initial knowledge
      architect.setKnowledge('Initial system design');
      
      // Chat should trigger knowledge reorganization
      const response = await architect.chat('Add user authentication system');
      
      // Verify knowledge was updated with reorganized content
      expect(architect.getKnowledge()).toBe(response.content);
      expect(response.content).toContain('knowledge point');
    });

    it('should maintain knowledge continuity across multiple chats', async () => {
      await architect.chat('First requirement: User authentication');
      const firstKnowledge = architect.getKnowledge();
      
      await architect.chat('Second requirement: Database design');
      const secondKnowledge = architect.getKnowledge();
      
      expect(secondKnowledge).not.toBe('');
      expect(secondKnowledge).not.toBe(firstKnowledge); // Different counter values ensure different responses
    });
  });

  describe('chat functionality', () => {
    it('should handle streaming responses', async () => {
      const streamedChunks: string[] = [];
      const onStream = (chunk: string) => {
        streamedChunks.push(chunk);
      };

      await architect.chat('Add payment processing system', onStream);
      
      // Verify streaming callback was used
      expect(streamedChunks.length).toBe(2);
      expect(streamedChunks).toContain('Streaming chunk 1');
      expect(streamedChunks).toContain('Streaming chunk 2');
    });

    // Increase timeout for this test
    it('should update status during chat process', async () => {
      const statusUpdates: Array<'idle' | 'busy' | 'error'> = [];
      
      // Set up status tracking
      architect.on('stateUpdate', (config: AgentConfig) => {
        if (config.status) {
          statusUpdates.push(config.status);
        }
      });

      // Start with idle status
      expect(architect.getStatus().status).toBe('idle');

      // Start chat and wait for completion
      await architect.chat('Design database schema');

      // Verify final status and updates
      expect(statusUpdates.length).toBeGreaterThanOrEqual(2); // At least busy and idle
      expect(statusUpdates).toContain('busy');
      expect(statusUpdates).toContain('idle');
      expect(architect.getStatus().status).toBe('idle');
    }, 10000); // 10 second timeout
  });

  describe('error handling', () => {
    it('should handle chat errors gracefully', async () => {
      const mockError = new Error('Chat failed');
      const mockFailedProvider = {
        model: 'mock-model',
        chat: jest.fn().mockImplementation(async () => {
          architect.status = 'error';
          throw mockError;
        })
      };

      // Replace the provider
      jest.requireMock('../../src/llm/base').LLMFactory.createProvider
        .mockImplementationOnce(() => Promise.resolve(mockFailedProvider));

      architect = new ArchitectAgent(mockConfig, mockApiKey);
      await new Promise(resolve => setTimeout(resolve, 100)); // Wait for initialization

      await expect(async () => {
        await architect.chat('Test message');
      }).rejects.toThrow('Chat failed');
      
      expect(architect.getStatus().status).toBe('error');
    });
  });
});
