/**
 * Electron Renderer Queue Message Item Label Tests
 *
 * Purpose:
 * - Verify status chip labels rendered by `QueueMessageItem`.
 *
 * Key Features:
 * - Confirms `sending` status renders the user-facing `Processing` chip text.
 *
 * Implementation Notes:
 * - Uses virtual React JSX-runtime mocks and validates JSX object output shape.
 *
 * Summary of Recent Changes:
 * - 2026-03-04: Added regression coverage for `sending` label copy update.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('react', () => ({
  default: { createElement: (type: unknown, props: Record<string, unknown> | null, key?: unknown) => ({ type, props: props ?? {}, key }) },
  useState: (initial: unknown) => [initial, () => { }],
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

import { QueueMessageItem } from '../../../electron/renderer/src/features/queue';
import type { QueuedMessageEntry } from '../../../electron/renderer/src/hooks/useMessageQueue';

function findNodeByType(node: unknown, type: string): { props?: Record<string, unknown> } | null {
  if (node == null) return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findNodeByType(child, type);
      if (found) return found;
    }
    return null;
  }
  if (typeof node === 'object' && node !== null && 'type' in node) {
    const candidate = node as { type?: unknown; props?: Record<string, unknown> };
    if (candidate.type === type) return candidate;
    return findNodeByType(candidate.props?.children, type);
  }
  return null;
}

describe('QueueMessageItem', () => {
  it('renders Processing label for sending status chip', () => {
    const message: QueuedMessageEntry = {
      id: 1,
      worldId: 'world-1',
      chatId: 'chat-1',
      messageId: 'msg-1',
      content: 'hello world',
      sender: 'human',
      status: 'sending',
      retryCount: 0,
      createdAt: '2026-03-04T00:00:00.000Z',
    };

    const tree = QueueMessageItem({
      message,
      onRemove: vi.fn(),
    }) as { props?: { children?: unknown } };

    const chip = findNodeByType(tree.props?.children, 'span');
    expect(chip?.props?.children).toBe('Processing');
    expect(chip?.props?.['aria-label']).toBe('Status: Processing');
  });
});
