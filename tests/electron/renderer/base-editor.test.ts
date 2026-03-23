/**
 * BaseEditor Component Tests
 * Purpose:
 * - Verify the generic editor shell applies the correct layout and toolbar chrome for full-area editor views.
 *
 * Key Features:
 * - Confirms collapsed-sidebar mode adds the left titlebar inset used to clear macOS traffic lights.
 * - Confirms the default toolbar padding remains unchanged when no inset is requested.
 * - Confirms the secondary pane is opt-in rather than a built-in business-specific default.
 *
 * Implementation Notes:
 * - Uses virtual React/JSX mocks and inspects the returned element tree directly.
 *
 * Recent Changes:
 * - 2026-03-23: Added coverage that the generic pattern renders an explicit secondary pane only when supplied.
 * - 2026-03-23: Initial regression coverage for toolbar inset spacing in full-area editors.
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

import BaseEditor from '../../../electron/renderer/src/design-system/patterns/BaseEditor';

function toChildArray(children: unknown): Array<{ type: unknown; props?: Record<string, unknown> }> {
  return Array.isArray(children)
    ? children as Array<{ type: unknown; props?: Record<string, unknown> }>
    : children != null
      ? [children as { type: unknown; props?: Record<string, unknown> }]
      : [];
}

describe('BaseEditor', () => {
  it('adds the traffic-light toolbar inset when requested', () => {
    const tree = BaseEditor({
      toolbar: { id: 'toolbar' } as unknown as any,
      children: { id: 'content' } as unknown as any,
      reserveTrafficLightSpace: true,
    }) as { props?: { children?: unknown } };

    const childNodes = toChildArray(tree.props?.children);
    expect(childNodes[0]?.props?.className).toContain('pl-36');
    expect(childNodes[0]?.props?.className).toContain('pr-5');
    expect(childNodes[0]?.props?.className).toContain('pb-3');
    expect(childNodes[0]?.props?.className).not.toContain('px-4');
  });

  it('keeps the default toolbar padding when no traffic-light inset is needed', () => {
    const tree = BaseEditor({
      toolbar: { id: 'toolbar' } as unknown as any,
      children: { id: 'content' } as unknown as any,
    }) as { props?: { children?: unknown } };

    const childNodes = toChildArray(tree.props?.children);
    expect(childNodes[0]?.props?.className).toContain('px-4');
    expect(childNodes[0]?.props?.className).not.toContain('pl-24');
  });

  it('renders the secondary pane only when a caller supplies one explicitly', () => {
    const withoutRightPane = BaseEditor({
      children: { id: 'content' } as unknown as any,
    }) as { props?: { children?: unknown } };

    const withoutRightPaneChildren = toChildArray(withoutRightPane.props?.children).filter(Boolean);
    expect(withoutRightPaneChildren).toHaveLength(1);
    expect(withoutRightPaneChildren[0]?.props?.className).toContain('flex min-h-0 flex-1');

    const withoutRightPaneContentRow = toChildArray(withoutRightPaneChildren[0]?.props?.children).filter(Boolean);
    expect(withoutRightPaneContentRow).toHaveLength(1);
    expect(withoutRightPaneContentRow[0]?.props?.className).toContain('flex-1');

    const rightPaneNode = { id: 'secondary-pane' } as unknown as any;
    const withRightPane = BaseEditor({
      children: { id: 'content' } as unknown as any,
      rightPane: rightPaneNode,
    }) as { props?: { children?: unknown } };

    const withRightPaneChildren = toChildArray(withRightPane.props?.children).filter(Boolean);
    const contentRowChildren = toChildArray(withRightPaneChildren[0]?.props?.children);
    expect(contentRowChildren).toHaveLength(2);
    expect(contentRowChildren[0]?.props?.className).toContain('flex-[3]');
    expect(contentRowChildren[1]?.props?.children).toBe(rightPaneNode);
  });
});