/**
 * Unit Tests for Session Selection Domain Helper
 *
 * Features:
 * - Verifies existing user-selected chat takes precedence when present.
 * - Verifies backend `currentChatId` is used when current selection is unavailable.
 * - Verifies fallback to first available session when neither preferred chat exists.
 *
 * Implementation Notes:
 * - Tests only pure selection logic to keep behavior deterministic.
 * - Supports renderer regression coverage without full UI mounting.
 *
 * Recent Changes:
 * - 2026-02-15: Added regression coverage for edit-agent current chat persistence.
 */

import { describe, expect, it } from 'vitest';
import { resolveSelectedSessionId } from '../../../electron/renderer/src/domain/session-selection.js';

describe('resolveSelectedSessionId', () => {
  it('prefers current selected session when available in sessions', () => {
    const selected = resolveSelectedSessionId({
      sessions: [{ id: 'chat-1' }, { id: 'chat-2' }],
      backendCurrentChatId: 'chat-2',
      currentSelectedSessionId: 'chat-1'
    });

    expect(selected).toBe('chat-1');
  });

  it('uses backend currentChatId when current selected session is unavailable', () => {
    const selected = resolveSelectedSessionId({
      sessions: [{ id: 'chat-2' }, { id: 'chat-3' }],
      backendCurrentChatId: 'chat-2',
      currentSelectedSessionId: 'chat-1'
    });

    expect(selected).toBe('chat-2');
  });

  it('falls back to first session when no preferred session exists', () => {
    const selected = resolveSelectedSessionId({
      sessions: [{ id: 'chat-3' }, { id: 'chat-4' }],
      backendCurrentChatId: 'chat-2',
      currentSelectedSessionId: 'chat-1'
    });

    expect(selected).toBe('chat-3');
  });

  it('returns null when there are no sessions', () => {
    const selected = resolveSelectedSessionId({
      sessions: [],
      backendCurrentChatId: 'chat-1',
      currentSelectedSessionId: 'chat-1'
    });

    expect(selected).toBeNull();
  });
});
