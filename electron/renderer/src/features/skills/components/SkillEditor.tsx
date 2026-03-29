/**
 * SkillEditor Component
 * Purpose:
 * - Editor UI for reading and saving files inside a skill folder.
 *
 * Key Features:
 * - Toolbar with back button plus scope-aware skill title and delete action.
 * - Full-height textarea for editing the currently selected skill file.
 * - Right pane shows the current skill folder structure as a tree view.
 * - Calls `onSave` / `onDelete`; save stays disabled until file content changes.
 *
 * Implementation Notes:
 * - Controlled component: content is passed in as prop and managed by App state.
 * - Saving state (spinner / disabled) controlled via `saving` prop and `hasUnsavedChanges`.
 * - Back button fires `onBack` without prompting (unsaved changes are parent's concern).
 *
 * Recent Changes:
 * - 2026-03-29: Reworked the GitHub primary-row sizing so the repo field can shrink inside a shared flex group instead of clipping the left side.
 * - 2026-03-29: Tightened the GitHub repo and skill widths so the primary row fits without shoving the toolbar left.
 * - 2026-03-29: Kept the GitHub skill select on the primary row by giving the repo field more width and disabling row wrap for that source mode.
 * - 2026-03-29: Replaced the install-scope select with inline radios beside Preview and Install so scope stays attached to the action buttons.
 * - 2026-03-29: Lowered the install-mode back button slightly so it aligns better with the denser two-row toolbar.
 * - 2026-03-29: Reorganized install mode into a single primary repo row that keeps the install label, skill picker, and scope selector aligned for faster scanning.
 * - 2026-03-23: Rewired install-form controls and the main editor textarea onto shared design-system primitives.
 * - 2026-03-23: Reserve extra left toolbar space when the main sidebar is collapsed so the back button clears the macOS traffic lights.
 * - 2026-03-22: Propagated busy state into the file tree so save/delete/load work disables file switching consistently.
 * - 2026-03-22: Restored the back button, removed the close button, and changed Save to an icon button that stays disabled until the file is dirty.
 * - 2026-03-22: Added selected-file state so tree clicks load that file in the left editor pane.
 * - 2026-03-22: Replaced the default editor chat pane with a skill folder structure pane on the right side.
 * - 2026-03-22: Added a confirmed delete action to the toolbar immediately left of Save and disabled the editor during delete in-flight state.
 * - 2026-03-08: Initial implementation as part of editor skill-editor feature.
 * - 2026-03-08: Match textarea font to PromptEditorModal (removed font-mono).
 */

import React from 'react';
import BaseEditor from '../../../design-system/patterns/BaseEditor';
import { Input, Radio, Select, Textarea } from '../../../design-system/primitives';
import type { SkillFolderEntry } from '../../../types/desktop-api';
import SkillFolderPane from './SkillFolderPane';

type SkillEditorMode = 'edit' | 'install';
type SkillInstallSourceType = 'local' | 'github';

export default function SkillEditor({
  mode = 'edit',
  skillId,
  sourceScope,
  selectedFilePath,
  content,
  onContentChange,
  onBack,
  onSave,
  onDelete,
  onSelectFile,
  folderEntries,
  hasUnsavedChanges,
  loadingFile,
  saving,
  deleting,
  installSourceType = 'github',
  installSourcePath = '',
  installRepo = '',
  installItemName = '',
  installOptions = [],
  installTargetScope = 'project',
  loadingInstallOptions = false,
  onInstallSourceTypeChange,
  onInstallSourcePathChange,
  onInstallRepoChange,
  onInstallItemNameChange,
  onInstallTargetScopeChange,
  onBrowseInstallSource,
  onLoadInstallOptions,
  onPreviewInstall,
  onInstall,
  installing = false,
  hasInstallPreview = false,
  currentFileEditable = true,
  leftSidebarCollapsed = false,
}: {
  mode?: SkillEditorMode;
  skillId: string;
  sourceScope: string;
  selectedFilePath: string;
  content: string;
  onContentChange: (value: string) => void;
  onBack: () => void;
  onSave: () => void;
  onDelete: () => void;
  onSelectFile: (relativePath: string) => void;
  folderEntries: SkillFolderEntry[];
  hasUnsavedChanges: boolean;
  loadingFile: boolean;
  saving: boolean;
  deleting: boolean;
  installSourceType?: SkillInstallSourceType;
  installSourcePath?: string;
  installRepo?: string;
  installItemName?: string;
  installOptions?: string[];
  installTargetScope?: 'global' | 'project';
  loadingInstallOptions?: boolean;
  onInstallSourceTypeChange?: (value: SkillInstallSourceType) => void;
  onInstallSourcePathChange?: (value: string) => void;
  onInstallRepoChange?: (value: string) => void;
  onInstallItemNameChange?: (value: string) => void;
  onInstallTargetScopeChange?: (value: 'global' | 'project') => void;
  onBrowseInstallSource?: () => void;
  onLoadInstallOptions?: () => void;
  onPreviewInstall?: () => void;
  onInstall?: () => void;
  installing?: boolean;
  hasInstallPreview?: boolean;
  currentFileEditable?: boolean;
  leftSidebarCollapsed?: boolean;
}) {
  const isInstallMode = mode === 'install';
  const busy = saving || deleting || loadingFile || installing;
  const backButtonClassName = isInstallMode
    ? 'mt-2 flex self-start items-center gap-1.5 rounded-md px-2 py-1 text-xs text-foreground/70 hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50'
    : 'flex self-start items-center gap-1.5 rounded-md px-2 py-1 text-xs text-foreground/70 hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50';
  const toolbarClassName = isInstallMode ? 'flex items-start gap-3' : 'flex items-center gap-3';
  const canSave = !busy && hasUnsavedChanges;
  const canPreview = isInstallMode
    ? (installSourceType === 'github'
      ? Boolean(installRepo.trim()) && Boolean(installItemName.trim())
      : Boolean(installSourcePath.trim()))
    : false;
  const canInstall = !busy && hasInstallPreview && Boolean(installItemName.trim());
  const scopeLabel = isInstallMode
    ? 'INSTALL SKILL'
    : (sourceScope === 'project' ? 'Project skill' : 'Global skill');
  const titleText = skillId;
  const textareaDisabled = busy || (isInstallMode && !currentFileEditable);
  const textareaPlaceholder = isInstallMode && !currentFileEditable
    ? `${selectedFilePath || 'SKILL.md'} cannot be edited in preview.`
    : `Contents of ${selectedFilePath || 'SKILL.md'}…`;
  const installHint = installSourceType === 'github'
    ? 'Choose a repo and skill, then confirm the install scope.'
    : 'Choose a local skill folder, then confirm the install scope.';
  const installPrimaryRowClassName = installSourceType === 'github'
    ? 'install-toolbar-primary-row flex min-w-0 flex-nowrap items-center gap-2'
    : 'install-toolbar-primary-row flex min-w-0 flex-wrap items-center justify-end gap-2';

  const installScopeOptions: Array<{ label: 'Project' | 'Global'; value: 'project' | 'global' }> = [
    { label: 'Project', value: 'project' },
    { label: 'Global', value: 'global' },
  ];

  const toolbar = (
    <div className={toolbarClassName}>
      <button
        type="button"
        onClick={onBack}
        disabled={busy}
        aria-label="Back"
        className={backButtonClassName}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Back
      </button>
      {isInstallMode ? (
        <div className="ml-auto flex min-w-0 flex-1 flex-col items-stretch gap-2">
          <div className={installPrimaryRowClassName}>
            <p className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{scopeLabel}</p>
            <div className="inline-flex items-center rounded-md border border-border bg-muted/30 p-0.5">
              {(['local', 'github'] as SkillInstallSourceType[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => onInstallSourceTypeChange?.(option)}
                  disabled={busy}
                  className={`rounded px-2 py-1 text-[11px] font-medium ${installSourceType === option
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                    }`}
                >
                  {option === 'local' ? 'Local' : 'GitHub'}
                </button>
              ))}
            </div>
            {installSourceType === 'local' ? (
              <div className="flex min-w-[240px] flex-[1_1_340px] items-center gap-2">
                <Input
                  value={installSourcePath}
                  onChange={(event) => onInstallSourcePathChange?.(event.target.value)}
                  disabled={busy}
                  placeholder="Skill folder path"
                  className="min-w-0 flex-1 px-2 py-1 text-[11px]"
                />
                <button
                  type="button"
                  onClick={onBrowseInstallSource}
                  disabled={busy}
                  className="rounded-md border border-border px-2 py-1 text-[11px] text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Browse
                </button>
              </div>
            ) : (
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <div className="relative min-w-0 flex-1">
                  <Input
                    value={installRepo}
                    onChange={(event) => onInstallRepoChange?.(event.target.value)}
                    disabled={busy}
                    placeholder="owner/repo"
                    className="w-full px-2 py-1 pr-8 text-[11px]"
                  />
                  <button
                    type="button"
                    onClick={onLoadInstallOptions}
                    disabled={busy || loadingInstallOptions || !installRepo.trim()}
                    aria-label={loadingInstallOptions ? 'Loading skills from repo' : 'Load skills from repo'}
                    title={loadingInstallOptions ? 'Loading skills from repo' : 'Load skills from repo'}
                    className="absolute right-1 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M21 12a9 9 0 0 1-15.5 6.36" />
                      <path d="M3 12A9 9 0 0 1 18.5 5.64" />
                      <path d="M3 16v-4h4" />
                      <path d="M21 8v4h-4" />
                    </svg>
                  </button>
                </div>
                <Select
                  value={installItemName}
                  onChange={(event) => onInstallItemNameChange?.(event.target.value)}
                  disabled={busy || loadingInstallOptions || installOptions.length === 0}
                  className="min-w-[132px] w-[132px] max-w-[132px] shrink-0 px-2 py-1 text-[11px]"
                  aria-label="GitHub skill"
                >
                  <option value="">
                    {loadingInstallOptions ? 'Loading skills...' : (installOptions.length > 0 ? 'Select skill' : 'Load skills from repo')}
                  </option>
                  {installOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </Select>
              </div>
            )}
          </div>
          <div className="install-toolbar-action-row flex min-w-0 flex-wrap items-center justify-end gap-2">
            <p className="mr-auto min-w-0 flex-1 text-[11px] text-muted-foreground">{installHint}</p>
            <div
              role="radiogroup"
              aria-label="Install scope"
              className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/30 px-2 py-1"
            >
              {installScopeOptions.map((option) => (
                <label
                  key={option.value}
                  className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] ${busy ? 'opacity-60' : 'cursor-pointer'} ${installTargetScope === option.value ? 'text-foreground' : 'text-muted-foreground'}`}
                >
                  <Radio
                    name="skill-install-scope"
                    value={option.value}
                    checked={installTargetScope === option.value}
                    onChange={() => onInstallTargetScopeChange?.(option.value)}
                    disabled={busy}
                    aria-label={option.label}
                    className="h-3.5 w-3.5"
                  />
                  {option.label}
                </label>
              ))}
            </div>
            <button
              type="button"
              onClick={onPreviewInstall}
              disabled={busy || !canPreview}
              className="rounded-md border border-border px-2 py-1 text-[11px] font-medium text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadingFile ? 'Previewing…' : 'Preview'}
            </button>
            <button
              type="button"
              onClick={onInstall}
              disabled={!canInstall}
              className="rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {installing ? 'Installing…' : 'Install'}
            </button>
          </div>
        </div>
      ) : (
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{scopeLabel}</p>
          <p className="truncate text-sm font-medium text-foreground">{titleText}</p>
        </div>
      )}
      {!isInstallMode ? (
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            className="rounded-md border border-destructive/35 px-3 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      ) : null}
    </div>
  );

  return (
    <BaseEditor
      reserveTrafficLightSpace={leftSidebarCollapsed}
      toolbar={toolbar}
      rightPane={(
        <SkillFolderPane
          skillId={skillId}
          entries={folderEntries}
          selectedPath={selectedFilePath}
          onSelectFile={onSelectFile}
          disabled={busy}
        />
      )}
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="border-b border-border px-4 py-2">
          {isInstallMode ? (
            <p className="min-w-0 truncate text-xs text-foreground">{selectedFilePath || 'SKILL.md'}</p>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 truncate text-xs text-foreground">{selectedFilePath || 'SKILL.md'}</p>
              <button
                type="button"
                onClick={onSave}
                disabled={!canSave}
                aria-label={saving ? 'Saving file' : 'Save file'}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M19 21H5a2 2 0 0 1-2-2V7.828a2 2 0 0 1 .586-1.414l2.828-2.828A2 2 0 0 1 7.828 3H17a2 2 0 0 1 2 2z" />
                  <path d="M17 21v-8H7v8" />
                  <path d="M7 3v5h8" />
                </svg>
              </button>
            </div>
          )}
        </div>
        <Textarea
          className="h-full resize-none p-4 text-xs leading-5 focus:border-transparent focus:ring-0"
          value={content}
          onChange={(e) => onContentChange(e.target.value)}
          disabled={textareaDisabled}
          spellCheck={false}
          placeholder={textareaPlaceholder}
          aria-label={`Edit ${selectedFilePath || 'SKILL.md'} for ${skillId}`}
          size="md"
        />
      </div>
    </BaseEditor>
  );
}
