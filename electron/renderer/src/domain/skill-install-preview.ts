/**
 * Skill Install Preview Domain Helpers
 *
 * Purpose:
 * - Centralize pure state helpers for the Electron skill-install preview flow.
 *
 * Key Features:
 * - Creates the canonical empty install-preview state.
 * - Resolves the next selected GitHub skill from a loaded repo skill list.
 * - Tracks text-file draft overlays without retaining unchanged preview content.
 * - Detects whether the selected preview file is text-editable.
 *
 * Implementation Notes:
 * - Keeps logic framework-agnostic so renderer tests can validate regressions without React hook mocks.
 * - Preview files only include text-readable content; non-text files remain visible in the tree but non-editable.
 *
 * Recent Changes:
 * - 2026-03-23: Added helpers to clear stale install previews when repo/skill selection changes and to limit install overlays to edited text files.
 */

import type { SkillFolderEntry } from '../types/desktop-api';

export interface SkillInstallPreviewState {
  selectedFilePath: string;
  content: string;
  savedContent: string;
  folderEntries: SkillFolderEntry[];
  previewFiles: Record<string, string>;
  draftFiles: Record<string, string>;
}

export function createEmptySkillInstallPreviewState(): SkillInstallPreviewState {
  return {
    selectedFilePath: 'SKILL.md',
    content: '',
    savedContent: '',
    folderEntries: [],
    previewFiles: {},
    draftFiles: {},
  };
}

export function resolveSelectedGitHubSkillName(currentSkillName: string, availableSkillNames: string[]): string {
  const normalizedCurrentSkillName = String(currentSkillName || '').trim();
  const normalizedSkillNames = availableSkillNames
    .map((skillName) => String(skillName || '').trim())
    .filter(Boolean);

  if (normalizedCurrentSkillName && normalizedSkillNames.includes(normalizedCurrentSkillName)) {
    return normalizedCurrentSkillName;
  }

  return normalizedSkillNames[0] || '';
}

export function mergeSkillInstallDraftFiles(
  draftFiles: Record<string, string>,
  previewFiles: Record<string, string>,
  filePath: string,
  content: string,
): Record<string, string> {
  const normalizedFilePath = String(filePath || '').trim();
  if (!normalizedFilePath) {
    return draftFiles;
  }

  const normalizedContent = String(content ?? '');
  const previewContent = typeof previewFiles[normalizedFilePath] === 'string'
    ? previewFiles[normalizedFilePath]
    : '';

  if (normalizedContent === previewContent) {
    const { [normalizedFilePath]: _removed, ...remainingDraftFiles } = draftFiles;
    return remainingDraftFiles;
  }

  return {
    ...draftFiles,
    [normalizedFilePath]: normalizedContent,
  };
}

export function isSkillInstallFileEditable(previewFiles: Record<string, string>, filePath: string): boolean {
  const normalizedFilePath = String(filePath || '').trim();
  if (!normalizedFilePath) {
    return true;
  }

  return Object.prototype.hasOwnProperty.call(previewFiles, normalizedFilePath);
}