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
 * - 2026-04-11: Added local-scan selection and filtering helpers so local install roots can list root skills and nested skills-directory candidates.
 * - 2026-04-11: Added a pure stage-transition helper so install preview opens immediately on click and stays open during preview-load failures.
 * - 2026-04-11: GitHub browse helpers now operate on summary entries so the install browser can show discovered skill descriptions.
 * - 2026-04-11: Added stale GitHub-load guards so renderer install browse state only accepts results for the latest active repo request.
 * - 2026-03-23: Added helpers to clear stale install previews when repo/skill selection changes and to limit install overlays to edited text files.
 */

import type { GitHubSkillSummary, LocalSkillSummary, SkillFolderEntry } from '../types/desktop-api';

export interface LocalSkillPreviewSelection {
  skillName: string;
  folderPath: string;
}

export interface SkillInstallPreviewState {
  selectedFilePath: string;
  content: string;
  savedContent: string;
  folderEntries: SkillFolderEntry[];
  previewFiles: Record<string, string>;
  draftFiles: Record<string, string>;
}

export type SkillInstallEditorStage = 'browse' | 'preview';

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

export function resolveSelectedGitHubSkillName(currentSkillName: string, availableSkills: GitHubSkillSummary[]): string {
  const normalizedCurrentSkillName = String(currentSkillName || '').trim();
  const normalizedSkillNames = availableSkills
    .map((skill) => String(skill?.skillId || '').trim())
    .filter(Boolean);

  if (normalizedCurrentSkillName && normalizedSkillNames.includes(normalizedCurrentSkillName)) {
    return normalizedCurrentSkillName;
  }

  return normalizedSkillNames[0] || '';
}

export function filterGitHubSkillOptions(availableSkills: GitHubSkillSummary[], searchQuery: string): GitHubSkillSummary[] {
  const normalizedSkills = availableSkills
    .map((skill) => ({
      skillId: String(skill?.skillId || '').trim(),
      description: String(skill?.description || '').trim(),
    }))
    .filter((skill) => Boolean(skill.skillId));
  const normalizedSearchQuery = String(searchQuery || '').trim().toLowerCase();

  if (!normalizedSearchQuery) {
    return normalizedSkills;
  }

  return normalizedSkills.filter((skill) => skill.skillId.toLowerCase().includes(normalizedSearchQuery));
}

export function resolveSelectedLocalSkillName(currentSkillName: string, availableSkills: LocalSkillSummary[]): string {
  const normalizedCurrentSkillName = String(currentSkillName || '').trim();
  const normalizedSkillNames = availableSkills
    .map((skill) => String(skill?.skillId || '').trim())
    .filter(Boolean);

  if (normalizedCurrentSkillName && normalizedSkillNames.includes(normalizedCurrentSkillName)) {
    return normalizedCurrentSkillName;
  }

  return normalizedSkillNames[0] || '';
}

export function filterLocalSkillOptions(availableSkills: LocalSkillSummary[], searchQuery: string): LocalSkillSummary[] {
  const normalizedSkills = availableSkills
    .map((skill) => ({
      skillId: String(skill?.skillId || '').trim(),
      description: String(skill?.description || '').trim(),
      folderPath: String(skill?.folderPath || '').trim(),
      relativePath: String(skill?.relativePath || '').trim(),
    }))
    .filter((skill) => Boolean(skill.skillId) && Boolean(skill.folderPath));
  const normalizedSearchQuery = String(searchQuery || '').trim().toLowerCase();

  if (!normalizedSearchQuery) {
    return normalizedSkills;
  }

  return normalizedSkills.filter((skill) => (
    skill.skillId.toLowerCase().includes(normalizedSearchQuery)
    || skill.relativePath.toLowerCase().includes(normalizedSearchQuery)
  ));
}

export function resolveLocalSkillPreviewSelection(
  availableSkills: LocalSkillSummary[],
  skillName: string,
  preferredFolderPath?: string,
): LocalSkillPreviewSelection | null {
  const normalizedFolderPath = String(preferredFolderPath || '').trim();
  if (normalizedFolderPath) {
    const exactMatch = availableSkills.find((skill) => String(skill?.folderPath || '').trim() === normalizedFolderPath);
    if (exactMatch) {
      return {
        skillName: String(exactMatch.skillId || '').trim(),
        folderPath: normalizedFolderPath,
      };
    }
  }

  const normalizedSkillName = String(skillName || '').trim();
  if (!normalizedSkillName) {
    return null;
  }

  const firstMatch = availableSkills.find((skill) => String(skill?.skillId || '').trim() === normalizedSkillName);
  if (!firstMatch) {
    return null;
  }

  return {
    skillName: String(firstMatch.skillId || '').trim(),
    folderPath: String(firstMatch.folderPath || '').trim(),
  };
}

export function shouldApplyGitHubSkillLoadResult({
  activeRequestId,
  requestId,
  currentRepo,
  requestRepo,
}: {
  activeRequestId: number;
  requestId: number;
  currentRepo: string;
  requestRepo: string;
}): boolean {
  const normalizedCurrentRepo = String(currentRepo || '').trim();
  const normalizedRequestRepo = String(requestRepo || '').trim();

  if (!normalizedCurrentRepo || !normalizedRequestRepo) {
    return false;
  }

  return activeRequestId === requestId && normalizedCurrentRepo === normalizedRequestRepo;
}

export function shouldApplyLocalSkillLoadResult({
  activeRequestId,
  requestId,
  currentSourcePath,
  requestSourcePath,
}: {
  activeRequestId: number;
  requestId: number;
  currentSourcePath: string;
  requestSourcePath: string;
}): boolean {
  const normalizedCurrentSourcePath = String(currentSourcePath || '').trim();
  const normalizedRequestSourcePath = String(requestSourcePath || '').trim();

  if (!normalizedCurrentSourcePath || !normalizedRequestSourcePath) {
    return false;
  }

  return activeRequestId === requestId && normalizedCurrentSourcePath === normalizedRequestSourcePath;
}

export function resolveSkillInstallEditorStageOnPreview(loadSucceeded?: boolean): SkillInstallEditorStage {
  return 'preview';
}

export function deriveLocalSkillCandidateName(sourcePath: string, currentSkillName: string): string {
  const normalizedCurrentSkillName = String(currentSkillName || '').trim();
  if (normalizedCurrentSkillName) {
    return normalizedCurrentSkillName;
  }

  const normalizedSourcePath = String(sourcePath || '').trim().replace(/[\\/]+$/, '');
  if (!normalizedSourcePath) {
    return '';
  }

  const pathSegments = normalizedSourcePath.split(/[\\/]+/).filter(Boolean);
  return pathSegments[pathSegments.length - 1] || '';
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

function unquoteYamlScalar(value: string): string {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return '';
  }

  const hasMatchingQuotes =
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"));

  if (hasMatchingQuotes && trimmed.length >= 2) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

export function extractSkillDescriptionFromMarkdown(markdown: string): string {
  const normalizedMarkdown = String(markdown || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const frontMatterMatch = normalizedMarkdown.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/);
  if (!frontMatterMatch || !frontMatterMatch[1]) {
    return '';
  }

  const lines = frontMatterMatch[1].split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] || '';
    const descriptionMatch = line.match(/^\s*description\s*:\s*(.*)$/i);
    if (!descriptionMatch) {
      continue;
    }

    const rest = String(descriptionMatch[1] || '').trim();
    if (rest === '>' || rest === '|') {
      const collectedLines: string[] = [];
      for (let nestedIndex = index + 1; nestedIndex < lines.length; nestedIndex += 1) {
        const nestedLine = lines[nestedIndex] || '';
        if (!nestedLine.trim()) {
          if (collectedLines.length > 0) {
            collectedLines.push('');
          }
          continue;
        }

        if (!/^\s+/.test(nestedLine)) {
          break;
        }

        collectedLines.push(nestedLine.trim());
      }

      return collectedLines.join(' ').replace(/\s+/g, ' ').trim();
    }

    return unquoteYamlScalar(rest);
  }

  return '';
}

export function extractSkillDescriptionFromPreviewFiles(previewFiles: Record<string, string>): string {
  const exactSkillFile = typeof previewFiles['SKILL.md'] === 'string' ? previewFiles['SKILL.md'] : '';
  if (exactSkillFile) {
    return extractSkillDescriptionFromMarkdown(exactSkillFile);
  }

  const skillFilePath = Object.keys(previewFiles).find((filePath) => /(^|\/)SKILL\.md$/i.test(String(filePath || '').trim()));
  if (!skillFilePath) {
    return '';
  }

  return extractSkillDescriptionFromMarkdown(previewFiles[skillFilePath] || '');
}