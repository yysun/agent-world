/**
 * Electron Renderer Design-System Primitive Tests
 *
 * Purpose:
 * - Verify the primitive barrel now exposes only atomic base components.
 *
 * Key Features:
 * - Guards the primitive barrel against specialized widget regressions.
 * - Verifies representative primitive output shape for button/menu building blocks.
 *
 * Implementation Notes:
 * - Uses JSX-runtime mocks and inspects returned element props directly.
 *
 * Recent Changes:
 * - 2026-03-23: Added after correcting the primitive layer to atomic base components only.
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

import * as primitives from '../../../electron/renderer/src/design-system/primitives';
import Button from '../../../electron/renderer/src/design-system/primitives/Button';
import Checkbox from '../../../electron/renderer/src/design-system/primitives/Checkbox';
import Input from '../../../electron/renderer/src/design-system/primitives/Input';
import MenuItem from '../../../electron/renderer/src/design-system/primitives/MenuItem';
import Radio from '../../../electron/renderer/src/design-system/primitives/Radio';
import Switch from '../../../electron/renderer/src/design-system/primitives/Switch';
import Textarea from '../../../electron/renderer/src/design-system/primitives/Textarea';

describe('electron renderer design-system primitives', () => {
  it('exposes only atomic primitive modules from the primitive barrel', () => {
    expect(Object.keys(primitives).sort()).toEqual(['Button', 'Card', 'Checkbox', 'IconButton', 'Input', 'MenuItem', 'Radio', 'Select', 'Switch', 'Textarea']);
  });

  it('renders Button with semantic button defaults and variant classes', () => {
    const tree = Button({ children: 'Apply' }) as { type: unknown; props?: Record<string, unknown> };

    expect(tree.type).toBe('button');
    expect(tree.props?.type).toBe('button');
    expect(String(tree.props?.className || '')).toContain('bg-primary');
    expect(String(tree.props?.className || '')).toContain('px-4');
    expect(tree.props?.children).toBe('Apply');
  });

  it('renders MenuItem with selected-state metadata and row styling', () => {
    const tree = MenuItem({ selected: true, children: 'World A' }) as { type: unknown; props?: Record<string, unknown> };

    expect(tree.type).toBe('button');
    expect(tree.props?.type).toBe('button');
    expect(tree.props?.['data-selected']).toBe('true');
    expect(String(tree.props?.className || '')).toContain('w-full');
    expect(tree.props?.children).toBe('World A');
  });

  it('renders Input with sidebar tone styling', () => {
    const tree = Input({ tone: 'sidebar', placeholder: 'Agent name' }) as { type: unknown; props?: Record<string, unknown> };

    expect(tree.type).toBe('input');
    expect(String(tree.props?.className || '')).toContain('border-sidebar-border');
    expect(String(tree.props?.className || '')).toContain('bg-sidebar-accent');
    expect(tree.props?.placeholder).toBe('Agent name');
  });

  it('renders Textarea with monospace option when requested', () => {
    const tree = Textarea({ monospace: true, value: 'json' }) as { type: unknown; props?: Record<string, unknown> };

    expect(tree.type).toBe('textarea');
    expect(String(tree.props?.className || '')).toContain('font-mono');
    expect(tree.props?.value).toBe('json');
  });

  it('renders Radio with native radio semantics and accent styling', () => {
    const tree = Radio({ name: 'storageType', value: 'sqlite' }) as { type: unknown; props?: Record<string, unknown> };

    expect(tree.type).toBe('input');
    expect(tree.props?.type).toBe('radio');
    expect(String(tree.props?.className || '')).toContain('accent-primary');
    expect(tree.props?.name).toBe('storageType');
  });

  it('renders Checkbox with native checkbox semantics and accent styling', () => {
    const tree = Checkbox({ checked: true }) as { type: unknown; props?: Record<string, unknown> };

    expect(tree.type).toBe('input');
    expect(tree.props?.type).toBe('checkbox');
    expect(String(tree.props?.className || '')).toContain('accent-primary');
    expect(tree.props?.checked).toBe(true);
  });

  it('renders Switch with switch semantics and checked state styling', () => {
    const tree = Switch({ checked: true }) as { type: unknown; props?: Record<string, unknown> };

    expect(tree.type).toBe('button');
    expect(tree.props?.role).toBe('switch');
    expect(tree.props?.['aria-checked']).toBe(true);
    expect(String(tree.props?.className || '')).toContain('rounded-full');
    expect(JSON.stringify(tree)).toContain('bg-sidebar-primary/62');
  });
});