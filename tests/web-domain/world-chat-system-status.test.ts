/**
 * Web World Chat System Status Title Tests
 *
 * Purpose:
 * - Verify transient selected-chat system status uses the legend title area.
 *
 * Key Features:
 * - Confirms non-error system status replaces the chat legend text temporarily.
 * - Confirms error-like status never replaces the chat title in the legend.
 *
 * Notes on Implementation:
 * - Uses the exported legend-title helper with lightweight AppRun-compatible mocks.
 * - Avoids DOM mounting and transcript rendering concerns.
 *
 * Summary of Recent Changes:
 * - 2026-03-12: Added legend-title system-status coverage for web parity.
 */

import { describe, expect, it, vi } from 'vitest';

const { jsxFactory } = vi.hoisted(() => ({
  jsxFactory: (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => ({
    type,
    props: {
      ...(props ?? {}),
      children: children.length <= 1 ? children[0] : children,
    },
  }),
}));

vi.mock('apprun', () => ({
  app: {
    createElement: jsxFactory,
    h: jsxFactory,
    Fragment: 'Fragment',
  },
}));

vi.mock('../../web/src/domain/message-visibility', () => ({
  shouldHideWorldChatMessage: () => false,
}));

vi.mock('../../web/src/domain/message-content', () => ({
  isToolRenderableMessage: () => false,
  renderMessageContent: () => null,
}));

vi.mock('../../web/src/domain/tool-merge', () => ({
  buildCombinedRenderableMessages: (messages: unknown[]) => messages,
}));

vi.mock('../../web/src/components/activity-indicators', () => ({
  ActivityPulse: () => null,
  ElapsedTimeCounter: () => null,
}));

vi.mock('../../web/src/components/agent-queue-display', () => ({
  AgentQueueDisplay: () => null,
}));

vi.mock('../../web/src/domain/responsive-ui', () => ({
  getResponsiveControlStyleAttribute: () => '',
}));

import { getWorldChatLegendTitle } from '../../web/src/components/world-chat';

describe('web world-chat legend system status', () => {
  it('prefers transient non-error system status over the chat title', () => {
    expect(getWorldChatLegendTitle(
      'world-1',
      'Chat 1',
      'desktop',
      {
        worldName: 'world-1',
        chatId: 'chat-1',
        eventType: 'retry-wait',
        messageId: 'sys-1',
        createdAt: null,
        text: 'Retrying in 2s.',
        kind: 'info',
      },
    )).toBe('world-1 - Retrying in 2s.');
  });

  it('keeps the real chat title when the system status is error-like', () => {
    expect(getWorldChatLegendTitle(
      'world-1',
      'Chat 1',
      'desktop',
      {
        worldName: 'world-1',
        chatId: 'chat-1',
        eventType: 'error',
        messageId: 'sys-error-1',
        createdAt: null,
        text: 'Queue failed to dispatch user turn: world is busy.',
        kind: 'error',
      },
    )).toBe('world-1 - Chat 1');
  });
});
