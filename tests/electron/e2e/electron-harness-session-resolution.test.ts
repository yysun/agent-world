/**
 * Unit Tests for Electron E2E Harness Session Resolution
 *
 * Purpose:
 * - Verify the desktop E2E harness identifies the newly created session only after it
 *   actually exists and becomes distinguishable from pre-existing sessions.
 *
 * Key Features:
 * - Covers the selected new session path.
 * - Covers fallback detection when the new session exists before selection catches up.
 * - Covers the no-new-session case to avoid false positives.
 *
 * Implementation Notes:
 * - Tests only the pure helper used by the Playwright harness.
 * - Keeps regression coverage deterministic without launching Electron.
 *
 * Recent Changes:
 * - 2026-03-12: Added regression coverage for async new-session selection races in desktop E2E helpers.
 */

import { describe, expect, it } from 'vitest';
import { resolveCreatedSessionId } from '../../electron-e2e/support/session-resolution';

describe('resolveCreatedSessionId', () => {
  it('returns the selected current chat when it is a newly created session', () => {
    const createdSessionId = resolveCreatedSessionId(
      ['chat-current', 'chat-switched'],
      {
        currentChatId: 'chat-new',
        sessions: [
          { id: 'chat-new', name: 'New Chat' },
          { id: 'chat-current', name: 'Loaded Current Chat' },
          { id: 'chat-switched', name: 'Switched Chat' },
        ],
      },
    );

    expect(createdSessionId).toBe('chat-new');
  });

  it('falls back to the newly added session when selection has not caught up yet', () => {
    const createdSessionId = resolveCreatedSessionId(
      ['chat-current', 'chat-switched'],
      {
        currentChatId: 'chat-current',
        sessions: [
          { id: 'chat-new', name: 'New Chat' },
          { id: 'chat-current', name: 'Loaded Current Chat' },
          { id: 'chat-switched', name: 'Switched Chat' },
        ],
      },
    );

    expect(createdSessionId).toBe('chat-new');
  });

  it('returns an empty string when no new session exists yet', () => {
    const createdSessionId = resolveCreatedSessionId(
      ['chat-current', 'chat-switched'],
      {
        currentChatId: 'chat-current',
        sessions: [
          { id: 'chat-current', name: 'Loaded Current Chat' },
          { id: 'chat-switched', name: 'Switched Chat' },
        ],
      },
    );

    expect(createdSessionId).toBe('');
  });
});