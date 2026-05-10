/**
 * MessageListPanel Narrated Tool-Call Visibility Tests
 *
 * Purpose:
 * - Ensure narrated assistant tool-call messages remain assistant-visible and are
 *   not merged away into tool result cards.
 *
 * Recent changes:
 * - 2026-05-10: Added component-level chat-to-non-chat switch coverage so board/grid/canvas latest-user panels are validated through the actual render path.
 * - 2026-03-15: Added regression coverage for live shell stdout rows using `toolUseId-stdout` so streaming tool output merges into the existing tool request row.
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
  useState: (initial: unknown) => [initial, () => undefined],
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
  getGridCanvasBottomSectionClassName,
  getLatestUserMessageEntry,
  getMessageListViewportClassName,
  getNonChatBaseContainerClassName,
  getNonChatLatestUserSectionClassName,
  getNonChatRootClassName,
  getNonChatViewportClassName,
  MessageListPanel,
  isNarratedAssistantToolCallMessage,
  shouldReserveToolAvatarSpace,
  shouldShowMessageAvatar,
  shouldRenderNonChatSectionLabels,
  shouldShowMessageChrome,
} from '../../../electron/renderer/src/features/chat';

function allDescendants(node: any): any[] {
  if (Array.isArray(node)) {
    return node.flatMap(allDescendants);
  }
  if (!node || typeof node !== 'object') {
    return [];
  }

  const children = node.props?.children;
  const childArray = Array.isArray(children) ? children : children != null ? [children] : [];
  return [node, ...childArray.flatMap(allDescendants)];
}

function renderPanel(worldViewMode: 'chat' | 'board' | 'grid' | 'canvas') {
  const messages = [
    {
      messageId: 'human-earlier',
      role: 'user',
      sender: 'user',
      content: 'Earlier user input',
      createdAt: '2026-05-10T09:00:00.000Z',
    },
    {
      messageId: 'planner-1',
      role: 'assistant',
      sender: 'Planner',
      content: 'Planner output',
      createdAt: '2026-05-10T09:01:00.000Z',
    },
    {
      messageId: 'human-latest',
      role: 'user',
      sender: 'user',
      content: 'Long human input that must remain visible after switching away from chat view.',
      createdAt: '2026-05-10T09:02:00.000Z',
    },
    {
      messageId: 'writer-1',
      role: 'assistant',
      sender: 'Writer',
      content: 'Writer output',
      createdAt: '2026-05-10T09:03:00.000Z',
    },
  ];

  const messagesById = new Map(messages.map((message) => [message.messageId, message]));

  return MessageListPanel({
    worldViewMode,
    worldGridLayoutChoiceId: '1+2',
    messagesContainerRef: { current: null },
    messagesLoading: false,
    hasConversationMessages: true,
    selectedSession: { id: 'chat-1', name: 'Chat 1' },
    refreshSkillRegistry: () => undefined,
    loadingSkillRegistry: false,
    visibleSkillRegistryEntries: [],
    skillRegistryError: '',
    showToolMessages: true,
    messages,
    messagesById,
    worldAgentsById: new Map(),
    worldAgentsByName: new Map(),
    editingText: '',
    setEditingText: () => undefined,
    editingMessageId: null,
    deletingMessageId: null,
    onCancelEditMessage: () => undefined,
    onSaveEditMessage: () => undefined,
    onStartEditMessage: () => undefined,
    onDeleteMessage: () => undefined,
    onBranchFromMessage: () => undefined,
    onCopyRawMarkdownFromMessage: () => undefined,
    showInlineWorkingIndicator: false,
    inlineWorkingIndicatorState: null,
    activeHitlPrompt: null,
    submittingHitlRequestId: null,
    onRespondHitlOption: () => undefined,
    onSkipHitlPrompt: () => undefined,
  });
}

describe('MessageListPanel narrated tool-call visibility', () => {
  it('shows message chrome only for chat view', () => {
    expect(shouldShowMessageChrome('chat')).toBe(true);
    expect(shouldShowMessageChrome('board')).toBe(false);
    expect(shouldShowMessageChrome('grid')).toBe(false);
    expect(shouldShowMessageChrome('canvas')).toBe(false);
    expect(shouldShowMessageChrome('unsupported')).toBe(true);

    const chatViewportClassName = getMessageListViewportClassName('chat');
    const nonChatViewportClassName = getNonChatViewportClassName();
    expect(chatViewportClassName).toContain('overflow-y-auto');
    expect(chatViewportClassName).not.toContain('floating-composer-height');
    expect(getMessageListViewportClassName('board')).toBe(nonChatViewportClassName);
    expect(nonChatViewportClassName).toContain('overflow-y-auto');
    expect(nonChatViewportClassName).not.toContain('overflow-hidden');
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

    const latestUserSectionClassName = getNonChatLatestUserSectionClassName();
    const nonChatBaseContainerClassName = getNonChatBaseContainerClassName();
    const nonChatRootClassName = getNonChatRootClassName();

    expect(latestUserSectionClassName).toContain('shrink-0');
    expect(latestUserSectionClassName).not.toContain('rounded-lg');
    expect(latestUserSectionClassName).not.toContain('border');
    expect(latestUserSectionClassName).not.toContain('bg-card');
    expect(latestUserSectionClassName).not.toContain('max-h-');
    expect(latestUserSectionClassName).not.toContain('overflow-y-auto');
    expect(nonChatBaseContainerClassName).toContain('min-h-full');
    expect(nonChatBaseContainerClassName.split(' ')).not.toContain('h-full');
    expect(nonChatRootClassName).toContain('min-h-full');
    expect(nonChatRootClassName).toContain('gap-4');
  });

  it('hides non-chat section title labels', () => {
    expect(shouldRenderNonChatSectionLabels()).toBe(false);
  });

  it('uses horizontal board lane strip where each lane stacks messages vertically', () => {
    const className = getBoardLaneContainerClassName();
    expect(className).toContain('flex');
    expect(className).toContain('overflow-x-auto');
    expect(className).toContain('min-h-[20rem]');
    expect(className).toContain('items-stretch');

    const laneClassName = getBoardLaneClassName();
    expect(laneClassName).toContain('flex-col');
    expect(laneClassName).toContain('min-h-0');

    const boardSectionClassName = getBoardBottomSectionClassName();
    expect(boardSectionClassName).toContain('flex-col');
    expect(boardSectionClassName).toContain('min-h-[20rem]');
    expect(boardSectionClassName).not.toContain('rounded-xl');
    expect(boardSectionClassName).not.toContain('border');
    expect(boardSectionClassName).not.toContain('bg-card');
    expect(boardSectionClassName).not.toContain('floating-composer-height');

    const gridCanvasBottomSectionClassName = getGridCanvasBottomSectionClassName();
    expect(gridCanvasBottomSectionClassName).toContain('min-h-[20rem]');
    expect(gridCanvasBottomSectionClassName).not.toContain('rounded-xl');
    expect(gridCanvasBottomSectionClassName).not.toContain('border');
    expect(gridCanvasBottomSectionClassName).not.toContain('bg-card');
  });

  it('keeps the latest human message visible when switching from chat to board, grid, and canvas views', () => {
    const chatTree: any = renderPanel('chat');
    const chatNodes = allDescendants(chatTree);
    const chatHumanRow = chatNodes.find((node: any) => node?.props?.['data-testid'] === 'message-row-human-latest');

    expect(chatHumanRow).toBeDefined();

    for (const mode of ['board', 'grid', 'canvas'] as const) {
      const tree: any = renderPanel(mode);
      const nodes = allDescendants(tree);
      const latestHumanRow = nodes.find((node: any) => node?.props?.['data-testid'] === 'message-row-human-latest');
      const nonChatRoot = nodes.find((node: any) => node?.type === 'div' && node?.props?.className === getNonChatRootClassName());
      const latestHumanSection = nodes.find((node: any) => (
        node?.type === 'section'
        && node?.props?.className === getNonChatLatestUserSectionClassName()
        && allDescendants(node).some((child: any) => child?.props?.['data-testid'] === 'message-row-human-latest')
      ));

      expect(latestHumanRow).toBeDefined();
      expect(nonChatRoot).toBeDefined();
      expect(latestHumanSection).toBeDefined();
      expect(String(tree?.props?.className || '')).not.toContain('overflow-hidden');
    }
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

  it('still merges placeholder calling-tool assistant row and hides the consumed standalone tool result', () => {
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

  it('merges live shell stdout rows into the placeholder tool request during streaming without a duplicate tool row', () => {
    const assistantCallingTool = {
      messageId: 'assistant-call-stream-1',
      role: 'assistant',
      sender: 'runner',
      content: 'Calling tool: shell_cmd',
      tool_calls: [
        {
          id: 'tool-live-1',
          type: 'function',
          function: {
            name: 'shell_cmd',
            arguments: '{"command":"npm test"}',
          },
        },
      ],
    };

    const liveStdoutRow = {
      messageId: 'tool-live-1-stdout',
      role: 'tool',
      sender: 'runner',
      toolName: 'shell_cmd',
      command: 'npm test',
      content: 'running tests\n',
      isToolStreaming: true,
    };

    const merged = buildCombinedRenderableMessages([assistantCallingTool, liveStdoutRow]);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.messageId).toBe('assistant-call-stream-1');
    expect(Array.isArray(merged[0]?.combinedToolResults)).toBe(true);
    expect(merged[0]?.combinedToolResults).toHaveLength(1);
    expect(merged[0]?.combinedToolResults?.[0]?.messageId).toBe('tool-live-1-stdout');
  });

  it('drops live shell stdout rows once a terminal tool result exists for the same tool call', () => {
    const assistantCallingTool = {
      messageId: 'assistant-call-stream-2',
      role: 'assistant',
      sender: 'runner',
      content: 'Calling tool: shell_cmd',
      tool_calls: [
        {
          id: 'tool-live-2',
          type: 'function',
          function: {
            name: 'shell_cmd',
            arguments: '{"command":"./scripts/search.sh","parameters":["{\\"query\\": \\"google workspace cli\\"}"]}',
          },
        },
      ],
    };

    const liveStdoutRow = {
      messageId: 'tool-live-2-stdout',
      role: 'tool',
      sender: 'runner',
      toolName: 'shell_cmd',
      content: '{\n  "query": "google workspace cli"\n}',
      isToolStreaming: true,
    };

    const terminalToolRow = {
      messageId: 'tool-result-2',
      role: 'tool',
      sender: 'runner',
      tool_call_id: 'tool-live-2',
      content: JSON.stringify({
        __type: 'tool_execution_envelope',
        version: 1,
        tool: 'shell_cmd',
        tool_call_id: 'tool-live-2',
        status: 'completed',
        preview: {
          kind: 'markdown',
          renderer: 'markdown',
          text: '### Command Execution\n\n```\n{\n  "query": "google workspace cli"\n}\n```',
        },
        result: 'status: success\nexit_code: 0',
      }),
    };

    const merged = buildCombinedRenderableMessages([assistantCallingTool, liveStdoutRow, terminalToolRow]);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.messageId).toBe('assistant-call-stream-2');
    expect(Array.isArray(merged[0]?.combinedToolResults)).toBe(true);
    expect(merged[0]?.combinedToolResults).toHaveLength(1);
    expect(merged[0]?.combinedToolResults?.[0]?.messageId).toBe('tool-result-2');
  });
});
