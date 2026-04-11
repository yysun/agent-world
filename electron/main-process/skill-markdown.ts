/**
 * Electron Main Skill Markdown Helpers
 *
 * Purpose:
 * - Parse skill front-matter fields from SKILL.md content.
 *
 * Key Features:
 * - Normalizes quoted YAML scalar values.
 * - Extracts `name` and `description` from SKILL.md front matter.
 * - Supports folded and literal multiline description blocks.
 *
 * Implementation Notes:
 * - Keeps markdown parsing logic separate from IPC orchestration.
 * - Uses lightweight regex parsing because skill metadata only needs a few fields.
 *
 * Recent Changes:
 * - 2026-04-11: Extracted from ipc-handlers.ts so GitHub and local skill discovery share one parser path.
 */

export function normalizeSkillFrontMatterValue(value: string): string {
  const trimmed = value.trim();
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

export function parseSkillNameFromMarkdown(markdown: string): string {
  const normalizedMarkdown = String(markdown || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const frontMatterMatch = normalizedMarkdown.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/);
  if (!frontMatterMatch || !frontMatterMatch[1]) {
    return '';
  }

  for (const rawLine of frontMatterMatch[1].split(/\r?\n/)) {
    const keyValueMatch = rawLine.match(/^\s*name\s*:\s*(.*)$/i);
    if (!keyValueMatch) {
      continue;
    }

    return normalizeSkillFrontMatterValue(String(keyValueMatch[1] || ''));
  }

  return '';
}

export function parseSkillDescriptionFromMarkdown(markdown: string): string {
  const normalizedMarkdown = String(markdown || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const frontMatterMatch = normalizedMarkdown.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/);
  if (!frontMatterMatch || !frontMatterMatch[1]) {
    return '';
  }

  const lines = frontMatterMatch[1].split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index] || '';
    const descriptionMatch = rawLine.match(/^\s*description\s*:\s*(.*)$/i);
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

    return normalizeSkillFrontMatterValue(rest);
  }

  return '';
}