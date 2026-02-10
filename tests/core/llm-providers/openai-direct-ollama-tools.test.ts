/**
 * OpenAI Direct Ollama Tool Attachment Tests
 *
 * Features:
 * - Verifies OpenAI provider requests include converted MCP tool definitions
 * - Verifies Ollama provider requests omit tool definitions
 * - Covers both non-streaming and streaming request paths
 *
 * Implementation Notes:
 * - Uses local fake OpenAI clients to inspect outbound request params
 * - Unmocks openai-direct module to validate real request construction logic
 * - Avoids filesystem and network usage
 *
 * Recent Changes:
 * - 2026-02-10: Added env-flag coverage for opt-in Ollama tool attachment
 * - 2026-02-07: Added regression tests for Ollama tool-attachment exclusion
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

function createFakeNonStreamingClient() {
  const create = vi.fn().mockResolvedValue({
    choices: [{ message: { content: 'ok' } }],
    usage: { prompt_tokens: 1, completion_tokens: 1 },
  });

  return {
    client: { chat: { completions: { create } } } as any,
    create,
  };
}

function createFakeStreamingClient() {
  const stream = (async function* () {
    yield { choices: [{ delta: { content: 'ok' } }] };
  })();
  const create = vi.fn().mockResolvedValue(stream);

  return {
    client: { chat: { completions: { create } } } as any,
    create,
  };
}

const mcpTools = {
  weather_lookup: {
    description: 'Look up weather',
    parameters: {
      type: 'object',
      properties: {
        city: { type: 'string' },
      },
      required: ['city'],
    },
  },
};

describe('openai-direct tool attachment by provider', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.ENABLE_OLLAMA_TOOLS;
  });

  it('attaches tools for non-Ollama providers', async () => {
    vi.doUnmock('../../../core/openai-direct');
    vi.doUnmock('../../../core/openai-direct.js');
    const openaiDirect = await import('../../../core/openai-direct.js');
    const { client, create } = createFakeNonStreamingClient();

    await openaiDirect.generateOpenAIResponse(
      client,
      'gpt-4o-mini',
      [{ role: 'user', content: 'hello' }],
      { id: 'agent-openai', provider: 'openai', temperature: 0.1, maxTokens: 1000 } as any,
      mcpTools as any,
      { id: 'world-1' } as any
    );

    const requestParams = create.mock.calls[0][0];
    expect(requestParams.tools).toBeDefined();
    expect(requestParams.tools).toHaveLength(1);
    expect(requestParams.tools[0].function.name).toBe('weather_lookup');
  });

  it('does not attach tools for Ollama in non-streaming requests', async () => {
    vi.doUnmock('../../../core/openai-direct');
    vi.doUnmock('../../../core/openai-direct.js');
    const openaiDirect = await import('../../../core/openai-direct.js');
    const { client, create } = createFakeNonStreamingClient();

    await openaiDirect.generateOpenAIResponse(
      client,
      'llama3.2',
      [{ role: 'user', content: 'hello' }],
      { id: 'agent-ollama', provider: 'ollama', temperature: 0.1, maxTokens: 1000 } as any,
      mcpTools as any,
      { id: 'world-1' } as any
    );

    const requestParams = create.mock.calls[0][0];
    expect(requestParams.tools).toBeUndefined();
  });

  it('does not attach tools for Ollama in streaming requests', async () => {
    vi.doUnmock('../../../core/openai-direct');
    vi.doUnmock('../../../core/openai-direct.js');
    const openaiDirect = await import('../../../core/openai-direct.js');
    const { client, create } = createFakeStreamingClient();
    const onChunk = vi.fn();

    await openaiDirect.streamOpenAIResponse(
      client,
      'llama3.2',
      [{ role: 'user', content: 'hello' }],
      { id: 'agent-ollama', provider: 'ollama', temperature: 0.1, maxTokens: 1000 } as any,
      mcpTools as any,
      { id: 'world-1' } as any,
      onChunk,
      'message-1'
    );

    const requestParams = create.mock.calls[0][0];
    expect(requestParams.tools).toBeUndefined();
  });

  it('attaches tools for Ollama in non-streaming requests when ENABLE_OLLAMA_TOOLS=true', async () => {
    process.env.ENABLE_OLLAMA_TOOLS = 'true';
    vi.doUnmock('../../../core/openai-direct');
    vi.doUnmock('../../../core/openai-direct.js');
    const openaiDirect = await import('../../../core/openai-direct.js');
    const { client, create } = createFakeNonStreamingClient();

    await openaiDirect.generateOpenAIResponse(
      client,
      'llama3.2',
      [{ role: 'user', content: 'hello' }],
      { id: 'agent-ollama', provider: 'ollama', temperature: 0.1, maxTokens: 1000 } as any,
      mcpTools as any,
      { id: 'world-1' } as any
    );

    const requestParams = create.mock.calls[0][0];
    expect(requestParams.tools).toBeDefined();
    expect(requestParams.tools).toHaveLength(1);
    expect(requestParams.tools[0].function.name).toBe('weather_lookup');
  });

  it('attaches tools for Ollama in streaming requests when ENABLE_OLLAMA_TOOLS=1', async () => {
    process.env.ENABLE_OLLAMA_TOOLS = '1';
    vi.doUnmock('../../../core/openai-direct');
    vi.doUnmock('../../../core/openai-direct.js');
    const openaiDirect = await import('../../../core/openai-direct.js');
    const { client, create } = createFakeStreamingClient();
    const onChunk = vi.fn();

    await openaiDirect.streamOpenAIResponse(
      client,
      'llama3.2',
      [{ role: 'user', content: 'hello' }],
      { id: 'agent-ollama', provider: 'ollama', temperature: 0.1, maxTokens: 1000 } as any,
      mcpTools as any,
      { id: 'world-1' } as any,
      onChunk,
      'message-1'
    );

    const requestParams = create.mock.calls[0][0];
    expect(requestParams.tools).toBeDefined();
    expect(requestParams.tools).toHaveLength(1);
    expect(requestParams.tools[0].function.name).toBe('weather_lookup');
  });
});
