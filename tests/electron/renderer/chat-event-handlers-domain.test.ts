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
 * - 2026-02-13: Added coverage for tool lifecycle response-state transitions and chat-id filtering.
 * - 2026-02-13: Added coverage for session response-state callback transitions on SSE lifecycle events.
 * - 2026-02-12: Moved into layer-based tests/electron subfolder and updated module import paths.
 * - 2026-02-12: Added Phase 5 tests for extracted chat event orchestration handlers.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  createChatSubscriptionEventHandler,
  createGlobalLogEventHandler
} from '../../../electron/renderer/src/domain/chat-event-handlers.js';

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
});
