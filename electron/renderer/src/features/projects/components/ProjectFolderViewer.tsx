/**
 * ProjectFolderViewer Component
 *
 * Purpose:
 * - Render a full-area project file editor from the chat composer Project action.
 *
 * Key Features:
 * - Uses the shared `BaseEditor` workspace shell with a Back action.
 * - Shows an editable text file pane on the left and folder tree on the right.
 * - Reuses the skill-editor style markdown Preview/Markdown toggle for `.md` files.
 * - Renders explicit placeholders for binary, unsupported, and oversized files.
 *
 * Implementation Notes:
 * - Controlled component; parent owns folder data, selected file path, draft content, and loading state.
 * - Saving and dirty-state prompts stay in the parent so file switching/back behavior remains centralized.
 *
 * Recent Changes:
 * - 2026-04-14: Moved save and markdown controls into an in-pane file action row so project files save like the skill editor.
 * - 2026-04-14: Switched from a read-only preview panel to a skill-editor-style project file editor with markdown preview and save support.
 * - 2026-04-14: Initial implementation for the composer project folder viewer.
 */

import React from 'react';
import BaseEditor from '../../../design-system/patterns/BaseEditor';
import { Button, Radio, Textarea } from '../../../design-system/primitives';
import type { ProjectFileReadResult, ProjectFolderEntry } from '../../../types/desktop-api';
import { renderMarkdown } from '../../../utils/markdown';
import ProjectFolderPane from './ProjectFolderPane';

function getLastPathSegment(projectPath: string): string {
  const normalized = String(projectPath || '').trim().replace(/[\\/]+$/, '');
  if (!normalized) {
    return 'Project';
  }

  const segments = normalized.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] || normalized;
}

function getPreviewMessage(fileResult: ProjectFileReadResult | null, selectedFilePath: string): string {
  if (!selectedFilePath) {
    return 'Select a file from the folder tree to preview it here.';
  }

  if (!fileResult) {
    return `Unable to preview ${selectedFilePath}.`;
  }

  if (fileResult.status === 'binary') {
    return `${selectedFilePath} looks like a binary file and cannot be previewed as text.`;
  }

  if (fileResult.status === 'too-large') {
    return `${selectedFilePath} is too large to preview in the project viewer.`;
  }

  return `${selectedFilePath} cannot be previewed in the project viewer.`;
}

function isMarkdownFile(filePath: string): boolean {
  return /(^|\/)[^/]+\.(?:md|markdown)$/i.test(String(filePath || '').trim());
}

export default function ProjectFolderViewer({
  rootPath,
  entries,
  selectedFilePath,
  fileResult,
  content,
  markdownViewMode = 'preview',
  loadingStructure,
  loadingFile,
  saving,
  hasUnsavedChanges,
  onSelectFile,
  onContentChange,
  onMarkdownViewModeChange,
  onSave,
  onBack,
  leftSidebarCollapsed = false,
}: {
  rootPath: string;
  entries: ProjectFolderEntry[];
  selectedFilePath: string;
  fileResult: ProjectFileReadResult | null;
  content: string;
  markdownViewMode?: 'preview' | 'markdown';
  loadingStructure: boolean;
  loadingFile: boolean;
  saving: boolean;
  hasUnsavedChanges: boolean;
  onSelectFile: (relativePath: string) => void;
  onContentChange: (value: string) => void;
  onMarkdownViewModeChange: (value: 'preview' | 'markdown') => void;
  onSave: () => void;
  onBack: () => void;
  leftSidebarCollapsed?: boolean;
}) {
  const projectName = getLastPathSegment(rootPath);
  const busy = loadingStructure || loadingFile || saving;
  const currentFileEditable = fileResult?.status === 'ok';
  const markdownFile = isMarkdownFile(selectedFilePath);
  const showRenderedMarkdown = currentFileEditable && markdownFile && markdownViewMode === 'preview';
  const renderedMarkdown = showRenderedMarkdown ? renderMarkdown(content) : '';
  const markdownViewOptions: Array<{ label: 'Preview' | 'Markdown'; value: 'preview' | 'markdown' }> = [
    { label: 'Preview', value: 'preview' },
    { label: 'Markdown', value: 'markdown' },
  ];

  const toolbar = (
    <div className="flex min-w-0 items-center gap-3">
      <Button variant="ghost" size="sm" onClick={onBack} aria-label="Back">
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
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-foreground/60">Project Viewer</p>
        <p className="truncate text-sm text-foreground/75">{projectName}</p>
      </div>
    </div>
  );

  return (
    <BaseEditor
      toolbar={toolbar}
      reserveTrafficLightSpace={leftSidebarCollapsed}
      rightPane={(
        <ProjectFolderPane
          rootPath={rootPath}
          entries={entries}
          selectedPath={selectedFilePath}
          onSelectFile={onSelectFile}
          disabled={busy}
        />
      )}
    >
      <div className="flex h-full min-h-0 flex-col bg-background">
        <div className="border-b border-border px-4 py-2">
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 truncate text-xs text-foreground">{selectedFilePath || 'No file selected'}</p>
            <div className="flex shrink-0 items-center gap-3">
              {markdownFile && currentFileEditable ? (
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
                        name="project-markdown-view-mode"
                        value={option.value}
                        checked={markdownViewMode === option.value}
                        onChange={() => onMarkdownViewModeChange(option.value)}
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
                disabled={!currentFileEditable || !hasUnsavedChanges || busy}
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
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {loadingStructure ? (
            <div className="m-4 rounded-lg border border-border/70 bg-card/40 p-4 text-sm text-muted-foreground">Loading project folder structure...</div>
          ) : loadingFile ? (
            <div className="m-4 rounded-lg border border-border/70 bg-card/40 p-4 text-sm text-muted-foreground">Loading {selectedFilePath || 'file'}...</div>
          ) : showRenderedMarkdown ? (
            <div
              className="prose max-w-none min-h-full p-4 text-foreground"
              aria-label={`Preview ${selectedFilePath}`}
              dangerouslySetInnerHTML={{ __html: renderedMarkdown || '<p>(empty markdown)</p>' }}
            />
          ) : currentFileEditable ? (
            <Textarea
              className="h-full resize-none p-4 text-xs leading-5 focus:border-transparent focus:ring-0"
              value={content}
              onChange={(e) => onContentChange(e.target.value)}
              disabled={busy}
              spellCheck={false}
              placeholder={`Contents of ${selectedFilePath || 'file'}…`}
              aria-label={`Edit ${selectedFilePath || 'file'} for ${projectName}`}
              size="md"
            />
          ) : (
            <div className="m-4 rounded-lg border border-dashed border-border/80 bg-card/30 p-4 text-sm text-muted-foreground">{getPreviewMessage(fileResult, selectedFilePath)}</div>
          )}
        </div>
      </div>
    </BaseEditor>
  );
}