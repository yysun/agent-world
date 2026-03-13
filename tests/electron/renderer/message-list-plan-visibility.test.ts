/**
 * MessageListPanel Narrated Tool-Call Visibility Tests
 *
 * Purpose:
 * - Ensure narrated assistant tool-call messages remain assistant-visible and are
 *   not merged away into tool result cards.
 *
 * Recent changes:
 * - 2026-03-13: Added coverage for reserving avatar spacing on tool transcript rows.
 * - 2026-03-13: Added coverage for suppressing avatar chrome on tool transcript rows.
 * - 2026-03-04: Added view-mode coverage ensuring message chrome only appears in `Chat View`.
 * - 2026-03-01: Added coverage for narrated assistant tool-call rows remaining as assistant messages.
 */

import { describe, expect, it, vi } from 'vitest';

import { isToolRelatedMessage } from '../../../electron/renderer/src/utils/message-utils';

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

import {
  getBoardBottomSectionClassName,
  getBoardLaneClassName,
  buildCombinedRenderableMessages,
  getBoardLaneContainerClassName,
  getLatestUserMessageEntry,
  isNarratedAssistantToolCallMessage,
  shouldReserveToolAvatarSpace,
  shouldShowMessageAvatar,
  shouldRenderNonChatSectionLabels,
  shouldShowMessageChrome,
} from '../../../electron/renderer/src/components/MessageListPanel';

describe('MessageListPanel narrated tool-call visibility', () => {
  it('shows message chrome only for chat view', () => {
    expect(shouldShowMessageChrome('chat')).toBe(true);
    expect(shouldShowMessageChrome('board')).toBe(false);
    expect(shouldShowMessageChrome('grid')).toBe(false);
    expect(shouldShowMessageChrome('canvas')).toBe(false);
    expect(shouldShowMessageChrome('unsupported')).toBe(true);
  });

  it('suppresses avatar chrome for tool transcript rows only', () => {
    expect(shouldShowMessageAvatar(true, true, false)).toBe(true);
    expect(shouldShowMessageAvatar(true, true, true)).toBe(false);
    expect(shouldShowMessageAvatar(false, true, false)).toBe(false);
    expect(shouldShowMessageAvatar(true, false, false)).toBe(false);
  });

  it('reserves avatar spacing for tool transcript rows in chat view', () => {
    expect(shouldReserveToolAvatarSpace(true, true)).toBe(true);
    expect(shouldReserveToolAvatarSpace(true, false)).toBe(false);
    expect(shouldReserveToolAvatarSpace(false, true)).toBe(false);
  });

  it('selects only the latest user message for non-chat top row', () => {
    const entries = [
      { index: 1, message: { messageId: 'u1', role: 'user', content: 'first' } },
      { index: 3, message: { messageId: 'u2', role: 'user', content: 'second' } },
    ];

    expect(getLatestUserMessageEntry(entries)?.message?.messageId).toBe('u2');
    expect(getLatestUserMessageEntry([])).toBeNull();
  });

  it('hides non-chat section title labels', () => {
    expect(shouldRenderNonChatSectionLabels()).toBe(false);
  });

  it('uses horizontal board lane strip where each lane stacks messages vertically', () => {
    const className = getBoardLaneContainerClassName();
    expect(className).toContain('flex');
    expect(className).toContain('overflow-x-auto');
    expect(className).toContain('flex-1');
    expect(className).toContain('items-stretch');

    const laneClassName = getBoardLaneClassName();
    expect(laneClassName).toContain('flex-col');
    expect(laneClassName).toContain('min-h-0');

    const boardSectionClassName = getBoardBottomSectionClassName();
    expect(boardSectionClassName).toContain('flex-col');
    expect(boardSectionClassName).toContain('flex-1');
    expect(boardSectionClassName).toContain('overflow-hidden');
  });

  it('detects narrated assistant tool-call rows as narrated messages', () => {
    const message = {
      role: 'assistant',
      content: 'I will write ./score.musicxml and then ask @engraver to render it.',
      tool_calls: [
        {
          id: 'call_write_1',
          type: 'function',
          function: {
            name: 'write_file',
            arguments: '{"filePath":"./score.musicxml","content":"<xml/>"}',
          },
        },
      ],
    };

    expect(isNarratedAssistantToolCallMessage(message)).toBe(true);
  });

  it('does not merge narrated assistant tool-call row with its tool result row', () => {
    const assistantPlanWithToolCall = {
      messageId: 'assistant-plan-1',
      role: 'assistant',
      sender: 'composer',
      content: 'I will write ./score.musicxml and then ask @engraver to render it.',
      tool_calls: [
        {
          id: 'call_write_1',
          type: 'function',
          function: {
            name: 'write_file',
            arguments: '{"filePath":"./score.musicxml","content":"<xml/>"}',
          },
        },
      ],
    };

    const toolResult = {
      messageId: 'tool-result-1',
      role: 'tool',
      tool_call_id: 'call_write_1',
      replyToMessageId: 'assistant-plan-1',
      content: '{"status":"success"}',
    };

    const merged = buildCombinedRenderableMessages([assistantPlanWithToolCall, toolResult]);

    expect(merged).toHaveLength(2);
    expect(merged[0]?.messageId).toBe('assistant-plan-1');
    expect(merged[0]?.combinedToolResults).toBeUndefined();
    expect(merged[1]?.messageId).toBe('tool-result-1');
  });

  it('preserves narrated tool-call result metadata when tool transcript rows are hidden', () => {
    const assistantPlanWithToolCall = {
      messageId: 'assistant-plan-hidden-1',
      role: 'assistant',
      sender: 'composer',
      content: 'I will write ./score.musicxml and then ask @engraver to render it.',
      tool_calls: [
        {
          id: 'call_write_hidden_1',
          type: 'function',
          function: {
            name: 'write_file',
            arguments: '{"filePath":"./score.musicxml","content":"<xml/>"}',
          },
        },
      ],
    };

    const toolResult = {
      messageId: 'tool-result-hidden-1',
      role: 'tool',
      tool_call_id: 'call_write_hidden_1',
      replyToMessageId: 'assistant-plan-hidden-1',
      content: '{"status":"success"}',
    };

    const visibleMessages = buildCombinedRenderableMessages([assistantPlanWithToolCall, toolResult]).filter((message) => {
      if (isNarratedAssistantToolCallMessage(message)) {
        return true;
      }
      return !isToolRelatedMessage(message);
    });

    expect(visibleMessages).toHaveLength(1);
    expect(visibleMessages[0]?.messageId).toBe('assistant-plan-hidden-1');
    expect(Array.isArray(visibleMessages[0]?.narratedToolCallResults)).toBe(true);
    expect(visibleMessages[0]?.narratedToolCallResults).toHaveLength(1);
    expect(visibleMessages[0]?.narratedToolCallResults?.[0]?.messageId).toBe('tool-result-hidden-1');
  });

  it('still merges placeholder calling-tool assistant row with tool result', () => {
    const assistantCallingTool = {
      messageId: 'assistant-call-1',
      role: 'assistant',
      sender: 'composer',
      content: 'Calling tool: write_file',
      tool_calls: [
        {
          id: 'call_write_2',
          type: 'function',
          function: {
            name: 'write_file',
            arguments: '{"filePath":"./score.musicxml","content":"<xml/>"}',
          },
        },
      ],
    };

    const toolResult = {
      messageId: 'tool-result-2',
      role: 'tool',
      tool_call_id: 'call_write_2',
      replyToMessageId: 'assistant-call-1',
      content: '{"status":"success"}',
    };

    const merged = buildCombinedRenderableMessages([assistantCallingTool, toolResult]);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.messageId).toBe('assistant-call-1');
    expect(Array.isArray(merged[0]?.combinedToolResults)).toBe(true);
    expect(merged[0]?.combinedToolResults).toHaveLength(1);
  });
});
