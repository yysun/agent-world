/**
 * Web Chat Selection Domain Tests
 *
 * Purpose:
 * - Verify web chat selection priority remains current-selection-first.
 *
 * Key Features:
 * - Current selected chat ID takes precedence when valid.
 * - Backend world.currentChatId is used as fallback when current selection is invalid.
 * - Supports array and map-like/object chat collections.
 *
 * Implementation Notes:
 * - Tests are pure domain-level coverage with no UI mounting.
 * - Uses minimal world-shaped fixtures required by resolver.
 *
 * Recent Changes:
 * - 2026-02-15: Added tests to lock web selection behavior parity with desktop priority rules.
 */

import { describe, expect, it } from 'vitest';
import { resolveActiveChatId } from '../../web/src/domain/chat-selection';

describe('web/chat-selection resolveActiveChatId', () => {
  it('prefers current selected chat when it exists (array chats)', () => {
    const selected = resolveActiveChatId(
      {
        currentChatId: 'chat-2',
        chats: [{ id: 'chat-1' }, { id: 'chat-2' }] as any
      },
      'chat-1'
    );

    expect(selected).toBe('chat-1');
  });

  it('falls back to backend currentChatId when current selection is missing', () => {
    const selected = resolveActiveChatId(
      {
        currentChatId: 'chat-2',
        chats: [{ id: 'chat-2' }, { id: 'chat-3' }] as any
      },
      'chat-1'
    );

    expect(selected).toBe('chat-2');
  });

  it('returns null when neither selected nor backend chat exists', () => {
    const selected = resolveActiveChatId(
      {
        currentChatId: 'chat-9',
        chats: [{ id: 'chat-2' }, { id: 'chat-3' }] as any
      },
      'chat-1'
    );

    expect(selected).toBeNull();
  });

  it('supports map-like/object chat collections', () => {
    const selected = resolveActiveChatId(
      {
        currentChatId: 'chat-2',
        chats: {
          'chat-1': { id: 'chat-1' },
          'chat-2': { id: 'chat-2' }
        } as any
      },
      'chat-1'
    );

    expect(selected).toBe('chat-1');
  });
});
