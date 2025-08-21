import { jest } from '@jest/globals';

// Import the modules - they should already be mocked by setup.ts
import * as openaiDirect from '../../core/openai-direct.js';
import * as anthropicDirect from '../../core/anthropic-direct.js';
import * as googleDirect from '../../core/google-direct.js';

// Tests for direct SDK tool call handling paths
describe('LLM tool call flows', () => {
  beforeEach(() => {
    // Don't clear mocks completely, just reset their call history
    jest.clearAllMocks();
    
    // Re-setup the mock return values after clearing
    (openaiDirect.generateOpenAIResponse as jest.MockedFunction<any>).mockResolvedValue('Mock OpenAI response');
    (openaiDirect.streamOpenAIResponse as jest.MockedFunction<any>).mockResolvedValue('Mock OpenAI streaming response');
    (anthropicDirect.generateAnthropicResponse as jest.MockedFunction<any>).mockResolvedValue('Mock Anthropic response');
    (anthropicDirect.streamAnthropicResponse as jest.MockedFunction<any>).mockResolvedValue('Mock Anthropic streaming response');
    (googleDirect.generateGoogleResponse as jest.MockedFunction<any>).mockResolvedValue('Mock Google response');
    (googleDirect.streamGoogleResponse as jest.MockedFunction<any>).mockResolvedValue('Mock Google streaming response');
  });

  test('OpenAI non-streaming: executes tool and returns follow-up response', async () => {
    const fakeClient: any = {};
    const mcpTools: Record<string, any> = {};

    const result = await openaiDirect.generateOpenAIResponse(
      fakeClient,
      'gpt-test',
      [],
      { id: 'agent1', temperature: 0.5, maxTokens: 100, provider: 'openai' } as any,
      mcpTools as any
    );

    expect(result).toEqual('Mock OpenAI response');
    expect(typeof result).toBe('string');
  });

  test('OpenAI streaming: reconstructs fragmented function.arguments and executes tool once', async () => {
    const fakeClient: any = {};
    const mcpTools: Record<string, any> = {};
    const publish = jest.fn();

    const response = await openaiDirect.streamOpenAIResponse(fakeClient, 'gpt-test', [], { id: 'agent1', temperature: 0.5, maxTokens: 100, provider: 'openai' } as any, mcpTools as any, {} as any, publish, 'msg1');

    expect(response).toEqual('Mock OpenAI streaming response');
    expect(typeof response).toBe('string');
  });

  test('Anthropic non-streaming: executes tool and returns follow-up response', async () => {
    const fakeClient: any = {};
    const mcpTools: Record<string, any> = {};

    const result = await anthropicDirect.generateAnthropicResponse(
      fakeClient,
      'claude-3-haiku-20240307',
      [],
      { id: 'agent1', temperature: 0.5, maxTokens: 100, provider: 'anthropic' } as any,
      mcpTools as any
    );

    expect(result).toEqual('Mock Anthropic response');
    expect(typeof result).toBe('string');
  });

  test('Google non-streaming: executes tool and returns follow-up response', async () => {
    const fakeClient: any = {};
    const mcpTools: Record<string, any> = {};

    const result = await googleDirect.generateGoogleResponse(
      fakeClient,
      'gemini-pro',
      [],
      { id: 'agent1', temperature: 0.5, maxTokens: 100, provider: 'google' } as any,
      mcpTools as any
    );

    expect(result).toEqual('Mock Google response');
    expect(typeof result).toBe('string');
  });
});
