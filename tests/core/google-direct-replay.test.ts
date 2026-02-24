/**
 * Google Direct Replay Compatibility Tests
 *
 * Purpose:
 * - Ensure historical tool call traces are not replayed as Google functionCall/functionResponse parts.
 *
 * Key features:
 * - Assistant messages with `tool_calls` are converted to plain text model context.
 * - Tool role messages are converted to plain text user context.
 * - Outbound Google payload avoids replayed function call parts that can require thought_signature.
 */

import { describe, expect, it, vi } from 'vitest';
import { generateGoogleResponse } from '../../core/google-direct.js';
import type { Agent, ChatMessage, World } from '../../core/types.js';

describe('google direct replay compatibility', () => {
  it('does not replay historical functionCall/functionResponse parts', async () => {
    const generateContent = vi.fn().mockResolvedValue({
      response: {
        text: () => 'ok',
        candidates: [{ content: { parts: [{ text: 'ok' }] } }]
      }
    });

    const getGenerativeModel = vi.fn().mockReturnValue({
      generateContent
    });

    const fakeClient = {
      getGenerativeModel
    } as any;

    const messages: ChatMessage[] = [
      { role: 'system', content: 'system prompt' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'tc-1',
            type: 'function',
            function: {
              name: 'shell_cmd',
              arguments: '{"command":"ls"}'
            }
          }
        ]
      },
      {
        role: 'tool',
        content: 'command output',
        tool_call_id: 'tc-1'
      },
      { role: 'user', content: '@g1 say hi to @g2' }
    ];

    const agent: Agent = {
      id: 'g1',
      name: 'g1',
      type: 'assistant',
      provider: 'google' as any,
      model: 'gemini-3-flash-preview',
      llmCallCount: 0,
      memory: []
    };

    const world: World = {
      id: 'gemini',
      name: 'gemini',
      turnLimit: 5,
      createdAt: new Date(),
      lastUpdated: new Date(),
      totalAgents: 0,
      totalMessages: 0,
      eventEmitter: {} as any,
      agents: new Map(),
      chats: new Map()
    };

    await generateGoogleResponse(fakeClient, 'gemini-3-flash-preview', messages, agent, {}, world);

    expect(generateContent).toHaveBeenCalledTimes(1);
    const requestPayload = generateContent.mock.calls[0][0];
    const allParts = (requestPayload.contents || []).flatMap((m: any) => m.parts || []);

    expect(allParts.some((part: any) => 'functionCall' in part)).toBe(false);
    expect(allParts.some((part: any) => 'functionResponse' in part)).toBe(false);
  });

  it('keeps tool_calls shape when all returned function calls are invalid', async () => {
    const generateContent = vi.fn().mockResolvedValue({
      response: {
        text: () => 'plain answer after invalid function call',
        candidates: [{
          content: {
            parts: [
              { text: 'plain answer after invalid function call' },
              { functionCall: { name: '', args: {} } }
            ]
          }
        }]
      }
    });

    const getGenerativeModel = vi.fn().mockReturnValue({ generateContent });
    const fakeClient = { getGenerativeModel } as any;

    const agent: Agent = {
      id: 'g1',
      name: 'g1',
      type: 'assistant',
      provider: 'google' as any,
      model: 'gemini-3-flash-preview',
      llmCallCount: 0,
      memory: []
    };

    const world: World = {
      id: 'gemini',
      name: 'gemini',
      turnLimit: 5,
      createdAt: new Date(),
      lastUpdated: new Date(),
      totalAgents: 0,
      totalMessages: 0,
      eventEmitter: {} as any,
      agents: new Map(),
      chats: new Map()
    };

    const response = await generateGoogleResponse(
      fakeClient,
      'gemini-3-flash-preview',
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
