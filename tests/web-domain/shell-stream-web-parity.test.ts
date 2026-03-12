/**
 * Web Shell Stream Parity Tests
 *
 * Purpose:
 * - Verify live web shell tool rows keep Electron-style metadata and finalize cleanly.
 *
 * Key Features:
 * - Shell tool-start backfills command metadata onto an existing live tool-stream row.
 * - Terminal shell tool-result events finalize matching live tool-stream rows.
 * - Reply-linked tool results merge into inline `Calling tool:` request rows without `tool_calls`.
 * - Linked live shell stream rows merge into the request row instead of rendering as a second tool card.
 *
 * Notes on Implementation:
 * - Uses in-memory AppRun state fixtures only.
 * - Asserts transcript-visible outcomes instead of implementation internals.
 *
 * Summary of Recent Changes:
 * - 2026-03-12: Initial coverage for web shell stream parity and reply-linked merge fallback.
 */

import { describe, expect, it } from 'vitest';
import { handleToolStart, handleToolResult, handleToolStream } from '../../web/src/utils/sse-client';
import { buildCombinedRenderableMessages } from '../../web/src/domain/tool-merge';
import { getToolSummaryStatus } from '../../web/src/domain/message-content';
import { worldUpdateHandlers } from '../../web/src/pages/World.update';

describe('web shell stream parity', () => {
  it('backfills shell command metadata onto an existing live tool stream row', () => {
    const streamingState = handleToolStream({
      messages: [],
      isWaiting: false,
    } as any, {
      messageId: 'call-1-stdout',
      agentName: 'agent-a',
      content: 'line 1\n',
      stream: 'stdout',
    });

    const nextState = handleToolStart(streamingState as any, {
      messageId: 'call-1',
      sender: 'agent-a',
      chatId: 'chat-1',
      toolExecution: {
        toolName: 'shell_cmd',
        toolCallId: 'call-1',
        input: { command: 'pwd' },
      },
    });

    expect(nextState.messages).toHaveLength(1);
    expect(nextState.messages[0]).toMatchObject({
      messageId: 'call-1-stdout',
      toolName: 'shell_cmd',
      command: 'pwd',
      toolInput: { command: 'pwd' },
      chatId: 'chat-1',
      isToolStreaming: true,
    });
  });

  it('finalizes matching live shell stream rows when the tool result arrives', () => {
    const state = {
      messages: [
        {
          id: 'stderr-row',
          messageId: 'call-1',
          sender: 'agent-a',
          text: 'warning',
          isToolEvent: true,
          isToolStreaming: true,
          streamType: 'stderr',
        },
        {
          id: 'stdout-row',
          messageId: 'call-1-stdout',
          sender: 'agent-a',
          text: '/workspace\n',
          isToolEvent: true,
          isToolStreaming: true,
          streamType: 'stdout',
        },
      ],
    } as any;

    const nextState = handleToolResult(state, {
      messageId: 'call-1',
      sender: 'agent-a',
      chatId: 'chat-1',
      toolExecution: {
        toolName: 'shell_cmd',
        toolCallId: 'call-1',
        input: { command: 'pwd' },
        result: 'status: success\nexit_code: 0\nstdout_preview:\n/workspace',
      },
    });

    expect(nextState.messages).toEqual([
      expect.objectContaining({ messageId: 'call-1', isToolStreaming: false }),
      expect.objectContaining({ messageId: 'call-1-stdout', isToolStreaming: false }),
      expect.objectContaining({
        role: 'tool',
        tool_call_id: 'call-1',
        toolName: 'shell_cmd',
        command: 'pwd',
        text: 'status: success\nexit_code: 0\nstdout_preview:\n/workspace',
      }),
    ]);
  });

  it('merges a reply-linked tool result into an inline request row without tool_calls metadata', () => {
    const result = buildCombinedRenderableMessages([
      {
        id: 'assistant-inline',
        type: 'assistant',
        role: 'assistant',
        sender: 'agent-a',
        text: 'Calling tool: shell_cmd (command: "pwd")',
        messageId: 'assistant-msg-1',
        createdAt: new Date('2026-03-12T00:00:00.000Z'),
      } as any,
      {
        id: 'tool-result',
        type: 'tool',
        role: 'tool',
        sender: 'agent-a',
        text: 'status: success\nexit_code: 0\nstdout_preview:\n/workspace',
        messageId: 'tool-msg-1',
        replyToMessageId: 'assistant-msg-1',
        createdAt: new Date('2026-03-12T00:00:01.000Z'),
      } as any,
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'assistant-inline',
      combinedToolResults: [
        expect.objectContaining({ id: 'tool-result' }),
      ],
    });
  });

  it('merges a linked live shell stream row into the request row', () => {
    const result = buildCombinedRenderableMessages([
      {
        id: 'assistant-request',
        type: 'assistant',
        role: 'assistant',
        sender: 'agent-a',
        text: 'Calling tool: shell_cmd (command: "pwd")',
        tool_calls: [
          {
            id: 'call-1',
            type: 'function',
            function: { name: 'shell_cmd', arguments: '{"command":"pwd"}' },
          },
        ],
        messageId: 'assistant-msg-1',
        createdAt: new Date('2026-03-12T00:00:00.000Z'),
      } as any,
      {
        id: 'live-stream',
        type: 'tool-stream',
        role: 'tool',
        sender: 'agent-a',
        text: '/workspace\n',
        messageId: 'call-1-stdout',
        toolCallId: 'call-1',
        isToolEvent: true,
        isToolStreaming: true,
        streamType: 'stdout',
        createdAt: new Date('2026-03-12T00:00:01.000Z'),
      } as any,
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'assistant-request',
      combinedToolStreams: [
        expect.objectContaining({ id: 'live-stream' }),
      ],
    });
  });

  it('preserves live request/result tool metadata from message events so the merged card reaches done state', () => {
    const handleMessageEvent = (worldUpdateHandlers as any)['handleMessageEvent'];
    const baseState = {
      currentChat: { id: 'chat-1', name: 'Chat 1' },
      world: { id: 'world-1', currentChatId: 'chat-1', agents: [] },
      messages: [],
    } as any;

    const withRequest = handleMessageEvent(baseState, {
      sender: 'agent-a',
      content: 'Calling tool: shell_cmd (command: "pwd")',
      role: 'assistant',
      chatId: 'chat-1',
      messageId: 'assistant-call-1',
      createdAt: '2026-03-12T00:00:00.000Z',
      tool_calls: [
        {
          id: 'call-1',
          type: 'function',
          function: { name: 'shell_cmd', arguments: '{"command":"pwd"}' },
        },
      ],
    });

    const withResult = handleMessageEvent(withRequest, {
      sender: 'agent-a',
      content: 'status: success\nexit_code: 0\nstdout_preview:\n/workspace',
      role: 'tool',
      chatId: 'chat-1',
      messageId: 'tool-result-1',
      createdAt: '2026-03-12T00:00:01.000Z',
      tool_call_id: 'call-1',
    });

    const merged = buildCombinedRenderableMessages(withResult.messages);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      tool_calls: [
        expect.objectContaining({ id: 'call-1' }),
      ],
      combinedToolResults: [
        expect.objectContaining({ tool_call_id: 'call-1' }),
      ],
    });
    expect(getToolSummaryStatus(merged[0] as any)).toBe('done');
  });

  it('converts live tool_result envelopes into merged tool rows so running cards finish without refresh', () => {
    const handleMessageEvent = (worldUpdateHandlers as any)['handleMessageEvent'];
    const baseState = {
      currentChat: { id: 'chat-1', name: 'Chat 1' },
      world: { id: 'world-1', currentChatId: 'chat-1', agents: [] },
      messages: [],
    } as any;

    const withRequest = handleMessageEvent(baseState, {
      sender: 'agent-a',
      content: 'Calling tool: shell_cmd (command: "pwd")',
      role: 'assistant',
      chatId: 'chat-1',
      messageId: 'assistant-call-1',
      createdAt: '2026-03-12T00:00:00.000Z',
      tool_calls: [
        {
          id: 'call-1',
          type: 'function',
          function: { name: 'shell_cmd', arguments: '{"command":"pwd"}' },
        },
      ],
    });

    const withResult = handleMessageEvent(withRequest, {
      sender: 'agent-a',
      content: JSON.stringify({
        __type: 'tool_result',
        tool_call_id: 'call-1',
        agentId: 'agent-a',
        content: 'status: success\nexit_code: 0\nstdout_preview:\n/workspace',
      }),
      chatId: 'chat-1',
      messageId: 'tool-result-1',
      createdAt: '2026-03-12T00:00:01.000Z',
    });

    const merged = buildCombinedRenderableMessages(withResult.messages);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      tool_calls: [
        expect.objectContaining({ id: 'call-1' }),
      ],
      combinedToolResults: [
        expect.objectContaining({
          tool_call_id: 'call-1',
          text: 'status: success\nexit_code: 0\nstdout_preview:\n/workspace',
          role: 'tool',
        }),
      ],
    });
    expect(getToolSummaryStatus(merged[0] as any)).toBe('done');
  });

  it('turns the merged shell request card to done from the live tool-result event before any message refresh', () => {
    const handleMessageEvent = (worldUpdateHandlers as any)['handleMessageEvent'];
    const handleToolResultEvent = (worldUpdateHandlers as any)['handleToolResult'];
    const baseState = {
      currentChat: { id: 'chat-1', name: 'Chat 1' },
      world: { id: 'world-1', currentChatId: 'chat-1', agents: [] },
      messages: [],
      activeTools: [],
      pendingStreamUpdates: new Map(),
      isBusy: false,
      elapsedIntervalId: null,
    } as any;

    const withRequest = handleMessageEvent(baseState, {
      sender: 'agent-a',
      content: 'Calling tool: shell_cmd (command: "pwd")',
      role: 'assistant',
      chatId: 'chat-1',
      messageId: 'assistant-call-1',
      createdAt: '2026-03-12T00:00:00.000Z',
      tool_calls: [
        {
          id: 'call-1',
          type: 'function',
          function: { name: 'shell_cmd', arguments: '{"command":"pwd"}' },
        },
      ],
    });

    const withToolResultEvent = handleToolResultEvent(withRequest, {
      messageId: 'call-1',
      sender: 'agent-a',
      chatId: 'chat-1',
      toolExecution: {
        toolName: 'shell_cmd',
        toolCallId: 'call-1',
        input: { command: 'pwd' },
        result: 'status: success\nexit_code: 0\nstdout_preview:\n/workspace',
      },
    });

    const merged = buildCombinedRenderableMessages(withToolResultEvent.messages);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      combinedToolResults: [
        expect.objectContaining({
          tool_call_id: 'call-1',
          text: 'status: success\nexit_code: 0\nstdout_preview:\n/workspace',
        }),
      ],
    });
    expect(getToolSummaryStatus(merged[0] as any)).toBe('done');
  });

  it('replaces a synthetic live shell completion row with the later persisted tool message instead of duplicating it', () => {
    const handleMessageEvent = (worldUpdateHandlers as any)['handleMessageEvent'];
    const handleToolResultEvent = (worldUpdateHandlers as any)['handleToolResult'];
    const baseState = {
      currentChat: { id: 'chat-1', name: 'Chat 1' },
      world: { id: 'world-1', currentChatId: 'chat-1', agents: [] },
      messages: [],
      activeTools: [],
      pendingStreamUpdates: new Map(),
      isBusy: false,
      elapsedIntervalId: null,
    } as any;

    const withRequest = handleMessageEvent(baseState, {
      sender: 'agent-a',
      content: 'Calling tool: shell_cmd (command: "pwd")',
      role: 'assistant',
      chatId: 'chat-1',
      messageId: 'assistant-call-1',
      createdAt: '2026-03-12T00:00:00.000Z',
      tool_calls: [
        {
          id: 'call-1',
          type: 'function',
          function: { name: 'shell_cmd', arguments: '{"command":"pwd"}' },
        },
      ],
    });

    const withSyntheticResult = handleToolResultEvent(withRequest, {
      messageId: 'call-1',
      sender: 'agent-a',
      chatId: 'chat-1',
      toolExecution: {
        toolName: 'shell_cmd',
        toolCallId: 'call-1',
        input: { command: 'pwd' },
        result: 'status: success\nexit_code: 0\nstdout_preview:\n/workspace',
      },
    });

    const withPersistedResult = handleMessageEvent(withSyntheticResult, {
      sender: 'agent-a',
      content: 'status: success\nexit_code: 0\nstdout_preview:\n/workspace',
      role: 'tool',
      chatId: 'chat-1',
      messageId: 'tool-result-1',
      createdAt: '2026-03-12T00:00:01.000Z',
      tool_call_id: 'call-1',
    });

    const merged = buildCombinedRenderableMessages(withPersistedResult.messages);

    expect(withPersistedResult.messages.filter((message: any) => String(message?.tool_call_id || '').trim() === 'call-1')).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      combinedToolResults: [
        expect.objectContaining({ messageId: 'tool-result-1', tool_call_id: 'call-1' }),
      ],
    });
  });
});
