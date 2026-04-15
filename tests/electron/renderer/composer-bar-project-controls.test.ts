/**
 * ComposerBar Project Controls Tests
 * Purpose:
 * - Verify the Electron composer splits project actions into separate open-folder and open-viewer buttons.
 *
 * Key Features:
 * - Confirms the folder icon button and Project button are both present.
 * - Confirms the Project button disables cleanly when no project is selected.
 * - Confirms both callbacks fire when a project path is available.
 * - Confirms the Project button uses the secondary button treatment.
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

function allDescendants(node: any): any[] {
  if (!node || typeof node !== 'object') return [];
  const children = node.props?.children;
  if (!children) return [node];
  const childArr = Array.isArray(children) ? children : [children];
  return [node, ...childArr.flatMap(allDescendants)];
}

describe('ComposerBar project controls', () => {
  it('renders separate open-folder and project-viewer buttons', () => {
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
      reasoningEffort: 'default',
      onSetReasoningEffort: () => { },
      toolPermission: 'auto',
      onSetToolPermission: () => { },
    });

    const nodes = allDescendants(tree);
    const openFolderButton = nodes.find((node: any) => node?.type === 'button' && node?.props?.['aria-label'] === 'Open project folder');
    const projectButton = nodes.find((node: any) => node?.type === 'button' && node?.props?.['aria-label'] === 'Open project viewer');
    const projectControlsRow = nodes.find((node: any) => node?.props?.['data-testid'] === 'composer-project-controls-row');

    expect(openFolderButton).toBeDefined();
    expect(projectButton).toBeDefined();
    expect(projectControlsRow).toBeDefined();
    expect(projectControlsRow.props.className).toContain('flex-nowrap');
    expect(projectButton.props.disabled).toBe(true);
    expect(projectButton.props.className).toContain('bg-secondary');
    expect(projectButton.props.className).toContain('text-secondary-foreground');
  });

  it('fires separate callbacks when a project path is selected', () => {
    const onOpenProjectFolder = vi.fn();
    const onOpenProjectViewer = vi.fn();
    const tree: any = ComposerBar({
      onSubmitMessage: (event: Event) => event.preventDefault(),
      composerTextareaRef: null,
      composer: 'hello',
      onComposerChange: () => { },
      onComposerKeyDown: () => { },
      onOpenProjectFolder,
      onOpenProjectViewer,
      selectedProjectPath: '/Users/test/project',
      canStopCurrentSession: false,
      isCurrentSessionStopping: false,
      isCurrentSessionSending: false,
      hasActiveHitlPrompt: false,
      reasoningEffort: 'default',
      onSetReasoningEffort: () => { },
      toolPermission: 'auto',
      onSetToolPermission: () => { },
    });

    const nodes = allDescendants(tree);
    const openFolderButton = nodes.find((node: any) => node?.type === 'button' && node?.props?.['aria-label'] === 'Open project folder');
    const projectButton = nodes.find((node: any) => node?.type === 'button' && node?.props?.['aria-label'] === 'Open project viewer');

    openFolderButton.props.onClick();
    projectButton.props.onClick();

    expect(projectButton.props.disabled).toBe(false);
    expect(onOpenProjectFolder).toHaveBeenCalledTimes(1);
    expect(onOpenProjectViewer).toHaveBeenCalledTimes(1);
  });
});