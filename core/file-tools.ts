/**
 * File Tools Module - Built-in workspace inspection tools for LLM workflows.
 *
 * Features:
 * - Exposes built-in `read_file`, `list_files`, and `grep` tool definitions
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
 * - 2026-02-16: Switched `path` import to namespace style for Vitest mock compatibility.
 * - 2026-02-16: Initial implementation of built-in file inspection tools.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import {
  resolveTrustedShellWorkingDirectory,
  validateShellDirectoryRequest,
} from './shell-cmd-tool.js';

type ToolContext = {
  workingDirectory?: string;
  world?: {
    variables?: string;
  };
};

const DEFAULT_READ_LIMIT = 200;
const MAX_READ_LIMIT = 2000;
const DEFAULT_GREP_MAX_RESULTS = 200;
const MAX_GREP_MAX_RESULTS = 2000;
const MAX_GREP_FILE_BYTES = 1024 * 1024;

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

function ensurePathWithinTrustedDirectory(
  resolvedPath: string,
  trustedWorkingDirectory: string,
): void {
  const validation = validateShellDirectoryRequest(resolvedPath, trustedWorkingDirectory);
  if (!validation.valid) {
    throw new Error(validation.error);
  }
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
    if (!pattern.includes('*') && !pattern.includes('?')) {
      return normalizedRelativePath.includes(normalizePath(pattern));
    }
    return globToRegExp(pattern).test(normalizedRelativePath);
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
      'Read a file for context gathering. Supports line-based pagination with optional offset and limit.',
    parameters: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'File path to read. Relative paths resolve from runtime working directory.',
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
      required: ['filePath'],
      additionalProperties: false,
    },
    execute: async (args: any, _sequenceId?: string, _parentToolCall?: string, context?: ToolContext) => {
      try {
        const trustedWorkingDirectory = getTrustedWorkingDirectory(context);
        const resolvedPath = resolveTargetPath(String(args.filePath), trustedWorkingDirectory);
        ensurePathWithinTrustedDirectory(resolvedPath, trustedWorkingDirectory);
        const rawContent = await fs.readFile(resolvedPath, 'utf8');
        const fileContent = toUtf8String(rawContent);
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

export function createListFilesToolDefinition() {
  return {
    description:
      'List files and directories available in a directory path for quick workspace exploration.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Directory path to list. Relative paths resolve from runtime working directory.',
        },
        includeHidden: {
          type: 'boolean',
          description: 'Include dot-prefixed files and folders when true (default: false).',
        },
      },
      required: ['path'],
      additionalProperties: false,
    },
    execute: async (args: any, _sequenceId?: string, _parentToolCall?: string, context?: ToolContext) => {
      try {
        const trustedWorkingDirectory = getTrustedWorkingDirectory(context);
        const resolvedPath = resolveTargetPath(String(args.path), trustedWorkingDirectory);
        ensurePathWithinTrustedDirectory(resolvedPath, trustedWorkingDirectory);
        const includeHidden = Boolean(args.includeHidden ?? false);
        const rawEntries = await fs.readdir(resolvedPath, { withFileTypes: true });
        const entries = toArray<{ isDirectory: () => boolean; name: string }>(rawEntries);

        const items = entries
          .filter((entry) => includeHidden || !entry.name.startsWith('.'))
          .map((entry) => (entry.isDirectory() ? `${entry.name}/` : entry.name))
          .sort((left, right) => left.localeCompare(right));

        return JSON.stringify(
          {
            path: resolvedPath,
            total: items.length,
            entries: items,
          },
          null,
          2,
        );
      } catch (error) {
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
        ensurePathWithinTrustedDirectory(directoryPath, trustedWorkingDirectory);
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
