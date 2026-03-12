/**
 * Unit Tests for Chat Event Handler Domain Module
 *
 * Features:
 * - Verifies global log event routing behavior.
 * - Verifies subscription/world/chat filtering in session handlers.
 * - Verifies SSE/tool event delegation to streaming state managers.
 *
 * Implementation Notes:
 * - Uses dependency injection with in-memory refs/state setters.
 * - Focuses on orchestration behavior, not UI rendering.
 *
 * Recent Changes:
 * - 2026-03-12: Added plain-text selected-chat system-event forwarding coverage for status-bar visibility.
 * - 2026-03-10: Added assistant SSE chatId propagation coverage so live streaming rows stay scoped
 *   to the selected chat during refresh reconciliation.
 * - 2026-03-10: Added coverage that unscoped activity events are ignored for the selected chat, preserving live streaming rows until a properly scoped event arrives.
 * - 2026-03-10: Reverted log-event transcript injection; logs remain diagnostics-only while structured system errors drive durable transcript failure rows.
 * - 2026-02-27: Updated global-log coverage to assert logs are routed only to panel callbacks (no chat-message insertion).
 * - 2026-02-27: Added coverage for unified main-process log callback routing independent of active-session message-list updates.
 * - 2026-02-26: Added coverage for redundant error-log suppression when an equivalent inline stream error is already present.
 * - 2026-02-24: Removed activityStateRef from all tests (activity-state.ts deleted as part of working-status simplification).
 * - 2026-02-22: Removed activity event routing tests and response-state tracking tests as part of status-registry migration (Phase 1).
 * - 2026-02-20: Added optimistic user-message reconciliation coverage for message-event ordering and identical consecutive user sends.
 * - 2026-02-20: Added coverage for chat-scoped HITL prompt delivery via tool-progress metadata.
 * - 2026-02-13: Updated system-event coverage to structured payload content (`eventType` + metadata object).
 * - 2026-02-13: Added coverage for session-scoped realtime system events (chat title update notifications).
 * - 2026-02-13: Added coverage for tool lifecycle response-state transitions and chat-id filtering.
 * - 2026-02-12: Moved into layer-based tests/electron subfolder and updated module import paths.
 * - 2026-02-12: Added Phase 5 tests for extracted chat event orchestration handlers.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  createChatSubscriptionEventHandler,
  createGlobalLogEventHandler
} from '../../../electron/renderer/src/domain/chat-event-handlers';

type TestMessage = {
  messageId?: string;
  id?: string;
  role?: string;
  sender?: string;
  chatId?: string;
  content?: string;
  type?: string;
  hasError?: boolean;
  errorMessage?: string;
  optimisticUserPending?: boolean;
  createdAt?: string;
  isToolStreaming?: boolean;
  streamType?: string;
};

function createMessageStateHarness(initial: TestMessage[] = []) {
  let value: TestMessage[] = [...initial];
  const setMessages = (updater: (existing: TestMessage[]) => TestMessage[]) => {
    value = updater(value);
  };
  return {
    setMessages,
    getMessages: () => value
  };
}

function makeFullStreamingRef() {
  return {
    current: {
      getActiveCount: vi.fn(() => 0),
      endAllToolStreams: vi.fn(() => [] as string[]),
      handleStart: vi.fn(),
      handleChunk: vi.fn(),
      handleEnd: vi.fn(),
      handleError: vi.fn(),
      handleToolStreamStart: vi.fn(),
      handleToolStreamChunk: vi.fn(),
      handleToolStreamEnd: vi.fn(),
      isActive: vi.fn(() => false),
      cleanup: vi.fn(),
    }
  };
}

describe('createGlobalLogEventHandler', () => {
  it('publishes main log callbacks for log events', () => {
    const onMainLogEvent = vi.fn();

    const handler = createGlobalLogEventHandler({
      onMainLogEvent,
    });

    handler({
      type: 'log',
      worldId: 'world-1',
      chatId: 'chat-1',
      logEvent: {
        message: 'Something happened',
        level: 'info',
        category: 'system',
        timestamp: '2026-02-27T10:00:00.000Z',
        data: {
          worldId: 'world-1',
          chatId: 'chat-1',
        }
      }
    });

    expect(onMainLogEvent).toHaveBeenCalledTimes(1);
    expect(onMainLogEvent).toHaveBeenCalledWith({
      process: 'main',
      level: 'info',
      category: 'system',
      message: 'Something happened',
      timestamp: '2026-02-27T10:00:00.000Z',
      worldId: 'world-1',
      chatId: 'chat-1',
      data: {
        worldId: 'world-1',
        chatId: 'chat-1',
      }
    });
  });

  it('normalizes missing log fields and ignores non-log payloads', () => {
    const onMainLogEvent = vi.fn();
    const handler = createGlobalLogEventHandler({
      onMainLogEvent,
    });

    handler({
      type: 'message',
      message: {
        messageId: 'm-1',
      }
    } as any);

    handler({
      type: 'log',
      logEvent: {
        message: '',
        level: '',
        category: '',
      }
    });

    expect(onMainLogEvent).toHaveBeenCalledTimes(1);
    expect(onMainLogEvent.mock.calls[0]?.[0]).toMatchObject({
      process: 'main',
      level: 'info',
      category: 'main',
      message: '(empty log message)',
    });
    expect(typeof onMainLogEvent.mock.calls[0]?.[0]?.timestamp).toBe('string');
  });
});

describe('createChatSubscriptionEventHandler', () => {
  it('upserts incoming session message events', () => {
    const harness = createMessageStateHarness();
    const streamingStateRef = {
      current: {
        getActiveCount: vi.fn(() => 0),
        endAllToolStreams: vi.fn(() => [] as string[]),
        handleStart: vi.fn(),
        handleChunk: vi.fn(),
        handleEnd: vi.fn(),
        handleError: vi.fn(),
        handleToolStreamStart: vi.fn(),
        handleToolStreamChunk: vi.fn(),
        handleToolStreamEnd: vi.fn(),
        isActive: vi.fn(() => false),
        cleanup: vi.fn(),
      }
    };

    const handler = createChatSubscriptionEventHandler({
      subscriptionId: 'sub-1',
      loadedWorldId: 'world-1',
      selectedSessionId: 'chat-1',
      streamingStateRef,
      setMessages: harness.setMessages as Parameters<typeof createChatSubscriptionEventHandler>[0]['setMessages'],
    });

    handler({
      type: 'message',
      subscriptionId: 'sub-1',
      worldId: 'world-1',
      message: {
        messageId: 'm-1',
        chatId: 'chat-1',
        role: 'assistant',
        content: 'hello',
        createdAt: '2026-02-12T10:00:00.000Z'
      }
    });

    expect(harness.getMessages()).toHaveLength(1);
    expect((harness.getMessages()[0] as Record<string, unknown>).messageId).toBe('m-1');
  });

  it('reconciles incoming user message event into pending optimistic message', () => {
    const harness = createMessageStateHarness([{
      messageId: 'optimistic-user-1',
      id: 'optimistic-user-1',
      role: 'user',
      sender: 'human',
      chatId: 'chat-1',
      content: 'hello',
      optimisticUserPending: true,
      createdAt: '2026-02-20T10:00:00.000Z'
    }]);
    const handler = createChatSubscriptionEventHandler({
      subscriptionId: 'sub-1',
      loadedWorldId: 'world-1',
      selectedSessionId: 'chat-1',
      streamingStateRef: { current: null },
      setMessages: harness.setMessages as Parameters<typeof createChatSubscriptionEventHandler>[0]['setMessages'],
    });

    handler({
      type: 'message',
      subscriptionId: 'sub-1',
      worldId: 'world-1',
      message: {
        messageId: 'server-user-1',
        chatId: 'chat-1',
        role: 'user',
        sender: 'human',
        content: 'hello',
        createdAt: '2026-02-20T10:00:01.000Z'
      }
    });

    const msgs = harness.getMessages() as Record<string, unknown>[];
    expect(msgs).toHaveLength(1);
    expect(msgs[0].messageId).toBe('server-user-1');
    expect(msgs[0].optimisticUserPending).toBe(false);
  });

  it('keeps identical consecutive user sends distinct when message events arrive', () => {
    const harness = createMessageStateHarness([
      {
        messageId: 'optimistic-user-1',
        id: 'optimistic-user-1',
        role: 'user',
        sender: 'human',
        chatId: 'chat-1',
        content: 'repeat',
        optimisticUserPending: true,
        createdAt: '2026-02-20T10:00:00.000Z'
      },
      {
        messageId: 'optimistic-user-2',
        id: 'optimistic-user-2',
        role: 'user',
        sender: 'human',
        chatId: 'chat-1',
        content: 'repeat',
        optimisticUserPending: true,
        createdAt: '2026-02-20T10:00:01.000Z'
      }
    ]);
    const handler = createChatSubscriptionEventHandler({
      subscriptionId: 'sub-1',
      loadedWorldId: 'world-1',
      selectedSessionId: 'chat-1',
      streamingStateRef: { current: null },

      setMessages: harness.setMessages as Parameters<typeof createChatSubscriptionEventHandler>[0]['setMessages'],
    });

    handler({
      type: 'message',
      subscriptionId: 'sub-1',
      worldId: 'world-1',
      message: {
        messageId: 'server-user-1',
        chatId: 'chat-1',
        role: 'user',
        sender: 'human',
        content: 'repeat',
        createdAt: '2026-02-20T10:00:02.000Z'
      }
    });
    handler({
      type: 'message',
      subscriptionId: 'sub-1',
      worldId: 'world-1',
      message: {
        messageId: 'server-user-2',
        chatId: 'chat-1',
        role: 'user',
        sender: 'human',
        content: 'repeat',
        createdAt: '2026-02-20T10:00:03.000Z'
      }
    });

    const messages = harness.getMessages() as Record<string, unknown>[];
    expect(messages).toHaveLength(2);
    expect(messages.map((m) => m.messageId)).toEqual(['server-user-1', 'server-user-2']);
    expect(messages.every((m) => m.optimisticUserPending !== true)).toBe(true);
  });

  it('does not add log events to the transcript', () => {
    const harness = createMessageStateHarness();
    const handler = createChatSubscriptionEventHandler({
      subscriptionId: 'sub-1',
      loadedWorldId: 'world-1',
      selectedSessionId: 'chat-1',
      streamingStateRef: { current: null },
      setMessages: harness.setMessages as Parameters<typeof createChatSubscriptionEventHandler>[0]['setMessages'],
    });

    handler({
      type: 'log',
      subscriptionId: 'sub-1',
      worldId: 'world-1',
      chatId: 'chat-1',
      logEvent: {
        messageId: 'log-error-1',
        chatId: 'chat-1',
        level: 'error',
        category: 'AGENT',
        message: 'Failed to continue LLM after tool execution',
        timestamp: '2026-03-06T19:19:52.794Z',
        data: {
          args: [{
            agentId: 'a1',
            error: 'The response was filtered by content policy.'
          }]
        }
      }
    } as any);

    handler({
      type: 'log',
      subscriptionId: 'sub-1',
      worldId: 'world-1',
      chatId: 'chat-1',
      logEvent: {
        messageId: 'log-info-1',
        chatId: 'chat-1',
        level: 'info',
        category: 'AGENT',
        message: 'Continuation retry scheduled',
        timestamp: '2026-03-06T19:19:53.000Z',
      }
    } as any);

    const messages = harness.getMessages();
    expect(messages).toEqual([]);
  });

  it('ignores mismatched subscriptions/world IDs', () => {
    const harness = createMessageStateHarness();
    const handler = createChatSubscriptionEventHandler({
      subscriptionId: 'sub-1',
      loadedWorldId: 'world-1',
      selectedSessionId: 'chat-1',
      streamingStateRef: { current: null },

      setMessages: harness.setMessages as Parameters<typeof createChatSubscriptionEventHandler>[0]['setMessages'],
    });

    handler({
      type: 'message',
      subscriptionId: 'sub-2',
      worldId: 'world-1',
      message: {
        messageId: 'm-1',
        chatId: 'chat-1',
        role: 'assistant',
        content: 'ignored'
      }
    });

    expect(harness.getMessages()).toHaveLength(0);
  });

  it('ignores message events without chatId when a session is selected', () => {
    const harness = createMessageStateHarness();
    const handler = createChatSubscriptionEventHandler({
      subscriptionId: 'sub-1',
      loadedWorldId: 'world-1',
      selectedSessionId: 'chat-1',
      streamingStateRef: { current: null },

      setMessages: harness.setMessages as Parameters<typeof createChatSubscriptionEventHandler>[0]['setMessages'],
    });

    handler({
      type: 'message',
      subscriptionId: 'sub-1',
      worldId: 'world-1',
      message: {
        messageId: 'm-unscoped',
        role: 'assistant',
        content: 'should be ignored'
      }
    });

    expect(harness.getMessages()).toHaveLength(0);
  });

  it('ignores unscoped agent messages with missing role', () => {
    const harness = createMessageStateHarness();
    const handler = createChatSubscriptionEventHandler({
      subscriptionId: 'sub-1',
      loadedWorldId: 'world-1',
      selectedSessionId: 'chat-1',
      streamingStateRef: { current: null },

      setMessages: harness.setMessages as Parameters<typeof createChatSubscriptionEventHandler>[0]['setMessages'],
    });

    handler({
      type: 'message',
      subscriptionId: 'sub-1',
      worldId: 'world-1',
      message: {
        messageId: 'm-unscoped-agent',
        sender: 'a1',
        content: 'final answer from agent'
      }
    });

    expect(harness.getMessages()).toHaveLength(0);
  });

  it('finalizes matching active assistant stream when final assistant message arrives', () => {
    const harness = createMessageStateHarness();
    const streamingStateRef = {
      current: {
        getActiveCount: vi.fn(() => 0),
        endAllToolStreams: vi.fn(() => [] as string[]),
        handleStart: vi.fn(),
        handleChunk: vi.fn(),
        handleEnd: vi.fn(),
        handleError: vi.fn(),
        handleToolStreamStart: vi.fn(),
        handleToolStreamChunk: vi.fn(),
        handleToolStreamEnd: vi.fn(),
        isActive: vi.fn((messageId: string) => messageId === 'stream-1'),
        cleanup: vi.fn(),
      }
    };

    const handler = createChatSubscriptionEventHandler({
      subscriptionId: 'sub-1',
      loadedWorldId: 'world-1',
      selectedSessionId: 'chat-1',
      streamingStateRef,

      setMessages: harness.setMessages as Parameters<typeof createChatSubscriptionEventHandler>[0]['setMessages'],
    });

    handler({
      type: 'message',
      subscriptionId: 'sub-1',
      worldId: 'world-1',
      message: {
        messageId: 'stream-1',
        chatId: 'chat-1',
        role: 'assistant',
        sender: 'a1',
        content: 'final response'
      }
    });

    expect(streamingStateRef.current.handleEnd).toHaveBeenCalledWith('stream-1');
    expect(harness.getMessages()).toHaveLength(1);
  });

  it('delegates SSE start events to streaming state manager with chat scope', () => {
    const harness = createMessageStateHarness();
    const streamingStateRef = makeFullStreamingRef();
    (streamingStateRef.current.getActiveCount as ReturnType<typeof vi.fn>).mockReturnValue(1);

    const handler = createChatSubscriptionEventHandler({
      subscriptionId: 'sub-1',
      loadedWorldId: 'world-1',
      selectedSessionId: 'chat-1',
      streamingStateRef,
      setMessages: harness.setMessages as Parameters<typeof createChatSubscriptionEventHandler>[0]['setMessages'],
    });

    handler({
      type: 'sse',
      subscriptionId: 'sub-1',
      worldId: 'world-1',
      sse: {
        eventType: 'start',
        chatId: 'chat-1',
        messageId: 'm-1',
        agentName: 'assistant-1'
      }
    });

    handler({
      type: 'tool',
      subscriptionId: 'sub-1',
      worldId: 'world-1',
      chatId: 'chat-1',
      tool: {
        eventType: 'tool-result',
        toolUseId: 'tool-1',
        result: 'done'
      }
    });

    expect(streamingStateRef.current.handleStart).toHaveBeenCalledWith('m-1', 'assistant-1', 'chat-1');
    expect(streamingStateRef.current.endAllToolStreams).toHaveBeenCalled();
  });

  it('delegates SSE chunk events to streaming state manager with chat scope', () => {
    const harness = createMessageStateHarness();
    const streamingStateRef = makeFullStreamingRef();

    const handler = createChatSubscriptionEventHandler({
      subscriptionId: 'sub-1',
      loadedWorldId: 'world-1',
      selectedSessionId: 'chat-1',
      streamingStateRef,
      setMessages: harness.setMessages as Parameters<typeof createChatSubscriptionEventHandler>[0]['setMessages'],
    });

    handler({
      type: 'sse',
      subscriptionId: 'sub-1',
      worldId: 'world-1',
      sse: {
        eventType: 'chunk',
        chatId: 'chat-1',
        messageId: 'm-1',
        agentName: 'assistant-1',
        content: 'partial response'
      }
    });

    expect(streamingStateRef.current.handleChunk).toHaveBeenCalledWith('m-1', 'partial response', 'chat-1');
  });

  it('propagates tool-start command to subsequent tool-stream chunk', () => {
    const harness = createMessageStateHarness();
    const streamingStateRef = makeFullStreamingRef();

    const handler = createChatSubscriptionEventHandler({
      subscriptionId: 'sub-1',
      loadedWorldId: 'world-1',
      selectedSessionId: 'chat-1',
      streamingStateRef,
      setMessages: harness.setMessages as Parameters<typeof createChatSubscriptionEventHandler>[0]['setMessages'],
    });

    handler({
      type: 'tool',
      subscriptionId: 'sub-1',
      worldId: 'world-1',
      chatId: 'chat-1',
      tool: {
        eventType: 'tool-start',
        toolUseId: 'tool-1',
        toolName: 'shell_cmd',
        toolInput: { command: 'ls -la' }
      }
    });

    handler({
      type: 'sse',
      subscriptionId: 'sub-1',
      worldId: 'world-1',
      sse: {
        eventType: 'tool-stream',
        messageId: 'tool-1',
        content: 'file.txt\n',
        stream: 'stderr',
        toolName: 'shell_cmd',
        agentName: 'assistant-1',
        chatId: 'chat-1'
      }
    });

    expect(streamingStateRef.current.handleToolStreamStart).toHaveBeenCalledWith(
      'tool-1', 'assistant-1', 'stderr', 'shell_cmd', 'ls -la'
    );
    expect(streamingStateRef.current.handleToolStreamChunk).toHaveBeenCalledWith(
      'tool-1', 'file.txt\n', 'stderr', 'shell_cmd', 'ls -la'
    );
  });

  it('normalizes shell stdout start/chunk/end SSE events to tool-stream handlers', () => {
    const harness = createMessageStateHarness();
    const streamingStateRef = makeFullStreamingRef();

    const handler = createChatSubscriptionEventHandler({
      subscriptionId: 'sub-1',
      loadedWorldId: 'world-1',
      selectedSessionId: 'chat-1',
      streamingStateRef,
      setMessages: harness.setMessages as Parameters<typeof createChatSubscriptionEventHandler>[0]['setMessages'],
    });

    handler({
      type: 'tool',
      subscriptionId: 'sub-1',
      worldId: 'world-1',
      chatId: 'chat-1',
      tool: {
        eventType: 'tool-start',
        toolUseId: 'tool-1',
        toolName: 'shell_cmd',
        toolInput: { command: 'npm test' }
      }
    });

    handler({
      type: 'sse',
      subscriptionId: 'sub-1',
      worldId: 'world-1',
      sse: {
        eventType: 'start',
        messageId: 'tool-1-stdout',
        toolName: 'shell_cmd',
        agentName: 'assistant-1',
        chatId: 'chat-1'
      }
    });

    handler({
      type: 'sse',
      subscriptionId: 'sub-1',
      worldId: 'world-1',
      sse: {
        eventType: 'chunk',
        messageId: 'tool-1-stdout',
        toolName: 'shell_cmd',
        content: 'ok\n',
        agentName: 'assistant-1',
        chatId: 'chat-1'
      }
    });

    handler({
      type: 'sse',
      subscriptionId: 'sub-1',
      worldId: 'world-1',
      sse: {
        eventType: 'end',
        messageId: 'tool-1-stdout',
        toolName: 'shell_cmd',
        agentName: 'assistant-1',
        chatId: 'chat-1'
      }
    });

    expect(streamingStateRef.current.handleStart).not.toHaveBeenCalledWith('tool-1-stdout', expect.any(String));
    expect(streamingStateRef.current.handleChunk).not.toHaveBeenCalledWith('tool-1-stdout', expect.any(String));
    expect(streamingStateRef.current.handleEnd).not.toHaveBeenCalledWith('tool-1-stdout');

    expect(streamingStateRef.current.handleToolStreamStart).toHaveBeenCalledWith(
      'tool-1-stdout',
      'assistant-1',
      'stdout',
      'shell_cmd',
      'npm test'
    );
    expect(streamingStateRef.current.handleToolStreamChunk).toHaveBeenCalledWith(
      'tool-1-stdout',
      'ok\n',
      'stdout',
      'shell_cmd',
      'npm test'
    );
    expect(streamingStateRef.current.handleToolStreamEnd).toHaveBeenCalledWith('tool-1-stdout');
  });

  it('stamps tool-stream rows with selected chatId during live streaming', () => {
    const harness = createMessageStateHarness([{
      messageId: 'tool-1',
      role: 'tool',
      sender: 'shell_cmd',
      content: '',
      isToolStreaming: true,
    }]);

    const streamingStateRef = makeFullStreamingRef();
    (streamingStateRef.current.isActive as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const handler = createChatSubscriptionEventHandler({
      subscriptionId: 'sub-1',
      loadedWorldId: 'world-1',
      selectedSessionId: 'chat-1',
      streamingStateRef,
      setMessages: harness.setMessages as Parameters<typeof createChatSubscriptionEventHandler>[0]['setMessages'],
    });

    handler({
      type: 'sse',
      subscriptionId: 'sub-1',
      worldId: 'world-1',
      sse: {
        eventType: 'tool-stream',
        messageId: 'tool-1',
        content: 'ok\n',
        stream: 'stderr',
        toolName: 'shell_cmd',
        agentName: 'assistant-1',
        chatId: 'chat-1'
      }
    });

    const msgs = harness.getMessages() as Record<string, unknown>[];
    expect(msgs).toHaveLength(1);
    expect(msgs[0].chatId).toBe('chat-1');
  });

  it('backfills tool-start command onto pre-existing tool-stream row', () => {
    const harness = createMessageStateHarness([{
      messageId: 'tool-1',
      role: 'tool',
      sender: 'shell_cmd',
      content: 'partial output',
      isToolStreaming: true
    }]);

    const handler = createChatSubscriptionEventHandler({
      subscriptionId: 'sub-1',
      loadedWorldId: 'world-1',
      selectedSessionId: 'chat-1',
      streamingStateRef: { current: null },
      setMessages: harness.setMessages as Parameters<typeof createChatSubscriptionEventHandler>[0]['setMessages'],
    });

    handler({
      type: 'tool',
      subscriptionId: 'sub-1',
      worldId: 'world-1',
      chatId: 'chat-1',
      tool: {
        eventType: 'tool-start',
        toolUseId: 'tool-1',
        toolName: 'shell_cmd',
        toolInput: { command: 'grep -r pattern' }
      }
    });

    const msgs = harness.getMessages() as Record<string, unknown>[];
    expect(msgs).toHaveLength(1);
    expect(msgs[0].command).toBe('grep -r pattern');
    expect(msgs[0].toolName).toBe('shell_cmd');
  });

  it('backfills tool-start metadata onto pre-existing tool-stream row without command', () => {
    const harness = createMessageStateHarness([{
      messageId: 'tool-2',
      role: 'tool',
      sender: 'read_file',
      content: 'partial output',
      isToolStreaming: true
    }]);

    const handler = createChatSubscriptionEventHandler({
      subscriptionId: 'sub-1',
      loadedWorldId: 'world-1',
      selectedSessionId: 'chat-1',
      streamingStateRef: { current: null },
      setMessages: harness.setMessages as Parameters<typeof createChatSubscriptionEventHandler>[0]['setMessages'],
    });

    handler({
      type: 'tool',
      subscriptionId: 'sub-1',
      worldId: 'world-1',
      chatId: 'chat-1',
      tool: {
        eventType: 'tool-start',
        toolUseId: 'tool-2',
        toolName: 'read_file',
        toolInput: { filePath: './README.md' }
      }
    });

    const msgs = harness.getMessages() as Record<string, unknown>[];
    expect(msgs).toHaveLength(1);
    expect(msgs[0].toolName).toBe('read_file');
    expect(msgs[0].toolInput).toEqual({ filePath: './README.md' });
    expect(msgs[0].command).toBeUndefined();
  });

  it('ignores unscoped SSE end events', () => {
    const harness = createMessageStateHarness();
    const streamingStateRef = makeFullStreamingRef();

    const handler = createChatSubscriptionEventHandler({
      subscriptionId: 'sub-1',
      loadedWorldId: 'world-1',
      selectedSessionId: 'chat-1',
      streamingStateRef,

      setMessages: harness.setMessages as Parameters<typeof createChatSubscriptionEventHandler>[0]['setMessages'],
    });

    handler({
      type: 'sse',
      subscriptionId: 'sub-1',
      worldId: 'world-1',
      sse: {
        eventType: 'end',
        messageId: 'm-1',
      }
    });

    expect(streamingStateRef.current.handleEnd).not.toHaveBeenCalled();
  });

  it('ignores unscoped SSE end events without messageId', () => {
    const harness = createMessageStateHarness();
    const streamingStateRef = makeFullStreamingRef();
    (streamingStateRef.current.endAllToolStreams as ReturnType<typeof vi.fn>).mockReturnValue(['tool-1']);

    const handler = createChatSubscriptionEventHandler({
      subscriptionId: 'sub-1',
      loadedWorldId: 'world-1',
      selectedSessionId: 'chat-1',
      streamingStateRef,
      setMessages: harness.setMessages as Parameters<typeof createChatSubscriptionEventHandler>[0]['setMessages'],
    });

    handler({
      type: 'sse',
      subscriptionId: 'sub-1',
      worldId: 'world-1',
      sse: {
        eventType: 'end'
      }
    });

    expect(streamingStateRef.current.endAllToolStreams).not.toHaveBeenCalled();
    expect(streamingStateRef.current.handleEnd).not.toHaveBeenCalled();
  });

  it('ignores unscoped tool-result events', () => {
    const harness = createMessageStateHarness();
    const streamingStateRef = makeFullStreamingRef();

    const handler = createChatSubscriptionEventHandler({
      subscriptionId: 'sub-1',
      loadedWorldId: 'world-1',
      selectedSessionId: 'chat-1',
      streamingStateRef,
      setMessages: harness.setMessages as Parameters<typeof createChatSubscriptionEventHandler>[0]['setMessages'],
    });

    expect(() => handler({
      type: 'tool',
      subscriptionId: 'sub-1',
      worldId: 'world-1',
      tool: {
        eventType: 'tool-result',
        toolUseId: 'tool-1',
        result: 'done'
      }
    })).not.toThrow();

    expect(streamingStateRef.current.endAllToolStreams).not.toHaveBeenCalled();
    expect(harness.getMessages()).toEqual([]);
  });

  it('upserts a live tool message for tool-result events', () => {
    const harness = createMessageStateHarness();
    const streamingStateRef = makeFullStreamingRef();

    const handler = createChatSubscriptionEventHandler({
      subscriptionId: 'sub-1',
      loadedWorldId: 'world-1',
      selectedSessionId: 'chat-1',
      streamingStateRef,
      setMessages: harness.setMessages as Parameters<typeof createChatSubscriptionEventHandler>[0]['setMessages'],
    });

    handler({
      type: 'tool',
      subscriptionId: 'sub-1',
      worldId: 'world-1',
      chatId: 'chat-1',
      tool: {
        eventType: 'tool-start',
        toolUseId: 'tool-r1',
        toolName: 'read_file',
        toolInput: { command: 'cat README.md', filePath: './README.md' },
      }
    });

    handler({
      type: 'tool',
      subscriptionId: 'sub-1',
      worldId: 'world-1',
      chatId: 'chat-1',
      tool: {
        eventType: 'tool-result',
        toolUseId: 'tool-r1',
        toolName: 'read_file',
        agentName: 'assistant-1',
        result: { ok: true },
        createdAt: '2026-02-24T00:00:00.000Z'
      }
    });

    const messages = harness.getMessages() as Record<string, unknown>[];
    expect(messages).toHaveLength(1);
    expect(messages[0].messageId).toBe('tool-r1');
    expect(messages[0].role).toBe('tool');
    expect(messages[0].toolName).toBe('read_file');
    expect(String(messages[0].content || '')).toContain('"ok": true');
    expect(messages[0].command).toBe('cat README.md');
    expect(messages[0].toolInput).toEqual({ command: 'cat README.md', filePath: './README.md' });
    expect(messages[0].chatId).toBe('chat-1');
    expect(messages[0].isToolStreaming).toBe(false);
  });

  it('upserts a live tool message for tool-error events', () => {
    const harness = createMessageStateHarness();
    const streamingStateRef = makeFullStreamingRef();

    const handler = createChatSubscriptionEventHandler({
      subscriptionId: 'sub-1',
      loadedWorldId: 'world-1',
      selectedSessionId: 'chat-1',
      streamingStateRef,
      setMessages: harness.setMessages as Parameters<typeof createChatSubscriptionEventHandler>[0]['setMessages'],
    });

    handler({
      type: 'tool',
      subscriptionId: 'sub-1',
      worldId: 'world-1',
      chatId: 'chat-1',
      tool: {
        eventType: 'tool-start',
        toolUseId: 'tool-e1',
        toolName: 'read_file',
        toolInput: { command: 'cat missing.md' },
      }
    });

    handler({
      type: 'tool',
      subscriptionId: 'sub-1',
      worldId: 'world-1',
      chatId: 'chat-1',
      tool: {
        eventType: 'tool-error',
        toolUseId: 'tool-e1',
        toolName: 'read_file',
        agentName: 'assistant-1',
        error: 'File not found',
        createdAt: '2026-02-24T00:00:00.000Z'
      }
    });

    const messages = harness.getMessages() as Record<string, unknown>[];
    expect(messages).toHaveLength(1);
    expect(messages[0].messageId).toBe('tool-e1');
    expect(messages[0].role).toBe('tool');
    expect(messages[0].toolName).toBe('read_file');
    expect(messages[0].content).toBe('File not found');
    expect(messages[0].command).toBe('cat missing.md');
    expect(messages[0].toolInput).toEqual({ command: 'cat missing.md' });
    expect(messages[0].chatId).toBe('chat-1');
    expect(messages[0].streamType).toBe('stderr');
  });

  it('forwards system events to session system callback', () => {
    const harness = createMessageStateHarness();
    const onSessionSystemEvent = vi.fn();

    const handler = createChatSubscriptionEventHandler({
      subscriptionId: 'sub-1',
      loadedWorldId: 'world-1',
      selectedSessionId: 'chat-1',
      streamingStateRef: { current: null },

      setMessages: harness.setMessages as Parameters<typeof createChatSubscriptionEventHandler>[0]['setMessages'],
      onSessionSystemEvent
    });

    handler({
      type: 'system',
      subscriptionId: 'sub-1',
      worldId: 'world-1',
      chatId: 'chat-1',
      system: {
        eventType: 'chat-title-updated',
        messageId: 'sys-1',
        createdAt: '2026-02-13T00:00:00.000Z',
        content: {
          eventType: 'chat-title-updated',
          title: 'Scoped Chat Title',
          source: 'idle'
        }
      }
    });

    expect(onSessionSystemEvent).toHaveBeenCalledWith({
      eventType: 'chat-title-updated',
      chatId: 'chat-1',
      messageId: 'sys-1',
      createdAt: '2026-02-13T00:00:00.000Z',
      content: {
        eventType: 'chat-title-updated',
        title: 'Scoped Chat Title',
        source: 'idle'
      }
    });
  });

  it('forwards plain-text system events to the selected-chat status callback without transcript rows', () => {
    const harness = createMessageStateHarness();
    const onSessionSystemEvent = vi.fn();

    const handler = createChatSubscriptionEventHandler({
      subscriptionId: 'sub-1',
      loadedWorldId: 'world-1',
      selectedSessionId: 'chat-1',
      streamingStateRef: { current: null },
      setMessages: harness.setMessages as Parameters<typeof createChatSubscriptionEventHandler>[0]['setMessages'],
      onSessionSystemEvent
    });

    handler({
      type: 'system',
      subscriptionId: 'sub-1',
      worldId: 'world-1',
      chatId: 'chat-1',
      system: {
        eventType: 'system',
        messageId: 'sys-plain-1',
        createdAt: '2026-03-12T00:00:00.000Z',
        content: 'Retrying in 2s.',
      }
    });

    expect(onSessionSystemEvent).toHaveBeenCalledWith({
      eventType: 'system',
      chatId: 'chat-1',
      messageId: 'sys-plain-1',
      createdAt: '2026-03-12T00:00:00.000Z',
      content: 'Retrying in 2s.',
    });
    expect(harness.getMessages()).toEqual([]);
  });

  it('adds structured system error events to the selected chat transcript', () => {
    const harness = createMessageStateHarness();

    const handler = createChatSubscriptionEventHandler({
      subscriptionId: 'sub-1',
      loadedWorldId: 'world-1',
      selectedSessionId: 'chat-1',
      streamingStateRef: { current: null },
      setMessages: harness.setMessages as Parameters<typeof createChatSubscriptionEventHandler>[0]['setMessages'],
    });

    handler({
      type: 'system',
      subscriptionId: 'sub-1',
      worldId: 'world-1',
      chatId: 'chat-1',
      system: {
        eventType: 'error',
        messageId: 'sys-error-1',
        createdAt: '2026-03-10T03:18:00.000Z',
        content: {
          type: 'error',
          message: 'Error processing agent message: provider missing. | agent=gpt5',
          agentName: 'gpt5',
        }
      }
    });

    expect(harness.getMessages()).toMatchObject([{
      messageId: 'sys-error-1',
      role: 'system',
      type: 'system',
      chatId: 'chat-1',
      systemEvent: {
        kind: 'error',
      }
    }]);
  });

  it('ignores system events for non-selected chat', () => {
    const harness = createMessageStateHarness();
    const onSessionSystemEvent = vi.fn();

    const handler = createChatSubscriptionEventHandler({
      subscriptionId: 'sub-1',
      loadedWorldId: 'world-1',
      selectedSessionId: 'chat-1',
      streamingStateRef: { current: null },

      setMessages: harness.setMessages as Parameters<typeof createChatSubscriptionEventHandler>[0]['setMessages'],
      onSessionSystemEvent
    });

    handler({
      type: 'system',
      subscriptionId: 'sub-1',
      worldId: 'world-1',
      chatId: 'chat-2',
      system: {
        eventType: 'chat-title-updated'
      }
    });

    expect(onSessionSystemEvent).not.toHaveBeenCalled();
  });

  it('ignores system events without chatId when a session is selected', () => {
    const harness = createMessageStateHarness();
    const onSessionSystemEvent = vi.fn();

    const handler = createChatSubscriptionEventHandler({
      subscriptionId: 'sub-1',
      loadedWorldId: 'world-1',
      selectedSessionId: 'chat-1',
      streamingStateRef: { current: null },

      setMessages: harness.setMessages as Parameters<typeof createChatSubscriptionEventHandler>[0]['setMessages'],
      onSessionSystemEvent
    });

    handler({
      type: 'system',
      subscriptionId: 'sub-1',
      worldId: 'world-1',
      system: {
        eventType: 'chat-title-updated',
        messageId: 'sys-unscoped'
      }
    });

    expect(onSessionSystemEvent).not.toHaveBeenCalled();
  });

  it('ignores system events when chatId differs', () => {
    const harness = createMessageStateHarness();
    const onSessionSystemEvent = vi.fn();

    const handler = createChatSubscriptionEventHandler({
      subscriptionId: 'sub-1',
      loadedWorldId: 'world-1',
      selectedSessionId: 'chat-1',
      streamingStateRef: { current: null },

      setMessages: harness.setMessages as Parameters<typeof createChatSubscriptionEventHandler>[0]['setMessages'],
      onSessionSystemEvent
    });

    handler({
      type: 'system',
      subscriptionId: 'sub-1',
      worldId: 'world-1',
      chatId: 'chat-2',
      system: {
        eventType: 'chat-title-updated',
        messageId: 'sys-hitl',
        content: {
          eventType: 'chat-title-updated',
        }
      }
    });

    expect(onSessionSystemEvent).not.toHaveBeenCalled();
  });

  it('ignores unscoped system events when a session is selected', () => {
    const harness = createMessageStateHarness();
    const onSessionSystemEvent = vi.fn();

    const handler = createChatSubscriptionEventHandler({
      subscriptionId: 'sub-1',
      loadedWorldId: 'world-1',
      selectedSessionId: 'chat-1',
      streamingStateRef: { current: null },

      setMessages: harness.setMessages as Parameters<typeof createChatSubscriptionEventHandler>[0]['setMessages'],
      onSessionSystemEvent
    });

    handler({
      type: 'system',
      subscriptionId: 'sub-1',
      worldId: 'world-1',
      system: {
        eventType: 'chat-title-updated',
        messageId: 'sys-hitl-unscoped',
        content: {
          eventType: 'chat-title-updated',
        }
      }
    });

    expect(onSessionSystemEvent).not.toHaveBeenCalled();
  });

  it('ignores activity events without chatId when a session is selected', () => {
    const harness = createMessageStateHarness([{
      messageId: 'stream-1',
      role: 'assistant',
      sender: 'gpt5',
      chatId: 'chat-1',
      content: 'partial',
      isStreaming: true,
    }]);

    const handler = createChatSubscriptionEventHandler({
      subscriptionId: 'sub-1',
      loadedWorldId: 'world-1',
      selectedSessionId: 'chat-1',
      streamingStateRef: makeFullStreamingRef(),
      setMessages: harness.setMessages as Parameters<typeof createChatSubscriptionEventHandler>[0]['setMessages'],
    });

    handler({
      type: 'activity',
      subscriptionId: 'sub-1',
      worldId: 'world-1',
      activity: {
        eventType: 'idle',
        pendingOperations: 0,
      }
    });

    expect(harness.getMessages()).toHaveLength(1);
    expect(harness.getMessages()[0].messageId).toBe('stream-1');
  });
});
