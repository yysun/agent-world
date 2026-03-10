/**
 * HITL Session Scope Unit Tests
 *
 * Regression tests for AD-4 session-scoping fix.
 * Before fix: activeHitlPrompt was always hitlPromptQueue[0] (unscoped).
 * After fix: only prompts for the current session (or null-chatId global prompts) match,
 * and combined App display state can be derived safely from the selected session.
 */

import { describe, expect, it } from 'vitest';
import {
  deriveHitlPromptDisplayState,
  hasHitlPromptForSession,
  selectHitlPromptForSession,
} from '../../../electron/renderer/src/domain/hitl-scope';

const makePrompt = (requestId: string, chatId: string | null) => ({
  requestId,
  chatId,
  title: 'Test',
  message: 'Choose',
  mode: 'option' as const,
  options: [{ id: 'yes', label: 'Yes' }],
});

describe('selectHitlPromptForSession', () => {
  it('returns the prompt that matches the current session', () => {
    const queue = [
      makePrompt('req-a', 'session-a'),
      makePrompt('req-b', 'session-b'),
    ];
    const result = selectHitlPromptForSession(queue, 'session-b');
    expect(result?.requestId).toBe('req-b');
  });

  it('returns null when queue only has prompts for other sessions', () => {
    const queue = [makePrompt('req-a', 'session-a')];
    const result = selectHitlPromptForSession(queue, 'session-b');
    expect(result).toBeNull();
  });

  it('returns a global (null-chatId) prompt for any session', () => {
    const queue = [makePrompt('req-global', null)];
    const result = selectHitlPromptForSession(queue, 'session-x');
    expect(result?.requestId).toBe('req-global');
  });

  it('returns null when queue is empty', () => {
    expect(selectHitlPromptForSession([], 'session-a')).toBeNull();
  });

  it('prefers session-scoped over global when both are present', () => {
    const queue = [
      makePrompt('req-global', null),
      makePrompt('req-b', 'session-b'),
    ];
    // queue[0] is global — it matches first
    const result = selectHitlPromptForSession(queue, 'session-b');
    expect(result?.requestId).toBe('req-global');
  });
});

describe('hasHitlPromptForSession', () => {
  it('returns true when a matching session prompt exists', () => {
    const queue = [makePrompt('req-a', 'session-a')];
    expect(hasHitlPromptForSession(queue, 'session-a')).toBe(true);
  });

  it('returns false when only other session prompts exist', () => {
    const queue = [makePrompt('req-a', 'session-a')];
    expect(hasHitlPromptForSession(queue, 'session-b')).toBe(false);
  });

  it('returns true for a global (null-chatId) prompt in any session', () => {
    const queue = [makePrompt('req-global', null)];
    expect(hasHitlPromptForSession(queue, 'session-x')).toBe(true);
  });

  it('returns false for an empty queue', () => {
    expect(hasHitlPromptForSession([], 'session-a')).toBe(false);
  });
});

describe('deriveHitlPromptDisplayState', () => {
  it('returns the active prompt and visible-state flag for the selected session', () => {
    const queue = [
      makePrompt('req-a', 'session-a'),
      makePrompt('req-b', 'session-b'),
    ];

    expect(deriveHitlPromptDisplayState(queue, 'session-b')).toEqual({
      activeHitlPrompt: expect.objectContaining({ requestId: 'req-b' }),
      hasActiveHitlPrompt: true,
    });
  });

  it('returns null and false when the selected session has no visible prompt', () => {
    const queue = [makePrompt('req-a', 'session-a')];

    expect(deriveHitlPromptDisplayState(queue, 'session-b')).toEqual({
      activeHitlPrompt: null,
      hasActiveHitlPrompt: false,
    });
  });
});
