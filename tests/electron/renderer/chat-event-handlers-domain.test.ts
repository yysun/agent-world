/**
 * Unit Tests for Chat Event Handler Domain Module
 *
 * Features:
 * - Verifies global log event routing behavior.
 * - Verifies subscription/world/chat filtering in session handlers.
 * - Verifies SSE/tool event delegation to streaming/activity state managers.
 *
 * Implementation Notes:
 * - Uses dependency injection with in-memory refs/state setters.
 * - Focuses on orchestration behavior, not UI rendering.
 *
 * Recent Changes:
 * - 2026-02-20: Added optimistic user-message reconciliation coverage for message-event ordering and identical consecutive user sends.
 * - 2026-02-20: Added coverage that `hitl-option-request` system events bypass chatId filtering so approval prompts are not dropped.
 * - 2026-02-19: Added coverage for elapsed reset on idle→active activity transitions.
 * - 2026-02-13: Updated system-event coverage to structured payload content (`eventType` + metadata object).
 * - 2026-02-13: Added coverage for session-scoped realtime system events (chat title update notifications).
 * - 2026-02-13: Added coverage for tool lifecycle response-state transitions and chat-id filtering.
 * - 2026-02-13: Added coverage for session response-state callback transitions on SSE lifecycle events.
 * - 2026-02-12: Moved into layer-based tests/electron subfolder and updated module import paths.
 * - 2026-02-12: Added Phase 5 tests for extracted chat event orchestration handlers.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  createChatSubscriptionEventHandler,
  createGlobalLogEventHandler
} from '../../../electron/renderer/src/domain/chat-event-handlers';

function createMessageStateHarness(initial = []) {
  let value = [...initial];
  const setMessages = (updater) => {
    value = updater(value);
  };
  return {
    setMessages,
    getMessages: () => value
  };
}

describe('createGlobalLogEventHandler', () => {
  it('appends log messages when an active session is selected', () => {
    const harness = createMessageStateHarness();
    const setStatusText = vi.fn();

    const handler = createGlobalLogEventHandler({
      loadedWorldId: 'world-1',
      selectedSessionId: 'chat-1',
      setMessages: harness.setMessages,
      setStatusText
    });

    handler({
      type: 'log',
      logEvent: {
        message: 'Runtime warning',
        level: 'warn',
        category: 'runtime',
        timestamp: '2026-02-12T12:00:00.000Z'
      }
    });

    expect(harness.getMessages()).toHaveLength(1);
    expect(harness.getMessages()[0].type).toBe('log');
    expect(setStatusText).not.toHaveBeenCalled();
  });

  it('falls back to status updates when there is no active chat session', () => {
    const harness = createMessageStateHarness();
    const setStatusText = vi.fn();

    const handler = createGlobalLogEventHandler({
      loadedWorldId: null,
      selectedSessionId: null,
      setMessages: harness.setMessages,
      setStatusText
    });

    handler({
      type: 'log',
      logEvent: {
        message: 'Something happened',
        level: 'info',
        category: 'system'
      }
    });

    expect(harness.getMessages()).toHaveLength(0);
    expect(setStatusText).toHaveBeenCalledWith('system - Something happened', 'info');
  });
});

describe('createChatSubscriptionEventHandler', () => {
  it('upserts incoming session message events', () => {
    const harness = createMessageStateHarness();
    const setActiveStreamCount = vi.fn();
    const streamingStateRef = {
      current: {
        getActiveCount: vi.fn(() => 0),
        endAllToolStreams: vi.fn(() => [])
      }
    };
    const activityStateRef = {
      current: {
        setActiveStreamCount: vi.fn()
      }
    };

    const handler = createChatSubscriptionEventHandler({
      subscriptionId: 'sub-1',
      loadedWorldId: 'world-1',
      selectedSessionId: 'chat-1',
      streamingStateRef,
      activityStateRef,
      setMessages: harness.setMessages,
      setActiveStreamCount
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
    expect(harness.getMessages()[0].messageId).toBe('m-1');
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
      activityStateRef: { current: null },
      setMessages: harness.setMessages,
      setActiveStreamCount: vi.fn()
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

    expect(harness.getMessages()).toHaveLength(1);
    expect(harness.getMessages()[0].messageId).toBe('server-user-1');
    expect(harness.getMessages()[0].optimisticUserPending).toBe(false);
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
      activityStateRef: { current: null },
      setMessages: harness.setMessages,
      setActiveStreamCount: vi.fn()
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

    const messages = harness.getMessages();
    expect(messages).toHaveLength(2);
    expect(messages.map((message) => message.messageId)).toEqual(['server-user-1', 'server-user-2']);
    expect(messages.every((message) => message.optimisticUserPending !== true)).toBe(true);
  });

  it('ignores mismatched subscriptions/world IDs', () => {
    const harness = createMessageStateHarness();
    const handler = createChatSubscriptionEventHandler({
      subscriptionId: 'sub-1',
      loadedWorldId: 'world-1',
      selectedSessionId: 'chat-1',
      streamingStateRef: { current: null },
      activityStateRef: { current: null },
      setMessages: harness.setMessages,
      setActiveStreamCount: vi.fn()
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
    const onSessionResponseStateChange = vi.fn();
    const handler = createChatSubscriptionEventHandler({
      subscriptionId: 'sub-1',
      loadedWorldId: 'world-1',
      selectedSessionId: 'chat-1',
      streamingStateRef: { current: null },
      activityStateRef: { current: null },
      setMessages: harness.setMessages,
      setActiveStreamCount: vi.fn(),
      onSessionResponseStateChange
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
    expect(onSessionResponseStateChange).toHaveBeenCalledWith('chat-1', false);
  });

  it('clears response state for unscoped agent message when role is missing', () => {
    const harness = createMessageStateHarness();
    const onSessionResponseStateChange = vi.fn();

    const handler = createChatSubscriptionEventHandler({
      subscriptionId: 'sub-1',
      loadedWorldId: 'world-1',
      selectedSessionId: 'chat-1',
      streamingStateRef: { current: null },
      activityStateRef: { current: null },
      setMessages: harness.setMessages,
      setActiveStreamCount: vi.fn(),
      onSessionResponseStateChange
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

    expect(onSessionResponseStateChange).toHaveBeenCalledWith('chat-1', false);
    expect(harness.getMessages()).toHaveLength(0);
  });

  it('finalizes matching active assistant stream when final assistant message arrives', () => {
    const harness = createMessageStateHarness();
    const setActiveStreamCount = vi.fn();
    const streamingStateRef = {
      current: {
        getActiveCount: vi.fn(() => 0),
        endAllToolStreams: vi.fn(() => []),
        isActive: vi.fn((messageId: string) => messageId === 'stream-1'),
        handleEnd: vi.fn(),
      }
    };
    const onSessionResponseStateChange = vi.fn();

    const handler = createChatSubscriptionEventHandler({
      subscriptionId: 'sub-1',
      loadedWorldId: 'world-1',
      selectedSessionId: 'chat-1',
      streamingStateRef,
      activityStateRef: { current: null },
      setMessages: harness.setMessages,
      setActiveStreamCount,
      onSessionResponseStateChange
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
    expect(setActiveStreamCount).toHaveBeenCalledWith(0);
    expect(onSessionResponseStateChange).toHaveBeenCalledWith('chat-1', false);
    expect(harness.getMessages()).toHaveLength(1);
  });

  it('delegates SSE and tool lifecycle events to state managers', () => {
    const harness = createMessageStateHarness();
    const setActiveStreamCount = vi.fn();
    const streamingStateRef = {
      current: {
        getActiveCount: vi.fn(() => 1),
        endAllToolStreams: vi.fn(() => []),
        handleStart: vi.fn(),
        handleChunk: vi.fn(),
        handleEnd: vi.fn(),
        handleError: vi.fn(),
        handleToolStreamStart: vi.fn(),
        handleToolStreamChunk: vi.fn(),
        handleToolStreamEnd: vi.fn(),
        isActive: vi.fn(() => false)
      }
    };
    const activityStateRef = {
      current: {
        setActiveStreamCount: vi.fn(),
        handleToolStart: vi.fn(),
        handleToolResult: vi.fn(),
        handleToolError: vi.fn(),
        handleToolProgress: vi.fn()
      }
    };
    const onSessionResponseStateChange = vi.fn();

    const handler = createChatSubscriptionEventHandler({
      subscriptionId: 'sub-1',
      loadedWorldId: 'world-1',
      selectedSessionId: 'chat-1',
      streamingStateRef,
      activityStateRef,
      setMessages: harness.setMessages,
      setActiveStreamCount,
      onSessionResponseStateChange
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
        eventType: 'tool-start',
        toolUseId: 'tool-1',
        toolName: 'read_file',
        toolInput: { path: '/tmp' }
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

    expect(streamingStateRef.current.handleStart).toHaveBeenCalledWith('m-1', 'assistant-1');
    expect(activityStateRef.current.handleToolStart).toHaveBeenCalledWith('tool-1', 'read_file', { path: '/tmp' });
    expect(activityStateRef.current.handleToolResult).toHaveBeenCalledWith('tool-1', 'done');
    expect(setActiveStreamCount).toHaveBeenCalledWith(1);
    expect(onSessionResponseStateChange).toHaveBeenCalledWith('chat-1', true);
    expect(onSessionResponseStateChange).toHaveBeenCalledWith('chat-1', false);
  });

  it('resets elapsed timer when activity transitions from idle to active', () => {
    const harness = createMessageStateHarness();
    const resetElapsed = vi.fn();

    const handler = createChatSubscriptionEventHandler({
      subscriptionId: 'sub-1',
      loadedWorldId: 'world-1',
      selectedSessionId: 'chat-1',
      streamingStateRef: { current: null },
      activityStateRef: {
        current: {
          setActiveStreamCount: vi.fn(),
          handleToolStart: vi.fn(),
          handleToolResult: vi.fn(),
          handleToolError: vi.fn(),
          handleToolProgress: vi.fn(),
          resetElapsed,
        }
      },
      setMessages: harness.setMessages,
      setActiveStreamCount: vi.fn(),
    });

    handler({
      type: 'activity',
      subscriptionId: 'sub-1',
      worldId: 'world-1',
      chatId: 'chat-1',
      activity: {
        eventType: 'start',
        pendingOperations: 1,
      }
    });

    handler({
      type: 'activity',
      subscriptionId: 'sub-1',
      worldId: 'world-1',
      chatId: 'chat-1',
      activity: {
        eventType: 'update',
        pendingOperations: 2,
      }
    });

    handler({
      type: 'activity',
      subscriptionId: 'sub-1',
      worldId: 'world-1',
      chatId: 'chat-1',
      activity: {
        eventType: 'idle',
        pendingOperations: 0,
      }
    });

    handler({
      type: 'activity',
      subscriptionId: 'sub-1',
      worldId: 'world-1',
      chatId: 'chat-1',
      activity: {
        eventType: 'start',
        pendingOperations: 1,
      }
    });

    expect(resetElapsed).toHaveBeenCalledTimes(2);
  });

  it('clears selected session on unscoped SSE end events', () => {
    const harness = createMessageStateHarness();
    const onSessionResponseStateChange = vi.fn();
    const setActiveStreamCount = vi.fn();
    const streamingStateRef = {
      current: {
        getActiveCount: vi.fn(() => 0),
        endAllToolStreams: vi.fn(() => []),
        handleStart: vi.fn(),
        handleChunk: vi.fn(),
        handleEnd: vi.fn(),
        handleError: vi.fn(),
        handleToolStreamStart: vi.fn(),
        handleToolStreamChunk: vi.fn(),
        handleToolStreamEnd: vi.fn(),
        isActive: vi.fn(() => false)
      }
    };

    const handler = createChatSubscriptionEventHandler({
      subscriptionId: 'sub-1',
      loadedWorldId: 'world-1',
      selectedSessionId: 'chat-1',
      streamingStateRef,
      activityStateRef: { current: null },
      setMessages: harness.setMessages,
      setActiveStreamCount,
      onSessionResponseStateChange
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

    expect(onSessionResponseStateChange).toHaveBeenCalledWith('chat-1', false);
    expect(streamingStateRef.current.handleEnd).toHaveBeenCalledWith('m-1');
  });

  it('clears selected session on SSE end without messageId', () => {
    const harness = createMessageStateHarness();
    const onSessionResponseStateChange = vi.fn();
    const setActiveStreamCount = vi.fn();
    const streamingStateRef = {
      current: {
        getActiveCount: vi.fn(() => 0),
        endAllToolStreams: vi.fn(() => ['tool-1']),
        handleStart: vi.fn(),
        handleChunk: vi.fn(),
        handleEnd: vi.fn(),
        handleError: vi.fn(),
        handleToolStreamStart: vi.fn(),
        handleToolStreamChunk: vi.fn(),
        handleToolStreamEnd: vi.fn(),
        isActive: vi.fn(() => false)
      }
    };

    const handler = createChatSubscriptionEventHandler({
      subscriptionId: 'sub-1',
      loadedWorldId: 'world-1',
      selectedSessionId: 'chat-1',
      streamingStateRef,
      activityStateRef: { current: { setActiveStreamCount: vi.fn() } },
      setMessages: harness.setMessages,
      setActiveStreamCount,
      onSessionResponseStateChange
    });

    handler({
      type: 'sse',
      subscriptionId: 'sub-1',
      worldId: 'world-1',
      sse: {
        eventType: 'end'
      }
    });

    expect(onSessionResponseStateChange).toHaveBeenCalledWith('chat-1', false);
    expect(streamingStateRef.current.endAllToolStreams).toHaveBeenCalledTimes(1);
    expect(setActiveStreamCount).toHaveBeenCalledWith(0);
    expect(streamingStateRef.current.handleEnd).not.toHaveBeenCalled();
  });

  it('clears selected session on unscoped tool-result events', () => {
    const harness = createMessageStateHarness();
    const onSessionResponseStateChange = vi.fn();
    const activityStateRef = {
      current: {
        setActiveStreamCount: vi.fn(),
        handleToolStart: vi.fn(),
        handleToolResult: vi.fn(),
        handleToolError: vi.fn(),
        handleToolProgress: vi.fn()
      }
    };

    const handler = createChatSubscriptionEventHandler({
      subscriptionId: 'sub-1',
      loadedWorldId: 'world-1',
      selectedSessionId: 'chat-1',
      streamingStateRef: { current: null },
      activityStateRef,
      setMessages: harness.setMessages,
      setActiveStreamCount: vi.fn(),
      onSessionResponseStateChange
    });

    handler({
      type: 'tool',
      subscriptionId: 'sub-1',
      worldId: 'world-1',
      tool: {
        eventType: 'tool-result',
        toolUseId: 'tool-1',
        result: 'done'
      }
    });

    expect(onSessionResponseStateChange).toHaveBeenCalledWith('chat-1', false);
    expect(activityStateRef.current.handleToolResult).toHaveBeenCalledWith('tool-1', 'done');
  });

  it('forwards activity events to session activity callback', () => {
    const harness = createMessageStateHarness();
    const onSessionActivityUpdate = vi.fn();

    const handler = createChatSubscriptionEventHandler({
      subscriptionId: 'sub-1',
      loadedWorldId: 'world-1',
      selectedSessionId: 'chat-1',
      streamingStateRef: { current: null },
      activityStateRef: { current: null },
      setMessages: harness.setMessages,
      setActiveStreamCount: vi.fn(),
      onSessionActivityUpdate
    });

    handler({
      type: 'activity',
      subscriptionId: 'sub-1',
      worldId: 'world-1',
      chatId: 'chat-1',
      activity: {
        eventType: 'response-start',
        pendingOperations: 2,
        activityId: 42,
        source: 'agent:planner',
        activeSources: ['agent:planner', 'agent:coder']
      }
    });

    expect(onSessionActivityUpdate).toHaveBeenCalledWith({
      eventType: 'response-start',
      pendingOperations: 2,
      activityId: 42,
      source: 'agent:planner',
      activeSources: ['agent:planner', 'agent:coder']
    });
  });

  it('clears session response state when activity reports no pending work', () => {
    const harness = createMessageStateHarness();
    const onSessionResponseStateChange = vi.fn();

    const handler = createChatSubscriptionEventHandler({
      subscriptionId: 'sub-1',
      loadedWorldId: 'world-1',
      selectedSessionId: 'chat-1',
      streamingStateRef: { current: null },
      activityStateRef: { current: null },
      setMessages: harness.setMessages,
      setActiveStreamCount: vi.fn(),
      onSessionResponseStateChange
    });

    handler({
      type: 'activity',
      subscriptionId: 'sub-1',
      worldId: 'world-1',
      chatId: 'chat-1',
      activity: {
        eventType: 'response-end',
        pendingOperations: 0,
        activityId: 43,
        source: 'agent:planner',
        activeSources: []
      }
    });

    expect(onSessionResponseStateChange).toHaveBeenCalledWith('chat-1', false);
  });

  it('clears selected session response state when activity completion is unscoped', () => {
    const harness = createMessageStateHarness();
    const onSessionResponseStateChange = vi.fn();

    const handler = createChatSubscriptionEventHandler({
      subscriptionId: 'sub-1',
      loadedWorldId: 'world-1',
      selectedSessionId: 'chat-1',
      streamingStateRef: { current: null },
      activityStateRef: { current: null },
      setMessages: harness.setMessages,
      setActiveStreamCount: vi.fn(),
      onSessionResponseStateChange
    });

    handler({
      type: 'activity',
      subscriptionId: 'sub-1',
      worldId: 'world-1',
      activity: {
        eventType: 'idle',
        pendingOperations: 0,
        activityId: 99,
        source: 'agent:a1',
        activeSources: []
      }
    });

    expect(onSessionResponseStateChange).toHaveBeenCalledWith('chat-1', false);
  });

  it('ignores activity events for non-selected chat', () => {
    const harness = createMessageStateHarness();
    const onSessionActivityUpdate = vi.fn();

    const handler = createChatSubscriptionEventHandler({
      subscriptionId: 'sub-1',
      loadedWorldId: 'world-1',
      selectedSessionId: 'chat-1',
      streamingStateRef: { current: null },
      activityStateRef: { current: null },
      setMessages: harness.setMessages,
      setActiveStreamCount: vi.fn(),
      onSessionActivityUpdate
    });

    handler({
      type: 'activity',
      subscriptionId: 'sub-1',
      worldId: 'world-1',
      chatId: 'chat-2',
      activity: {
        eventType: 'response-start',
        pendingOperations: 1,
        activityId: 7,
        source: 'agent:planner',
        activeSources: ['agent:planner']
      }
    });

    expect(onSessionActivityUpdate).not.toHaveBeenCalled();
  });

  it('forwards system events to session system callback', () => {
    const harness = createMessageStateHarness();
    const onSessionSystemEvent = vi.fn();

    const handler = createChatSubscriptionEventHandler({
      subscriptionId: 'sub-1',
      loadedWorldId: 'world-1',
      selectedSessionId: 'chat-1',
      streamingStateRef: { current: null },
      activityStateRef: { current: null },
      setMessages: harness.setMessages,
      setActiveStreamCount: vi.fn(),
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

  it('ignores system events for non-selected chat', () => {
    const harness = createMessageStateHarness();
    const onSessionSystemEvent = vi.fn();

    const handler = createChatSubscriptionEventHandler({
      subscriptionId: 'sub-1',
      loadedWorldId: 'world-1',
      selectedSessionId: 'chat-1',
      streamingStateRef: { current: null },
      activityStateRef: { current: null },
      setMessages: harness.setMessages,
      setActiveStreamCount: vi.fn(),
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
      activityStateRef: { current: null },
      setMessages: harness.setMessages,
      setActiveStreamCount: vi.fn(),
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

  it('forwards hitl-option-request system events even when chatId differs', () => {
    const harness = createMessageStateHarness();
    const onSessionSystemEvent = vi.fn();

    const handler = createChatSubscriptionEventHandler({
      subscriptionId: 'sub-1',
      loadedWorldId: 'world-1',
      selectedSessionId: 'chat-1',
      streamingStateRef: { current: null },
      activityStateRef: { current: null },
      setMessages: harness.setMessages,
      setActiveStreamCount: vi.fn(),
      onSessionSystemEvent
    });

    handler({
      type: 'system',
      subscriptionId: 'sub-1',
      worldId: 'world-1',
      chatId: 'chat-2',
      system: {
        eventType: 'hitl-option-request',
        messageId: 'sys-hitl',
        content: {
          eventType: 'hitl-option-request',
          requestId: 'req-1',
          title: 'Approval required',
          options: [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }]
        }
      }
    });

    expect(onSessionSystemEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'hitl-option-request',
      chatId: 'chat-2',
      messageId: 'sys-hitl'
    }));
  });
});
