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
 * - 2026-04-14: Standardized both skill-editor Back actions onto the primary `Button` primitive for consistent workspace editor chrome.
 * - 2026-04-11: Added install-preview loading/error placeholders so failed or pending preview fetches do not render as blank content and blank file trees.
 * - 2026-04-11: Narrowed install mode to preview-only so search/discovery lives in `SkillInstallBrowser`.
 * - 2026-04-03: Added edit-mode Preview and Markdown radios for markdown files, defaulting to preview beside the save action.
 * - 2026-04-03: Render SKILL.md as formatted markdown in install preview while keeping raw text editing for normal edit mode and non-markdown preview files.
 * - 2026-03-23: Reserve extra left toolbar space when the main sidebar is collapsed so the back button clears the macOS traffic lights.
 * - 2026-03-22: Propagated busy state into the file tree so save/delete/load work disables file switching consistently.
 * - 2026-03-22: Restored the back button, removed the close button, and changed Save to an icon button that stays disabled until the file is dirty.
 * - 2026-03-22: Added selected-file state so tree clicks load that file in the left editor pane.
 * - 2026-03-22: Replaced the default editor chat pane with a skill folder structure pane on the right side.
 * - 2026-03-22: Added a confirmed delete action to the toolbar immediately left of Save and disabled the editor during delete in-flight state.
 * - 2026-03-08: Initial implementation as part of editor skill-editor feature.
 * - 2026-03-08: Match textarea font to the shared long-form editor treatment (removed font-mono).
 */

import React from 'react';
import BaseEditor from '../../../design-system/patterns/BaseEditor';
import { Button, Radio, Textarea } from '../../../design-system/primitives';
import type { SkillFolderEntry } from '../../../types/desktop-api';
import { renderMarkdown } from '../../../utils/markdown';
import SkillFolderPane from './SkillFolderPane';

type SkillEditorMode = 'edit' | 'install';
type SkillMarkdownViewMode = 'preview' | 'markdown';

export default function SkillEditor({
  mode = 'edit',
  skillId,
  sourceScope,
  selectedFilePath,
  markdownViewMode = 'preview',
  content,
  onContentChange,
  onMarkdownViewModeChange,
  onBack,
  onSave,
  onDelete,
  onSelectFile,
  folderEntries,
  hasUnsavedChanges,
  loadingFile,
  saving,
  deleting,
  installItemName = '',
  installDescription = '',
  installTargetScope = 'project',
  onInstallTargetScopeChange,
  onInstall,
  installing = false,
  currentFileEditable = true,
  emptyContentMessage = '',
  folderEmptyStateText = '',
  leftSidebarCollapsed = false,
}: {
  mode?: SkillEditorMode;
  skillId: string;
  sourceScope: string;
  selectedFilePath: string;
  markdownViewMode?: SkillMarkdownViewMode;
  content: string;
  onContentChange: (value: string) => void;
  onMarkdownViewModeChange?: (value: SkillMarkdownViewMode) => void;
  onBack: () => void;
  onSave: () => void;
  onDelete: () => void;
  onSelectFile: (relativePath: string) => void;
  folderEntries: SkillFolderEntry[];
  hasUnsavedChanges: boolean;
  loadingFile: boolean;
  saving: boolean;
  deleting: boolean;
  installItemName?: string;
  installDescription?: string;
  installTargetScope?: 'global' | 'project';
  onInstallTargetScopeChange?: (value: 'global' | 'project') => void;
  onInstall?: () => void;
  installing?: boolean;
  currentFileEditable?: boolean;
  emptyContentMessage?: string;
  folderEmptyStateText?: string;
  leftSidebarCollapsed?: boolean;
}) {
  const isInstallMode = mode === 'install';
  const busy = saving || deleting || loadingFile || installing;
  const toolbarClassName = 'flex items-center gap-3';
  const canSave = !busy && hasUnsavedChanges;
  const canInstall = !busy && folderEntries.length > 0 && Boolean(installItemName.trim());
  const scopeLabel = isInstallMode
    ? 'INSTALL SKILL'
    : (sourceScope === 'project' ? 'Project skill' : 'Global skill');
  const titleText = skillId || (isInstallMode ? 'Skill preview' : '');
  const textareaDisabled = busy || (isInstallMode && !currentFileEditable);
  const isMarkdownFile = /(^|\/)[^/]+\.(?:md|markdown)$/i.test(String(selectedFilePath || '').trim() || 'SKILL.md');
  const showRenderedMarkdown = (isInstallMode && /(^|\/)SKILL\.md$/i.test(String(selectedFilePath || '').trim() || 'SKILL.md'))
    || (!isInstallMode && isMarkdownFile && markdownViewMode === 'preview');
  const renderedSkillMarkdown = showRenderedMarkdown ? renderMarkdown(content) : '';
  const textareaPlaceholder = isInstallMode && !currentFileEditable
    ? `${selectedFilePath || 'SKILL.md'} cannot be edited in preview.`
    : `Contents of ${selectedFilePath || 'SKILL.md'}…`;
  const hasInstallDescription = Boolean(String(installDescription || '').trim());
  const showInstallEmptyState = isInstallMode && folderEntries.length === 0 && !String(content || '').trim();
  const resolvedInstallEmptyContentMessage = String(emptyContentMessage || (loadingFile
    ? 'Loading preview files…'
    : 'Preview files are unavailable for this skill.')).trim() || 'Preview files are unavailable for this skill.';

  const installScopeOptions: Array<{ label: 'Project' | 'Global'; value: 'project' | 'global' }> = [
    { label: 'Project', value: 'project' },
    { label: 'Global', value: 'global' },
  ];
  const markdownViewOptions: Array<{ label: 'Preview' | 'Markdown'; value: SkillMarkdownViewMode }> = [
    { label: 'Preview', value: 'preview' },
    { label: 'Markdown', value: 'markdown' },
  ];

  const toolbar = (
    <div className={toolbarClassName}>
      {isInstallMode ? (
        <>
          <Button
            variant="primary"
            size="sm"
            onClick={onBack}
            disabled={busy}
            aria-label="Back"
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
          </Button>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{scopeLabel}</p>
            <p className="truncate text-sm font-medium text-foreground">{titleText}</p>
          </div>
        </>
      ) : (
        <>
          <Button
            variant="primary"
            size="sm"
            onClick={onBack}
            disabled={busy}
            aria-label="Back"
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
          </Button>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{scopeLabel}</p>
            <p className="truncate text-sm font-medium text-foreground">{titleText}</p>
          </div>
        </>
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
          emptyStateText={folderEmptyStateText}
        />
      )}
    >
      <div className="flex h-full min-h-0 flex-col">
        {isInstallMode && hasInstallDescription ? (
          <div className="border-b border-border bg-muted/20 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/65">Preview Summary</p>
            <p className="mt-1 text-sm text-foreground">{installDescription}</p>
          </div>
        ) : null}
        <div className="border-b border-border px-4 py-2">
          {isInstallMode ? (
            <div className="install-editor-action-row flex items-center justify-between gap-3 py-0.5">
              <p className="min-w-0 truncate text-xs font-medium tracking-[0.08em] text-foreground/80">{selectedFilePath || 'SKILL.md'}</p>
              <div className="flex shrink-0 items-center gap-3">
                <div
                  role="radiogroup"
                  aria-label="Install scope"
                  className="inline-flex items-center gap-3"
                >
                  {installScopeOptions.map((option) => (
                    <label
                      key={option.value}
                      className={[
                        'inline-flex items-center gap-2 text-xs',
                        busy ? 'opacity-60' : 'cursor-pointer',
                        installTargetScope === option.value ? 'text-foreground' : 'text-muted-foreground',
                      ].join(' ')}
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
                <Button
                  variant="primary"
                  size="sm"
                  onClick={onInstall}
                  disabled={!canInstall}
                >
                  {installing ? 'Installing…' : 'Install'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 truncate text-xs text-foreground">{selectedFilePath || 'SKILL.md'}</p>
              <div className="flex shrink-0 items-center gap-3">
                {!isInstallMode && isMarkdownFile ? (
                  <div
                    role="radiogroup"
                    aria-label="Markdown view mode"
                    className="inline-flex items-center gap-3"
                  >
                    {markdownViewOptions.map((option) => (
                      <label
                        key={option.value}
                        className={[
                          'inline-flex items-center gap-2 text-xs',
                          busy ? 'opacity-60' : 'cursor-pointer',
                          markdownViewMode === option.value ? 'text-foreground' : 'text-muted-foreground',
                        ].join(' ')}
                      >
                        <Radio
                          name="skill-markdown-view-mode"
                          value={option.value}
                          checked={markdownViewMode === option.value}
                          onChange={() => onMarkdownViewModeChange?.(option.value)}
                          disabled={busy}
                          aria-label={option.label}
                          className="h-3.5 w-3.5"
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
                ) : null}
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
            </div>
          )}
        </div>
        {showInstallEmptyState ? (
          <div
            className="flex flex-1 items-center justify-center px-6 py-8 text-center text-sm text-muted-foreground"
            aria-label="Install preview empty state"
          >
            {resolvedInstallEmptyContentMessage}
          </div>
        ) : showRenderedMarkdown ? (
          <div
            className="prose max-w-none flex-1 overflow-y-auto p-4 text-foreground"
            aria-label={`Preview ${selectedFilePath || 'SKILL.md'} for ${skillId}`}
            dangerouslySetInnerHTML={{ __html: renderedSkillMarkdown || '<p>(empty markdown)</p>' }}
          />
        ) : (
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
        )}
      </div>
    </BaseEditor>
  );
}
