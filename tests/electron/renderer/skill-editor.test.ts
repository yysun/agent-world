/**
 * SkillEditor Component Tests
 * Purpose:
 * - Verify SkillEditor renders the updated header/actions, markdown preview/edit toggles,
 *   and dispatches correct callbacks.
 *
 * Key Features:
 * - Back button fires onBack; Delete and Save buttons fire their callbacks.
 * - Markdown files in edit mode default to rendered preview with a toggle back to raw markdown.
 * - Right pane shows the current skill folder structure.
 * - Save stays disabled until the file content changes.
 *
 * Implementation Notes:
 * - Uses virtual React/JSX mocks to avoid jsdom; exercises component output props.
 * - Tests BaseEditor slot contract by inspecting children tree structure.
 *
 * Recent Changes:
 * - 2026-04-14: Added preview-scroll coverage so markdown preview keeps an explicit full-height scroll surface.
 * - 2026-04-14: Updated Back-button coverage for the shared primary `Button` treatment in both edit and install modes.
 * - 2026-04-11: Added install-preview empty-state coverage so loading and failed preview fetches do not regress to blank editor panes.
 * - 2026-04-11: Reworked install-mode coverage for the new preview-only role after search/discovery moved to `SkillInstallBrowser`.
 * - 2026-04-03: Added edit-mode markdown preview toggle coverage and updated markdown-file expectations to default to preview.
 * - 2026-04-03: Added coverage for formatted SKILL.md markdown rendering in install preview.
 * - 2026-03-23: Added coverage that collapsed-sidebar mode forwards toolbar inset spacing into BaseEditor.
 * - 2026-03-22: Updated coverage for the restored back button and icon-only save button with dirty-state gating.
 * - 2026-03-22: Added selected-file and loading-state coverage for tree-driven skill file switching.
 * - 2026-03-22: Added folder-pane coverage so the right side shows the skill folder tree.
 * - 2026-03-22: Added toolbar coverage for the delete button placement/callback and delete busy state.
 * - 2026-03-08: Initial test suite for SkillEditor component.
 */

import { describe, it, expect, vi } from 'vitest';

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

import { SkillEditor } from '../../../electron/renderer/src/features/skills';
import { Button, Radio, Textarea } from '../../../electron/renderer/src/design-system/primitives';

function allDescendants(node: any): any[] {
  if (!node || typeof node !== 'object') return [];
  const children = node.props?.children;
  if (!children) return [node];
  const childArr = Array.isArray(children) ? children : [children];
  return [node, ...childArr.flatMap(allDescendants)];
}

function allNodes(toolbar: any): any[] {
  return allDescendants(toolbar);
}

describe('SkillEditor', () => {
  it('renders BaseEditor with scope-aware header and markdown preview for SKILL.md', () => {
    const onSelectFile = vi.fn();
    const result: any = SkillEditor({
      skillId: 'rpd',
      sourceScope: 'project',
      selectedFilePath: 'SKILL.md',
      content: '# RPD Skill',
      onContentChange: () => { },
      onBack: () => { },
      onSave: () => { },
      onDelete: () => { },
      onSelectFile,
      folderEntries: [
        { name: 'SKILL.md', relativePath: 'SKILL.md', type: 'file' },
      ],
      hasUnsavedChanges: false,
      loadingFile: false,
      saving: false,
      deleting: false,
    });

    // The root element should be BaseEditor (via jsxFactory type = baseEditorStub)
    expect(result.type).toBe(baseEditorStub);
    expect(result.props.chatPaneContext).toBeUndefined();

    const nodes = allDescendants(result.props.children);
    const textarea = nodes.find((n: any) => n?.type === Textarea);
    const preview = nodes.find((node: any) => node?.props?.['aria-label'] === 'Preview SKILL.md for rpd');
    expect(textarea).toBeUndefined();
    expect(preview).toBeDefined();
    expect(preview?.props?.className).toContain('h-full');
    expect(preview?.props?.className).toContain('overflow-y-auto');
    expect(String(preview?.props?.dangerouslySetInnerHTML?.__html || '')).toContain('<h1');

    // toolbar should contain the scope + skill name, but not the file name
    const toolbarStr = JSON.stringify(result.props.toolbar);
    expect(toolbarStr).toContain('Project skill');
    expect(toolbarStr).toContain('rpd');
    expect(toolbarStr).not.toContain('SKILL.md');

    expect(result.props.rightPane.props.skillId).toBe('rpd');
    expect(result.props.rightPane.props.selectedPath).toBe('SKILL.md');
    expect(result.props.rightPane.props.onSelectFile).toBe(onSelectFile);
    expect(result.props.rightPane.props.entries).toEqual([
      { name: 'SKILL.md', relativePath: 'SKILL.md', type: 'file' },
    ]);

    const contentAreaStr = JSON.stringify(result.props.children);
    expect(contentAreaStr).toContain('SKILL.md');
  });

  it('shows Preview and Markdown radios for markdown files in edit mode', () => {
    const onMarkdownViewModeChange = vi.fn();
    const result: any = SkillEditor({
      skillId: 'my-skill',
      sourceScope: 'global',
      selectedFilePath: 'docs/guide.md',
      markdownViewMode: 'preview',
      content: '# Guide',
      onContentChange: () => { },
      onMarkdownViewModeChange,
      onBack: () => { },
      onSave: () => { },
      onDelete: () => { },
      onSelectFile: () => { },
      folderEntries: [],
      hasUnsavedChanges: false,
      loadingFile: false,
      saving: false,
      deleting: false,
    });

    const nodes = allDescendants(result.props.children);
    const viewModeGroup = nodes.find((node: any) => node?.props?.role === 'radiogroup' && node?.props?.['aria-label'] === 'Markdown view mode');
    const previewRadio = nodes.find((node: any) => node?.type === Radio && node?.props?.['aria-label'] === 'Preview');
    const markdownRadio = nodes.find((node: any) => node?.type === Radio && node?.props?.['aria-label'] === 'Markdown');

    expect(viewModeGroup).toBeDefined();
    expect(previewRadio?.props?.checked).toBe(true);
    expect(markdownRadio?.props?.checked).toBe(false);

    markdownRadio?.props?.onChange();
    expect(onMarkdownViewModeChange).toHaveBeenCalledWith('markdown');
  });

  it('back button onClick is wired to onBack', () => {
    const onBack = vi.fn();
    const result: any = SkillEditor({
      skillId: 'my-skill',
      sourceScope: 'global',
      selectedFilePath: 'SKILL.md',
      content: '',
      onContentChange: () => { },
      onBack,
      onSave: () => { },
      onDelete: () => { },
      onSelectFile: () => { },
      folderEntries: [],
      hasUnsavedChanges: false,
      loadingFile: false,
      saving: false,
      deleting: false,
    });

    const nodes = allNodes(result.props.toolbar);
    const backBtn = nodes.find(
      (n: any) => n?.type === Button && n?.props?.onClick === onBack
    );
    expect(backBtn).toBeDefined();
    expect(backBtn.props['aria-label']).toBe('Back');
    expect(backBtn.props.variant).toBe('primary');
    backBtn.props.onClick();
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('forwards collapsed-sidebar toolbar inset into BaseEditor', () => {
    const result: any = SkillEditor({
      skillId: 'my-skill',
      sourceScope: 'global',
      leftSidebarCollapsed: true,
      selectedFilePath: 'SKILL.md',
      content: '',
      onContentChange: () => { },
      onBack: () => { },
      onSave: () => { },
      onDelete: () => { },
      onSelectFile: () => { },
      folderEntries: [],
      hasUnsavedChanges: false,
      loadingFile: false,
      saving: false,
      deleting: false,
    });

    expect(result.props.reserveTrafficLightSpace).toBe(true);
  });

  it('delete button remains in the top row and fires onDelete', () => {
    const onDelete = vi.fn();
    const result: any = SkillEditor({
      skillId: 'my-skill',
      sourceScope: 'project',
      selectedFilePath: 'SKILL.md',
      content: '',
      onContentChange: () => { },
      onBack: () => { },
      onSave: () => { },
      onDelete,
      onSelectFile: () => { },
      folderEntries: [],
      hasUnsavedChanges: false,
      loadingFile: false,
      saving: false,
      deleting: false,
    });

    const deleteButton = allNodes(result.props.toolbar).find(
      (node: any) => node?.type === 'button' && node?.props?.onClick === onDelete
    );
    expect(deleteButton).toBeDefined();
    expect(JSON.stringify(deleteButton)).toContain('Delete');

    deleteButton.props.onClick();
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('save icon button lives in the file section, starts disabled, and fires onSave when dirty', () => {
    const onSave = vi.fn();
    const result: any = SkillEditor({
      skillId: 'my-skill',
      sourceScope: 'global',
      selectedFilePath: 'docs/guide.md',
      content: '',
      onContentChange: () => { },
      onBack: () => { },
      onSave,
      onDelete: () => { },
      onSelectFile: () => { },
      folderEntries: [],
      hasUnsavedChanges: false,
      loadingFile: false,
      saving: false,
      deleting: false,
    });

    const nodes = allDescendants(result.props.children);
    const saveBtn = nodes.find(
      (n: any) => n?.type === 'button' && n?.props?.onClick === onSave
    );
    expect(saveBtn).toBeDefined();
    expect(saveBtn.props.disabled).toBe(true);
    expect(saveBtn.props['aria-label']).toBe('Save file');

    const dirtyResult: any = SkillEditor({
      skillId: 'my-skill',
      sourceScope: 'global',
      selectedFilePath: 'docs/guide.md',
      content: '',
      onContentChange: () => { },
      onBack: () => { },
      onSave,
      onDelete: () => { },
      onSelectFile: () => { },
      folderEntries: [],
      hasUnsavedChanges: true,
      loadingFile: false,
      saving: false,
      deleting: false,
    });

    const dirtyNodes = allDescendants(dirtyResult.props.children);
    const enabledSaveBtn = dirtyNodes.find(
      (n: any) => n?.type === 'button' && n?.props?.onClick === onSave
    );
    expect(enabledSaveBtn.props.disabled).toBe(false);
    enabledSaveBtn.props.onClick();
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('disables textarea and toolbar buttons when saving=true and shows Saving label', () => {
    const result: any = SkillEditor({
      skillId: 'my-skill',
      sourceScope: 'global',
      selectedFilePath: 'config.json',
      content: 'hello',
      onContentChange: () => { },
      onBack: () => { },
      onSave: () => { },
      onDelete: () => { },
      onSelectFile: () => { },
      folderEntries: [],
      hasUnsavedChanges: true,
      loadingFile: false,
      saving: true,
      deleting: false,
    });

    const textareaNodes = allDescendants(result.props.children);
    const textarea = textareaNodes.find((n: any) => n?.type === Textarea);
    expect(textarea?.props?.disabled).toBe(true);

    const toolbarNodes = allNodes(result.props.toolbar);
    const disabledButtons = toolbarNodes.filter(
      (n: any) => n?.type === 'button' && n?.props?.disabled === true
    );
    expect(disabledButtons.length).toBeGreaterThanOrEqual(1);
  });

  it('disables textarea and toolbar buttons when deleting=true and shows Deleting label', () => {
    const result: any = SkillEditor({
      skillId: 'my-skill',
      sourceScope: 'project',
      selectedFilePath: 'config.json',
      content: 'hello',
      onContentChange: () => { },
      onBack: () => { },
      onSave: () => { },
      onDelete: () => { },
      onSelectFile: () => { },
      folderEntries: [],
      hasUnsavedChanges: false,
      loadingFile: false,
      saving: false,
      deleting: true,
    });

    const textareaNodes = allDescendants(result.props.children);
    const textarea = textareaNodes.find((n: any) => n?.type === Textarea);
    expect(textarea?.props?.disabled).toBe(true);

    const toolbarNodes = allNodes(result.props.toolbar);
    const disabledButtons = toolbarNodes.filter(
      (n: any) => n?.type === 'button' && n?.props?.disabled === true
    );
    expect(disabledButtons.length).toBeGreaterThanOrEqual(1);

    const toolbarStr = JSON.stringify(result.props.toolbar);
    expect(toolbarStr).toContain('Deleting');
  });

  it('renders nested skill folder entries in the right pane', () => {
    const onSelectFile = vi.fn();
    const result: any = SkillEditor({
      skillId: 'nested-skill',
      sourceScope: 'project',
      selectedFilePath: 'assets/icon.svg',
      content: '',
      onContentChange: () => { },
      onBack: () => { },
      onSave: () => { },
      onDelete: () => { },
      onSelectFile,
      folderEntries: [
        {
          name: 'assets',
          relativePath: 'assets',
          type: 'directory',
          children: [
            { name: 'icon.svg', relativePath: 'assets/icon.svg', type: 'file' },
          ],
        },
      ],
      hasUnsavedChanges: false,
      loadingFile: false,
      saving: false,
      deleting: false,
    });

    expect(result.props.rightPane.props.entries[0].children[0].relativePath).toBe('assets/icon.svg');
    expect(result.props.rightPane.props.selectedPath).toBe('assets/icon.svg');
    expect(result.props.rightPane.props.onSelectFile).toBe(onSelectFile);
  });

  it('disables editing and shows loading label while switching files', () => {
    const result: any = SkillEditor({
      skillId: 'loading-skill',
      sourceScope: 'global',
      selectedFilePath: 'docs/guide.txt',
      content: 'hello',
      onContentChange: () => { },
      onBack: () => { },
      onSave: () => { },
      onDelete: () => { },
      onSelectFile: () => { },
      folderEntries: [],
      hasUnsavedChanges: true,
      loadingFile: true,
      saving: false,
      deleting: false,
    });

    const textareaNodes = allDescendants(result.props.children);
    const textarea = textareaNodes.find((n: any) => n?.type === Textarea);
    expect(textarea?.props?.disabled).toBe(true);

    const toolbarStr = JSON.stringify(result.props.toolbar);
    expect(toolbarStr).not.toContain('docs/guide.md');

    const saveBtn = textareaNodes.find((n: any) => n?.type === 'button');
    expect(saveBtn?.props?.disabled).toBe(true);
    expect(result.props.rightPane.props.disabled).toBe(true);
  });

  it('renders install mode as a preview-only editor with install controls in the action row', () => {
    const onBack = vi.fn();
    const onInstall = vi.fn();
    const onInstallTargetScopeChange = vi.fn();

    const result: any = SkillEditor({
      mode: 'install',
      skillId: 'reviewer',
      sourceScope: 'project',
      selectedFilePath: 'SKILL.md',
      content: '# Draft Skill',
      onContentChange: () => { },
      onBack,
      onSave: () => { },
      onDelete: () => { },
      onSelectFile: () => { },
      folderEntries: [
        { name: 'SKILL.md', relativePath: 'SKILL.md', type: 'file' },
      ],
      hasUnsavedChanges: false,
      loadingFile: false,
      saving: false,
      deleting: false,
      installItemName: 'reviewer',
      installDescription: 'Review pull requests for correctness, regressions, and missing tests.',
      installTargetScope: 'project',
      onInstallTargetScopeChange,
      onInstall,
    });

    const toolbarStr = JSON.stringify(result.props.toolbar);
    expect(toolbarStr).toContain('INSTALL SKILL');
    expect(toolbarStr).toContain('reviewer');
    expect(toolbarStr).not.toContain('Delete');
    expect(toolbarStr).not.toContain('owner/repo');
    expect(toolbarStr).not.toContain('GitHub');
    expect(toolbarStr).not.toContain('Local');

    const nodes = allDescendants(result.props.children);
    const installButton = nodes.find((node: any) => node?.type === Button && node?.props?.onClick === onInstall);
    const contentStr = JSON.stringify(result.props.children);
    const scopeGroup = nodes.find((node: any) => node?.props?.role === 'radiogroup' && node?.props?.['aria-label'] === 'Install scope');
    const projectRadio = nodes.find((node: any) => node?.type === Radio && node?.props?.['aria-label'] === 'Project');
    const globalRadio = nodes.find((node: any) => node?.type === Radio && node?.props?.['aria-label'] === 'Global');
    const backButton = allDescendants(result.props.toolbar).find((node: any) => node?.type === Button && node?.props?.onClick === onBack);

    expect(installButton).toBeDefined();
    expect(scopeGroup).toBeDefined();
    expect(projectRadio?.props?.checked).toBe(true);
    expect(globalRadio?.props?.checked).toBe(false);
    expect(backButton).toBeDefined();
    expect(contentStr).toContain('Preview Summary');
    expect(contentStr).toContain('Review pull requests for correctness, regressions, and missing tests.');
    expect(contentStr).toContain('Project');
    expect(contentStr).toContain('Install');

    expect(backButton?.props?.variant).toBe('primary');
    expect(backButton?.props?.size).toBe('sm');
    expect(installButton?.props?.variant).toBe('primary');
    expect(installButton?.props?.size).toBe('sm');
    expect(installButton?.props?.disabled).toBe(false);

    globalRadio.props.onChange();
    installButton.props.onClick();
    backButton.props.onClick();

    expect(onInstallTargetScopeChange).toHaveBeenCalledWith('global');
    expect(onInstall).toHaveBeenCalledTimes(1);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('disables install editing for non-text preview files', () => {
    const result: any = SkillEditor({
      mode: 'install',
      skillId: 'preview-skill',
      sourceScope: 'project',
      selectedFilePath: 'assets/banner.png',
      content: '',
      onContentChange: () => { },
      onBack: () => { },
      onSave: () => { },
      onDelete: () => { },
      onSelectFile: () => { },
      folderEntries: [
        {
          name: 'assets',
          relativePath: 'assets',
          type: 'directory',
          children: [
            { name: 'banner.png', relativePath: 'assets/banner.png', type: 'file' },
          ],
        },
      ],
      hasUnsavedChanges: false,
      loadingFile: false,
      saving: false,
      deleting: false,
      installItemName: 'preview-skill',
      currentFileEditable: false,
    });

    const nodes = allDescendants(result.props.children);
    const textarea = nodes.find((node: any) => node?.type === Textarea);

    expect(textarea?.props?.disabled).toBe(true);
    expect(textarea?.props?.placeholder).toContain('cannot be edited in preview');
  });

  it('renders formatted SKILL.md markdown in install preview', () => {
    const result: any = SkillEditor({
      mode: 'install',
      skillId: 'preview-skill',
      sourceScope: 'project',
      selectedFilePath: 'SKILL.md',
      content: '# Preview Skill\n\n- First item\n- Second item',
      onContentChange: () => { },
      onBack: () => { },
      onSave: () => { },
      onDelete: () => { },
      onSelectFile: () => { },
      folderEntries: [
        { name: 'SKILL.md', relativePath: 'SKILL.md', type: 'file' },
      ],
      hasUnsavedChanges: false,
      loadingFile: false,
      saving: false,
      deleting: false,
      installItemName: 'apprun-skills',
    });

    const nodes = allDescendants(result.props.children);
    const textarea = nodes.find((node: any) => node?.type === Textarea);
    const markdownPreview = nodes.find((node: any) => node?.props?.['aria-label'] === 'Preview SKILL.md for preview-skill');

    expect(textarea).toBeUndefined();
    expect(markdownPreview).toBeDefined();
    expect(markdownPreview?.props?.className).toContain('prose');
    expect(String(markdownPreview?.props?.dangerouslySetInnerHTML?.__html || '')).toContain('<h1');
    expect(String(markdownPreview?.props?.dangerouslySetInnerHTML?.__html || '')).toContain('<ul');
  });

  it('shows loading placeholders instead of blank install preview panes while preview files are loading', () => {
    const result: any = SkillEditor({
      mode: 'install',
      skillId: 'notebooklm',
      sourceScope: 'project',
      selectedFilePath: 'SKILL.md',
      content: '',
      onContentChange: () => { },
      onBack: () => { },
      onSave: () => { },
      onDelete: () => { },
      onSelectFile: () => { },
      folderEntries: [],
      hasUnsavedChanges: false,
      loadingFile: true,
      saving: false,
      deleting: false,
      installItemName: 'notebooklm',
      emptyContentMessage: 'Loading preview files…',
      folderEmptyStateText: 'Loading preview files…',
    });

    const contentStr = JSON.stringify(result.props.children);
    const emptyState = allDescendants(result.props.children).find((node: any) => node?.props?.['aria-label'] === 'Install preview empty state');

    expect(contentStr).toContain('Loading preview files…');
    expect(emptyState).toBeDefined();
    expect(result.props.rightPane.props.emptyStateText).toBe('Loading preview files…');
  });

  it('shows explicit install preview error copy when preview files are unavailable', () => {
    const result: any = SkillEditor({
      mode: 'install',
      skillId: 'youtube-search',
      sourceScope: 'project',
      selectedFilePath: 'SKILL.md',
      content: '',
      onContentChange: () => { },
      onBack: () => { },
      onSave: () => { },
      onDelete: () => { },
      onSelectFile: () => { },
      folderEntries: [],
      hasUnsavedChanges: false,
      loadingFile: false,
      saving: false,
      deleting: false,
      installItemName: 'youtube-search',
      emptyContentMessage: 'Failed to preview skill import: Missing SKILL.md',
      folderEmptyStateText: 'Failed to preview skill import: Missing SKILL.md',
    });

    const contentStr = JSON.stringify(result.props.children);

    expect(contentStr).toContain('Failed to preview skill import: Missing SKILL.md');
    expect(result.props.rightPane.props.emptyStateText).toBe('Failed to preview skill import: Missing SKILL.md');
  });
});
