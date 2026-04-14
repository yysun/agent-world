/**
 * ComposerBar Reasoning Effort Tests
 * Purpose:
 * - Verify the Electron composer renders the reasoning-effort dropdown and wires its change handler.
 *
 * Key Features:
 * - Confirms the dropdown is visible with the current value.
 * - Confirms changing the dropdown calls the renderer action callback.
 * - Confirms the toolbar dropdowns request medium native control sizing on macOS.
 * - Confirms the toolbar dropdown labels use the smaller text treatment needed to avoid clipping.
 *
 * Implementation Notes:
 * - Uses virtual React/JSX mocks and inspects the returned element tree directly.
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

import { ComposerBar } from '../../../electron/renderer/src/features/chat';
import { Select } from '../../../electron/renderer/src/design-system/primitives';

function allDescendants(node: any): any[] {
  if (!node || typeof node !== 'object') return [];
  const children = node.props?.children;
  if (!children) return [node];
  const childArr = Array.isArray(children) ? children : [children];
  return [node, ...childArr.flatMap(allDescendants)];
}

describe('ComposerBar reasoning effort', () => {
  it('renders the reasoning-effort dropdown and forwards changes', () => {
    const onSetReasoningEffort = vi.fn();
    const tree: any = ComposerBar({
      onSubmitMessage: (event: Event) => event.preventDefault(),
      composerTextareaRef: null,
      composer: 'hello',
      onComposerChange: () => { },
      onComposerKeyDown: () => { },
      onOpenProjectFolder: () => { },
      onOpenProjectViewer: () => { },
      selectedProjectPath: null,
      canStopCurrentSession: false,
      isCurrentSessionStopping: false,
      isCurrentSessionSending: false,
      hasActiveHitlPrompt: false,
      reasoningEffort: 'high',
      onSetReasoningEffort,
      toolPermission: 'auto',
      onSetToolPermission: () => { },
    });

    const nodes = allDescendants(tree);
    const reasoningSelect = nodes.find((node: any) => (
      node?.type === Select && node?.props?.['aria-label'] === 'Reasoning effort'
    ));
    const toolPermissionSelect = nodes.find((node: any) => (
      node?.type === Select && node?.props?.['aria-label'] === 'Tool permission level'
    ));
    const projectControlsRow = nodes.find((node: any) => (
      node?.props?.['data-testid'] === 'composer-project-controls-row'
    ));
    const defaultOption = nodes.find((node: any) => (
      node?.type === 'option' && node?.props?.value === 'default'
    ));
    const noneOption = nodes.find((node: any) => (
      node?.type === 'option' && node?.props?.value === 'none'
    ));
    const readOption = nodes.find((node: any) => (
      node?.type === 'option' && node?.props?.value === 'read'
    ));
    const askOption = nodes.find((node: any) => (
      node?.type === 'option' && node?.props?.value === 'ask'
    ));
    const autoOption = nodes.find((node: any) => (
      node?.type === 'option' && node?.props?.value === 'auto'
    ));

    expect(reasoningSelect).toBeDefined();
    expect(toolPermissionSelect).toBeDefined();
    expect(defaultOption).toBeDefined();
    expect(noneOption).toBeDefined();
    expect(readOption).toBeDefined();
    expect(askOption).toBeDefined();
    expect(autoOption).toBeDefined();
    expect(projectControlsRow).toBeDefined();
    expect(projectControlsRow.props.className).toContain('flex-nowrap');
    expect(projectControlsRow.props.className).not.toContain('overflow-x-auto');
    expect(reasoningSelect.props.value).toBe('high');
    expect(defaultOption.props.children).toBe('Not set');
    expect(noneOption.props.children).toBe('None');
    expect(readOption.props.children).toBe('Read');
    expect(askOption.props.children).toBe('Ask');
    expect(autoOption.props.children).toBe('Auto');
    expect(reasoningSelect.props.size).toBe('sm');
    expect(toolPermissionSelect.props.size).toBe('sm');
    expect(reasoningSelect.props.className).toContain('!w-[78px]');
    expect(reasoningSelect.props.className).toContain('shrink-0');
    expect(reasoningSelect.props.className).toContain('px-1.5');
    expect(reasoningSelect.props.className).toContain('text-[12px]');
    expect(reasoningSelect.props.className).toContain('leading-none');
    expect(toolPermissionSelect.props.className).toContain('!w-[72px]');
    expect(toolPermissionSelect.props.className).toContain('shrink-0');
    expect(toolPermissionSelect.props.className).toContain('px-1.5');
    expect(toolPermissionSelect.props.className).toContain('text-[12px]');
    expect(toolPermissionSelect.props.className).toContain('leading-none');

    reasoningSelect.props.onChange({ target: { value: 'none' } });
    expect(onSetReasoningEffort).toHaveBeenCalledWith('none');
  });
});