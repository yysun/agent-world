/**
 * HITL Queue Ingestion Tests for Chat Event Subscriptions
 *
 * Purpose:
 * - Validate replay-safe HITL prompt queue ingestion behavior in renderer subscriptions.
 *
 * Coverage:
 * - Enqueues valid HITL option prompts.
 * - Deduplicates replayed prompts by requestId.
 * - Ignores malformed or non-HITL system events.
 * - Preserves metadata used by refresh-after-dismiss behavior.
 */

import { describe, expect, it } from 'vitest';
import { enqueueHitlPromptFromSystemEvent } from '../../../electron/renderer/src/hooks/useChatEventSubscriptions';

describe('electron/renderer useChatEventSubscriptions HITL ingestion', () => {
  it('enqueues a valid hitl-option-request prompt', () => {
    const queue = enqueueHitlPromptFromSystemEvent(
      [],
      {
        eventType: 'hitl-option-request',
        chatId: 'chat-1',
        content: {
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
      'chat-fallback'
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
    const existing = enqueueHitlPromptFromSystemEvent(
      [],
      {
        eventType: 'hitl-option-request',
        chatId: 'chat-1',
        content: {
          requestId: 'req-replay',
          title: 'Approval required',
          message: 'First payload',
          options: [
            { id: 'yes', label: 'Yes' },
            { id: 'no', label: 'No' },
          ],
        },
      },
      'chat-fallback'
    );

    const replayed = enqueueHitlPromptFromSystemEvent(
      existing,
      {
        eventType: 'hitl-option-request',
        chatId: 'chat-1',
        content: {
          requestId: 'req-replay',
          title: 'Approval required (replay)',
          message: 'Replayed payload',
          replay: true,
          options: [
            { id: 'yes', label: 'Yes' },
            { id: 'no', label: 'No' },
          ],
        },
      },
      'chat-fallback'
    );

    expect(replayed).toHaveLength(1);
    expect(replayed[0]?.message).toBe('First payload');
  });

  it('uses fallback chat id when system event is unscoped', () => {
    const queue = enqueueHitlPromptFromSystemEvent(
      [],
      {
        eventType: 'hitl-option-request',
        content: {
          requestId: 'req-fallback',
          options: [
            { id: 'yes', label: 'Yes' },
            { id: 'no', label: 'No' },
          ],
        },
      },
      'chat-fallback'
    );

    expect(queue[0]?.chatId).toBe('chat-fallback');
  });

  it('ignores non-hitl and malformed system events', () => {
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

    const nonHitl = enqueueHitlPromptFromSystemEvent(baseQueue, { eventType: 'chat-title-updated' }, 'chat-1');
    const malformed = enqueueHitlPromptFromSystemEvent(baseQueue, {
      eventType: 'hitl-option-request',
      content: { requestId: '', options: [] },
    }, 'chat-1');

    expect(nonHitl).toEqual(baseQueue);
    expect(malformed).toEqual(baseQueue);
  });

  it('enqueues all prompts when multiple replayed events are batched sequentially', () => {
    const events = [
      {
        systemEvent: {
          eventType: 'hitl-option-request',
          chatId: 'chat-1',
          content: {
            requestId: 'req-batch-a',
            title: 'First',
            message: 'First?',
            options: [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }],
            replay: true,
          },
        },
        fallbackChatId: 'chat-1' as string | null,
      },
      {
        systemEvent: {
          eventType: 'hitl-option-request',
          chatId: 'chat-1',
          content: {
            requestId: 'req-batch-b',
            title: 'Second',
            message: 'Second?',
            options: [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }],
            replay: true,
          },
        },
        fallbackChatId: 'chat-1' as string | null,
      },
    ];

    let queue: any[] = [];
    for (const entry of events) {
      queue = enqueueHitlPromptFromSystemEvent(queue, entry.systemEvent, entry.fallbackChatId);
    }

    expect(queue).toHaveLength(2);
    expect(queue.map((p: any) => p.requestId)).toEqual(['req-batch-a', 'req-batch-b']);
  });
});
