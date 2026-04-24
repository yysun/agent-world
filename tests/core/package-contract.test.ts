/**
 * Core package dependency contract tests.
 *
 * Purpose:
 * - Prevent runtime package drift that causes multiple `llm-runtime` installs across the repo.
 *
 * Key Features:
 * - Verifies the root, core, and Electron package manifests declare the same `llm-runtime` version.
 * - Verifies the public `agent-world/core` export exposes the Electron runtime APIs needed without a loader.
 *
 * Implementation Notes:
 * - Reads the real package manifests with `node:fs` so the contract stays independent of mocked filesystem state.
 * - Resolves `agent-world/core` through the Vitest alias to validate the current source tree without depending on a prebuilt `dist/` artifact.
 * - Treats dependency-version parity as a repository boundary because drift can bypass Vitest mocks and load different runtime copies.
 *
 * Summary of Recent Changes:
 * - 2026-04-24: Switched the public core export assertion to import `agent-world/core` so the test exercises the actual package boundary used by Electron.
 * - 2026-04-24: Added regression coverage for `llm-runtime` version alignment across root, core, and Electron manifests.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return actual;
});

type PackageJsonWithDependencies = {
  dependencies?: Record<string, string | undefined>;
  exports?: Record<string, {
    import?: string;
    types?: string;
  } | string | undefined>;
};

function readJson(relativePath: string): PackageJsonWithDependencies {
  return JSON.parse(readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')) as PackageJsonWithDependencies;
}

describe('core package dependency contract', () => {
  it('keeps llm-runtime aligned across root, core, and electron manifests', () => {
    const rootPackage = readJson('../../package.json');
    const corePackage = readJson('../../core/package.json');
    const electronPackage = readJson('../../electron/package.json');

    expect(corePackage.dependencies?.['llm-runtime']).toBe(rootPackage.dependencies?.['llm-runtime']);
    expect(electronPackage.dependencies?.['llm-runtime']).toBe(rootPackage.dependencies?.['llm-runtime']);
  });

  it('exposes Electron runtime APIs from the public core package export', async () => {
    const rootPackage = readJson('../../package.json');
    const coreExport = rootPackage.exports?.['./core'];

    expect(coreExport).toMatchObject({
      import: './dist/core/index.js',
      types: './dist/core/index.d.ts',
    });

    const coreModule = await import('agent-world/core');

    expect(coreModule.createStorage).toBeTypeOf('function');
    expect(coreModule.createStorageFromEnv).toBeTypeOf('function');
    expect(coreModule.stageGitHubFolderFromRepo).toBeTypeOf('function');
    expect(coreModule.listPendingHitlPromptEventsFromMessages).toBeTypeOf('function');
  });
});