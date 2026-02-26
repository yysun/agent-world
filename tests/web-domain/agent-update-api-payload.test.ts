/**
 * Web API Agent Update Payload Tests
 *
 * Purpose:
 * - Ensure agent update requests only send patchable agent settings fields.
 * - Prevent large agent payloads (memory/history) from being sent to PATCH endpoint.
 *
 * Coverage:
 * - `buildAgentPatchPayload` field filtering and normalization.
 * - `api.updateAgent` sends a minimal PATCH body.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import api, { buildAgentPatchPayload } from '../../web/src/api';

describe('web api agent update payload', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('builds a minimal patch payload and strips non-patchable fields', () => {
    const payload = buildAgentPatchPayload({
      id: 'agent-1',
      name: 'Agent One',
      autoReply: false,
      provider: 'ollama',
      model: 'llama3.2:3b',
      systemPrompt: 'hello',
      temperature: 0.3,
      maxTokens: 1024,
      memory: [{ role: 'user', content: 'very large history' }] as any,
      llmCallCount: 999,
      createdAt: new Date(),
      lastActive: new Date(),
      spriteIndex: 2,
      messageCount: 123,
    } as any);

    expect(payload).toEqual({
      name: 'Agent One',
      autoReply: false,
      provider: 'ollama',
      model: 'llama3.2:3b',
      systemPrompt: 'hello',
      temperature: 0.3,
      maxTokens: 1024,
    });
    expect((payload as any).memory).toBeUndefined();
    expect((payload as any).llmCallCount).toBeUndefined();
    expect((payload as any).spriteIndex).toBeUndefined();
  });

  it('omits empty provider/model values', () => {
    const payload = buildAgentPatchPayload({
      provider: '',
      model: '',
      autoReply: true,
    } as any);

    expect(payload).toEqual({
      autoReply: true,
    });
    expect((payload as any).provider).toBeUndefined();
    expect((payload as any).model).toBeUndefined();
  });

  it('sends only patchable agent fields in PATCH body', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ id: 'agent-1', name: 'Agent One' }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    await api.updateAgent('Infinite Etude', 'Agent One', {
      id: 'agent-1',
      name: 'Agent One',
      autoReply: true,
      provider: 'ollama',
      model: 'qwen2.5:14b',
      systemPrompt: 'Prompt',
      temperature: 0.2,
      maxTokens: 2048,
      memory: new Array(1000).fill({ role: 'assistant', content: 'x' }) as any,
      llmCallCount: 1000,
      spriteIndex: 1,
      messageCount: 1000,
    } as any);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, requestOptions] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(requestOptions.body));

    expect(url).toBe('/api/worlds/Infinite%20Etude/agents/Agent%20One');
    expect(requestOptions.method).toBe('PATCH');
    expect(body).toEqual({
      name: 'Agent One',
      autoReply: true,
      provider: 'ollama',
      model: 'qwen2.5:14b',
      systemPrompt: 'Prompt',
      temperature: 0.2,
      maxTokens: 2048,
    });
    expect(body.memory).toBeUndefined();
    expect(body.llmCallCount).toBeUndefined();
    expect(body.spriteIndex).toBeUndefined();
  });
});
