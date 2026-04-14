/**
 * ProjectFolderPane Component Tests
 * Purpose:
 * - Verify the project folder tree renders file rows without the old leading dash marker.
 *
 * Key Features:
 * - Confirms file rows remain clickable and selection-aware.
 * - Confirms the decorative dash spacer is no longer rendered ahead of file names.
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

import ProjectFolderPane from '../../../electron/renderer/src/features/projects/components/ProjectFolderPane';

function allDescendants(node: any): any[] {
  if (!node || typeof node !== 'object') return [];
  const children = node.props?.children;
  if (!children) return [node];
  const childArr = Array.isArray(children) ? children : [children];
  return [node, ...childArr.flatMap(allDescendants)];
}

describe('ProjectFolderPane', () => {
  it('renders clickable file rows without the old dash spacer', () => {
    const onSelectFile = vi.fn();
    const result: any = ProjectFolderPane({
      rootPath: '/Users/test/project',
      selectedPath: 'agents/codex/config.json',
      onSelectFile,
      disabled: false,
      entries: [
        {
          name: 'agents',
          relativePath: 'agents',
          type: 'directory',
          children: [
            {
              name: 'codex',
              relativePath: 'agents/codex',
              type: 'directory',
              children: [
                { name: 'config.json', relativePath: 'agents/codex/config.json', type: 'file' },
              ],
            },
          ],
        },
      ],
    });

    const nodes = allDescendants(result);
    const fileButton = nodes.find((node: any) => (
      node?.type === 'button'
      && node?.props?.role === 'treeitem'
      && JSON.stringify(node.props.children).includes('config.json')
    ));

    expect(fileButton).toBeDefined();
    expect(fileButton.props['aria-selected']).toBe(true);
    expect(JSON.stringify(fileButton.props.children)).not.toContain('h-px w-2 bg-current');

    fileButton.props.onClick();
    expect(onSelectFile).toHaveBeenCalledWith('agents/codex/config.json');
  });
});