/**
 * Web HITL API Tests
 *
 * Purpose:
 * - Verify web API client wiring for HITL option response submission.
 *
 * Coverage:
 * - Endpoint and payload shape for `respondHitlOption`.
 * - Successful response parsing.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import api from '../../web/src/api';

describe('web api hitl response', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('submits hitl option response to the expected endpoint', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ accepted: true }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await api.respondHitlOption('my-world', 'req-1', 'yes_once', 'chat-1');

    expect(fetchMock).toHaveBeenCalledWith('/api/worlds/my-world/hitl/respond', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requestId: 'req-1',
        optionId: 'yes_once',
        chatId: 'chat-1',
      }),
    });
    expect(result).toEqual({ accepted: true });
  });
});

