/**
 * SkillEditor Component Tests
 * Purpose:
 * - Verify SkillEditor renders the updated header/actions, textarea content,
 *   and dispatches correct callbacks.
 *
 * Key Features:
 * - Back button fires onBack; Delete and Save buttons fire their callbacks.
 * - Textarea displays current content via value prop.
 * - Right pane shows the current skill folder structure.
 * - Save stays disabled until the file content changes.
 *
 * Implementation Notes:
 * - Uses virtual React/JSX mocks to avoid jsdom; exercises component output props.
 * - Tests BaseEditor slot contract by inspecting children tree structure.
 *
 * Recent Changes:
 * - 2026-03-29: Updated GitHub sizing coverage for the shared repo+skill flex group that prevents left-side clipping.
 * - 2026-03-29: Tightened GitHub primary-row sizing coverage for the compact repo and skill widths.
 * - 2026-03-29: Added GitHub no-wrap primary-row sizing coverage so the skill selector stays beside the repo field.
 * - 2026-03-29: Replaced install-scope select assertions with radio-group coverage beside the action buttons.
 * - 2026-03-29: Added coverage for the install-mode back button vertical offset.
 * - 2026-03-29: Added coverage for the install toolbar primary-row grouping in GitHub and local source modes.
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
import { Radio, Select, Textarea } from '../../../electron/renderer/src/design-system/primitives';

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

function hasClassName(node: any, className: string): boolean {
  return typeof node?.props?.className === 'string' && node.props.className.includes(className);
}

describe('SkillEditor', () => {
  it('renders BaseEditor with scope-aware header and right pane tree', () => {
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

    // The textarea in children should have the content as value
    const nodes = allDescendants(result.props.children);
    const textarea = nodes.find((n: any) => n?.type === Textarea);
    expect(textarea).toBeDefined();
    expect(textarea.props.value).toBe('# RPD Skill');
    expect(textarea.props.disabled).toBe(false);

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
      (n: any) => n?.type === 'button' && n?.props?.onClick === onBack
    );
    expect(backBtn).toBeDefined();
    expect(backBtn.props['aria-label']).toBe('Back');
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

    const buttons = allNodes(result.props.toolbar).filter((n: any) => n?.type === 'button');
    expect(JSON.stringify(buttons[1])).toContain('Delete');

    buttons[1].props.onClick();
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
      selectedFilePath: 'SKILL.md',
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
      selectedFilePath: 'SKILL.md',
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
      selectedFilePath: 'docs/guide.md',
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

  it('defaults install mode to GitHub controls in the toolbar without preview labeling', () => {
    const onPreviewInstall = vi.fn();
    const onInstall = vi.fn();
    const onBrowseInstallSource = vi.fn();
    const onLoadInstallOptions = vi.fn();
    const onInstallTargetScopeChange = vi.fn();

    const result: any = SkillEditor({
      mode: 'install',
      skillId: '',
      sourceScope: 'project',
      selectedFilePath: 'SKILL.md',
      content: '# Draft Skill',
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
      installRepo: 'yysun/awesome-agent-world',
      installItemName: 'reviewer',
      installOptions: ['planner', 'reviewer'],
      installTargetScope: 'project',
      onInstallTargetScopeChange,
      onBrowseInstallSource,
      onLoadInstallOptions,
      onPreviewInstall,
      onInstall,
      hasInstallPreview: true,
    });

    const toolbarStr = JSON.stringify(result.props.toolbar);
    expect(toolbarStr).toContain('INSTALL SKILL');
    expect(toolbarStr).toContain('GitHub');
    expect(toolbarStr).toContain('owner/repo');
    expect(toolbarStr).toContain('Project');
    expect(toolbarStr).toContain('Load skills from repo');
    expect(toolbarStr).toContain('M21 12');
    expect(toolbarStr).not.toContain('Delete');
    expect(toolbarStr).not.toContain('Skill preview');

    const nodes = allDescendants(result.props.children);
    const previewButton = nodes.find((node: any) => node?.type === 'button' && node?.props?.onClick === onPreviewInstall);
    const installButton = nodes.find((node: any) => node?.type === 'button' && node?.props?.onClick === onInstall);
    const browseButton = nodes.find((node: any) => node?.type === 'button' && node?.props?.onClick === onBrowseInstallSource);
    const contentStr = JSON.stringify(result.props.children);

    expect(previewButton).toBeUndefined();
    expect(installButton).toBeUndefined();
    expect(browseButton).toBeUndefined();
    expect(contentStr).not.toContain('Preview a local or GitHub skill to inspect its files before installing.');
    expect(contentStr).not.toContain('Skill preview');

    const toolbarNodes = allDescendants(result.props.toolbar);
    const primaryRow = toolbarNodes.find((node: any) => hasClassName(node, 'install-toolbar-primary-row'));
    const actionRow = toolbarNodes.find((node: any) => hasClassName(node, 'install-toolbar-action-row'));
    const toolbarPreviewButton = toolbarNodes.find((node: any) => node?.type === 'button' && node?.props?.onClick === onPreviewInstall);
    const toolbarInstallButton = toolbarNodes.find((node: any) => node?.type === 'button' && node?.props?.onClick === onInstall);
    const toolbarLoadButton = toolbarNodes.find((node: any) => node?.type === 'button' && node?.props?.onClick === onLoadInstallOptions);
    const toolbarBrowseButton = toolbarNodes.find((node: any) => node?.type === 'button' && node?.props?.onClick === onBrowseInstallSource);
    const toolbarSkillSelect = toolbarNodes.find((node: any) => node?.type === Select && node?.props?.['aria-label'] === 'GitHub skill');
    const scopeSelect = toolbarNodes.find((node: any) => node?.type === Select && node?.props?.['aria-label'] === 'Install scope');
    const backButton = toolbarNodes.find((node: any) => node?.type === 'button' && node?.props?.['aria-label'] === 'Back');

    expect(primaryRow).toBeDefined();
    expect(actionRow).toBeDefined();
    expect(JSON.stringify(primaryRow)).toContain('INSTALL SKILL');
    expect(JSON.stringify(primaryRow)).toContain('owner/repo');
    expect(JSON.stringify(primaryRow)).toContain('GitHub skill');
    expect(JSON.stringify(primaryRow)).not.toContain('Install scope');
    expect(primaryRow?.props?.className).toContain('flex-nowrap');
    expect(JSON.stringify(actionRow)).toContain('Choose a repo and skill, then confirm the install scope.');
    expect(toolbarPreviewButton).toBeDefined();
    expect(toolbarInstallButton).toBeDefined();
    expect(toolbarInstallButton.props.disabled).toBe(false);
    expect(toolbarLoadButton).toBeDefined();
    expect(toolbarBrowseButton).toBeUndefined();
    expect(toolbarSkillSelect).toBeDefined();
    expect(backButton?.props?.className).toContain('mt-2');
    expect(scopeSelect).toBeUndefined();

    const scopeGroup = toolbarNodes.find((node: any) => node?.props?.role === 'radiogroup' && node?.props?.['aria-label'] === 'Install scope');
    const projectRadio = toolbarNodes.find((node: any) => node?.type === Radio && node?.props?.['aria-label'] === 'Project');
    const globalRadio = toolbarNodes.find((node: any) => node?.type === Radio && node?.props?.['aria-label'] === 'Global');
    const repoField = toolbarNodes.find((node: any) => hasClassName(node, 'min-w-0 flex-1'));

    expect(scopeGroup).toBeDefined();
    expect(JSON.stringify(actionRow)).toContain('Install scope');
    expect(projectRadio).toBeDefined();
    expect(projectRadio?.props?.checked).toBe(true);
    expect(globalRadio).toBeDefined();
    expect(globalRadio?.props?.checked).toBe(false);
    expect(repoField).toBeDefined();
    expect(toolbarSkillSelect?.props?.className).toContain('w-[132px]');

    toolbarLoadButton.props.onClick();
    globalRadio.props.onChange();
    toolbarPreviewButton.props.onClick();
    toolbarInstallButton.props.onClick();

    expect(onLoadInstallOptions).toHaveBeenCalledTimes(1);
    expect(onInstallTargetScopeChange).toHaveBeenCalledWith('global');
    expect(onPreviewInstall).toHaveBeenCalledTimes(1);
    expect(onInstall).toHaveBeenCalledTimes(1);
    expect(onBrowseInstallSource).toHaveBeenCalledTimes(0);
  });

  it('keeps local install path and scope in the primary toolbar row', () => {
    const onBrowseInstallSource = vi.fn();

    const result: any = SkillEditor({
      mode: 'install',
      skillId: '',
      sourceScope: 'project',
      selectedFilePath: 'SKILL.md',
      content: '# Draft Skill',
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
      installSourceType: 'local',
      installSourcePath: '/tmp/my-skill',
      installTargetScope: 'global',
      onBrowseInstallSource,
    });

    const toolbarNodes = allDescendants(result.props.toolbar);
    const primaryRow = toolbarNodes.find((node: any) => hasClassName(node, 'install-toolbar-primary-row'));
    const actionRow = toolbarNodes.find((node: any) => hasClassName(node, 'install-toolbar-action-row'));
    const browseButton = toolbarNodes.find((node: any) => node?.type === 'button' && node?.props?.onClick === onBrowseInstallSource);

    expect(primaryRow).toBeDefined();
    expect(JSON.stringify(primaryRow)).toContain('INSTALL SKILL');
    expect(JSON.stringify(primaryRow)).toContain('Skill folder path');
    expect(browseButton).toBeDefined();
    expect(JSON.stringify(primaryRow)).not.toContain('Install scope');
    expect(JSON.stringify(actionRow)).toContain('Choose a local skill folder, then confirm the install scope.');

    browseButton.props.onClick();
    expect(onBrowseInstallSource).toHaveBeenCalledTimes(1);
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
      installRepo: 'yysun/awesome-agent-world',
      installItemName: 'preview-skill',
      installOptions: ['preview-skill'],
      hasInstallPreview: true,
      currentFileEditable: false,
    });

    const nodes = allDescendants(result.props.children);
    const textarea = nodes.find((node: any) => node?.type === Textarea);

    expect(textarea?.props?.disabled).toBe(true);
    expect(textarea?.props?.placeholder).toContain('cannot be edited in preview');
  });
});
