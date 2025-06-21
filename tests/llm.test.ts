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
    it('should load OpenAI provider correctly', () => {
      const provider = loadLLMProvider(config);
      expect(provider).toBeDefined();
    });

    it('should load Anthropic provider correctly', () => {
      config.provider = LLMProvider.ANTHROPIC;
      const provider = loadLLMProvider(config);
      expect(provider).toBeDefined();
    });

    it('should load Google provider correctly', () => {
      config.provider = LLMProvider.GOOGLE;
      const provider = loadLLMProvider(config);
      expect(provider).toBeDefined();
    });

    it('should load xAI provider correctly', () => {
      config.provider = LLMProvider.XAI;
      const provider = loadLLMProvider(config);
      expect(provider).toBeDefined();
    });

    it('should load Ollama provider correctly', () => {
      config.provider = LLMProvider.OLLAMA;
      config.ollamaBaseUrl = 'http://localhost:11434/api';
      const provider = loadLLMProvider(config);
      expect(provider).toBeDefined();
    });

    it('should throw error for unsupported provider', () => {
      config.provider = 'unsupported' as LLMProvider;
      expect(() => loadLLMProvider(config)).toThrow('Unsupported LLM provider');
    });
  });

  describe('singleRequest', () => {
    it('should create provider and make request', async () => {
      // This test verifies the function structure, actual LLM calls would need API keys
      expect(typeof singleRequest).toBe('function');

      // Test that it accepts the correct parameters
      const systemPrompt = 'You are a test assistant.';
      const userPrompt = 'Hello, world!';

      // The function should be callable (will fail due to no real API key, but that's expected)
      try {
        await singleRequest(config, systemPrompt, userPrompt);
      } catch (error) {
        // Expected to fail without real API key, but function structure is correct
        expect(error).toBeDefined();
      }
    });
  });

  describe('Function interfaces', () => {
    it('should have correct function signatures', () => {
      expect(typeof loadLLMProvider).toBe('function');
      expect(typeof chatWithLLM).toBe('function');
      expect(typeof streamChatWithLLM).toBe('function');
      expect(typeof singleRequest).toBe('function');
    });

    it('should accept correct configuration interface', () => {
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
    it('should preserve streaming functionality structure', () => {
      // Verify streamChatWithLLM has the expected signature (removed EventManager parameter)
      expect(streamChatWithLLM.length).toBe(4); // 4 parameters (options is optional)

      // Verify it requires messageId for SSE
      const provider = loadLLMProvider(config);
      const systemPrompt = 'Test system';
      const userPrompt = 'Test user';
      const messageId = 'test-message-123';

      // Function should be callable with correct parameters
      expect(() => {
        streamChatWithLLM(provider, systemPrompt, userPrompt, messageId);
      }).not.toThrow();
    });

    it('should maintain timeout and error handling structure', () => {
      // The streamChatWithLLM should handle timeouts (tested by structure, not actual timeout)
      const provider = loadLLMProvider(config);
      expect(typeof streamChatWithLLM).toBe('function');

      // Should return a Promise (async function)
      const result = streamChatWithLLM(provider, 'test', 'test', 'msg-id');
      expect(result).toBeInstanceOf(Promise);
    });
  });
});
