/**
 * System Status Subscription Tests
 * Purpose:
 * - Verify selected-chat system events are forwarded for status-bar use.
 *
 * Key Features:
 * - Confirms title updates still trigger session refresh.
 * - Confirms selected-chat system events reach the app-level callback.
 * - Confirms non-selected-chat system events are ignored.
 *
 * Implementation Notes:
 * - Uses the pure forwarding helper extracted from the hook.
 * - Avoids DOM rendering and React hook runtime concerns.
 *
 * Recent Changes:
 * - 2026-03-06: Added selected-chat system-event callback coverage for status-bar wiring.
 */

import { describe, expect, it, vi } from 'vitest';
import { forwardSessionSystemEvent } from '../../../electron/renderer/src/hooks/useChatEventSubscriptions';

describe('forwardSessionSystemEvent', () => {
  it('refreshes sessions and forwards selected-chat title updates', () => {
    const refreshSessions = vi.fn(async () => { });
    const onSessionSystemEvent = vi.fn();

    forwardSessionSystemEvent({
      loadedWorldId: 'world-1',
      refreshSessions,
      onSessionSystemEvent,
      systemEvent: {
        chatId: 'chat-1',
        eventType: 'chat-title-updated',
        messageId: 'sys-1',
        createdAt: '2026-03-06T00:00:00.000Z',
        content: {
          eventType: 'chat-title-updated',
          title: 'Scoped Chat Title',
        },
      },
    });

    expect(refreshSessions).toHaveBeenCalledWith('world-1', 'chat-1');
    expect(onSessionSystemEvent).toHaveBeenCalledWith({
      eventType: 'chat-title-updated',
      chatId: 'chat-1',
      messageId: 'sys-1',
      createdAt: '2026-03-06T00:00:00.000Z',
      content: {
        eventType: 'chat-title-updated',
        title: 'Scoped Chat Title',
      },
    });
  });

  it('does nothing without a loaded world id', () => {
    const refreshSessions = vi.fn(async () => { });
    const onSessionSystemEvent = vi.fn();

    forwardSessionSystemEvent({
      loadedWorldId: null,
      refreshSessions,
      onSessionSystemEvent,
      systemEvent: {
        chatId: 'chat-2',
        eventType: 'chat-title-updated',
        messageId: 'sys-ignored',
        createdAt: '2026-03-06T00:00:00.000Z',
        content: {
          eventType: 'chat-title-updated',
          title: 'Ignored',
        },
      },
    });

    expect(refreshSessions).not.toHaveBeenCalled();
    expect(onSessionSystemEvent).not.toHaveBeenCalled();
  });

  it('ignores unscoped system events', () => {
    const refreshSessions = vi.fn(async () => { });
    const onSessionSystemEvent = vi.fn();

    forwardSessionSystemEvent({
      loadedWorldId: 'world-1',
      refreshSessions,
      onSessionSystemEvent,
      systemEvent: {
        chatId: null,
        eventType: 'chat-title-updated',
        messageId: 'sys-unscoped',
        createdAt: '2026-03-06T00:00:00.000Z',
        content: {
          eventType: 'chat-title-updated',
          title: 'Ignored',
        },
      },
    });

    expect(refreshSessions).not.toHaveBeenCalled();
    expect(onSessionSystemEvent).not.toHaveBeenCalled();
  });
});
