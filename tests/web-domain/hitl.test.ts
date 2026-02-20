/**
 * Web HITL Domain Tests
 *
 * Purpose:
 * - Validate parsing and queue-management helpers for web HITL option requests.
 *
 * Coverage:
 * - `hitl-option-request` payload parsing.
 * - Default option fallback behavior.
 * - Queue deduplication and removal behavior.
 */

import { describe, expect, it } from 'vitest';
import {
  enqueueHitlPrompt,
  parseHitlPromptRequest,
  removeHitlPromptByRequestId,
} from '../../web/src/domain/hitl';

describe('web/domain/hitl', () => {
  it('parses a valid hitl-option-request payload', () => {
    const parsed = parseHitlPromptRequest({
      chatId: 'chat-1',
      content: {
        eventType: 'hitl-option-request',
        requestId: 'req-1',
        title: 'Run scripts?',
        message: 'Choose one option.',
        defaultOptionId: 'yes_once',
        options: [
          { id: 'yes_once', label: 'Yes once' },
          { id: 'yes_in_session', label: 'Yes in this session' },
          { id: 'no', label: 'No' },
        ],
      },
    });

    expect(parsed).toEqual({
      requestId: 'req-1',
      chatId: 'chat-1',
      title: 'Run scripts?',
      message: 'Choose one option.',
      defaultOptionId: 'yes_once',
      options: [
        { id: 'yes_once', label: 'Yes once', description: undefined },
        { id: 'yes_in_session', label: 'Yes in this session', description: undefined },
        { id: 'no', label: 'No', description: undefined },
      ],
    });
  });

  it('falls back default option to no when preferred default is invalid', () => {
    const parsed = parseHitlPromptRequest({
      content: {
        eventType: 'hitl-option-request',
        requestId: 'req-2',
        options: [
          { id: 'yes_once', label: 'Yes once' },
          { id: 'no', label: 'No' },
        ],
        defaultOptionId: 'missing-option',
      },
    });

    expect(parsed?.defaultOptionId).toBe('no');
  });

  it('parses metadata used for refresh-after-dismiss behavior', () => {
    const parsed = parseHitlPromptRequest({
      content: {
        eventType: 'hitl-option-request',
        requestId: 'req-meta',
        options: [
          { id: 'dismiss', label: 'Dismiss' },
        ],
        metadata: {
          kind: 'create_agent_created',
          refreshAfterDismiss: true,
        },
      },
    });

    expect(parsed?.metadata).toEqual({
      kind: 'create_agent_created',
      refreshAfterDismiss: true,
    });
  });

  it('returns null for non-hitl system payloads', () => {
    const parsed = parseHitlPromptRequest({
      content: {
        eventType: 'chat-title-updated',
      },
    });
    expect(parsed).toBeNull();
  });

  it('deduplicates queue entries by requestId', () => {
    const queue = enqueueHitlPrompt([], {
      requestId: 'req-1',
      chatId: null,
      title: 'A',
      message: 'B',
      defaultOptionId: 'no',
      options: [{ id: 'no', label: 'No' }],
    });
    const deduped = enqueueHitlPrompt(queue, {
      requestId: 'req-1',
      chatId: null,
      title: 'C',
      message: 'D',
      defaultOptionId: 'no',
      options: [{ id: 'no', label: 'No' }],
    });
    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.title).toBe('A');
  });

  it('removes only the requested queue entry', () => {
    const remaining = removeHitlPromptByRequestId(
      [
        {
          requestId: 'req-1',
          chatId: null,
          title: 'A',
          message: 'A',
          defaultOptionId: 'no',
          options: [{ id: 'no', label: 'No' }],
        },
        {
          requestId: 'req-2',
          chatId: null,
          title: 'B',
          message: 'B',
          defaultOptionId: 'no',
          options: [{ id: 'no', label: 'No' }],
        },
      ],
      'req-1'
    );
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.requestId).toBe('req-2');
  });
});

