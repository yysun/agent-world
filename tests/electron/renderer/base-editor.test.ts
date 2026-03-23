/**
 * BaseEditor Component Tests
 * Purpose:
 * - Verify the shared editor shell applies the correct toolbar chrome for full-area editor views.
 *
 * Key Features:
 * - Confirms collapsed-sidebar mode adds the left titlebar inset used to clear macOS traffic lights.
 * - Confirms the default toolbar padding remains unchanged when no inset is requested.
 *
 * Implementation Notes:
 * - Uses virtual React/JSX mocks and inspects the returned element tree directly.
 * - Mocks `EditorChatPane` because these tests only care about toolbar wrapper classes.
 *
 * Recent Changes:
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

vi.mock('../../../electron/renderer/src/components/EditorChatPane', () => ({
  default: Symbol('EditorChatPane'),
}));

import BaseEditor from '../../../electron/renderer/src/components/BaseEditor';

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
});