/**
 * OpenAI Direct Ollama Tool Attachment Tests
 *
 * Features:
 * - Verifies OpenAI provider requests include converted MCP tool definitions
 * - Verifies Ollama provider requests include tool definitions
 * - Covers both non-streaming and streaming request paths
 *
 * Implementation Notes:
 * - Uses local fake OpenAI clients to inspect outbound request params
 * - Unmocks openai-direct module to validate real request construction logic
 * - Avoids filesystem and network usage
 *
 * Recent Changes:
 * - 2026-02-27: Added regression coverage for OpenAI 40-character `tool_call` ID limits in both request conversion and provider responses.
 * - 2026-02-27: Added sequence-safety regression coverage so unresolved assistant `tool_calls` are pruned before OpenAI requests.
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

  it('attaches tools for Ollama in non-streaming requests', async () => {
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

  it('attaches tools for Ollama in streaming requests', async () => {
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

  it('keeps tool_calls shape when all non-streaming tool calls are invalid', async () => {
    vi.doUnmock('../../../core/openai-direct');
    vi.doUnmock('../../../core/openai-direct.js');
    const openaiDirect = await import('../../../core/openai-direct.js');

    const create = vi.fn().mockResolvedValue({
      choices: [{
        message: {
          content: 'final text after invalid tool call',
          tool_calls: [{
            id: 'tc-invalid',
            type: 'function',
            function: { name: '', arguments: '{}' },
          }],
        }
      }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    });

    const fakeClient = { chat: { completions: { create } } } as any;
    const response = await openaiDirect.generateOpenAIResponse(
      fakeClient,
      'gpt-4o-mini',
      [{ role: 'user', content: 'hello' }],
      { id: 'agent-openai', provider: 'openai', temperature: 0.1, maxTokens: 1000 } as any,
      mcpTools as any,
      { id: 'world-1' } as any
    );

    expect(response.type).toBe('tool_calls');
    expect(Array.isArray(response.tool_calls)).toBe(true);
    expect(response.tool_calls).toHaveLength(0);
  });

  it('reconstructs delayed streaming tool call name across chunks', async () => {
    vi.doUnmock('../../../core/openai-direct');
    vi.doUnmock('../../../core/openai-direct.js');
    const openaiDirect = await import('../../../core/openai-direct.js');

    const stream = (async function* () {
      yield {
        choices: [{
          delta: {
            tool_calls: [{
              index: 0,
              id: 'tc-1',
              function: { arguments: '{"path":"' },
            }],
          },
        }],
      };
      yield {
        choices: [{
          delta: {
            tool_calls: [{
              index: 0,
              function: { name: 'read_file', arguments: 'README.md"}' },
            }],
          },
        }],
      };
    })();

    const create = vi.fn().mockResolvedValue(stream);
    const fakeClient = { chat: { completions: { create } } } as any;

    const response = await openaiDirect.streamOpenAIResponse(
      fakeClient,
      'gpt-4o-mini',
      [{ role: 'user', content: 'hello' }],
      { id: 'agent-openai', provider: 'openai', temperature: 0.1, maxTokens: 1000 } as any,
      mcpTools as any,
      { id: 'world-1' } as any,
      vi.fn(),
      'message-1'
    );

    expect(response.type).toBe('tool_calls');
    expect(response.tool_calls).toHaveLength(1);
    expect(response.tool_calls?.[0]?.function?.name).toBe('read_file');
    expect(response.tool_calls?.[0]?.function?.arguments).toContain('README.md');
  });

  it('normalizes overlong historical tool call ids in outbound OpenAI messages', async () => {
    vi.doUnmock('../../../core/openai-direct');
    vi.doUnmock('../../../core/openai-direct.js');
    const openaiDirect = await import('../../../core/openai-direct.js');
    const { client, create } = createFakeNonStreamingClient();
    const overlongId = `call_${'x'.repeat(45)}`;

    await openaiDirect.generateOpenAIResponse(
      client,
      'gpt-4o-mini',
      [
        {
          role: 'assistant',
          content: 'calling tool',
          tool_calls: [{
            id: overlongId,
            type: 'function',
            function: { name: 'weather_lookup', arguments: '{"city":"SF"}' },
          }],
        },
        {
          role: 'tool',
          content: 'sunny',
          tool_call_id: overlongId,
        },
      ],
      { id: 'agent-openai', provider: 'openai', temperature: 0.1, maxTokens: 1000 } as any,
      mcpTools as any,
      { id: 'world-1' } as any
    );

    const requestParams = create.mock.calls[0][0];
    const assistantMessage = requestParams.messages[0];
    const toolMessage = requestParams.messages[1];
    const normalizedId = assistantMessage.tool_calls[0].id;

    expect(normalizedId.length).toBeLessThanOrEqual(40);
    expect(normalizedId).not.toBe(overlongId);
    expect(toolMessage.tool_call_id).toBe(normalizedId);
  });

  it('normalizes overlong tool call ids returned by provider responses', async () => {
    vi.doUnmock('../../../core/openai-direct');
    vi.doUnmock('../../../core/openai-direct.js');
    const openaiDirect = await import('../../../core/openai-direct.js');
    const overlongId = `call_${'y'.repeat(45)}`;

    const create = vi.fn().mockResolvedValue({
      choices: [{
        message: {
          content: 'tool result',
          tool_calls: [{
            id: overlongId,
            type: 'function',
            function: { name: 'weather_lookup', arguments: '{"city":"SF"}' },
          }],
        }
      }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    });

    const fakeClient = { chat: { completions: { create } } } as any;
    const response = await openaiDirect.generateOpenAIResponse(
      fakeClient,
      'gpt-4o-mini',
      [{ role: 'user', content: 'hello' }],
      { id: 'agent-openai', provider: 'openai', temperature: 0.1, maxTokens: 1000 } as any,
      mcpTools as any,
      { id: 'world-1' } as any
    );

    expect(response.type).toBe('tool_calls');
    expect(response.tool_calls?.[0]?.id.length).toBeLessThanOrEqual(40);
    expect(response.tool_calls?.[0]?.id).not.toBe(overlongId);
  });

  it('prunes unresolved assistant tool_calls when no matching tool result follows', async () => {
    vi.doUnmock('../../../core/openai-direct');
    vi.doUnmock('../../../core/openai-direct.js');
    const openaiDirect = await import('../../../core/openai-direct.js');
    const { client, create } = createFakeNonStreamingClient();
    const unresolvedId = 'call_4p37fK5MFg8lH9N8mxjhSPRZ';

    await openaiDirect.generateOpenAIResponse(
      client,
      'gpt-4o-mini',
      [
        {
          role: 'assistant',
          content: 'Calling tool',
          tool_calls: [{
            id: unresolvedId,
            type: 'function',
            function: { name: 'weather_lookup', arguments: '{"city":"SF"}' },
          }],
        },
        {
          role: 'user',
          content: 'continue',
        },
      ] as any,
      { id: 'agent-openai', provider: 'openai', temperature: 0.1, maxTokens: 1000 } as any,
      mcpTools as any,
      { id: 'world-1' } as any
    );

    const requestParams = create.mock.calls[0][0];
    const firstAssistant = requestParams.messages[0];
    expect(firstAssistant.role).toBe('assistant');
    expect(firstAssistant.tool_calls).toBeUndefined();
    expect(requestParams.messages[1]).toMatchObject({ role: 'user', content: 'continue' });
  });

  it('keeps only tool_calls that received contiguous tool result messages', async () => {
    vi.doUnmock('../../../core/openai-direct');
    vi.doUnmock('../../../core/openai-direct.js');
    const openaiDirect = await import('../../../core/openai-direct.js');
    const { client, create } = createFakeNonStreamingClient();

    await openaiDirect.generateOpenAIResponse(
      client,
      'gpt-4o-mini',
      [
        {
          role: 'assistant',
          content: 'Calling tools',
          tool_calls: [
            {
              id: 'call_resolved',
              type: 'function',
              function: { name: 'weather_lookup', arguments: '{"city":"SF"}' },
            },
            {
              id: 'call_unresolved',
              type: 'function',
              function: { name: 'weather_lookup', arguments: '{"city":"NY"}' },
            },
          ],
        },
        {
          role: 'tool',
          content: 'sunny',
          tool_call_id: 'call_resolved',
        },
        {
          role: 'user',
          content: 'next',
        },
      ] as any,
      { id: 'agent-openai', provider: 'openai', temperature: 0.1, maxTokens: 1000 } as any,
      mcpTools as any,
      { id: 'world-1' } as any
    );

    const requestParams = create.mock.calls[0][0];
    const firstAssistant = requestParams.messages[0];
    expect(firstAssistant.role).toBe('assistant');
    expect(firstAssistant.tool_calls).toHaveLength(1);
    expect(firstAssistant.tool_calls[0].id).toBe('call_resolved');
    expect(requestParams.messages[1]).toMatchObject({ role: 'tool', tool_call_id: 'call_resolved' });
    expect(requestParams.messages[2]).toMatchObject({ role: 'user', content: 'next' });
  });
});
