/**
 * ComposerBar Project Controls Tests
 * Purpose:
 * - Verify the Electron composer keeps only the project-folder control after the
 *   project-editor launcher moved to the header.
 *
 * Key Features:
 * - Confirms the folder icon button remains present.
 * - Confirms the legacy attach button is absent.
 * - Confirms the project-editor action no longer renders in the composer.
 * - Confirms the folder callback still fires when a project path is available.
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
  it('renders only the project-folder control without the attach or project-editor buttons', () => {
    const tree: any = ComposerBar({
      onSubmitMessage: (event: Event) => event.preventDefault(),
      composerTextareaRef: null,
      composer: 'hello',
      onComposerChange: () => { },
      onComposerKeyDown: () => { },
      onOpenProjectFolder: () => { },
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
    const projectEditorButton = nodes.find((node: any) => node?.props?.['aria-label'] === 'Open project editor' || node?.props?.label === 'Open project editor');
    const attachButton = nodes.find((node: any) => node?.type === 'button' && node?.props?.['aria-label'] === 'Attach file');
    const projectControlsRow = nodes.find((node: any) => node?.props?.['data-testid'] === 'composer-project-controls-row');

    expect(openFolderButton).toBeDefined();
    expect(projectEditorButton).toBeUndefined();
    expect(attachButton).toBeUndefined();
    expect(projectControlsRow).toBeDefined();
    expect(projectControlsRow.props.className).toContain('flex-nowrap');
  });

  it('fires the project-folder callback when a project path is selected', () => {
    const onOpenProjectFolder = vi.fn();
    const tree: any = ComposerBar({
      onSubmitMessage: (event: Event) => event.preventDefault(),
      composerTextareaRef: null,
      composer: 'hello',
      onComposerChange: () => { },
      onComposerKeyDown: () => { },
      onOpenProjectFolder,
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

    openFolderButton.props.onClick();

    expect(onOpenProjectFolder).toHaveBeenCalledTimes(1);
  });
});