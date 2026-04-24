/**
 * Electron Renderer Message Queue Panel Visibility Tests
 *
 * Purpose:
 * - Verify `MessageQueuePanel` only renders when at least two queue items remain.
 *
 * Key Features:
 * - Confirms a single queued item returns `null`.
 * - Confirms two queued items render the floating queue panel test id.
 *
 * Implementation Notes:
 * - Uses lightweight JSX-runtime mocks and inspects the returned element tree directly.
 *
 * Summary of Recent Changes:
 * - 2026-04-24: Added regression coverage for the two-item visibility gate used by Electron queue E2E.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('react', () => ({
  default: { createElement: (type: unknown, props: Record<string, unknown> | null, key?: unknown) => ({ type, props: props ?? {}, key }) },
}));

vi.mock('react/jsx-runtime', () => ({
  Fragment: 'Fragment',
  jsx: (type: unknown, props: Record<string, unknown> | null, key?: unknown) => ({ type, props: props ?? {}, key }),
  jsxs: (type: unknown, props: Record<string, unknown> | null, key?: unknown) => ({ type, props: props ?? {}, key }),
}));

vi.mock('react/jsx-dev-runtime', () => ({
  Fragment: 'Fragment',
  jsxDEV: (type: unknown, props: Record<string, unknown> | null, key?: unknown) => ({ type, props: props ?? {}, key }),
}));

import MessageQueuePanel from '../../../electron/renderer/src/features/queue/components/MessageQueuePanel';
import type { QueuedMessageEntry } from '../../../electron/renderer/src/hooks/useMessageQueue';

function createQueuedEntry(messageId: string): QueuedMessageEntry {
  return {
    id: Number(messageId.replace(/\D/g, '')) || 1,
    worldId: 'world-1',
    chatId: 'chat-1',
    messageId,
    content: `content for ${messageId}`,
    sender: 'human',
    status: 'queued',
    retryCount: 0,
    createdAt: '2026-04-24T00:00:00.000Z',
  };
}

function findNodeByTestId(node: unknown, testId: string): { props?: Record<string, unknown> } | null {
  if (node == null) return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findNodeByTestId(child, testId);
      if (found) return found;
    }
    return null;
  }
  if (typeof node === 'object' && node !== null && 'props' in node) {
    const candidate = node as { props?: Record<string, unknown> };
    if (candidate.props?.['data-testid'] === testId) {
      return candidate;
    }
    return findNodeByTestId(candidate.props?.children, testId);
  }
  return null;
}

describe('MessageQueuePanel visibility', () => {
  it('returns null when only one queue item remains', () => {
    const result = MessageQueuePanel({
      queuedMessages: [createQueuedEntry('msg-1')],
      onRemove: vi.fn(),
      onPause: vi.fn(),
      onResume: vi.fn(),
      onStop: vi.fn(),
      onClear: vi.fn(),
    });

    expect(result).toBeNull();
  });

  it('renders the floating queue panel when two queue items remain', () => {
    const result = MessageQueuePanel({
      queuedMessages: [createQueuedEntry('msg-1'), createQueuedEntry('msg-2')],
      onRemove: vi.fn(),
      onPause: vi.fn(),
      onResume: vi.fn(),
      onStop: vi.fn(),
      onClear: vi.fn(),
    });

    expect(findNodeByTestId(result, 'message-queue-panel')).not.toBeNull();
  });
});