/**
 * Anthropic Direct Invalid Tool Fallback Tests
 *
 * Features:
 * - Verifies Anthropic responses with only invalid tool uses preserve `tool_calls` mode.
 *
 * Implementation Notes:
 * - Uses a fake Anthropic client to assert adapter behavior without network calls.
 * - Keeps scope focused on LLMResponse shape for continuation-loop safety.
 *
 * Recent Changes:
 * - 2026-02-16: Added regression coverage for invalid-only tool_use returning empty `tool_calls`.
 */

import { describe, expect, it, vi } from 'vitest';
import { generateAnthropicResponse } from '../../../core/anthropic-direct.js';
import type { Agent, World } from '../../../core/types.js';

describe('anthropic direct invalid tool fallback', () => {
  it('keeps tool_calls shape when all tool uses are invalid', async () => {
    const create = vi.fn().mockResolvedValue({
      content: [
        { type: 'text', text: 'final text after invalid tool use' },
        { type: 'tool_use', id: 'tu-1', name: '', input: {} },
      ],
      usage: {
        input_tokens: 1,
        output_tokens: 1,
      },
    });

    const fakeClient = {
      messages: {
        create,
      },
    } as any;

    const agent: Agent = {
      id: 'a1',
      name: 'a1',
      type: 'assistant',
      provider: 'anthropic' as any,
      model: 'claude-3-5-sonnet-latest',
      llmCallCount: 0,
      memory: [],
    };

    const world: World = {
      id: 'w1',
      name: 'w1',
      turnLimit: 5,
      createdAt: new Date(),
      lastUpdated: new Date(),
      totalAgents: 0,
      totalMessages: 0,
      eventEmitter: {} as any,
      agents: new Map(),
      chats: new Map(),
    };

    const response = await generateAnthropicResponse(
      fakeClient,
      'claude-3-5-sonnet-latest',
      [{ role: 'user', content: 'hello' }],
      agent,
      {},
      world
    );

    expect(response.type).toBe('tool_calls');
    expect(Array.isArray(response.tool_calls)).toBe(true);
    expect(response.tool_calls).toHaveLength(0);
  });
});
