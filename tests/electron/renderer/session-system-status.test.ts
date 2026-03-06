/**
 * Session System Status Helper Tests
 * Purpose:
 * - Verify selected-chat system-event formatting and scoping for the Electron status bar.
 *
 * Key Features:
 * - Covers structured title-update payload formatting.
 * - Covers plain-text timeout/retry status handling.
 * - Covers explicit chat-scoping and chat-switch clearing behavior.
 *
 * Implementation Notes:
 * - Pure-function tests only; no React runtime required.
 * - Confirms unscoped events are rejected for chat-status-bar use.
 *
 * Recent Changes:
 * - 2026-03-06: Added regression coverage ensuring error-kind system statuses stay persistent while non-error statuses remain transient.
 * - 2026-03-06: Added coverage for selected-chat system-event status normalization.
 */

import { describe, expect, it } from 'vitest';
import {
  createSessionSystemStatus,
  retainSessionSystemStatusForContext,
} from '../../../electron/renderer/src/domain/session-system-status';

describe('session-system-status helpers', () => {
  it('formats structured title updates as success status text', () => {
    const status = createSessionSystemStatus('world-1', {
      eventType: 'chat-title-updated',
      chatId: 'chat-1',
      messageId: 'sys-1',
      createdAt: '2026-03-06T00:00:00.000Z',
      content: {
        eventType: 'chat-title-updated',
        title: 'Scoped Chat Title',
      },
    });

    expect(status).toMatchObject({
      worldId: 'world-1',
      chatId: 'chat-1',
      eventType: 'chat-title-updated',
      text: 'Chat title updated: Scoped Chat Title',
      kind: 'success',
    });
  });

  it('keeps plain-text timeout and retry status readable', () => {
    const timeoutStatus = createSessionSystemStatus('world-1', {
      eventType: 'system',
      chatId: 'chat-1',
      messageId: 'sys-timeout',
      createdAt: null,
      content: 'LLM processing timed out for a1 after 15s.',
    });
    const retryStatus = createSessionSystemStatus('world-1', {
      eventType: 'system',
      chatId: 'chat-1',
      messageId: 'sys-retry-2',
      createdAt: null,
      content: 'Queue retry scheduled (timeout): attempt 2/3, remaining attempts 1, elapsed 3s, next retry in 1s.',
    });

    expect(timeoutStatus?.text).toContain('timed out');
    expect(timeoutStatus?.kind).toBe('error');
    expect(timeoutStatus?.expiresAfterMs).toBeNull();
    expect(retryStatus?.text).toContain('attempt 2/3');
    expect(retryStatus?.kind).toBe('info');
    expect(retryStatus?.expiresAfterMs).toBe(5000);
  });

  it('rejects unscoped events and clears state on chat switch', () => {
    const unscoped = createSessionSystemStatus('world-1', {
      eventType: 'chat-title-updated',
      chatId: null,
      messageId: 'sys-unscoped',
      createdAt: null,
      content: { eventType: 'chat-title-updated', title: 'Ignored' },
    });
    const retained = retainSessionSystemStatusForContext(
      createSessionSystemStatus('world-1', {
        eventType: 'system',
        chatId: 'chat-1',
        messageId: 'sys-retry-1',
        createdAt: null,
        content: 'Queue retry scheduled (timeout): attempt 1/3, remaining attempts 2, elapsed 0s, next retry in 2s.',
      }),
      'world-1',
      'chat-2',
    );

    expect(unscoped).toBeNull();
    expect(retained).toBeNull();
  });
});
