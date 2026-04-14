/**
 * Agent Prompt Editor Component Tests
 * Purpose:
 * - Verify the full-area agent prompt editor renders the expected workspace chrome and callback wiring.
 *
 * Key Features:
 * - Confirms BaseEditor receives the traffic-light inset when the sidebar is collapsed.
 * - Confirms the editor header identifies the current agent draft.
 * - Confirms Back and Apply actions route through the provided callbacks.
 *
 * Implementation Notes:
 * - Uses virtual React/JSX mocks and inspects the returned element tree directly.
 *
 * Recent Changes:
 * - 2026-04-14: Added explicit coverage that the Back action uses the primary workspace-editor button treatment.
 * - 2026-04-11: Added the initial regression coverage for the full-area agent prompt editor.
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
import { AgentPromptEditor } from '../../../electron/renderer/src/features/agents';

function allDescendants(node: any): any[] {
  if (!node || typeof node !== 'object') return [];
  const children = node.props?.children;
  const childArray = Array.isArray(children) ? children : children != null ? [children] : [];
  return [node, ...childArray.flatMap(allDescendants)];
}

describe('AgentPromptEditor', () => {
  it('renders BaseEditor with the expected draft context and textarea', () => {
    const result: any = AgentPromptEditor({
      draftContextLabel: 'Create Agent Draft',
      agentName: 'Planner',
      value: 'Be precise.',
      onChange: () => { },
      onBack: () => { },
      onApply: () => { },
      hasUnappliedChanges: false,
      leftSidebarCollapsed: true,
    });

    expect(result.type).toBe(baseEditorStub);
    expect(result.props.reserveTrafficLightSpace).toBe(true);
    expect(JSON.stringify(result.props.toolbar)).toContain('Agent System Prompt');
    expect(JSON.stringify(result.props.children)).toContain('Create Agent Draft');
    expect(JSON.stringify(result.props.children)).toContain('System Prompt for ');
    expect(JSON.stringify(result.props.children)).toContain('Planner');

    const nodes = allDescendants(result.props.children);
    const textarea = nodes.find((node: any) => node?.type === Textarea);
    expect(textarea).toBeDefined();
    expect(textarea.props.value).toBe('Be precise.');
  });

  it('routes Back and Apply actions through the provided callbacks', () => {
    const onBack = vi.fn();
    const onApply = vi.fn();

    const result: any = AgentPromptEditor({
      draftContextLabel: 'Edit Agent Draft',
      agentName: 'Planner',
      value: 'Be precise.',
      onChange: () => { },
      onBack,
      onApply,
      hasUnappliedChanges: true,
    });

    const toolbarNodes = allDescendants(result.props.toolbar);
    const buttons = toolbarNodes.filter((node: any) => node?.type === Button);
    const backButton = buttons.find((node: any) => node?.props?.onClick === onBack);
    const applyButton = buttons.find((node: any) => node?.props?.onClick === onApply);

    expect(backButton).toBeDefined();
    expect(backButton.props.variant).toBe('primary');
    expect(applyButton).toBeDefined();
    expect(applyButton.props.disabled).toBe(false);

    backButton.props.onClick();
    applyButton.props.onClick();

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledTimes(1);
  });
});