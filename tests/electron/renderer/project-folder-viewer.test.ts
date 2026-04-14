/**
 * ProjectFolderViewer Component Tests
 * Purpose:
 * - Verify the Electron project folder viewer renders the split-pane workspace editor correctly.
 *
 * Key Features:
 * - Confirms BaseEditor slot usage and right-pane tree wiring.
 * - Confirms editable text content renders in the left pane.
 * - Confirms markdown files expose Preview/Markdown mode controls.
 * - Confirms unsupported-file placeholder messaging remains explicit.
 *
 * Implementation Notes:
 * - Uses virtual React/JSX mocks to inspect the returned element tree directly.
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

vi.mock('../../../electron/renderer/src/utils/markdown', () => ({
  renderMarkdown: (value: string) => `<p>${value}</p>`,
}));

import { ProjectFolderViewer } from '../../../electron/renderer/src/features/projects';
import { Button } from '../../../electron/renderer/src/design-system/primitives';

function allDescendants(node: any): any[] {
  if (!node || typeof node !== 'object') return [];
  const children = node.props?.children;
  if (!children) return [node];
  const childArr = Array.isArray(children) ? children : [children];
  return [node, ...childArr.flatMap(allDescendants)];
}

describe('ProjectFolderViewer', () => {
  it('renders BaseEditor with project tree pane and editable markdown controls', () => {
    const onSelectFile = vi.fn();
    const onContentChange = vi.fn();
    const onMarkdownViewModeChange = vi.fn();
    const onSave = vi.fn();
    const result: any = ProjectFolderViewer({
      rootPath: '/Users/test/project',
      entries: [
        { name: 'src', relativePath: 'src', type: 'directory', children: [{ name: 'index.ts', relativePath: 'src/index.ts', type: 'file' }] },
        { name: 'README.md', relativePath: 'README.md', type: 'file' },
      ],
      selectedFilePath: 'README.md',
      fileResult: { status: 'ok', relativePath: 'README.md', content: '# Project', sizeBytes: 9 },
      content: '# Project',
      markdownViewMode: 'markdown',
      loadingStructure: false,
      loadingFile: false,
      saving: false,
      hasUnsavedChanges: true,
      onSelectFile,
      onContentChange,
      onMarkdownViewModeChange,
      onSave,
      onBack: () => { },
    });

    expect(result.type).toBe(baseEditorStub);
    expect(result.props.rightPane.props.rootPath).toBe('/Users/test/project');
    expect(result.props.rightPane.props.selectedPath).toBe('README.md');
    expect(result.props.rightPane.props.onSelectFile).toBe(onSelectFile);

    const toolbarNodes = allDescendants(result.props.toolbar);
    const contentNodes = allDescendants(result.props.children);
    const nodes = [...toolbarNodes, ...contentNodes];
    const textarea = nodes.find((node: any) => node?.props?.value === '# Project' && typeof node?.props?.onChange === 'function');
    const saveButton = contentNodes.find((node: any) => node?.type === 'button' && node?.props?.['aria-label'] === 'Save file');
    const markdownRadio = nodes.find((node: any) => node?.props?.['aria-label'] === 'Markdown');
    const readonlyHeader = nodes.find((node: any) => typeof node?.props?.children === 'string' && node.props.children === 'Read Only');
    const inlineSelectedFileLabel = contentNodes.find((node: any) => node?.type === 'p' && node?.props?.children === 'README.md');
    const toolbarSaveButton = toolbarNodes.find((node: any) => node?.type === 'button' && node?.props?.['aria-label'] === 'Save file');
    const backButton = toolbarNodes.find((node: any) => node?.type === Button && node?.props?.['aria-label'] === 'Back');
    const editorBody = contentNodes.find((node: any) => typeof node?.props?.className === 'string' && node.props.className.includes('min-h-0 flex-1 overflow-hidden'));

    expect(textarea).toBeDefined();
    expect(textarea.props.value).toBe('# Project');
    expect(saveButton).toBeDefined();
    expect(saveButton.props.disabled).toBe(false);
    expect(markdownRadio).toBeDefined();
    expect(readonlyHeader).toBeUndefined();
    expect(inlineSelectedFileLabel).toBeDefined();
    expect(toolbarSaveButton).toBeUndefined();
    expect(backButton?.props?.variant).toBe('primary');
    expect(editorBody).toBeDefined();

    textarea.props.onChange({ target: { value: '# Updated' } });
    markdownRadio.props.onChange();
    saveButton.props.onClick();

    expect(onContentChange).toHaveBeenCalledWith('# Updated');
    expect(onMarkdownViewModeChange).toHaveBeenCalledWith('markdown');
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('renders markdown preview for markdown files in preview mode', () => {
    const result: any = ProjectFolderViewer({
      rootPath: '/Users/test/project',
      entries: [{ name: 'README.md', relativePath: 'README.md', type: 'file' }],
      selectedFilePath: 'README.md',
      fileResult: { status: 'ok', relativePath: 'README.md', content: '# Project', sizeBytes: 9 },
      content: '# Project',
      markdownViewMode: 'preview',
      loadingStructure: false,
      loadingFile: false,
      saving: false,
      hasUnsavedChanges: false,
      onSelectFile: () => { },
      onContentChange: () => { },
      onMarkdownViewModeChange: () => { },
      onSave: () => { },
      onBack: () => { },
    });

    const nodes = allDescendants(result.props.children);
    const preview = nodes.find((node: any) => node?.props?.['aria-label'] === 'Preview README.md');

    expect(preview).toBeDefined();
    expect(preview.props.className).toContain('h-full');
    expect(preview.props.className).toContain('overflow-y-auto');
    expect(preview.props.dangerouslySetInnerHTML.__html).toContain('<p># Project</p>');
  });

  it('shows explicit placeholder text for unsupported files', () => {
    const result: any = ProjectFolderViewer({
      rootPath: '/Users/test/project',
      entries: [{ name: 'archive.zip', relativePath: 'archive.zip', type: 'file' }],
      selectedFilePath: 'archive.zip',
      fileResult: { status: 'binary', relativePath: 'archive.zip', sizeBytes: 128 },
      content: '',
      markdownViewMode: 'preview',
      loadingStructure: false,
      loadingFile: false,
      saving: false,
      hasUnsavedChanges: false,
      onSelectFile: () => { },
      onContentChange: () => { },
      onMarkdownViewModeChange: () => { },
      onSave: () => { },
      onBack: () => { },
    });

    const contentText = JSON.stringify(result.props.children);
    expect(contentText).toContain('archive.zip looks like a binary file');
  });
});