/**
 * MessageListPanel Failed-Turn Action Visibility Tests
 *
 * Features:
 * - Verifies the latest failed user turn keeps its action chrome visible when
 *   only diagnostic error rows follow it.
 * - Verifies normal completed conversations do not force the user action chrome.
 *
 * Implementation Notes:
 * - Uses the exported pure helper from MessageListPanel.
 * - Keeps assertions at the renderer-domain boundary without mounting React.
 *
 * Recent Changes:
 * - 2026-03-10: Added regression coverage for visible edit/delete actions on failed last-user turns.
 */

import { describe, expect, it } from 'vitest';
import { shouldForceHumanMessageActionsVisible } from '../../../electron/renderer/src/components/MessageListPanel';

describe('MessageListPanel failed-turn user action visibility', () => {
  it('forces user action visibility when only diagnostic error rows follow the last user message', () => {
    const messages = [
      {
        messageId: 'user-1',
        role: 'user',
        sender: 'human',
        content: '@gpt5 do work',
        createdAt: '2026-03-10T03:18:00.000Z',
        chatId: 'chat-1',
      },
      {
        messageId: 'sys-1',
        role: 'system',
        sender: 'system',
        type: 'system',
        content: 'Error processing agent message: provider missing. | agent=gpt5',
        createdAt: '2026-03-10T03:18:01.000Z',
        chatId: 'chat-1',
        systemEvent: { kind: 'error', eventType: 'error' },
      },
    ];

    expect(shouldForceHumanMessageActionsVisible(messages, 0)).toBe(true);
  });

  it('does not force user action visibility when a non-diagnostic reply follows the user turn', () => {
    const messages = [
      {
        messageId: 'user-1',
        role: 'user',
        sender: 'human',
        content: '@gpt5 do work',
        createdAt: '2026-03-10T03:18:00.000Z',
        chatId: 'chat-1',
      },
      {
        messageId: 'assistant-1',
        role: 'assistant',
        sender: 'gpt5',
        content: 'Done.',
        createdAt: '2026-03-10T03:18:03.000Z',
        chatId: 'chat-1',
      },
    ];

    expect(shouldForceHumanMessageActionsVisible(messages, 0)).toBe(false);
  });
});
