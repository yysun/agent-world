/**
 * CLI System Event Formatting Tests
 *
 * Purpose:
 * - Verify CLI-visible text extraction for runtime `system` events.
 *
 * Key Features:
 * - Covers plain-text status messages used by timeout/retry emitters.
 * - Covers structured title-update payloads used by chat title refresh.
 * - Covers structured queue-dispatch failures so interactive and pipeline modes share readable output.
 *
 * Notes on Implementation:
 * - Tests the pure formatter used by both CLI rendering paths.
 * - Avoids terminal and readline side effects.
 *
 * Summary of Recent Changes:
 * - 2026-03-12: Created for cross-client selected-chat system-status parity.
 */

import { describe, expect, it } from 'vitest';
import { getSystemEventDisplayText } from '../../cli/system-events.js';

describe('cli/system-events', () => {
  it('returns plain-text system status unchanged', () => {
    expect(getSystemEventDisplayText({
      content: 'LLM processing timed out for gpt5 after 15s.',
      chatId: 'chat-1',
    })).toBe('LLM processing timed out for gpt5 after 15s.');
  });

  it('formats structured chat title updates into readable text', () => {
    expect(getSystemEventDisplayText({
      content: {
        eventType: 'chat-title-updated',
        title: 'Scoped Chat Title',
      },
      chatId: 'chat-1',
    })).toBe('Chat title updated: Scoped Chat Title');
  });

  it('extracts structured queue-dispatch failures from message payloads', () => {
    expect(getSystemEventDisplayText({
      content: {
        type: 'error',
        eventType: 'error',
        failureKind: 'queue-dispatch',
        message: 'Queue failed to dispatch user message: world is busy.',
      },
      chatId: 'chat-1',
    })).toBe('Queue failed to dispatch user message: world is busy.');
  });
});
