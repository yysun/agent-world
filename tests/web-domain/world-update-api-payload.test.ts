/**
 * Web API World Update Payload Tests
 *
 * Purpose:
 * - Ensure world update requests only send patchable world settings fields.
 * - Prevent large world payloads (agents/chats/memory) from being sent to PATCH endpoint.
 *
 * Coverage:
 * - `buildWorldPatchPayload` field filtering and normalization.
 * - `api.updateWorld` sends a minimal PATCH body.
 * - `apiRequest` preserves backend error codes on thrown errors.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import api, { apiRequest, buildWorldPatchPayload } from '../../web/src/api';

describe('web api world update payload', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('builds a minimal patch payload and normalizes optional blank fields', () => {
    const payload = buildWorldPatchPayload({
      id: 'infinite-etude',
      name: 'Infinite Etude',
      description: 'Etude world',
      turnLimit: 5,
      mainAgent: '',
      chatLLMProvider: 'ollama',
      chatLLMModel: '',
      mcpConfig: '',
      variables: 'working_directory=/tmp',
      currentChatId: 'chat-1',
      agents: [{ id: 'a1' } as any],
      chats: [{ id: 'chat-1' } as any],
    } as any);

    expect(payload).toEqual({
      name: 'Infinite Etude',
      description: 'Etude world',
      turnLimit: 5,
      mainAgent: null,
      chatLLMProvider: 'ollama',
      chatLLMModel: null,
      mcpConfig: null,
      variables: 'working_directory=/tmp',
    });
    expect((payload as any).agents).toBeUndefined();
    expect((payload as any).chats).toBeUndefined();
    expect((payload as any).currentChatId).toBeUndefined();
  });

  it('normalizes main agent into canonical token when provided as mention or display name', () => {
    const payloadFromMention = buildWorldPatchPayload({
      mainAgent: '  @Madame Pedagogue  '
    } as any);
    expect(payloadFromMention.mainAgent).toBe('madame-pedagogue');

    const payloadFromName = buildWorldPatchPayload({
      mainAgent: 'Madame Pedagogue'
    } as any);
    expect(payloadFromName.mainAgent).toBe('madame-pedagogue');
  });

  it('sends only patchable world fields in PATCH body', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ id: 'infinite-etude', name: 'Infinite Etude' }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    await api.updateWorld('Infinite Etude', {
      id: 'infinite-etude',
      name: 'Infinite Etude',
      description: 'Updated description',
      turnLimit: 6,
      mainAgent: '',
      chatLLMProvider: 'ollama',
      chatLLMModel: 'qwen2.5:14b',
      mcpConfig: '',
      variables: 'project=etude',
      currentChatId: 'chat-1',
      agents: [{ id: 'a1' } as any],
      chats: [{ id: 'chat-1' } as any],
    } as any);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, requestOptions] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(requestOptions.body));

    expect(url).toBe('/api/worlds/Infinite%20Etude');
    expect(requestOptions.method).toBe('PATCH');
    expect(body).toEqual({
      name: 'Infinite Etude',
      description: 'Updated description',
      turnLimit: 6,
      mainAgent: null,
      chatLLMProvider: 'ollama',
      chatLLMModel: 'qwen2.5:14b',
      mcpConfig: null,
      variables: 'project=etude',
    });
    expect(body.agents).toBeUndefined();
    expect(body.chats).toBeUndefined();
    expect(body.currentChatId).toBeUndefined();
  });

  it('preserves backend error code on thrown request errors', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 413,
      statusText: 'Payload Too Large',
      json: async () => ({
        error: 'Request payload too large. Try submitting a smaller update payload.',
        code: 'PAYLOAD_TOO_LARGE',
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    try {
      await apiRequest('/worlds/Infinite%20Etude', {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Infinite Etude' }),
      });
      throw new Error('Expected apiRequest to throw');
    } catch (error: any) {
      expect(error.message).toContain('PAYLOAD_TOO_LARGE');
      expect(error.code).toBe('PAYLOAD_TOO_LARGE');
    }
  });
});
