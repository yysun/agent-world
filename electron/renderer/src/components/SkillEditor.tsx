/**
 * SkillEditor Component
 * Purpose:
 * - Editor UI for reading and saving a skill's SKILL.md content.
 *
 * Key Features:
 * - Toolbar with back button plus delete/save actions.
 * - Full-height textarea for editing SKILL.md raw markdown content.
 * - Right pane shows EditorChatPane (via BaseEditor).
 * - Calls `onSave` / `onDelete`; disables inputs while save/delete work is in flight.
 *
 * Implementation Notes:
 * - Controlled component: content is passed in as prop and managed by App state.
 * - Saving state (spinner / disabled) controlled via `saving` prop.
 * - Back button fires `onBack` without prompting (unsaved changes are parent's concern).
 *
 * Recent Changes:
 * - 2026-03-22: Added a confirmed delete action to the toolbar immediately left of Save and disabled the editor during delete in-flight state.
 * - 2026-03-08: Initial implementation as part of editor skill-editor feature.
 * - 2026-03-08: Match textarea font to PromptEditorModal (removed font-mono).
 */

import React from 'react';
import BaseEditor from './BaseEditor';

export default function SkillEditor({
  skillId,
  content,
  onContentChange,
  onBack,
  onSave,
  onDelete,
  saving,
  deleting,
}: {
  skillId: string;
  content: string;
  onContentChange: (value: string) => void;
  onBack: () => void;
  onSave: () => void;
  onDelete: () => void;
  saving: boolean;
  deleting: boolean;
}) {
  const busy = saving || deleting;

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
      <span className="text-xs font-medium text-foreground/80 truncate">{skillId}</span>
      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          className="rounded-md border border-destructive/35 px-3 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {deleting ? 'Deleting…' : 'Delete'}
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={busy}
          className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );

  return (
    <BaseEditor toolbar={toolbar} chatPaneContext={skillId}>
      <textarea
        className="h-full w-full resize-none bg-background p-4 text-xs leading-5 text-foreground placeholder:text-muted-foreground focus:outline-none"
        value={content}
        onChange={(e) => onContentChange(e.target.value)}
        disabled={busy}
        spellCheck={false}
        placeholder="SKILL.md content…"
        aria-label={`Edit SKILL.md for ${skillId}`}
      />
    </BaseEditor>
  );
}
