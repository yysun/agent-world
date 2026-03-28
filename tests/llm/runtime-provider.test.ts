/**
 * LLM Package Runtime Provider Dispatch Tests
 *
 * Purpose:
 * - Verify that `createLLMRuntime(...)` dispatches provider calls through the package-owned provider layer.
 *
 * Key features:
 * - Covers runtime.generate and runtime.stream provider dispatch.
 * - Verifies constructor/per-call tool resolution reaches the provider adapter.
 * - Uses mocked package provider modules with no real SDK or network usage.
 *
 * Implementation notes:
 * - Mocks package provider modules directly to keep tests focused on runtime orchestration.
 * - Avoids real filesystem, network, and provider clients.
 *
 * Recent changes:
 * - 2026-03-27: Initial provider-dispatch coverage for the publishable `@agent-world/llm` runtime.
 */

import { describe, expect, it, vi } from 'vitest';

const {
  mockCreateClientForProvider,
  mockGenerateOpenAIResponse,
  mockStreamOpenAIResponse,
} = vi.hoisted(() => ({
  mockCreateClientForProvider: vi.fn(() => ({ client: 'openai' })),
  mockGenerateOpenAIResponse: vi.fn(async (request: any) => ({
    type: 'text',
    content: 'generated',
    assistantMessage: {
      role: 'assistant',
      content: `tools:${Object.keys(request.tools || {}).join(',')}`,
    },
  })),
  mockStreamOpenAIResponse: vi.fn(async (request: any) => {
    request.onChunk({ content: 'chunk-1' });
    request.onChunk({ reasoningContent: 'reasoning-1' });
    return {
      type: 'text',
      content: 'streamed',
      assistantMessage: {
        role: 'assistant',
        content: 'streamed',
      },
    };
  }),
}));

vi.mock('../../packages/llm/src/openai-direct.js', () => ({
  createClientForProvider: mockCreateClientForProvider,
  generateOpenAIResponse: mockGenerateOpenAIResponse,
  streamOpenAIResponse: mockStreamOpenAIResponse,
}));

describe('@agent-world/llm runtime provider dispatch', () => {
  it('dispatches generate requests through the package-owned provider layer', async () => {
    const { createLLMRuntime } = await import('../../packages/llm/src/runtime.js');

    const runtime = createLLMRuntime({
      providers: {
        openai: {
          apiKey: 'test-openai-key',
        },
      },
      tools: {
        builtIns: false,
        extraTools: [
          {
            name: 'project_lookup',
            description: 'Project lookup',
            parameters: { type: 'object' },
          },
        ],
      },
    });

    const response = await runtime.generate({
      provider: 'openai',
      model: 'gpt-5',
      messages: [
        {
          role: 'user',
          content: 'Hello',
        },
      ],
      context: {
        reasoningEffort: 'high',
      },
      resolveTools: {
        extraTools: [
          {
            name: 'project_write',
            description: 'Project write',
            parameters: { type: 'object' },
          },
        ],
      },
    });

    expect(response.content).toBe('generated');
    expect(mockCreateClientForProvider).toHaveBeenCalledWith('openai', {
      apiKey: 'test-openai-key',
    });
    expect(mockGenerateOpenAIResponse).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'openai',
      model: 'gpt-5',
      reasoningEffort: 'high',
      tools: {
        project_lookup: expect.objectContaining({ name: 'project_lookup' }),
        project_write: expect.objectContaining({ name: 'project_write' }),
      },
    }));
  });

  it('dispatches stream requests through the package-owned provider layer', async () => {
    const { createLLMRuntime } = await import('../../packages/llm/src/runtime.js');

    const runtime = createLLMRuntime({
      providers: {
        openai: {
          apiKey: 'test-openai-key',
        },
      },
      defaults: {
        reasoningEffort: 'medium',
      },
      tools: {
        builtIns: false,
      },
    });

    const chunks: Array<{ content?: string; reasoningContent?: string }> = [];
    const response = await runtime.stream({
      provider: 'openai',
      model: 'gpt-5',
      messages: [
        {
          role: 'user',
          content: 'Stream please',
        },
      ],
      onChunk: (chunk) => {
        chunks.push(chunk);
      },
    });

    expect(response.content).toBe('streamed');
    expect(chunks).toEqual([
      { content: 'chunk-1' },
      { reasoningContent: 'reasoning-1' },
    ]);
    expect(mockStreamOpenAIResponse).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'openai',
      model: 'gpt-5',
      reasoningEffort: 'medium',
    }));
  });

  it('rejects per-call request.tools attempts to override reserved built-in names', async () => {
    const { createLLMRuntime } = await import('../../packages/llm/src/runtime.js');

    const runtime = createLLMRuntime({
      providers: {
        openai: {
          apiKey: 'test-openai-key',
        },
      },
    });

    await expect(runtime.generate({
      provider: 'openai',
      model: 'gpt-5',
      messages: [
        {
          role: 'user',
          content: 'Hello',
        },
      ],
      tools: {
        read_file: {
          name: 'read_file',
          description: 'override',
          parameters: { type: 'object' },
        },
      },
    })).rejects.toThrow('Tool name "read_file" is reserved by @agent-world/llm built-ins.');
  });
});
