/**
 * SkillFolderPane Component Tests
 * Purpose:
 * - Verify the skill folder pane renders a tree view without raw DIR/FILE labels.
 *
 * Key Features:
 * - Confirms tree semantics are exposed on the root container.
 * - Verifies file rows keep the click callback wired with the selected relative path.
 * - Guards against regressing to textual DIR/FILE badges.
 *
 * Implementation Notes:
 * - Uses virtual React/JSX mocks to inspect element output without jsdom.
 * - Exercises the component boundary directly instead of going through SkillEditor.
 *
 * Recent Changes:
 * - 2026-03-22: Added disabled-state coverage so busy editor work blocks file switching from the tree.
 * - 2026-03-22: Added focused coverage for icon-based tree rows and file selection callbacks.
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

import { SkillFolderPane } from '../../../electron/renderer/src/features/skills';

function allDescendants(node: any): any[] {
  if (!node || typeof node !== 'object') return [];
  const children = node.props?.children;
  if (!children) return [node];
  const childArray = Array.isArray(children) ? children : [children];
  return [node, ...childArray.flatMap(allDescendants)];
}

describe('SkillFolderPane', () => {
  it('renders an icon-based tree view without DIR and FILE labels', () => {
    const onSelectFile = vi.fn();
    const result: any = SkillFolderPane({
      skillId: 'openai',
      selectedPath: 'scripts/generate_openai_yaml.py',
      onSelectFile,
      entries: [
        {
          name: 'scripts',
          relativePath: 'scripts',
          type: 'directory',
          children: [
            {
              name: 'generate_openai_yaml.py',
              relativePath: 'scripts/generate_openai_yaml.py',
              type: 'file',
            },
          ],
        },
        {
          name: 'SKILL.md',
          relativePath: 'SKILL.md',
          type: 'file',
        },
      ],
    });

    const nodes = allDescendants(result);
    const treeNode = nodes.find((node: any) => node?.props?.role === 'tree');
    expect(treeNode).toBeDefined();
    expect(treeNode.props['aria-label']).toBe('openai file tree');

    const output = JSON.stringify(result);
    expect(output).toContain('scripts');
    expect(output).toContain('generate_openai_yaml.py');
    expect(output).not.toContain('"DIR"');
    expect(output).not.toContain('"FILE"');
  });

  it('keeps file rows clickable with the relative path payload', () => {
    const onSelectFile = vi.fn();
    const result: any = SkillFolderPane({
      skillId: 'openai',
      selectedPath: 'openai.yaml',
      onSelectFile,
      entries: [
        {
          name: 'openai.yaml',
          relativePath: 'openai.yaml',
          type: 'file',
        },
      ],
    });

    const nodes = allDescendants(result);
    const fileButton = nodes.find((node: any) => node?.type === 'button' && node?.props?.role === 'treeitem');
    expect(fileButton).toBeDefined();
    expect(fileButton.props['aria-selected']).toBe(true);

    fileButton.props.onClick();
    expect(onSelectFile).toHaveBeenCalledWith('openai.yaml');
  });

  it('disables file rows while the editor is busy', () => {
    const onSelectFile = vi.fn();
    const result: any = SkillFolderPane({
      skillId: 'openai',
      selectedPath: 'openai.yaml',
      onSelectFile,
      disabled: true,
      entries: [
        {
          name: 'openai.yaml',
          relativePath: 'openai.yaml',
          type: 'file',
        },
      ],
    });

    const nodes = allDescendants(result);
    const treeNode = nodes.find((node: any) => node?.props?.role === 'tree');
    const fileButton = nodes.find((node: any) => node?.type === 'button' && node?.props?.role === 'treeitem');

    expect(treeNode?.props?.['aria-disabled']).toBe('true');
    expect(fileButton?.props?.disabled).toBe(true);
  });
});