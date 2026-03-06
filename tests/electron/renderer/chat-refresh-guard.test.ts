/**
 * Unit Tests for Chat Refresh Guard Domain Helpers
 *
 * Features:
 * - Verifies shouldApplyChatRefresh blocks stale counter results.
 * - Verifies shouldApplyChatRefresh blocks results for a non-selected chat.
 * - Verifies shouldActivateSessionForRefresh guards backend activation.
 * - Verifies both guard functions allow valid same-chat current-counter results.
 *
 * Implementation Notes:
 * - All tests are pure logic — no React or IPC dependencies.
 * - Covers AD-6 (shared isolation rule) and AD-7 (activation/apply separation).
 *
 * Recent Changes:
 * - 2026-03-06: Initial regression coverage for selected-chat isolation guards.
 */

import { describe, expect, it } from 'vitest';
import {
  shouldApplyChatRefresh,
  shouldActivateSessionForRefresh,
} from '../../../electron/renderer/src/domain/chat-refresh-guard';

describe('shouldApplyChatRefresh', () => {
  it('returns true when counter matches and target chat is selected', () => {
    expect(
      shouldApplyChatRefresh({
        refreshId: 3,
        currentCounter: 3,
        targetChatId: 'chat-a',
        selectedChatId: 'chat-a',
      })
    ).toBe(true);
  });

  it('returns false when refreshId is behind current counter (stale result)', () => {
    expect(
      shouldApplyChatRefresh({
        refreshId: 2,
        currentCounter: 3,
        targetChatId: 'chat-a',
        selectedChatId: 'chat-a',
      })
    ).toBe(false);
  });

  it('returns false when refreshId is ahead of current counter', () => {
    expect(
      shouldApplyChatRefresh({
        refreshId: 4,
        currentCounter: 3,
        targetChatId: 'chat-a',
        selectedChatId: 'chat-a',
      })
    ).toBe(false);
  });

  it('returns false when target chat differs from selected chat', () => {
    expect(
      shouldApplyChatRefresh({
        refreshId: 3,
        currentCounter: 3,
        targetChatId: 'chat-a',
        selectedChatId: 'chat-b',
      })
    ).toBe(false);
  });

  it('returns false when selected chat is null (no session active)', () => {
    expect(
      shouldApplyChatRefresh({
        refreshId: 3,
        currentCounter: 3,
        targetChatId: 'chat-a',
        selectedChatId: null,
      })
    ).toBe(false);
  });

  it('returns false when both counter is stale and chat differs', () => {
    expect(
      shouldApplyChatRefresh({
        refreshId: 1,
        currentCounter: 5,
        targetChatId: 'chat-a',
        selectedChatId: 'chat-b',
      })
    ).toBe(false);
  });
});

describe('shouldActivateSessionForRefresh', () => {
  it('returns true when target chat equals selected chat', () => {
    expect(shouldActivateSessionForRefresh('chat-a', 'chat-a')).toBe(true);
  });

  it('returns false when target chat differs from selected chat', () => {
    expect(shouldActivateSessionForRefresh('chat-a', 'chat-b')).toBe(false);
  });

  it('returns false when selected chat is null', () => {
    expect(shouldActivateSessionForRefresh('chat-a', null)).toBe(false);
  });

  it('returns false when target is non-null but selected is null', () => {
    expect(shouldActivateSessionForRefresh('chat-x', null)).toBe(false);
  });
});
