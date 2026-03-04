/**
 * Electron Renderer Working Status Bar Tests
 *
 * Purpose:
 * - Verify `WorkingStatusBar` rendering behavior for idle-clear and visible states.
 *
 * Key Features:
 * - Confirms idle state keeps the status bar row mounted while clearing content.
 * - Confirms complete state still renders explicit completion text.
 *
 * Implementation Notes:
 * - Uses virtual React JSX-runtime mocks so tests do not depend on installed renderer packages.
 * - Exercises component output object shape only; no runtime timers or external side effects.
 *
 * Summary of Recent Changes:
 * - 2026-02-28: Added regression coverage for always-mounted idle status row behavior with virtual JSX-runtime mocks.
 */

import { describe, expect, it, vi } from 'vitest';

const { jsxFactory } = vi.hoisted(() => ({
  jsxFactory: (type: unknown, props: Record<string, unknown> | null, key?: unknown) => ({
    type,
    props: props ?? {},
    key,
  }),
}));

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

import WorkingStatusBar from '../../../electron/renderer/src/components/WorkingStatusBar';

function collectText(node: unknown): string {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map((entry) => collectText(entry)).join('');
  if (typeof node === 'object' && node !== null && 'props' in node) {
    return collectText((node as { props?: { children?: unknown } }).props?.children);
  }
  return '';
}

describe('WorkingStatusBar', () => {
  it('keeps an empty bar row mounted when chat status is idle', () => {
    const tree = WorkingStatusBar({
      chatStatus: 'idle',
      agentStatuses: [],
      notification: null,
    }) as { props?: { children?: { props?: Record<string, unknown> } } };

    const innerRow = tree.props?.children;
    expect(String(innerRow?.props?.className || '')).toContain('max-w-[750px]');
    expect(innerRow?.props?.['aria-hidden']).toBeTruthy();
    expect(collectText(tree)).not.toContain('Done');
  });

  it('renders done content when chat status is complete', () => {
    const tree = WorkingStatusBar({
      chatStatus: 'complete',
      agentStatuses: [],
      notification: null,
    }) as { props?: { children?: { props?: Record<string, unknown> } } };

    const innerRow = tree.props?.children;
    expect(innerRow?.props?.['aria-hidden']).toBeUndefined();
    expect(collectText(tree)).toContain('Done');
  });
});
