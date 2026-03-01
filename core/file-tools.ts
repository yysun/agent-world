/**
 * File Tools Module - Built-in workspace inspection tools for LLM workflows.
 *
 * Features:
 * - Exposes built-in `read_file`, `write_file`, `list_files`, and `grep` tool definitions
 * - Supports bounded line-based file reads with offset and limit
 * - Provides deterministic directory listing with optional hidden-file support
 * - Performs recursive text search with plain-text or regex matching
 * - Supports optional glob-like include filtering for `grep`
 *
 * Implementation Notes:
 * - Paths resolve relative to runtime working directory context when provided
 * - Tool outputs are JSON strings for deterministic downstream parsing
 * - Search depth and output volume are bounded to avoid runaway scans
 * - Errors are returned as tool-friendly `Error:` strings
 *
 * Recent Changes:
 * - 2026-03-01: Hardened `read_file` against undefined read payloads from mocked fs implementations by coercing to empty content instead of hard-failing.
 * - 2026-03-01: Added read_file fallback that resolves missing relative paths against loaded skill roots (for skill script paths like `scripts/convert.py`).
 * - 2026-03-01: Allowed read-only file tools to traverse lexically in-scope `.agents/skills/*` paths even when symlinks resolve outside the world directory (skill workspace compatibility).
 * - 2026-02-28: Added built-in `write_file` tool with explicit `create`/`overwrite` modes and trusted-scope path enforcement.
 * - 2026-02-21: Added `list_files` output bounding (`maxEntries`) and optional `includePattern` filtering with truncation metadata to reduce continuation token spikes and tool-hop churn on large workspaces.
 * - 2026-02-19: Aligned file-tool path behavior with `shell_cmd`: `list_files` now defaults to trusted working directory when `path` is omitted, and `read_file` accepts `path` alias.
 * - 2026-02-16: Switched `list_files` scanning to `fast-glob` with depth control and default ignore rules.
 * - 2026-02-16: Added optional `recursive` mode to `list_files` for nested directory traversal in a single call.
 * - 2026-02-16: `list_files` now includes hidden dot-prefixed entries by default (set `includeHidden: false` to exclude).
 * - 2026-02-16: Switched `path` import to namespace style for Vitest mock compatibility.
 * - 2026-02-16: Initial implementation of built-in file inspection tools.
 * - 2026-02-16: Enhanced `list_files` empty-directory and not-found reporting with structured flags.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import fg from 'fast-glob';
import {
  resolveTrustedShellWorkingDirectory,
  validateShellDirectoryRequest,
} from './shell-cmd-tool.js';
import { getSkillSourcePath, getSkills } from './skill-registry.js';

type ToolContext = {
  workingDirectory?: string;
  world?: {
    variables?: string;
  };
};

const DEFAULT_READ_LIMIT = 200;
const MAX_READ_LIMIT = 2000;
const DEFAULT_LIST_MAX_ENTRIES = 200;
const MAX_LIST_MAX_ENTRIES = 2000;
const DEFAULT_GREP_MAX_RESULTS = 200;
const MAX_GREP_MAX_RESULTS = 2000;
const MAX_GREP_FILE_BYTES = 1024 * 1024;

type WriteMode = 'create' | 'overwrite';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getTrustedWorkingDirectory(context?: ToolContext): string {
  return resolveTrustedShellWorkingDirectory({
    workingDirectory: context?.workingDirectory,
    world: context?.world,
  });
}

function resolveTargetPath(inputPath: string, trustedWorkingDirectory: string): string {
  if (!inputPath || typeof inputPath !== 'string') {
    throw new Error('Missing required path parameter');
  }
  const baseDirectory = trustedWorkingDirectory;
  return path.resolve(baseDirectory, inputPath);
}

function isPathWithinRoot(candidatePath: string, rootPath: string): boolean {
  const normalizeForComparison = (value: string): string =>
    normalizePath(path.resolve(value)).replace(/\/+/g, '/');

  const normalizedCandidate = normalizeForComparison(candidatePath);
  const normalizedRoot = normalizeForComparison(rootPath);

  return normalizedCandidate === normalizedRoot
    || normalizedCandidate.startsWith(`${normalizedRoot}/`);
}

function isMissingFileError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const errno = (error as NodeJS.ErrnoException).code;
  if (errno === 'ENOENT') {
    return true;
  }

  const message = String((error as Error).message ?? '').toLowerCase();
  return message.includes('enoent') || message.includes('no such file or directory');
}

function resolveSkillRelativeReadCandidates(requestedFilePath: string): string[] {
  const normalizedRequestedPath = normalizePath(String(requestedFilePath || '').trim());
  if (!normalizedRequestedPath || path.isAbsolute(normalizedRequestedPath)) {
    return [];
  }

  const candidates: string[] = [];
  const availableSkills = getSkills();
  for (const skill of availableSkills) {
    const sourcePath = getSkillSourcePath(skill.skill_id);
    if (!sourcePath) {
      continue;
    }

    const skillRoot = path.dirname(sourcePath);
    const candidatePaths = new Set<string>([
      path.resolve(skillRoot, normalizedRequestedPath),
    ]);

    const skillPrefix = `${skill.skill_id}/`;
    if (normalizedRequestedPath.startsWith(skillPrefix)) {
      const withoutSkillPrefix = normalizedRequestedPath.slice(skillPrefix.length);
      if (withoutSkillPrefix) {
        candidatePaths.add(path.resolve(skillRoot, withoutSkillPrefix));
      }
    }

    for (const candidatePath of candidatePaths) {
      if (isPathWithinRoot(candidatePath, skillRoot)) {
        candidates.push(candidatePath);
      }
    }
  }

  return [...new Set(candidates)];
}

function ensurePathWithinTrustedDirectory(
  resolvedPath: string,
  trustedWorkingDirectory: string,
  options?: { allowSkillPathAlias?: boolean },
): void {
  const validation = validateShellDirectoryRequest(resolvedPath, trustedWorkingDirectory);
  if (!validation.valid && options?.allowSkillPathAlias && isWithinSkillAliasPath(resolvedPath, trustedWorkingDirectory)) {
    return;
  }
  if (!validation.valid) {
    throw new Error(validation.error);
  }
}

function isWithinSkillAliasPath(resolvedPath: string, trustedWorkingDirectory: string): boolean {
  const candidate = path.resolve(String(resolvedPath || '').trim());
  const trusted = path.resolve(String(trustedWorkingDirectory || '').trim());
  const skillRoot = path.resolve(trusted, '.agents', 'skills');

  const normalizedCandidate = normalizePath(candidate).replace(/\/+/g, '/');
  const normalizedSkillRoot = normalizePath(skillRoot).replace(/\/+/g, '/');

  return normalizedCandidate === normalizedSkillRoot
    || normalizedCandidate.startsWith(`${normalizedSkillRoot}/`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/');
}

function toUtf8String(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (Buffer.isBuffer(value)) {
    return value.toString('utf8');
  }
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
}

function toArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function globToRegExp(pattern: string): RegExp {
  const normalized = normalizePath(pattern.trim());
  let source = '^';

  for (let index = 0; index < normalized.length; index += 1) {
    const current = normalized[index];
    const next = normalized[index + 1];

    if (current === '*' && next === '*') {
      source += '.*';
      index += 1;
      continue;
    }

    if (current === '*') {
      source += '[^/]*';
      continue;
    }

    if (current === '?') {
      source += '.';
      continue;
    }

    source += escapeRegExp(current);
  }

  source += '$';
  return new RegExp(source, 'i');
}

function shouldIncludeFile(relativePath: string, includePattern?: string): boolean {
  if (!includePattern || !includePattern.trim()) {
    return true;
  }

  const normalizedRelativePath = normalizePath(relativePath);
  const patterns = includePattern
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (patterns.length === 0) {
    return true;
  }

  return patterns.some((pattern) => {
    const normalizedPattern = normalizePath(pattern);
    const candidatePatterns = normalizedPattern.startsWith('**/')
      ? [normalizedPattern, normalizedPattern.slice(3)]
      : [normalizedPattern];

    return candidatePatterns.some((candidatePattern) => {
      if (!candidatePattern) {
        return false;
      }
      if (!candidatePattern.includes('*') && !candidatePattern.includes('?')) {
        return normalizedRelativePath.includes(candidatePattern);
      }
      return globToRegExp(candidatePattern).test(normalizedRelativePath);
    });
  });
}

async function collectFilesRecursively(directoryPath: string): Promise<string[]> {
  const files: string[] = [];
  const stack: string[] = [directoryPath];

  while (stack.length > 0) {
    const currentDirectory = stack.pop();
    if (!currentDirectory) continue;

    const rawEntries = await fs.readdir(currentDirectory, { withFileTypes: true });
    const entries = toArray<{ isDirectory: () => boolean; isFile: () => boolean; name: string }>(rawEntries);
    for (const entry of entries) {
      const fullPath = path.join(currentDirectory, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

async function searchInFile(options: {
  filePath: string;
  relativePath: string;
  matcher: RegExp;
  matches: Array<{ path: string; line: number; content: string }>;
  maxResults: number;
}): Promise<void> {
  const { filePath, relativePath, matcher, matches, maxResults } = options;
  const stat = await fs.stat(filePath);
  if (stat.size > MAX_GREP_FILE_BYTES) {
    return;
  }

  const rawContent = await fs.readFile(filePath, 'utf8');
  const content = toUtf8String(rawContent);
  if (content.includes('\u0000')) {
    return;
  }

  const lines = content.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const lineContent = lines[index] ?? '';
    matcher.lastIndex = 0;
    if (!matcher.test(lineContent)) {
      continue;
    }

    matches.push({
      path: normalizePath(relativePath),
      line: index + 1,
      content: lineContent,
    });

    if (matches.length >= maxResults) {
      return;
    }
  }
}

export function createReadFileToolDefinition() {
  return {
    description:
      'Read a file for context gathering. Supports line-based pagination with optional offset and limit. Paths resolve within the trusted working-directory scope.',
    parameters: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'File path to read. Relative paths resolve from runtime working directory.',
        },
        path: {
          type: 'string',
          description: 'Alias for filePath.',
        },
        offset: {
          type: 'number',
          description: '1-based line number to start reading from (default: 1).',
        },
        limit: {
          type: 'number',
          description: `Maximum number of lines to return (default: ${DEFAULT_READ_LIMIT}, max: ${MAX_READ_LIMIT}).`,
        },
      },
      required: [],
      additionalProperties: false,
    },
    execute: async (args: any, _sequenceId?: string, _parentToolCall?: string, context?: ToolContext) => {
      try {
        const trustedWorkingDirectory = getTrustedWorkingDirectory(context);
        const requestedFilePath = String(args.filePath ?? args.path ?? '').trim();
        if (!requestedFilePath) {
          return 'Error: read_file failed - filePath is required';
        }
        let resolvedPath = resolveTargetPath(requestedFilePath, trustedWorkingDirectory);
        ensurePathWithinTrustedDirectory(resolvedPath, trustedWorkingDirectory, { allowSkillPathAlias: true });

        let rawContent: string | Buffer | undefined;
        try {
          rawContent = await fs.readFile(resolvedPath, 'utf8');
        } catch (readError) {
          if (!isMissingFileError(readError)) {
            throw readError;
          }

          const skillReadCandidates = new Set<string>(resolveSkillRelativeReadCandidates(requestedFilePath));
          if (skillReadCandidates.size === 0) {
            const relativeFromTrustedDirectory = normalizePath(path.relative(trustedWorkingDirectory, resolvedPath));
            const isRelativeToTrusted = relativeFromTrustedDirectory
              && relativeFromTrustedDirectory !== '.'
              && !relativeFromTrustedDirectory.startsWith('..')
              && !path.isAbsolute(relativeFromTrustedDirectory);

            if (isRelativeToTrusted) {
              for (const candidatePath of resolveSkillRelativeReadCandidates(relativeFromTrustedDirectory)) {
                skillReadCandidates.add(candidatePath);
              }
            }
          }

          let fallbackReadError: unknown = null;
          for (const candidatePath of skillReadCandidates) {
            try {
              ensurePathWithinTrustedDirectory(candidatePath, trustedWorkingDirectory, { allowSkillPathAlias: true });
              rawContent = await fs.readFile(candidatePath, 'utf8');
              resolvedPath = candidatePath;
              fallbackReadError = null;
              break;
            } catch (candidateError) {
              fallbackReadError = candidateError;
              if (!isMissingFileError(candidateError)) {
                throw candidateError;
              }
            }
          }

          if (fallbackReadError || rawContent === undefined) {
            throw readError;
          }
        }

        const fileContent = toUtf8String(rawContent ?? '');
        const lines = fileContent.split(/\r?\n/);
        const offset = clamp(Number(args.offset ?? 1), 1, Number.MAX_SAFE_INTEGER);
        const limit = clamp(Number(args.limit ?? DEFAULT_READ_LIMIT), 1, MAX_READ_LIMIT);
        const startIndex = offset - 1;
        const endIndex = startIndex + limit;
        const selectedLines = startIndex < lines.length ? lines.slice(startIndex, endIndex) : [];

        return JSON.stringify(
          {
            filePath: resolvedPath,
            offset,
            limit,
            totalLines: lines.length,
            content: selectedLines.join('\n'),
          },
          null,
          2,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return `Error: read_file failed - ${message}`;
      }
    },
  };
}

function normalizeWriteMode(mode: unknown): WriteMode {
  if (mode === undefined || mode === null || mode === '') {
    return 'overwrite';
  }

  const normalizedMode = String(mode).trim().toLowerCase();
  if (normalizedMode === 'create' || normalizedMode === 'overwrite') {
    return normalizedMode;
  }

  throw new Error(`Invalid mode '${String(mode)}'. Expected 'create' or 'overwrite'.`);
}

export function createWriteFileToolDefinition() {
  return {
    description:
      'Write text content to a file inside the trusted working-directory scope. Supports explicit create-only and overwrite modes.',
    parameters: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Target file path. Relative paths resolve from runtime working directory.',
        },
        path: {
          type: 'string',
          description: 'Alias for filePath.',
        },
        content: {
          type: 'string',
          description: 'UTF-8 text content to write.',
        },
        mode: {
          type: 'string',
          enum: ['create', 'overwrite'],
          description: "Write mode. 'create' fails if the file exists. 'overwrite' replaces existing content (default).",
        },
      },
      required: ['content'],
      additionalProperties: false,
    },
    execute: async (args: any, _sequenceId?: string, _parentToolCall?: string, context?: ToolContext) => {
      try {
        const trustedWorkingDirectory = getTrustedWorkingDirectory(context);
        const requestedFilePath = String(args.filePath ?? args.path ?? '').trim();
        if (!requestedFilePath) {
          return 'Error: write_file failed - filePath is required';
        }

        if (typeof args.content !== 'string') {
          return 'Error: write_file failed - content must be a string';
        }

        const mode = normalizeWriteMode(args.mode);
        const resolvedPath = resolveTargetPath(requestedFilePath, trustedWorkingDirectory);
        ensurePathWithinTrustedDirectory(resolvedPath, trustedWorkingDirectory);

        let fileExists = false;
        try {
          const stat = await fs.stat(resolvedPath);
          if (stat.isDirectory()) {
            return 'Error: write_file failed - target path is a directory';
          }
          fileExists = true;
        } catch (error) {
          const code = (error as NodeJS.ErrnoException | undefined)?.code;
          if (code !== 'ENOENT') {
            throw error;
          }
        }

        if (mode === 'create' && fileExists) {
          return `Error: write_file failed - file already exists: ${resolvedPath}`;
        }

        const parentDirectory = path.dirname(resolvedPath);
        ensurePathWithinTrustedDirectory(parentDirectory, trustedWorkingDirectory);
        await fs.mkdir(parentDirectory, { recursive: true });
        try {
          await fs.writeFile(
            resolvedPath,
            args.content,
            mode === 'create'
              ? { encoding: 'utf8', flag: 'wx' }
              : { encoding: 'utf8', flag: 'w' },
          );
        } catch (error) {
          const code = (error as NodeJS.ErrnoException | undefined)?.code;
          if (code === 'EEXIST' && mode === 'create') {
            return `Error: write_file failed - file already exists: ${resolvedPath}`;
          }
          throw error;
        }

        const created = !fileExists;
        const bytesWritten = Buffer.byteLength(args.content, 'utf8');
        return JSON.stringify(
          {
            ok: true,
            status: 'success',
            filePath: resolvedPath,
            mode,
            operation: created ? 'created' : 'updated',
            created,
            updated: !created,
            bytesWritten,
          },
          null,
          2,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return `Error: write_file failed - ${message}`;
      }
    },
  };
}

export function createListFilesToolDefinition() {
  return {
    description:
      'List files and directories available in a directory path for quick workspace exploration. Defaults to trusted working directory when path is omitted. Use recursive=true for nested entries and includePattern/maxEntries to keep results bounded.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Optional directory path to list. Relative paths resolve from runtime working directory. Defaults to trusted working directory.',
        },
        includeHidden: {
          type: 'boolean',
          description: 'Include dot-prefixed files and folders when true (default: true).',
        },
        recursive: {
          type: 'boolean',
          description: 'When true, include nested entries recursively (default: false).',
        },
        includePattern: {
          type: 'string',
          description: 'Optional glob-like filter (supports comma-separated patterns), for example: **/*.md',
        },
        maxEntries: {
          type: 'number',
          description: `Maximum number of returned entries (default: ${DEFAULT_LIST_MAX_ENTRIES}, max: ${MAX_LIST_MAX_ENTRIES}).`,
        },
      },
      required: [],
      additionalProperties: false,
    },
    execute: async (args: any, _sequenceId?: string, _parentToolCall?: string, context?: ToolContext) => {
      try {
        const trustedWorkingDirectory = getTrustedWorkingDirectory(context);
        const requestedPath = String(args.path ?? '.');
        const resolvedPath = resolveTargetPath(requestedPath, trustedWorkingDirectory);
        ensurePathWithinTrustedDirectory(resolvedPath, trustedWorkingDirectory, { allowSkillPathAlias: true });
        const includeHidden = Boolean(args.includeHidden ?? true);
        const recursive = Boolean(args.recursive ?? false);
        const includePattern = String(args.includePattern ?? '').trim();
        const maxEntries = clamp(
          Number(args.maxEntries ?? DEFAULT_LIST_MAX_ENTRIES),
          1,
          MAX_LIST_MAX_ENTRIES,
        );

        const items = await fg(['**/*'], {
          cwd: resolvedPath,
          deep: recursive ? Infinity : 1,
          ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**'],
          onlyFiles: false,
          markDirectories: true,
          dot: includeHidden,
        });

        const filteredItems = items
          .map((entry) => normalizePath(entry))
          .filter((entry) => shouldIncludeFile(entry, includePattern))
          .sort((left, right) => left.localeCompare(right));
        const totalMatchedEntries = filteredItems.length;
        const truncated = totalMatchedEntries > maxEntries;
        const returnedEntries = truncated ? filteredItems.slice(0, maxEntries) : filteredItems;
        const message = totalMatchedEntries === 0
          ? 'No files or directories found in the requested path.'
          : (
            truncated
              ? `Result truncated to ${maxEntries} entries out of ${totalMatchedEntries}. Narrow with includePattern or path.`
              : undefined
          );

        return JSON.stringify(
          {
            requestedPath,
            path: resolvedPath,
            recursive,
            includePattern: includePattern || undefined,
            maxEntries,
            total: totalMatchedEntries,
            returned: returnedEntries.length,
            truncated,
            entries: returnedEntries,
            found: totalMatchedEntries > 0,
            message,
          },
          null,
          2,
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') {
          return `Error: list_files failed - Directory not found: ${String(args.path)}`;
        }
        const message = error instanceof Error ? error.message : String(error);
        return `Error: list_files failed - ${message}`;
      }
    },
  };
}

export function createGrepToolDefinition() {
  return {
    description:
      'Search text across files to find destinations. Supports plain text or regex queries with optional include filtering.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Text or regex pattern to search for.',
        },
        isRegexp: {
          type: 'boolean',
          description: 'When true, treat query as regular expression (default: false).',
        },
        directoryPath: {
          type: 'string',
          description: 'Optional root directory for recursive search (default: current working directory).',
        },
        includePattern: {
          type: 'string',
          description: 'Optional include pattern (glob-like). Supports comma-separated patterns.',
        },
        maxResults: {
          type: 'number',
          description: `Maximum matches to return (default: ${DEFAULT_GREP_MAX_RESULTS}, max: ${MAX_GREP_MAX_RESULTS}).`,
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
    execute: async (args: any, _sequenceId?: string, _parentToolCall?: string, context?: ToolContext) => {
      try {
        const query = String(args.query ?? '').trim();
        if (!query) {
          return 'Error: grep failed - query must be a non-empty string';
        }

        const trustedWorkingDirectory = getTrustedWorkingDirectory(context);
        const isRegexp = Boolean(args.isRegexp ?? false);
        const directoryPath = args.directoryPath
          ? resolveTargetPath(String(args.directoryPath), trustedWorkingDirectory)
          : trustedWorkingDirectory;
        ensurePathWithinTrustedDirectory(directoryPath, trustedWorkingDirectory, { allowSkillPathAlias: true });
        const includePattern = typeof args.includePattern === 'string' ? args.includePattern : undefined;
        const maxResults = clamp(Number(args.maxResults ?? DEFAULT_GREP_MAX_RESULTS), 1, MAX_GREP_MAX_RESULTS);

        const matcher = isRegexp ? new RegExp(query, 'i') : new RegExp(escapeRegExp(query), 'i');
        const allFiles = await collectFilesRecursively(directoryPath);
        const matches: Array<{ path: string; line: number; content: string }> = [];

        for (const filePath of allFiles) {
          const relativePath = path.relative(directoryPath, filePath);
          if (!shouldIncludeFile(relativePath, includePattern)) {
            continue;
          }

          await searchInFile({
            filePath,
            relativePath,
            matcher,
            matches,
            maxResults,
          });

          if (matches.length >= maxResults) {
            break;
          }
        }

        return JSON.stringify(
          {
            query,
            isRegexp,
            directoryPath,
            includePattern: includePattern ?? null,
            totalMatches: matches.length,
            truncated: matches.length >= maxResults,
            matches,
          },
          null,
          2,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return `Error: grep failed - ${message}`;
      }
    },
  };
}
