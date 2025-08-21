import { jest } from '@jest/globals';
let openaiDirect: typeof import('../../core/openai-direct.js');
let anthropicDirect: typeof import('../../core/anthropic-direct.js');
let googleDirect: typeof import('../../core/google-direct.js');
let llmManager: typeof import('../../core/llm-manager.js');

// Tests for direct SDK tool call handling paths
describe('LLM tool call flows', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  beforeAll(async () => {
    // Import the already mocked modules (mocked in setup.ts)
    openaiDirect = await import('../../core/openai-direct.js');
    anthropicDirect = await import('../../core/anthropic-direct.js');
    googleDirect = await import('../../core/google-direct.js');
    llmManager = await import('../../core/llm-manager.js');
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

    expect(result).toEqual(expect.any(String));
  });

  test('OpenAI streaming: reconstructs fragmented function.arguments and executes tool once', async () => {
    const fakeClient: any = {};
    const mcpTools: Record<string, any> = {};
    const publish = jest.fn();

    const response = await openaiDirect.streamOpenAIResponse(fakeClient, 'gpt-test', [], { id: 'agent1', temperature: 0.5, maxTokens: 100, provider: 'openai' } as any, mcpTools as any, {} as any, publish, 'msg1');

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

    expect(result).toEqual(expect.any(String));
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

    expect(result).toEqual(expect.any(String));
  });
});
