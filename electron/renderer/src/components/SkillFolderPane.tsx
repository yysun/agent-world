/**
 * SkillFolderPane Component
 * Purpose:
 * - Render the current skill folder structure inside the skill editor right pane.
 *
 * Key Features:
 * - Recursive tree rendering for skill files and subfolders.
 * - Clickable file rows that open file content in the editor.
 * - Icon-based tree rows instead of raw DIR/FILE text labels.
 * - Empty state when the skill folder contains no additional entries.
 * - Compact sidebar styling aligned with BaseEditor's right column.
 *
 * Implementation Notes:
 * - Purely presentational; folder data is loaded by App.tsx via Electron IPC.
 * - Uses native `details/summary` rows for a simple deterministic tree view.
 *
 * Recent Changes:
 * - 2026-03-22: Added a disabled state so busy save/delete/load work can block file switching from the tree.
 * - 2026-03-22: Replaced raw DIR/FILE labels with icon-based tree rows.
 * - 2026-03-22: Added clickable tree rows so selecting a file opens it in the left editor pane.
 * - 2026-03-22: Initial implementation for showing skill folder structure in the skill editor right pane.
 */

import React from 'react';
import type { SkillFolderEntry } from '../types/desktop-api';

function FolderGlyph() {
  return (
    <svg
      aria-hidden="true"
      className="h-3.5 w-3.5 flex-none text-sidebar-foreground/55"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M1.75 4.25H6.1L7.3 5.5H14.25V11.75C14.25 12.1642 13.9142 12.5 13.5 12.5H2.5C2.08579 12.5 1.75 12.1642 1.75 11.75V4.25Z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FileGlyph() {
  return (
    <svg
      aria-hidden="true"
      className="h-3.5 w-3.5 flex-none text-sidebar-foreground/50"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M4 1.75H9.5L12.25 4.5V13.25C12.25 13.6642 11.9142 14 11.5 14H4.5C4.08579 14 3.75 13.6642 3.75 13.25V2.5C3.75 2.08579 4.08579 1.75 4.5 1.75H4Z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <path d="M9.25 1.75V4.75H12.25" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronGlyph() {
  return (
    <svg
      aria-hidden="true"
      className="h-3 w-3 flex-none text-sidebar-foreground/35"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M6 3.75L10.25 8L6 12.25" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function renderSkillFolderNodes(
  entries: SkillFolderEntry[],
  selectedPath: string,
  onSelectFile: (relativePath: string) => void,
  disabled: boolean,
  depth: number = 0,
): React.ReactNode {
  return entries.map((entry) => {
    const hasChildren = entry.type === 'directory' && Array.isArray(entry.children) && entry.children.length > 0;
    const indentStyle = { paddingLeft: `${depth * 12}px` };

    if (entry.type === 'directory') {
      return (
        <details key={entry.relativePath} className="min-w-0" open>
          <summary
            role="treeitem"
            aria-expanded={hasChildren}
            className="flex cursor-pointer list-none items-center gap-2 rounded-md py-1 text-xs text-sidebar-foreground/75 hover:bg-sidebar-accent/40"
            style={indentStyle}
          >
            <ChevronGlyph />
            <FolderGlyph />
            <span className="truncate font-medium">{entry.name}</span>
          </summary>
          <div className="mt-0.5 min-w-0 border-l border-sidebar-border/70 pl-2" role="group">
            {hasChildren ? renderSkillFolderNodes(entry.children || [], selectedPath, onSelectFile, disabled, depth + 1) : null}
          </div>
        </details>
      );
    }

    const isSelected = entry.relativePath === selectedPath;
    return (
      <div key={entry.relativePath} className="min-w-0">
        <button
          type="button"
          role="treeitem"
          aria-selected={isSelected}
          disabled={disabled}
          onClick={() => onSelectFile(entry.relativePath)}
          className={[
            'flex w-full items-center gap-2 rounded-md py-1 text-left text-xs',
            isSelected
              ? 'bg-sidebar-accent text-sidebar-accent-foreground'
              : 'text-sidebar-foreground/75 hover:bg-sidebar-accent/40',
            disabled ? 'cursor-not-allowed opacity-50' : '',
          ].join(' ')}
          style={indentStyle}
        >
          <span className="flex h-3 w-3 flex-none items-center justify-center text-sidebar-foreground/35">
            <span className="h-px w-2 bg-current" />
          </span>
          <FileGlyph />
          <span className="truncate">{entry.name}</span>
        </button>
      </div>
    );
  });
}

export default function SkillFolderPane({
  skillId,
  entries,
  selectedPath,
  onSelectFile,
  disabled,
}: {
  skillId: string;
  entries: SkillFolderEntry[];
  selectedPath: string;
  onSelectFile: (relativePath: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex h-full flex-col border-l border-sidebar-border bg-sidebar">
      <div className="border-b border-sidebar-border px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-sidebar-foreground/60">
          Skill Files
        </p>
        <p className="mt-0.5 truncate text-xs text-sidebar-foreground/45">{skillId}</p>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-3 py-3" role="tree" aria-label={`${skillId} file tree`} aria-disabled={disabled ? 'true' : 'false'}>
        {entries.length > 0 ? (
          <div className="space-y-0.5">{renderSkillFolderNodes(entries, selectedPath, onSelectFile, Boolean(disabled))}</div>
        ) : (
          <p className="text-xs text-sidebar-foreground/40">This skill folder only contains SKILL.md.</p>
        )}
      </div>
    </div>
  );
}