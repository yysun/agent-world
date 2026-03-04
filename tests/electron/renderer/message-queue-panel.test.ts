/**
 * Electron Renderer Message Queue Panel Tests
 *
 * Purpose:
 * - Verify queue panel visibility gating behavior in the desktop renderer.
 *
 * Key Features:
 * - Hides queue panel by default for single in-flight or queued-only states.
 * - Shows queue panel only when one message is sending and additional messages are queued.
 *
 * Implementation Notes:
 * - Uses virtual JSX-runtime mocks to validate component output shape without DOM rendering.
 * - Keeps assertions focused on production-visible behavior (panel rendered vs hidden).
 *
 * Summary of Recent Changes:
 * - 2026-03-04: Added regression coverage for queue panel default-hidden behavior.
 */

import { describe, expect, it, vi } from 'vitest';

const jsxFactory = (type: unknown, props: Record<string, unknown> | null, key?: unknown) => ({
  type,
  props: props ?? {},
  key,
});

vi.mock('react', () => ({
  default: { createElement: jsxFactory },
}), { virtual: true });

vi.mock('react/jsx-runtime', () => ({
  Fragment: 'Fragment',
  jsx: jsxFactory,
  jsxs: jsxFactory,
}), { virtual: true });

vi.mock('react/jsx-dev-runtime', () => ({
  Fragment: 'Fragment',
  jsxDEV: jsxFactory,
}), { virtual: true });

import MessageQueuePanel from '../../../electron/renderer/src/components/MessageQueuePanel';
import type { QueuedMessageEntry } from '../../../electron/renderer/src/hooks/useMessageQueue';

function makeQueuedMessage(status: QueuedMessageEntry['status'], messageId: string): QueuedMessageEntry {
  return {
    id: Number(messageId.replace(/\D/g, '') || '1'),
    worldId: 'world-1',
    chatId: 'chat-1',
    messageId,
    content: `content-${messageId}`,
    sender: 'user',
    status,
    retryCount: 0,
    createdAt: '2026-03-04T00:00:00.000Z',
  };
}

function renderPanel(entries: QueuedMessageEntry[]) {
  return MessageQueuePanel({
    queuedMessages: entries,
    onRemove: () => { },
    onPause: () => { },
    onResume: () => { },
    onStop: () => { },
    onClear: () => { },
  });
}

describe('MessageQueuePanel visibility', () => {
  it('hides when there is only a currently sending message', () => {
    const tree = renderPanel([makeQueuedMessage('sending', 'm1')]);
    expect(tree).toBeNull();
  });

  it('hides when queue exists but no message is currently sending', () => {
    const tree = renderPanel([makeQueuedMessage('queued', 'm2')]);
    expect(tree).toBeNull();
  });

  it('shows when a message is sending and additional queued messages exist', () => {
    const tree = renderPanel([
      makeQueuedMessage('sending', 'm3'),
      makeQueuedMessage('queued', 'm4'),
    ]) as { props?: { children?: unknown } } | null;

    expect(tree).not.toBeNull();
    expect(tree?.props).toBeDefined();
  });
});
