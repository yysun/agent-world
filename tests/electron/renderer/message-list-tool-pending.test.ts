/**
 * MessageListPanel Tool Pending Detection Tests
 *
 * Purpose:
 * - Verify assistant tool-request cards resolve out of `running` state when
 *   completion rows are linked by `replyToMessageId` even without tool_call_id.
 *
 * Recent changes:
 * - 2026-03-01: Added regression coverage for reply-linked tool result completion fallback.
 */

import { describe, expect, it, vi } from 'vitest';

const { jsxFactory } = vi.hoisted(() => ({
  jsxFactory: (type: unknown, props: Record<string, unknown> | null, key?: unknown) => ({
    type,
    props: props ?? {},
    key,
  }),
}));

vi.mock('react', () => ({
  useMemo: (fn: () => unknown) => fn(),
  useCallback: (fn: unknown) => fn,
}), { virtual: true });

vi.mock('react/jsx-runtime', () => ({
  Fragment: 'Fragment',
  jsx: jsxFactory,
  jsxs: jsxFactory,
}), { virtual: true });

vi.mock('react/jsx-dev-runtime', () => ({
  Fragment: 'Fragment',
  jsxDEV: jsxFactory,
}), { virtual: true });

import { hasPendingToolCallsForMessage } from '../../../electron/renderer/src/components/MessageListPanel';

describe('MessageListPanel tool pending detection', () => {
  it('marks a single tool call complete when a reply-linked tool result has no tool_call_id', () => {
    const requestMessage = {
      messageId: 'assistant-msg-1',
      role: 'assistant',
      content: 'Calling tool: load_skill',
      tool_calls: [
        {
          id: 'call_load_skill_1',
          type: 'function',
          function: {
            name: 'load_skill',
            arguments: '{"skill_id":"apprun-skills"}',
          },
        },
      ],
    };

    const replyLinkedToolResult = {
      messageId: 'tool-msg-1',
      role: 'tool',
      replyToMessageId: 'assistant-msg-1',
      toolName: 'load_skill',
      content: '<skill_context id="apprun-skills">...</skill_context>',
    };

    const messages = [requestMessage, replyLinkedToolResult];

    expect(hasPendingToolCallsForMessage(requestMessage, messages, 0)).toBe(false);
  });

  it('keeps request pending when no matching tool result exists', () => {
    const requestMessage = {
      messageId: 'assistant-msg-2',
      role: 'assistant',
      content: 'Calling tool: load_skill',
      tool_calls: [
        {
          id: 'call_load_skill_2',
          type: 'function',
          function: {
            name: 'load_skill',
            arguments: '{"skill_id":"apprun-skills"}',
          },
        },
      ],
    };

    const unrelatedToolResult = {
      messageId: 'tool-msg-2',
      role: 'tool',
      replyToMessageId: 'different-assistant-message',
      toolName: 'load_skill',
      content: '<skill_context id="apprun-skills">...</skill_context>',
    };

    const messages = [requestMessage, unrelatedToolResult];

    expect(hasPendingToolCallsForMessage(requestMessage, messages, 0)).toBe(true);
  });
});
