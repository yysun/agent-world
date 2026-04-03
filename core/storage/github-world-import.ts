/**
 * GitHub World Import Utilities
 *
 * Purpose:
 * - Resolve supported GitHub shorthand world sources for import flows.
 * - Safely fetch and stage remote world folders into a temporary local directory.
 *
 * Key Features:
 * - Supports legacy `@awesome-agent-world/<world-name>` world shorthand mapping.
 * - Requires explicit `owner/repo` input for generic GitHub repo imports.
 * - Enforces strict alias allowlist and world-path derivation.
 * - Applies safety checks for unsupported entry types and unsafe paths.
 * - Enforces bounded file-count and byte limits during staging.
 * - Returns source metadata including commit SHA when available.
 *
 * Implementation Notes:
 * - Uses GitHub REST contents API with recursive traversal.
 * - Treats remote content as untrusted and validates every staged path.
 * - Uses temp directories and explicit cleanup callbacks.
 *
 * Recent Changes:
 * - 2026-04-03: Resolve the repo's default branch for generic GitHub folder imports when the user does not specify one.
 * - 2026-04-03: Added root-directory file listing and direct-file staging support so Electron skill installs can discover and stage repo-level SKILL.md files.
 * - 2026-02-25: Added shorthand resolver and secure GitHub staging for world import.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

const GITHUB_API_BASE = 'https://api.github.com';
const DEFAULT_BRANCH = 'main';
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_FILE_COUNT = 5_000;
const DEFAULT_MAX_TOTAL_BYTES = 50 * 1024 * 1024;

interface GitHubAliasMapping {
  alias: string;
  owner: string;
  repo: string;
  branch: string;
}

const ALLOWED_ALIAS_MAPPINGS: GitHubAliasMapping[] = [
  {
    alias: 'awesome-agent-world',
    owner: 'yysun',
    repo: 'awesome-agent-world',
    branch: DEFAULT_BRANCH
  }
];

export type GitHubWorldImportErrorCode =
  | 'invalid-shorthand'
  | 'unsupported-alias'
  | 'source-not-found'
  | 'fetch-failed'
  | 'unsupported-entry-type'
  | 'unsafe-path'
  | 'limits-exceeded';

export class GitHubWorldImportError extends Error {
  code: GitHubWorldImportErrorCode;
  details?: Record<string, unknown>;

  constructor(code: GitHubWorldImportErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'GitHubWorldImportError';
    this.code = code;
    this.details = details;
  }
}

export interface ResolvedGitHubWorldSource {
  shorthand: string;
  alias: string;
  worldName: string;
  owner: string;
  repo: string;
  branch: string;
  worldPath: string;
}

export interface ResolvedGitHubRepoSource {
  repoInput: string;
  owner: string;
  repo: string;
  branch: string;
}

interface GitHubContentsEntry {
  type: string;
  path: string;
  size?: number;
  download_url?: string | null;
}

interface GitHubRepoMetadata {
  default_branch?: string;
}

interface StageRemoteWorldOptions {
  maxFileCount?: number;
  maxTotalBytes?: number;
  requestTimeoutMs?: number;
  tempPrefix?: string;
}

export interface StagedGitHubWorldResult {
  stagingRootPath: string;
  worldFolderPath: string;
  source: {
    shorthand: string;
    owner: string;
    repo: string;
    branch: string;
    worldPath: string;
    commitSha: string | null;
  };
  cleanup: () => Promise<void>;
}

export interface StagedGitHubFolderResult {
  stagingRootPath: string;
  folderPath: string;
  source: {
    repoInput: string;
    owner: string;
    repo: string;
    branch: string;
    folderPath: string;
    commitSha: string | null;
  };
  cleanup: () => Promise<void>;
}

export interface GitHubDirectoryListingResult {
  repoInput: string;
  owner: string;
  repo: string;
  branch: string;
  directoryPath: string;
  directoryNames: string[];
  fileNames: string[];
}

function sanitizeWorldName(worldName: string): string {
  return worldName.trim();
}

function encodeGithubPathSegments(value: string): string {
  return value
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function getAbortSignal(timeoutMs: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(timeoutMs);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}

async function fetchJson(url: string, timeoutMs: number): Promise<Response> {
  try {
    return await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'agent-world-import'
      },
      signal: getAbortSignal(timeoutMs)
    });
  } catch (error) {
    const err = error as Error;
    throw new GitHubWorldImportError(
      'fetch-failed',
      `Failed to fetch GitHub source: ${err.message || 'Unknown network error'}`,
      { url }
    );
  }
}

async function fetchCommitSha(owner: string, repo: string, branch: string, timeoutMs: number): Promise<string | null> {
  const url = `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(branch)}`;
  const response = await fetchJson(url, timeoutMs);
  if (!response.ok) {
    return null;
  }
  const data = await response.json() as { sha?: string };
  return typeof data.sha === 'string' && data.sha ? data.sha : null;
}

function getPathBasename(value: string): string {
  const segments = String(value || '')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);
  return segments[segments.length - 1] || '';
}

function normalizeGitHubContentsPath(value: string): string {
  const trimmed = String(value || '').trim();
  if (!trimmed || trimmed === '.' || trimmed === '/') {
    return '';
  }

  return trimmed.replace(/^\/+|\/+$/g, '');
}

function normalizeRelativePath(worldPath: string, fullPath: string): string {
  if (fullPath === worldPath) {
    return getPathBasename(fullPath);
  }

  const prefix = `${worldPath}/`;
  if (!fullPath.startsWith(prefix)) {
    throw new GitHubWorldImportError('unsafe-path', 'Fetched file path does not match resolved world path.', {
      fullPath,
      worldPath
    });
  }
  return fullPath.slice(prefix.length);
}

export function ensureSafeRelativePath(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, '/').trim();
  if (!normalized) {
    throw new GitHubWorldImportError('unsafe-path', 'Fetched path is empty.');
  }
  if (path.isAbsolute(normalized)) {
    throw new GitHubWorldImportError('unsafe-path', 'Absolute paths are not allowed in fetched world content.', {
      relativePath
    });
  }
  const segments = normalized.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new GitHubWorldImportError('unsafe-path', 'Fetched content contains unsupported path segments.', {
      relativePath
    });
  }
  return normalized;
}

async function listGithubFilesRecursively(
  owner: string,
  repo: string,
  branch: string,
  directoryPath: string,
  timeoutMs: number,
  collector: GitHubContentsEntry[]
): Promise<void> {
  const encodedPath = encodeGithubPathSegments(directoryPath);
  const url = `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`;
  const response = await fetchJson(url, timeoutMs);

  if (response.status === 404) {
    throw new GitHubWorldImportError('source-not-found', `GitHub world path not found: ${owner}/${repo}/${directoryPath}@${branch}`, {
      owner,
      repo,
      branch,
      worldPath: directoryPath
    });
  }

  if (!response.ok) {
    throw new GitHubWorldImportError('fetch-failed', `GitHub responded with ${response.status} while listing world path.`, {
      owner,
      repo,
      branch,
      worldPath: directoryPath,
      status: response.status
    });
  }

  const payload = await response.json() as GitHubContentsEntry[] | GitHubContentsEntry;
  const entries = Array.isArray(payload) ? payload : [payload];

  for (const entry of entries) {
    if (entry.type === 'dir') {
      await listGithubFilesRecursively(owner, repo, branch, entry.path, timeoutMs, collector);
      continue;
    }

    if (entry.type === 'file') {
      collector.push(entry);
      continue;
    }

    throw new GitHubWorldImportError(
      'unsupported-entry-type',
      `Unsupported GitHub entry type '${entry.type}' in world source.`,
      {
        entryType: entry.type,
        path: entry.path
      }
    );
  }
}

async function downloadFileBytes(url: string, timeoutMs: number): Promise<Uint8Array> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'agent-world-import'
      },
      signal: getAbortSignal(timeoutMs)
    });

    if (!response.ok) {
      throw new GitHubWorldImportError('fetch-failed', `GitHub file download failed with status ${response.status}.`, {
        url,
        status: response.status
      });
    }

    const arrayBuffer = await response.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  } catch (error) {
    if (error instanceof GitHubWorldImportError) {
      throw error;
    }
    const err = error as Error;
    throw new GitHubWorldImportError(
      'fetch-failed',
      `Failed to download GitHub file: ${err.message || 'Unknown error'}`,
      { url }
    );
  }
}

export function resolveGitHubWorldShorthand(source: string): ResolvedGitHubWorldSource {
  const trimmed = String(source || '').trim();
  const match = trimmed.match(/^@([^/\s]+)\/([^/\s]+)$/);
  if (!match) {
    throw new GitHubWorldImportError(
      'invalid-shorthand',
      "GitHub world shorthand must use format '@<repo-alias>/<world-name>'.",
      { source: trimmed }
    );
  }

  const alias = String(match[1] || '').trim();
  const worldName = sanitizeWorldName(String(match[2] || ''));
  if (!alias || !worldName) {
    throw new GitHubWorldImportError('invalid-shorthand', 'GitHub world shorthand must include alias and world name.', {
      source: trimmed
    });
  }

  const mapping = ALLOWED_ALIAS_MAPPINGS.find((item) => item.alias === alias);
  if (!mapping) {
    throw new GitHubWorldImportError(
      'unsupported-alias',
      `Unsupported GitHub shorthand alias '${alias}'. Supported alias: @awesome-agent-world/<world-name>.`,
      { alias }
    );
  }

  return {
    shorthand: trimmed,
    alias,
    worldName,
    owner: mapping.owner,
    repo: mapping.repo,
    branch: mapping.branch,
    worldPath: `data/worlds/${worldName}`
  };
}

export function resolveGitHubRepoSource(repoInput: string): ResolvedGitHubRepoSource {
  const trimmed = String(repoInput || '').trim();
  if (!trimmed) {
    throw new GitHubWorldImportError('invalid-shorthand', 'GitHub repo is required.', {
      repoInput: trimmed,
    });
  }

  const withoutScheme = trimmed.replace(/^https?:\/\/github\.com\//i, '');
  const [repoPart, branchPart] = withoutScheme.split('#', 2);
  const normalizedRepoPart = String(repoPart || '').trim().replace(/^\/+|\/+$/g, '');
  const requestedBranch = String(branchPart || '').trim();

  if (!normalizedRepoPart) {
    throw new GitHubWorldImportError('invalid-shorthand', 'GitHub repo is required.', {
      repoInput: trimmed,
    });
  }

  const directMatch = normalizedRepoPart.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (directMatch) {
    return {
      repoInput: trimmed,
      owner: String(directMatch[1] || '').trim(),
      repo: String(directMatch[2] || '').trim(),
      branch: requestedBranch || DEFAULT_BRANCH,
    };
  }

  throw new GitHubWorldImportError(
    'unsupported-alias',
    `Unsupported GitHub repo '${trimmed}'. Use explicit 'owner/repo' syntax.`,
    { repoInput: trimmed }
  );
}

function hasExplicitGitHubBranch(repoInput: string): boolean {
  const trimmed = String(repoInput || '').trim();
  if (!trimmed) {
    return false;
  }

  const withoutScheme = trimmed.replace(/^https?:\/\/github\.com\//i, '');
  const [, branchPart] = withoutScheme.split('#', 2);
  return Boolean(String(branchPart || '').trim());
}

async function fetchDefaultBranch(owner: string, repo: string, timeoutMs: number): Promise<string | null> {
  const url = `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const response = await fetchJson(url, timeoutMs);
  if (!response.ok) {
    return null;
  }

  const payload = await response.json() as GitHubRepoMetadata;
  const defaultBranch = String(payload.default_branch || '').trim();
  return defaultBranch || null;
}

async function resolveGitHubRepoSourceForRequest(repoInput: string, timeoutMs: number): Promise<ResolvedGitHubRepoSource> {
  const resolvedRepo = resolveGitHubRepoSource(repoInput);
  if (hasExplicitGitHubBranch(repoInput)) {
    return resolvedRepo;
  }

  const defaultBranch = await fetchDefaultBranch(resolvedRepo.owner, resolvedRepo.repo, timeoutMs);
  if (!defaultBranch || defaultBranch === resolvedRepo.branch) {
    return resolvedRepo;
  }

  return {
    ...resolvedRepo,
    branch: defaultBranch,
  };
}

export async function listGitHubDirectoryNames(
  repoInput: string,
  directoryPath: string,
  options: Pick<StageRemoteWorldOptions, 'requestTimeoutMs'> = {}
): Promise<GitHubDirectoryListingResult> {
  const requestTimeoutMs = Number.isFinite(options.requestTimeoutMs)
    ? Math.max(1, Number(options.requestTimeoutMs))
    : DEFAULT_REQUEST_TIMEOUT_MS;
  const resolvedRepo = await resolveGitHubRepoSourceForRequest(repoInput, requestTimeoutMs);
  const normalizedDirectoryPath = normalizeGitHubContentsPath(directoryPath);
  const resolvedDirectoryPath = normalizedDirectoryPath || '.';

  if (normalizedDirectoryPath) {
    ensureSafeRelativePath(normalizedDirectoryPath);
  }

  const encodedPath = encodeGithubPathSegments(normalizedDirectoryPath);
  const contentsPath = encodedPath ? `/contents/${encodedPath}` : '/contents';
  const url = `${GITHUB_API_BASE}/repos/${encodeURIComponent(resolvedRepo.owner)}/${encodeURIComponent(resolvedRepo.repo)}${contentsPath}?ref=${encodeURIComponent(resolvedRepo.branch)}`;
  const response = await fetchJson(url, requestTimeoutMs);

  if (response.status === 404) {
    throw new GitHubWorldImportError('source-not-found', `GitHub path not found: ${resolvedRepo.owner}/${resolvedRepo.repo}/${resolvedDirectoryPath}@${resolvedRepo.branch}`, {
      owner: resolvedRepo.owner,
      repo: resolvedRepo.repo,
      branch: resolvedRepo.branch,
      directoryPath: resolvedDirectoryPath,
    });
  }

  if (!response.ok) {
    throw new GitHubWorldImportError('fetch-failed', `GitHub responded with ${response.status} while listing directory path.`, {
      owner: resolvedRepo.owner,
      repo: resolvedRepo.repo,
      branch: resolvedRepo.branch,
      directoryPath: resolvedDirectoryPath,
      status: response.status,
    });
  }

  const payload = await response.json() as GitHubContentsEntry[] | GitHubContentsEntry;
  const entries = Array.isArray(payload) ? payload : [payload];
  const directoryNames: string[] = [];
  const fileNames: string[] = [];

  for (const entry of entries) {
    if (entry.type === 'dir') {
      const directoryName = getPathBasename(entry.path);
      if (directoryName) {
        directoryNames.push(directoryName);
      }
      continue;
    }

    if (entry.type === 'file') {
      const fileName = getPathBasename(entry.path);
      if (fileName) {
        fileNames.push(fileName);
      }
      continue;
    }

    throw new GitHubWorldImportError(
      'unsupported-entry-type',
      `Unsupported GitHub entry type '${entry.type}' in directory listing.`,
      {
        entryType: entry.type,
        path: entry.path,
      }
    );
  }

  directoryNames.sort((left, right) => left.localeCompare(right));
  fileNames.sort((left, right) => left.localeCompare(right));

  return {
    repoInput: resolvedRepo.repoInput,
    owner: resolvedRepo.owner,
    repo: resolvedRepo.repo,
    branch: resolvedRepo.branch,
    directoryPath: resolvedDirectoryPath,
    directoryNames,
    fileNames,
  };
}

export async function stageGitHubFolderFromRepo(
  repoInput: string,
  folderPath: string,
  options: StageRemoteWorldOptions & { folderName?: string } = {}
): Promise<StagedGitHubFolderResult> {
  const maxFileCount = Number.isFinite(options.maxFileCount) ? Math.max(1, Number(options.maxFileCount)) : DEFAULT_MAX_FILE_COUNT;
  const maxTotalBytes = Number.isFinite(options.maxTotalBytes) ? Math.max(1, Number(options.maxTotalBytes)) : DEFAULT_MAX_TOTAL_BYTES;
  const requestTimeoutMs = Number.isFinite(options.requestTimeoutMs)
    ? Math.max(1, Number(options.requestTimeoutMs))
    : DEFAULT_REQUEST_TIMEOUT_MS;
  const tempPrefix = String(options.tempPrefix || 'agent-world-github-import-');

  const resolvedRepo = await resolveGitHubRepoSourceForRequest(repoInput, requestTimeoutMs);
  const normalizedFolderPath = String(folderPath || '').trim().replace(/^\/+|\/+$/g, '');
  if (!normalizedFolderPath) {
    throw new GitHubWorldImportError('invalid-shorthand', 'GitHub folder path is required.', {
      repoInput,
      folderPath,
    });
  }

  ensureSafeRelativePath(normalizedFolderPath);

  const requestedFolderName = String(options.folderName || getPathBasename(normalizedFolderPath)).trim();
  const folderName = requestedFolderName || getPathBasename(normalizedFolderPath);
  if (!folderName) {
    throw new GitHubWorldImportError('invalid-shorthand', 'GitHub folder name is required.', {
      repoInput,
      folderPath: normalizedFolderPath,
    });
  }

  const stagingRootPath = await mkdtemp(path.join(os.tmpdir(), tempPrefix));
  const stagedFolderPath = path.join(stagingRootPath, folderName);

  const cleanup = async () => {
    await rm(stagingRootPath, { recursive: true, force: true });
  };

  let totalBytes = 0;
  try {
    const stagedFolderRealPath = path.normalize(stagedFolderPath);
    const commitSha = await fetchCommitSha(resolvedRepo.owner, resolvedRepo.repo, resolvedRepo.branch, requestTimeoutMs);
    const files: GitHubContentsEntry[] = [];
    await listGithubFilesRecursively(
      resolvedRepo.owner,
      resolvedRepo.repo,
      resolvedRepo.branch,
      normalizedFolderPath,
      requestTimeoutMs,
      files
    );

    if (files.length === 0) {
      throw new GitHubWorldImportError('source-not-found', `No files were found in GitHub path '${normalizedFolderPath}'.`, {
        owner: resolvedRepo.owner,
        repo: resolvedRepo.repo,
        branch: resolvedRepo.branch,
        folderPath: normalizedFolderPath,
      });
    }

    if (files.length > maxFileCount) {
      throw new GitHubWorldImportError('limits-exceeded', `GitHub source exceeds file-count limit (${files.length}/${maxFileCount}).`, {
        fileCount: files.length,
        maxFileCount,
      });
    }

    for (const fileEntry of files) {
      if (!fileEntry.download_url) {
        throw new GitHubWorldImportError('fetch-failed', 'GitHub file entry does not include a download URL.', {
          path: fileEntry.path,
        });
      }

      const relativePath = ensureSafeRelativePath(normalizeRelativePath(normalizedFolderPath, fileEntry.path));
      const targetPath = path.normalize(path.join(stagedFolderPath, relativePath));
      const allowedPrefix = `${stagedFolderRealPath}${path.sep}`;
      if (targetPath !== stagedFolderRealPath && !targetPath.startsWith(allowedPrefix)) {
        throw new GitHubWorldImportError('unsafe-path', 'Fetched content attempted to escape the staging folder.', {
          relativePath,
        });
      }

      const fileBytes = await downloadFileBytes(fileEntry.download_url, requestTimeoutMs);
      totalBytes += fileBytes.byteLength;
      if (totalBytes > maxTotalBytes) {
        throw new GitHubWorldImportError('limits-exceeded', `GitHub source exceeds byte limit (${totalBytes}/${maxTotalBytes}).`, {
          totalBytes,
          maxTotalBytes,
        });
      }

      await mkdir(path.dirname(targetPath), { recursive: true });
      await writeFile(targetPath, fileBytes);
    }

    return {
      stagingRootPath,
      folderPath: stagedFolderPath,
      source: {
        repoInput: resolvedRepo.repoInput,
        owner: resolvedRepo.owner,
        repo: resolvedRepo.repo,
        branch: resolvedRepo.branch,
        folderPath: normalizedFolderPath,
        commitSha,
      },
      cleanup,
    };
  } catch (error) {
    await cleanup();
    if (error instanceof GitHubWorldImportError) {
      throw error;
    }
    const err = error as Error;
    throw new GitHubWorldImportError('fetch-failed', err.message || 'Failed to stage GitHub source.');
  }
}

export async function stageGitHubWorldFromShorthand(
  shorthand: string,
  options: StageRemoteWorldOptions = {}
): Promise<StagedGitHubWorldResult> {
  const resolved = resolveGitHubWorldShorthand(shorthand);
  try {
    const staged = await stageGitHubFolderFromRepo(
      `${resolved.owner}/${resolved.repo}#${resolved.branch}`,
      resolved.worldPath,
      {
        ...options,
        folderName: resolved.worldName,
      }
    );
    return {
      stagingRootPath: staged.stagingRootPath,
      worldFolderPath: staged.folderPath,
      source: {
        shorthand: resolved.shorthand,
        owner: resolved.owner,
        repo: resolved.repo,
        branch: resolved.branch,
        worldPath: resolved.worldPath,
        commitSha: staged.source.commitSha,
      },
      cleanup: staged.cleanup,
    };
  } catch (error) {
    if (error instanceof GitHubWorldImportError) {
      throw error;
    }
    const err = error as Error;
    throw new GitHubWorldImportError('fetch-failed', err.message || 'Failed to stage GitHub world source.');
  }
}
