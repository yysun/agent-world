/**
 * HITL Queue Ingestion Tests for Chat Event Subscriptions
 *
 * Purpose:
 * - Validate replay-safe HITL prompt queue ingestion behavior in renderer subscriptions.
 *
 * Coverage:
 * - Enqueues valid HITL option prompts from tool-progress payloads.
 * - Deduplicates prompts by requestId.
 * - Removes stale prompts when terminal tool events arrive.
 * - Ignores malformed or non-HITL tool payloads.
 * - Preserves metadata used by refresh-after-dismiss behavior.
 * - Exposes a pure helper for resetting HITL queue state across world switches.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('react', () => ({
  useEffect: () => undefined,
  useRef: (value?: unknown) => ({ current: value }),
}), { virtual: true });

import {
  enqueueHitlPromptFromToolEvent,
  shouldResetHitlQueueForWorldChange,
} from '../../../electron/renderer/src/hooks/useChatEventSubscriptions';

describe('electron/renderer useChatEventSubscriptions HITL ingestion', () => {
  it('enqueues a valid HITL prompt from tool-progress payload', () => {
    const queue = enqueueHitlPromptFromToolEvent(
      [],
      {
        chatId: 'chat-1',
        tool: {
          eventType: 'tool-progress',
          metadata: {
            hitlPrompt: {
              requestId: 'req-1',
              title: 'Approval required',
              message: 'Choose one',
              defaultOptionId: 'no',
              options: [
                { id: 'yes', label: 'Yes' },
                { id: 'no', label: 'No' },
              ],
              metadata: {
                kind: 'create_agent_created',
                refreshAfterDismiss: true,
              },
            },
          },
        },
      },
    );

    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      requestId: 'req-1',
      chatId: 'chat-1',
      title: 'Approval required',
      message: 'Choose one',
      defaultOptionId: 'no',
      metadata: {
        kind: 'create_agent_created',
        refreshAfterDismiss: true,
      },
    });
  });

  it('deduplicates replayed prompts by requestId', () => {
    const existing = enqueueHitlPromptFromToolEvent(
      [],
      {
        chatId: 'chat-1',
        tool: {
          eventType: 'tool-progress',
          metadata: {
            hitlPrompt: {
              requestId: 'req-replay',
              title: 'Approval required',
              message: 'First payload',
              options: [
                { id: 'yes', label: 'Yes' },
                { id: 'no', label: 'No' },
              ],
            },
          },
        },
      },
    );

    const replayed = enqueueHitlPromptFromToolEvent(
      existing,
      {
        chatId: 'chat-1',
        tool: {
          eventType: 'tool-progress',
          metadata: {
            hitlPrompt: {
              requestId: 'req-replay',
              title: 'Approval required (replay)',
              message: 'Replayed payload',
              options: [
                { id: 'yes', label: 'Yes' },
                { id: 'no', label: 'No' },
              ],
            },
          },
        },
      },
    );

    expect(replayed).toHaveLength(1);
    expect(replayed[0]?.message).toBe('First payload');
  });

  it('ignores unscoped tool-progress prompts without explicit chatId', () => {
    const queue = enqueueHitlPromptFromToolEvent(
      [],
      {
        tool: {
          eventType: 'tool-progress',
          metadata: {
            hitlPrompt: {
              requestId: 'req-fallback',
              options: [
                { id: 'yes', label: 'Yes' },
                { id: 'no', label: 'No' },
              ],
            },
          },
        },
      },
    );

    expect(queue).toEqual([]);
  });

  it('ignores non-hitl and malformed tool events', () => {
    const baseQueue = [
      {
        requestId: 'req-1',
        chatId: 'chat-1',
        title: 'A',
        message: 'B',
        mode: 'option' as const,
        options: [{ id: 'no', label: 'No' }],
      },
    ];

    const nonHitl = enqueueHitlPromptFromToolEvent(baseQueue, {
      tool: { eventType: 'tool-result' }
    });
    const malformed = enqueueHitlPromptFromToolEvent(baseQueue, {
      tool: {
        eventType: 'tool-progress',
        metadata: { hitlPrompt: { requestId: '', options: [] } },
      }
    });

    expect(nonHitl).toEqual(baseQueue);
    expect(malformed).toEqual(baseQueue);
  });

  it('removes a queued HITL prompt when the matching tool call reaches a terminal event', () => {
    const queue = enqueueHitlPromptFromToolEvent(
      [],
      {
        chatId: 'chat-1',
        tool: {
          eventType: 'tool-progress',
          toolUseId: 'call-hitl-1',
          metadata: {
            hitlPrompt: {
              requestId: 'req-hitl-1',
              toolCallId: 'call-hitl-1',
              title: 'Approval required',
              message: 'Proceed?',
              options: [
                { id: 'yes', label: 'Yes' },
                { id: 'no', label: 'No' },
              ],
            },
          },
        },
      },
    );

    const resolved = enqueueHitlPromptFromToolEvent(queue, {
      chatId: 'chat-1',
      tool: {
        eventType: 'tool-result',
        toolUseId: 'call-hitl-1',
      },
    });

    expect(resolved).toEqual([]);
  });

  it('enqueues all prompts when multiple tool events are batched sequentially', () => {
    const events = [
      {
        payload: {
          chatId: 'chat-1',
          tool: {
            eventType: 'tool-progress',
            metadata: {
              hitlPrompt: {
                requestId: 'req-batch-a',
                title: 'First',
                message: 'First?',
                options: [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }],
              },
            },
          },
        },
      },
      {
        payload: {
          chatId: 'chat-1',
          tool: {
            eventType: 'tool-progress',
            metadata: {
              hitlPrompt: {
                requestId: 'req-batch-b',
                title: 'Second',
                message: 'Second?',
                options: [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }],
              },
            },
          },
        },
      },
    ];

    let queue: any[] = [];
    for (const entry of events) {
      queue = enqueueHitlPromptFromToolEvent(queue, entry.payload);
    }

    expect(queue).toHaveLength(2);
    expect(queue.map((p: any) => p.requestId)).toEqual(['req-batch-a', 'req-batch-b']);
  });

  it('requests a HITL queue reset when switching between worlds', () => {
    expect(shouldResetHitlQueueForWorldChange('world-a', 'world-b')).toBe(true);
    expect(shouldResetHitlQueueForWorldChange('world-a', 'world-a')).toBe(false);
    expect(shouldResetHitlQueueForWorldChange(null, 'world-a')).toBe(false);
  });
});
