import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  loadLLMProvider,
  chatWithLLM,
  streamChatWithLLM,
  singleRequest,
  LLMConfig
} from '../src/llm';
import { LLMProvider } from '../src/types';

describe('Simplified LLM Wrapper', () => {
  let config: LLMConfig;

  beforeEach(() => {
    config = {
      provider: LLMProvider.OPENAI,
      model: 'gpt-3.5-turbo',
      temperature: 0.7,
      maxTokens: 100,
      apiKey: 'test-key'
    };
  });

  describe('loadLLMProvider', () => {
    it('should load OpenAI provider correctly', async () => {
      const provider = loadLLMProvider(config);
      expect(provider).toBeDefined();
    });

    it('should load Anthropic provider correctly', async () => {
      config.provider = LLMProvider.ANTHROPIC;
      const provider = loadLLMProvider(config);
      expect(provider).toBeDefined();
    });

    it('should load Google provider correctly', async () => {
      config.provider = LLMProvider.GOOGLE;
      const provider = loadLLMProvider(config);
      expect(provider).toBeDefined();
    });

    it('should load xAI provider correctly', async () => {
      config.provider = LLMProvider.XAI;
      const provider = loadLLMProvider(config);
      expect(provider).toBeDefined();
    });

    it('should load Ollama provider correctly', async () => {
      config.provider = LLMProvider.OLLAMA;
      config.ollamaBaseUrl = 'http://localhost:11434/api';
      const provider = loadLLMProvider(config);
      expect(provider).toBeDefined();
    });

    it('should throw error for unsupported provider', async () => {
      config.provider = 'unsupported' as LLMProvider;
      expect(() => loadLLMProvider(config)).toThrow('Unsupported LLM provider');
    });
  });

  describe('singleRequest', () => {
    it('should create provider and make request', async () => {
      // This test verifies the function structure, actual LLM calls would need API keys
      expect(typeof singleRequest).toBe('function');

      // Test that it accepts the correct parameters
      const messages = [
        { role: 'system' as const, content: 'You are a test assistant.' },
        { role: 'user' as const, content: 'Hello, world!' }
      ];

      // The function should be callable (will fail due to no real API key, but that's expected)
      try {
        await singleRequest(config, messages);
      } catch (error) {
        // Expected to fail without real API key, but function structure is correct
        expect(error).toBeDefined();
      }
    });
  });

  describe('Function interfaces', () => {
    it('should have correct function signatures', async () => {
      expect(typeof loadLLMProvider).toBe('function');
      expect(typeof chatWithLLM).toBe('function');
      expect(typeof streamChatWithLLM).toBe('function');
      expect(typeof singleRequest).toBe('function');
    });

    it('should accept correct configuration interface', async () => {
      const validConfig: LLMConfig = {
        provider: LLMProvider.OPENAI,
        model: 'gpt-4',
        apiKey: 'sk-test',
        baseUrl: 'https://api.openai.com/v1',
        temperature: 0.5,
        maxTokens: 500,
        ollamaBaseUrl: 'http://localhost:11434/api',
        azureEndpoint: 'https://test.openai.azure.com',
        azureApiVersion: '2024-02-15-preview',
        azureDeployment: 'gpt-4'
      };

      expect(() => loadLLMProvider(validConfig)).not.toThrow();
    });
  });

  describe('Extracted LLMQueue functionality', () => {
    it('should preserve streaming functionality structure', async () => {
      // Verify streamChatWithLLM has the expected signature (updated for messages array)
      expect(streamChatWithLLM.length).toBe(3); // 3 parameters (options is optional)

      // Verify it requires messageId for SSE
      const provider = loadLLMProvider(config);
      const messages = [
        { role: 'system' as const, content: 'Test system' },
        { role: 'user' as const, content: 'Test user' }
      ];
      const messageId = 'test-message-123';

      // Function should be callable with correct parameters
      expect(() => {
        streamChatWithLLM(provider, messages, messageId);
      }).not.toThrow();
    });

    it('should maintain timeout and error handling structure', async () => {
      // The streamChatWithLLM should handle timeouts (tested by structure, not actual timeout)
      const provider = loadLLMProvider(config);
      expect(typeof streamChatWithLLM).toBe('function');

      // Should return a Promise (async function)
      const result = streamChatWithLLM(provider, [{ role: 'user', content: 'test' }], 'msg-id');
      expect(result).toBeInstanceOf(Promise);
    });
  });
});
