/**
 * ProjectFolderPane Component
 *
 * Purpose:
 * - Render the selected project folder structure in the right pane of the project viewer.
 *
 * Key Features:
 * - Recursive tree rendering for nested folders and files.
 * - Clickable file rows that trigger lazy project file loading into the editor pane.
 * - Empty-state messaging for projects with no previewable files.
 *
 * Implementation Notes:
 * - Purely presentational; App.tsx owns folder data and file selection state.
 * - Mirrors the existing skill tree interaction model where that improves consistency.
 *
 * Recent Changes:
 * - 2026-04-14: Removed the decorative file-row dash marker so file names align cleanly in the tree.
 * - 2026-04-14: Initial implementation for the composer project folder viewer.
 */

import React from 'react';
import type { ProjectFolderEntry } from '../../../types/desktop-api';

function FolderGlyph() {
  return (
    <svg
      aria-hidden="true"
      className="h-3.5 w-3.5 flex-none text-foreground/45"
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
      className="h-3.5 w-3.5 flex-none text-foreground/40"
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
      className="h-3 w-3 flex-none text-foreground/35"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M6 3.75L10.25 8L6 12.25" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function renderProjectFolderNodes(
  entries: ProjectFolderEntry[],
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
            className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-2 py-1.5 text-xs text-foreground/70 hover:bg-muted"
            style={indentStyle}
          >
            <ChevronGlyph />
            <FolderGlyph />
            <span className="truncate font-medium">{entry.name}</span>
          </summary>
          <div className="mt-0.5 min-w-0 border-l border-border/80 pl-2" role="group">
            {hasChildren ? renderProjectFolderNodes(entry.children || [], selectedPath, onSelectFile, disabled, depth + 1) : null}
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
            'flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-xs',
            isSelected ? 'bg-muted text-foreground shadow-sm' : 'text-foreground/70 hover:bg-muted',
            disabled ? 'cursor-not-allowed opacity-50' : '',
          ].join(' ')}
          style={indentStyle}
        >
          <FileGlyph />
          <span className="truncate">{entry.name}</span>
        </button>
      </div>
    );
  });
}

export default function ProjectFolderPane({
  rootPath,
  entries,
  selectedPath,
  onSelectFile,
  disabled,
}: {
  rootPath: string;
  entries: ProjectFolderEntry[];
  selectedPath: string;
  onSelectFile: (relativePath: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex h-full flex-col border-l border-border bg-background">
      <div className="border-b border-border px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-foreground/55">Project Files</p>
        <p className="mt-1 truncate text-xs text-foreground/45">{rootPath}</p>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-3 py-4" role="tree" aria-label={`${rootPath} file tree`} aria-disabled={disabled ? 'true' : 'false'}>
        {entries.length > 0 ? (
          <div className="space-y-0.5">{renderProjectFolderNodes(entries, selectedPath, onSelectFile, Boolean(disabled))}</div>
        ) : (
          <p className="px-2 text-xs text-foreground/40">This project folder has no previewable files.</p>
        )}
      </div>
    </div>
  );
}