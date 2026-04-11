/**
 * World Text Editor Component Tests
 * Purpose:
 * - Verify the full-area world text editor renders field-specific context and callback wiring.
 *
 * Key Features:
 * - Confirms Variables and MCP Config modes expose distinct labels and textarea behavior.
 * - Confirms BaseEditor receives the traffic-light inset when requested.
 * - Confirms Back and Apply actions route through the provided callbacks.
 *
 * Implementation Notes:
 * - Uses virtual React/JSX mocks and inspects the returned element tree directly.
 *
 * Recent Changes:
 * - 2026-04-11: Added the initial regression coverage for the full-area world text editor.
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

const { baseEditorStub } = vi.hoisted(() => ({
  baseEditorStub: Symbol('BaseEditor'),
}));

vi.mock('../../../electron/renderer/src/design-system/patterns/BaseEditor', () => ({
  default: baseEditorStub,
}));

import { Button, Textarea } from '../../../electron/renderer/src/design-system/primitives';
import { WorldTextEditor } from '../../../electron/renderer/src/features/worlds';

function allDescendants(node: any): any[] {
  if (!node || typeof node !== 'object') return [];
  const children = node.props?.children;
  const childArray = Array.isArray(children) ? children : children != null ? [children] : [];
  return [node, ...childArray.flatMap(allDescendants)];
}

describe('WorldTextEditor', () => {
  it('renders Variables mode with world context and non-monospace textarea', () => {
    const result: any = WorldTextEditor({
      worldName: 'Research World',
      field: 'variables',
      value: 'OPENAI_API_KEY=test',
      onChange: () => { },
      onBack: () => { },
      onApply: () => { },
      hasUnappliedChanges: false,
      leftSidebarCollapsed: true,
    });

    expect(result.type).toBe(baseEditorStub);
    expect(result.props.reserveTrafficLightSpace).toBe(true);
    expect(JSON.stringify(result.props.toolbar)).toContain('Variables (.env)');
    expect(JSON.stringify(result.props.children)).toContain('Variables (.env)');
    expect(JSON.stringify(result.props.children)).toContain('Research World');

    const nodes = allDescendants(result.props.children);
    const textarea = nodes.find((node: any) => node?.type === Textarea);
    expect(textarea).toBeDefined();
    expect(textarea.props.monospace).toBe(false);
  });

  it('renders MCP mode with JSON-oriented presentation and action callbacks', () => {
    const onBack = vi.fn();
    const onApply = vi.fn();

    const result: any = WorldTextEditor({
      worldName: 'Research World',
      field: 'mcpConfig',
      value: '{"mcpServers":{}}',
      onChange: () => { },
      onBack,
      onApply,
      hasUnappliedChanges: true,
    });

    expect(JSON.stringify(result.props.toolbar)).toContain('MCP Config');
    expect(JSON.stringify(result.props.children)).toContain('MCP Config');
    expect(JSON.stringify(result.props.children)).toContain('Research World');

    const nodes = allDescendants(result.props.children);
    const textarea = nodes.find((node: any) => node?.type === Textarea);
    expect(textarea).toBeDefined();
    expect(textarea.props.monospace).toBe(true);

    const toolbarNodes = allDescendants(result.props.toolbar);
    const buttons = toolbarNodes.filter((node: any) => node?.type === Button);
    const backButton = buttons.find((node: any) => node?.props?.onClick === onBack);
    const applyButton = buttons.find((node: any) => node?.props?.onClick === onApply);

    expect(backButton).toBeDefined();
    expect(applyButton).toBeDefined();
    expect(applyButton.props.disabled).toBe(false);

    backButton.props.onClick();
    applyButton.props.onClick();

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledTimes(1);
  });
});