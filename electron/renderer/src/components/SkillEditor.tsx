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
 * - 2026-03-22: Propagated busy state into the file tree so save/delete/load work disables file switching consistently.
 * - 2026-03-22: Restored the back button, removed the close button, and changed Save to an icon button that stays disabled until the file is dirty.
 * - 2026-03-22: Added selected-file state so tree clicks load that file in the left editor pane.
 * - 2026-03-22: Replaced the default editor chat pane with a skill folder structure pane on the right side.
 * - 2026-03-22: Added a confirmed delete action to the toolbar immediately left of Save and disabled the editor during delete in-flight state.
 * - 2026-03-08: Initial implementation as part of editor skill-editor feature.
 * - 2026-03-08: Match textarea font to PromptEditorModal (removed font-mono).
 */

import React from 'react';
import type { SkillFolderEntry } from '../types/desktop-api';
import BaseEditor from './BaseEditor';
import SkillFolderPane from './SkillFolderPane';

export default function SkillEditor({
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
}: {
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
}) {
  const busy = saving || deleting || loadingFile;
  const canSave = !busy && hasUnsavedChanges;
  const scopeLabel = sourceScope === 'project' ? 'Project skill' : 'Global skill';

  const toolbar = (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onBack}
        disabled={busy}
        aria-label="Back"
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-foreground/70 hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
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
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{scopeLabel}</p>
        <p className="truncate text-sm font-medium text-foreground">{skillId}</p>
      </div>
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
    </div>
  );

  return (
    <BaseEditor
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
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
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
        <textarea
          className="h-full w-full resize-none bg-background p-4 text-xs leading-5 text-foreground placeholder:text-muted-foreground focus:outline-none"
          value={content}
          onChange={(e) => onContentChange(e.target.value)}
          disabled={busy}
          spellCheck={false}
          placeholder={`Contents of ${selectedFilePath || 'SKILL.md'}…`}
          aria-label={`Edit ${selectedFilePath || 'SKILL.md'} for ${skillId}`}
        />
      </div>
    </BaseEditor>
  );
}
