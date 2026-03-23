/**
 * Electron Renderer Design-System Pattern Tests
 *
 * Purpose:
 * - Verify generic pattern-layer exports remain composed from primitive building blocks.
 *
 * Key Features:
 * - Covers the shared panel action-bar layout shell.
 * - Covers the shared text-editor dialog shell.
 * - Verifies title, action labels, and textarea composition without rendering React.
 *
 * Implementation Notes:
 * - Uses JSX-runtime mocks and inspects returned element props directly.
 *
 * Recent Changes:
 * - 2026-03-23: Added after extracting the reusable text-editor dialog pattern.
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

import { Button, Card, IconButton, Textarea } from '../../../electron/renderer/src/design-system/primitives';
import LabeledField from '../../../electron/renderer/src/design-system/patterns/LabeledField';
import PanelActionBar from '../../../electron/renderer/src/design-system/patterns/PanelActionBar';
import TextEditorDialog from '../../../electron/renderer/src/design-system/patterns/TextEditorDialog';

function flatten(node: any): any[] {
  if (!node || typeof node !== 'object') return [];
  const children = node.props?.children;
  const childArray = Array.isArray(children) ? children : children != null ? [children] : [];
  return [node, ...childArray.flatMap(flatten)];
}

describe('electron renderer design-system patterns', () => {
  it('renders LabeledField with a stacked label and child content', () => {
    const tree = LabeledField({
      label: 'World Name',
      children: 'Control',
    }) as any;

    const nodes = flatten(tree);

    expect(String(tree.props.className || '')).toContain('flex-col');
    expect(nodes.some((node) => node?.type === 'label' && node?.props?.children === 'World Name')).toBe(true);
    expect(JSON.stringify(tree)).toContain('Control');
  });

  it('renders PanelActionBar with optional leading slot and trailing action group', () => {
    const tree = PanelActionBar({
      leading: 'Danger',
      children: 'Actions',
    }) as any;

    const nodes = flatten(tree);

    expect(String(tree.props.className || '')).toContain('justify-between');
    expect(nodes.some((node) => node?.props?.children === 'Danger')).toBe(true);
    expect(nodes.some((node) => node?.props?.children === 'Actions')).toBe(true);
  });

  it('renders TextEditorDialog from primitive building blocks', () => {
    const tree = TextEditorDialog({
      title: 'Edit Note',
      value: 'hello',
      onChange: () => undefined,
      onClose: () => undefined,
      onApply: () => undefined,
      placeholder: 'Type here',
    }) as any;

    const nodes = flatten(tree);

    expect(nodes.some((node) => node.type === Card)).toBe(true);
    expect(nodes.some((node) => node.type === IconButton)).toBe(true);
    expect(nodes.some((node) => node.type === Textarea)).toBe(true);
    expect(nodes.filter((node) => node.type === Button)).toHaveLength(2);
    expect(JSON.stringify(tree)).toContain('Edit Note');
    expect(JSON.stringify(tree)).toContain('Type here');
  });
});