/**
 * Unit Tests for GitHub World Import Utilities
 *
 * Purpose:
 * - Validate shorthand resolution and path-safety guards for GitHub world import sources.
 *
 * Key Features:
 * - Confirms supported alias mapping and world-path derivation.
 * - Confirms invalid shorthand and unsupported alias errors.
 * - Confirms unsafe relative path rejection.
 *
 * Implementation Notes:
 * - Uses pure utility-level tests without network access.
 * - Uses Vitest expectations for explicit error-code assertions.
 *
 * Recent Changes:
 * - 2026-02-25: Added baseline unit coverage for GitHub shorthand import resolver.
 */

import { describe, expect, it } from 'vitest';
import {
  ensureSafeRelativePath,
  GitHubWorldImportError,
  resolveGitHubWorldShorthand,
} from '../../core/storage/github-world-import.js';

describe('resolveGitHubWorldShorthand', () => {
  it('resolves supported alias and world name', () => {
    const resolved = resolveGitHubWorldShorthand('@awesome-agent-world/infinite-etude');
    expect(resolved).toEqual({
      shorthand: '@awesome-agent-world/infinite-etude',
      alias: 'awesome-agent-world',
      worldName: 'infinite-etude',
      owner: 'yysun',
      repo: 'awesome-agent-world',
      branch: 'main',
      worldPath: 'data/worlds/infinite-etude',
    });
  });

  it('rejects invalid shorthand format', () => {
    expect(() => resolveGitHubWorldShorthand('awesome-agent-world/infinite-etude')).toThrowError(
      GitHubWorldImportError,
    );

    try {
      resolveGitHubWorldShorthand('awesome-agent-world/infinite-etude');
    } catch (error) {
      const typedError = error as GitHubWorldImportError;
      expect(typedError.code).toBe('invalid-shorthand');
    }
  });

  it('rejects unsupported alias', () => {
    expect(() => resolveGitHubWorldShorthand('@other-repo/infinite-etude')).toThrowError(
      GitHubWorldImportError,
    );

    try {
      resolveGitHubWorldShorthand('@other-repo/infinite-etude');
    } catch (error) {
      const typedError = error as GitHubWorldImportError;
      expect(typedError.code).toBe('unsupported-alias');
    }
  });
});

describe('ensureSafeRelativePath', () => {
  it('accepts normal nested relative paths', () => {
    expect(ensureSafeRelativePath('agents/config.json')).toBe('agents/config.json');
    expect(ensureSafeRelativePath('chats/session-1/messages.json')).toBe('chats/session-1/messages.json');
  });

  it('rejects path traversal segments', () => {
    expect(() => ensureSafeRelativePath('../config.json')).toThrowError(GitHubWorldImportError);
    expect(() => ensureSafeRelativePath('agents/../../config.json')).toThrowError(GitHubWorldImportError);
  });

  it('rejects absolute paths', () => {
    expect(() => ensureSafeRelativePath('/tmp/config.json')).toThrowError(GitHubWorldImportError);
  });
});
