/**
 * Purpose:
 * - Verify the web Vite config resolves its root directory correctly across platforms.
 *
 * Key Features:
 * - Guards against Windows path normalization regressions in production builds.
 * - Asserts the configured root matches the actual `web/` filesystem directory.
 *
 * Notes on Implementation:
 * - The test imports the shipped Vite config as a black-box build contract.
 * - `fileURLToPath` is the canonical cross-platform expectation for file URL conversion.
 *
 * Summary of Recent Changes:
 * - 2026-03-23: Added a regression test for Windows-safe Vite root resolution.
 */

import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import viteConfig from '../../web/vite.config.js';

describe('web vite config', () => {
  it('uses the web directory as a filesystem root path', () => {
    const expectedRoot = fileURLToPath(new URL('../../web/', import.meta.url));

    expect(viteConfig.root).toBe(expectedRoot);
  });
});