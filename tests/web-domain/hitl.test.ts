/**
 * Web HITL Domain Tests
 *
 * Purpose:
 * - Validate parsing and queue-management helpers for structured web HITL prompts.
 *
 * Coverage:
 * - Structured pending prompt parsing.
 * - Structured tool-event payload parsing.
 * - Queue deduplication and removal behavior.
 * - Legacy transcript reconstruction compatibility.
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
  it('parses a valid structured pending-prompt payload', () => {
    const parsed = parseHitlPromptRequest({
      chatId: 'chat-1',
      prompt: {
        requestId: 'req-1',
        type: 'single-select',
        allowSkip: false,
        questions: [{
          id: 'question-1',
          header: 'Run scripts?',
          question: 'Choose one option.',
          options: [
            { id: 'yes_once', label: 'Yes once' },
            { id: 'yes_in_session', label: 'Yes in this session' },
            { id: 'no', label: 'No' },
          ],
        }],
      },
    });

    expect(parsed).toEqual({
      requestId: 'req-1',
      chatId: 'chat-1',
      type: 'single-select',
      allowSkip: false,
      questions: [{
        id: 'question-1',
        header: 'Run scripts?',
        question: 'Choose one option.',
        options: [
          { id: 'yes_once', label: 'Yes once', description: undefined },
          { id: 'yes_in_session', label: 'Yes in this session', description: undefined },
          { id: 'no', label: 'No', description: undefined },
        ],
      }],
    });
  });

  it('parses metadata used for refresh-after-dismiss behavior', () => {
    const parsed = parseHitlPromptRequest({
      prompt: {
        requestId: 'req-meta',
        questions: [{
          id: 'question-1',
          header: 'Created',
          question: 'Dismiss this notification?',
          options: [
            { id: 'dismiss', label: 'Dismiss' },
          ],
        }],
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

  it('parses a valid structured tool-event HITL prompt payload', () => {
    const parsed = parseHitlPromptFromToolEvent({
      chatId: 'chat-2',
      toolExecution: {
        metadata: {
          hitlPrompt: {
            requestId: 'req-tool-1',
            type: 'single-select',
            allowSkip: true,
            questions: [{
              id: 'question-1',
              header: 'Need confirmation',
              question: 'Confirm action',
              options: [
                { id: 'confirm', label: 'Confirm' },
                { id: 'cancel', label: 'Cancel' },
              ],
            }],
          },
        },
      },
    });

    expect(parsed).toEqual({
      requestId: 'req-tool-1',
      chatId: 'chat-2',
      type: 'single-select',
      allowSkip: true,
      questions: [{
        id: 'question-1',
        header: 'Need confirmation',
        question: 'Confirm action',
        options: [
          { id: 'confirm', label: 'Confirm', description: undefined },
          { id: 'cancel', label: 'Cancel', description: undefined },
        ],
      }],
    });
  });

  it('deduplicates queue entries by requestId', () => {
    const queue = enqueueHitlPrompt([], {
      requestId: 'req-1',
      chatId: null,
      type: 'single-select',
      questions: [{ id: 'question-1', header: 'A', question: 'B', options: [{ id: 'no', label: 'No' }] }],
    });
    const deduped = enqueueHitlPrompt(queue, {
      requestId: 'req-1',
      chatId: null,
      type: 'single-select',
      questions: [{ id: 'question-1', header: 'C', question: 'D', options: [{ id: 'no', label: 'No' }] }],
    });
    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.questions[0]?.header).toBe('A');
  });

  it('removes only the requested queue entry', () => {
    const remaining = removeHitlPromptByRequestId(
      [
        {
          requestId: 'req-1',
          chatId: null,
          type: 'single-select',
          questions: [{ id: 'question-1', header: 'A', question: 'A', options: [{ id: 'no', label: 'No' }] }],
        },
        {
          requestId: 'req-2',
          chatId: null,
          type: 'single-select',
          questions: [{ id: 'question-1', header: 'B', question: 'B', options: [{ id: 'no', label: 'No' }] }],
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
        type: 'single-select',
        questions: [{ id: 'question-1', header: 'A', question: 'A', options: [{ id: 'no', label: 'No' }] }],
      },
      {
        requestId: 'req-b',
        chatId: 'chat-b',
        type: 'single-select',
        questions: [{ id: 'question-1', header: 'B', question: 'B', options: [{ id: 'no', label: 'No' }] }],
      },
    ], 'chat-b');

    expect(selected?.requestId).toBe('req-b');
  });

  it('does not report a prompt for unrelated chats', () => {
    expect(hasHitlPromptForChat([
      {
        requestId: 'req-a',
        chatId: 'chat-a',
        type: 'single-select',
        questions: [{ id: 'question-1', header: 'A', question: 'A', options: [{ id: 'no', label: 'No' }] }],
      },
    ], 'chat-b')).toBe(false);
  });

  it('reconstructs unresolved structured HITL prompts from persisted request/response message pairs', () => {
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
              name: 'ask_user_input',
              arguments: JSON.stringify({
                type: 'single-select',
                questions: [{
                  id: 'question-1',
                  header: 'Approve deployment?',
                  question: 'Approve deployment?',
                  options: [
                    { id: 'yes', label: 'Yes' },
                    { id: 'no', label: 'No' },
                  ],
                }],
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
              name: 'ask_user_input',
              arguments: JSON.stringify({
                type: 'single-select',
                questions: [{
                  id: 'question-1',
                  header: 'Approve cleanup?',
                  question: 'Approve cleanup?',
                  options: [
                    { id: 'approve', label: 'Approve' },
                    { id: 'decline', label: 'Decline' },
                  ],
                }],
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
      type: 'single-select',
    });
    expect(reconstructed[0]?.questions).toEqual([
      {
        id: 'question-1',
        header: 'Approve cleanup?',
        question: 'Approve cleanup?',
        options: [
          { id: 'approve', label: 'Approve', description: undefined },
          { id: 'decline', label: 'Decline', description: undefined },
        ],
      },
    ]);
  });
});
