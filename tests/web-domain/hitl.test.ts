/**
 * Web HITL Domain Tests
 *
 * Purpose:
 * - Validate parsing and queue-management helpers for web HITL option requests.
 *
 * Coverage:
 * - Pending prompt payload parsing.
 * - Tool-event payload parsing.
 * - Default option fallback behavior.
 * - Queue deduplication and removal behavior.
 */

import { describe, expect, it } from 'vitest';
import {
  enqueueHitlPrompt,
  hasHitlPromptForChat,
  parseHitlPromptFromToolEvent,
  parseHitlPromptRequest,
  reconstructPendingHitlPromptsFromMessages,
  removeHitlPromptByRequestId,
  selectHitlPromptForChat,
} from '../../web/src/domain/hitl';

describe('web/domain/hitl', () => {
  it('parses a valid pending-prompt payload', () => {
    const parsed = parseHitlPromptRequest({
      chatId: 'chat-1',
      prompt: {
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
      mode: 'option',
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
      prompt: {
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
      prompt: {
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

  it('returns null for invalid pending payloads', () => {
    const parsed = parseHitlPromptRequest({
      prompt: {
        title: 'missing request id',
      },
    });
    expect(parsed).toBeNull();
  });

  it('parses a valid tool-event HITL prompt payload', () => {
    const parsed = parseHitlPromptFromToolEvent({
      chatId: 'chat-2',
      toolExecution: {
        metadata: {
          hitlPrompt: {
            requestId: 'req-tool-1',
            title: 'Need confirmation',
            message: 'Confirm action',
            defaultOptionId: 'confirm',
            options: [
              { id: 'confirm', label: 'Confirm' },
              { id: 'cancel', label: 'Cancel' },
            ],
          },
        },
      },
    });

    expect(parsed).toEqual({
      requestId: 'req-tool-1',
      chatId: 'chat-2',
      title: 'Need confirmation',
      message: 'Confirm action',
      mode: 'option',
      defaultOptionId: 'confirm',
      options: [
        { id: 'confirm', label: 'Confirm', description: undefined },
        { id: 'cancel', label: 'Cancel', description: undefined },
      ],
    });
  });

  it('deduplicates queue entries by requestId', () => {
    const queue = enqueueHitlPrompt([], {
      requestId: 'req-1',
      chatId: null,
      title: 'A',
      message: 'B',
      mode: 'option',
      defaultOptionId: 'no',
      options: [{ id: 'no', label: 'No' }],
    });
    const deduped = enqueueHitlPrompt(queue, {
      requestId: 'req-1',
      chatId: null,
      title: 'C',
      message: 'D',
      mode: 'option',
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
          mode: 'option',
          defaultOptionId: 'no',
          options: [{ id: 'no', label: 'No' }],
        },
        {
          requestId: 'req-2',
          chatId: null,
          title: 'B',
          message: 'B',
          mode: 'option',
          defaultOptionId: 'no',
          options: [{ id: 'no', label: 'No' }],
        },
      ],
      'req-1'
    );
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.requestId).toBe('req-2');
  });

  it('selects only the prompt that matches the active chat', () => {
    const selected = selectHitlPromptForChat([
      {
        requestId: 'req-a',
        chatId: 'chat-a',
        title: 'A',
        message: 'A',
        mode: 'option',
        defaultOptionId: 'no',
        options: [{ id: 'no', label: 'No' }],
      },
      {
        requestId: 'req-b',
        chatId: 'chat-b',
        title: 'B',
        message: 'B',
        mode: 'option',
        defaultOptionId: 'no',
        options: [{ id: 'no', label: 'No' }],
      },
    ], 'chat-b');

    expect(selected?.requestId).toBe('req-b');
  });

  it('does not report a prompt for unrelated chats', () => {
    expect(hasHitlPromptForChat([
      {
        requestId: 'req-a',
        chatId: 'chat-a',
        title: 'A',
        message: 'A',
        mode: 'option',
        defaultOptionId: 'no',
        options: [{ id: 'no', label: 'No' }],
      },
    ], 'chat-b')).toBe(false);
  });

  it('reconstructs unresolved HITL prompts from persisted request/response message pairs', () => {
    const reconstructed = reconstructPendingHitlPromptsFromMessages([
      {
        role: 'assistant',
        chatId: 'chat-1',
        sender: 'agent-a',
        tool_calls: [
          {
            id: 'call-hitl-1',
            type: 'function',
            function: {
              name: 'human_intervention_request',
              arguments: JSON.stringify({
                question: 'Approve deployment?',
                options: ['Yes', 'No'],
                defaultOption: 'No',
              }),
            },
          },
          {
            id: 'call-other-1',
            type: 'function',
            function: {
              name: 'list_files',
              arguments: '{}',
            },
          },
        ],
      },
      {
        role: 'assistant',
        chatId: 'chat-1',
        sender: 'agent-a',
        tool_calls: [
          {
            id: 'call-hitl-2',
            type: 'function',
            function: {
              name: 'human_intervention_request',
              arguments: JSON.stringify({
                question: 'Approve cleanup?',
                options: ['Yes', 'No'],
              }),
            },
          },
        ],
      },
      {
        role: 'tool',
        chatId: 'chat-1',
        tool_call_id: 'call-hitl-1',
        content: '{"ok":true}',
      },
    ], 'chat-1');

    expect(reconstructed).toHaveLength(1);
    expect(reconstructed[0]).toMatchObject({
      requestId: 'call-hitl-2',
      chatId: 'chat-1',
      title: 'Human input required',
      message: 'Approve cleanup?',
      defaultOptionId: 'opt_1',
    });
    expect(reconstructed[0]?.options).toEqual([
      { id: 'opt_1', label: 'Yes' },
      { id: 'opt_2', label: 'No' },
    ]);
  });
});
