/**
 * Release metadata contract tests.
 *
 * Purpose:
 * - Lock the release tag/version/channel rules used by the Electron release workflow.
 *
 * Key Features:
 * - Covers tagged release refs and manual workflow dispatch inputs.
 * - Verifies stable vs prerelease channel selection.
 * - Verifies invalid tags and version drift fail fast.
 *
 * Implementation Notes:
 * - Exercises the pure helper exported from `scripts/release-metadata.js`.
 * - Avoids shelling out so failures stay deterministic and fast.
 *
 * Recent Changes:
 * - 2026-03-21: Added regression coverage for manual release dispatch and tag validation.
 */

import { describe, expect, it } from 'vitest';

import { isDirectExecution, resolveReleaseMetadata, toFileHref } from '../scripts/release-metadata.js';

describe('release-metadata', () => {
  it('derives a stable release from a tag-triggered ref', () => {
    expect(
      resolveReleaseMetadata({
        refName: 'v0.15.0',
        inputTag: '',
        packageVersion: '0.15.0',
      })
    ).toEqual({
      tag: 'v0.15.0',
      releaseType: 'release',
    });
  });

  it('prefers the manual workflow dispatch tag and marks prereleases correctly', () => {
    expect(
      resolveReleaseMetadata({
        refName: 'main',
        inputTag: 'v0.15.0-beta.1',
        packageVersion: '0.15.0-beta.1',
      })
    ).toEqual({
      tag: 'v0.15.0-beta.1',
      releaseType: 'prerelease',
    });
  });

  it('fails fast when the provided tag does not match the package version', () => {
    expect(() =>
      resolveReleaseMetadata({
        refName: 'v0.15.1',
        inputTag: '',
        packageVersion: '0.15.0',
      })
    ).toThrow('Tag/version mismatch');
  });

  it('normalizes Windows-style script paths to file hrefs', () => {
    expect(toFileHref('C:\\repo\\scripts\\release-metadata.js')).toBe(
      'file:///C:/repo/scripts/release-metadata.js'
    );
  });

  it('detects direct execution for Windows-style script paths', () => {
    expect(
      isDirectExecution(
        'file:///C:/repo/scripts/release-metadata.js',
        'C:\\repo\\scripts\\release-metadata.js'
      )
    ).toBe(true);
  });
});