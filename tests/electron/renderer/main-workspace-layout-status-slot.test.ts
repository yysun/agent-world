/**
 * Electron Renderer Main Workspace Layout Status Slot Tests
 *
 * Purpose:
 * - Verify `MainWorkspaceLayout` routes queue and status slot content through the main-content area.
 *
 * Key Features:
 * - Confirms queue node is passed to `MainContentArea` as `queuePanel`.
 * - Confirms status node is passed to `MainContentArea` as `statusBar`.
 * - Confirms rendered markup contains the status node within main content output.
 *
 * Implementation Notes:
 * - Uses module mocks for `MainHeaderBar` and `MainContentArea` to isolate slot wiring.
 * - Uses virtual React JSX-runtime mocks and inspects returned element props directly.
 *
 * Summary of Recent Changes:
 * - 2026-03-05: Added queue-panel slot passthrough assertions to lock in queue-before-composer wiring.
 * - 2026-02-28: Added regression coverage for composer-column status-slot routing with runtime-independent mocks.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

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

const { mainContentAreaSpy, mainHeaderBarSpy } = vi.hoisted(() => ({
  mainContentAreaSpy: vi.fn(() => null),
  mainHeaderBarSpy: vi.fn(() => null),
}));

vi.mock('../../../electron/renderer/src/components/MainHeaderBar', () => ({
  default: mainHeaderBarSpy,
}));

vi.mock('../../../electron/renderer/src/components/MainContentArea', () => ({
  default: mainContentAreaSpy,
}));

import MainWorkspaceLayout from '../../../electron/renderer/src/components/MainWorkspaceLayout';

describe('MainWorkspaceLayout slot routing', () => {
  beforeEach(() => {
    mainContentAreaSpy.mockClear();
    mainHeaderBarSpy.mockClear();
  });

  it('passes queuePanel and statusBar to MainContentArea through main-content slot props', () => {
    const queueNode = { id: 'queue-probe' };
    const statusNode = { id: 'status-probe' };

    const tree = MainWorkspaceLayout({
      mainHeaderProps: { title: 'header' },
      mainContentAreaProps: { messageListProps: { a: 1 } },
      queuePanel: queueNode as unknown as any,
      statusBar: statusNode as unknown as any,
    }) as {
      props?: { children?: Array<{ type: unknown; props?: Record<string, unknown> }> };
    };

    const childNodes = tree.props?.children ?? [];
    expect(childNodes).toHaveLength(2);
    expect(childNodes[0]?.type).toBe(mainHeaderBarSpy);
    expect(childNodes[1]?.type).toBe(mainContentAreaSpy);
    expect(childNodes[1]?.props?.queuePanel).toBe(queueNode);
    expect(childNodes[1]?.props?.statusBar).toBe(statusNode);
    expect(childNodes[1]?.props?.messageListProps).toEqual({ a: 1 });
  });
});
