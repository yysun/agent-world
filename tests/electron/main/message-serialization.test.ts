/**
 * Unit Tests for Electron Message Serialization
 *
 * Features:
 * - Validates chat-session normalization and deduplication behavior.
 * - Ensures human-message detection prioritizes sender over legacy role hints.
 *
 * Implementation Notes:
 * - Uses pure helper tests with no Electron runtime dependencies.
 *
 * Recent Changes:
 * - 2026-03-21: Added regression coverage for persisted synthetic assistant tool-result rows so
 *   Electron renderer transport receives plain assistant markdown plus display-only linkage metadata.
 * - 2026-03-10: Added regression coverage ensuring activity event serialization includes chatId in nested object (E-Rule 4).
 * - 2026-03-06: Added regression coverage ensuring realtime log serialization preserves world/chat scope for transcript routing.
 * - 2026-02-28: Added regression coverage ensuring realtime tool message serialization preserves `tool_call_id` for renderer-side request/result linking.
 * - 2026-02-19: Added coverage for realtime CRUD-event serialization payload shape.
 * - 2026-02-15: Added regression coverage for agent-sender messages persisted with `role: 'user'`.
 */

import { describe, expect, it } from 'vitest';
import {
  normalizeSessionMessages,
  serializeMessage,
  serializeChatsWithMessageCounts,
  serializeRealtimeLogEvent,
  serializeRealtimeMessageEvent,
  serializeRealtimeCrudEvent,
  serializeRealtimeActivityEvent,
  serializeRealtimeSSEEvent
} from '../../../electron/main-process/message-serialization';

describe('normalizeSessionMessages', () => {
  it('does not classify agent-sender user-role message as a human-only duplicate', () => {
    const source = [
      {
        id: 'msg-1',
        messageId: 'msg-1',
        role: 'user',
        sender: 'g1',
        content: '@g2, good day!',
        createdAt: '2026-02-15T18:04:00.000Z',
        chatId: 'chat-1'
      }
    ];

    const normalized = normalizeSessionMessages(source);

    expect(normalized).toHaveLength(1);
    expect(normalized[0].sender).toBe('g1');
    expect(normalized[0].role).toBe('user');
  });

  it('still treats explicit human sender as human message', () => {
    const source = [
      {
        id: 'msg-2',
        messageId: 'msg-2',
        role: 'user',
        sender: 'human',
        content: 'hello',
        createdAt: '2026-02-15T18:03:00.000Z',
        chatId: 'chat-1'
      }
    ];

    const normalized = normalizeSessionMessages(source);

    expect(normalized).toHaveLength(1);
    expect(normalized[0].sender).toBe('human');
  });
});

describe('serializeRealtimeCrudEvent', () => {
  it('serializes CRUD payload for renderer chat events', () => {
    const payload = serializeRealtimeCrudEvent('world-1', 'chat-1', {
      operation: 'create',
      entityType: 'agent',
      entityId: 'agent-2',
      entityData: { id: 'agent-2', name: 'Agent 2' },
      timestamp: '2026-02-19T18:00:00.000Z'
    });

    expect(payload).toMatchObject({
      type: 'crud',
      worldId: 'world-1',
      chatId: 'chat-1',
      crud: {
        operation: 'create',
        entityType: 'agent',
        entityId: 'agent-2',
        entityData: { id: 'agent-2', name: 'Agent 2' },
        createdAt: '2026-02-19T18:00:00.000Z'
      }
    });
  });
});

describe('serializeRealtimeMessageEvent', () => {
  it('preserves tool_call_id on realtime tool messages', () => {
    const payload = serializeRealtimeMessageEvent('world-1', {
      messageId: 'msg-tool-1',
      role: 'tool',
      sender: 'shell_cmd',
      content: '{"status":"failed","exit_code":1}',
      tool_call_id: 'call_shell_1',
      chatId: 'chat-1',
      timestamp: '2026-02-28T12:00:00.000Z'
    });

    expect(payload).toMatchObject({
      type: 'message',
      worldId: 'world-1',
      chatId: 'chat-1',
      message: {
        messageId: 'msg-tool-1',
        role: 'tool',
        tool_call_id: 'call_shell_1',
      }
    });
  });

  it('unwraps synthetic assistant tool-result payloads into plain assistant content', () => {
    const payload = serializeRealtimeMessageEvent('world-1', {
      messageId: 'msg-synth-1',
      role: 'assistant',
      sender: 'agent-a',
      content: JSON.stringify({
        __type: 'synthetic_assistant_tool_result',
        version: 1,
        displayOnly: true,
        tool: 'shell_cmd',
        tool_call_id: 'call-svg',
        source_message_id: 'msg-tool-1',
        content: '![score](data:image/svg+xml;base64,AAAA)',
      }),
      chatId: 'chat-1',
      timestamp: '2026-03-21T12:00:00.000Z'
    });

    expect(payload).toMatchObject({
      message: {
        role: 'assistant',
        content: '![score](data:image/svg+xml;base64,AAAA)',
        syntheticDisplayOnly: true,
        syntheticToolResult: {
          tool: 'shell_cmd',
          toolCallId: 'call-svg',
          sourceMessageId: 'msg-tool-1',
        },
      }
    });
  });
});

describe('serializeMessage', () => {
  it('unwraps persisted synthetic assistant tool-result rows for session hydration', () => {
    const serialized = serializeMessage({
      messageId: 'msg-synth-2',
      role: 'assistant',
      sender: 'agent-a',
      chatId: 'chat-1',
      createdAt: '2026-03-21T12:01:00.000Z',
      content: JSON.stringify({
        __type: 'synthetic_assistant_tool_result',
        version: 1,
        displayOnly: true,
        tool: 'web_fetch',
        tool_call_id: 'call-fetch-1',
        source_message_id: 'msg-tool-fetch-1',
        content: '# Heading',
      }),
    });

    expect(serialized).toMatchObject({
      role: 'assistant',
      content: '# Heading',
      syntheticDisplayOnly: true,
      syntheticToolResult: {
        tool: 'web_fetch',
        toolCallId: 'call-fetch-1',
        sourceMessageId: 'msg-tool-fetch-1',
      },
    });
  });
});

describe('serializeRealtimeLogEvent', () => {
  it('preserves chat-scoped log metadata for renderer routing', () => {
    const payload = serializeRealtimeLogEvent({
      level: 'error',
      category: 'agent',
      message: 'Failed to continue LLM after tool execution',
      timestamp: '2026-03-06T19:19:52.794Z',
      messageId: 'log-123',
      data: {
        worldId: 'world-1',
        chatId: 'chat-1',
        agentId: 'a1',
        error: 'Filtered by content policy.'
      }
    });

    expect(payload).toMatchObject({
      type: 'log',
      worldId: 'world-1',
      chatId: 'chat-1',
      logEvent: {
        level: 'error',
        category: 'agent',
        message: 'Failed to continue LLM after tool execution',
        messageId: 'log-123',
        worldId: 'world-1',
        chatId: 'chat-1',
      }
    });
  });
});

describe('serializeRealtimeActivityEvent', () => {
  it('includes chatId in nested activity object for renderer fallback', () => {
    const payload = serializeRealtimeActivityEvent('world-1', 'chat-1', {
      type: 'response-start',
      pendingOperations: 1,
      activityId: 42,
      source: 'agent-a',
      activeSources: ['agent-a'],
      queue: null
    });

    expect(payload).toMatchObject({
      type: 'activity',
      worldId: 'world-1',
      chatId: 'chat-1',
      activity: {
        eventType: 'response-start',
        chatId: 'chat-1',
        source: 'agent-a',
        activeSources: ['agent-a']
      }
    });
  });

  it('sets nested chatId to null when top-level chatId is null', () => {
    const payload = serializeRealtimeActivityEvent('world-1', null, {
      type: 'idle',
      pendingOperations: 0,
      activityId: 43
    });

    expect(payload.chatId).toBeNull();
    expect((payload.activity as any).chatId).toBeNull();
  });
});

describe('serializeRealtimeSSEEvent', () => {
  it('preserves assistant reasoningContent on realtime SSE chunk events', () => {
    const payload = serializeRealtimeSSEEvent('world-1', 'chat-1', {
      type: 'chunk',
      messageId: 'msg-1',
      agentName: 'a1',
      content: 'final answer',
      reasoningContent: 'intermediate chain',
    });

    expect(payload).toMatchObject({
      type: 'sse',
      worldId: 'world-1',
      chatId: 'chat-1',
      sse: {
        eventType: 'chunk',
        messageId: 'msg-1',
        agentName: 'a1',
        content: 'final answer',
        reasoningContent: 'intermediate chain',
      },
    });
  });
});

describe('serializeChatsWithMessageCounts', () => {
  it('counts only user-visible conversation messages for session badges', async () => {
    const sessions = await serializeChatsWithMessageCounts(
      'world-1',
      [{ id: 'chat-1', worldId: 'world-1', name: 'Chat 1', messageCount: 99 }],
      async () => ([
        {
          messageId: 'user-1',
          role: 'user',
          sender: 'human',
          content: 'find videos',
          chatId: 'chat-1',
          createdAt: '2026-03-06T17:52:38.869Z',
          agentId: 'gemini'
        },
        {
          messageId: 'user-1',
          role: 'user',
          sender: 'human',
          content: 'find videos',
          chatId: 'chat-1',
          createdAt: '2026-03-06T17:52:38.869Z',
          agentId: 'qwen'
        },
        {
          messageId: 'assistant-1',
          role: 'assistant',
          sender: 'gemini',
          content: 'I loaded yt-dlp.',
          chatId: 'chat-1',
          createdAt: '2026-03-06T17:52:40.030Z',
          agentId: 'gemini',
          tool_calls: [{ id: 'tool-req-1', function: { name: 'load_skill' } }]
        },
        {
          messageId: 'assistant-tool-request',
          role: 'assistant',
          sender: 'gemini',
          content: 'Calling tool: yt-dlp',
          chatId: 'chat-1',
          createdAt: '2026-03-06T17:52:40.067Z',
          agentId: 'gemini'
        },
        {
          messageId: 'tool-1',
          role: 'tool',
          sender: 'gemini',
          content: '{"ok":true}',
          chatId: 'chat-1',
          createdAt: '2026-03-06T17:52:43.267Z',
          agentId: 'gemini'
        },
        {
          messageId: 'assistant-2',
          role: 'assistant',
          sender: 'gemini',
          content: 'I found the videos.',
          chatId: 'chat-1',
          createdAt: '2026-03-06T17:52:50.000Z',
          agentId: 'gemini',
          tool_calls: [{ id: 'tool-req-2', function: { name: 'shell_cmd' } }]
        },
        {
          messageId: 'assistant-3',
          role: 'assistant',
          sender: 'gemini',
          content: 'I created the notebook.',
          chatId: 'chat-1',
          createdAt: '2026-03-06T17:53:14.179Z',
          agentId: 'gemini'
        }
      ])
    );

    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      id: 'chat-1',
      messageCount: 4,
    });
  });
});
