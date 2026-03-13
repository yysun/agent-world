/**
 * Tool-permission fetch target tests.
 *
 * Purpose:
 * - Guard the shared E2E `web_fetch` target against regressions back to localhost/private URLs.
 *
 * Key Features:
 * - Verifies the shared permission-matrix fetch target stays public.
 * - Verifies obvious localhost/private targets are rejected by the regression guard.
 *
 * Implementation Notes:
 * - The test is deterministic and does not perform any real network access.
 * - Coverage is intentionally narrow because it protects only the E2E harness configuration.
 *
 * Recent Changes:
 * - 2026-03-12: Initial file added for the web_fetch permission-matrix regression.
 */

import { describe, expect, it } from 'vitest';

import {
  isLikelyLocalOrPrivateFetchTarget,
  TOOL_PERMISSION_FETCH_URL,
} from './tool-permission-fetch-target.js';

describe('tool permission fetch target', () => {
  it('keeps the shared E2E target on a public URL', () => {
    expect(isLikelyLocalOrPrivateFetchTarget(TOOL_PERMISSION_FETCH_URL)).toBe(false);
  });

  it('flags localhost and private network targets', () => {
    expect(isLikelyLocalOrPrivateFetchTarget('http://127.0.0.1:3000/health')).toBe(true);
    expect(isLikelyLocalOrPrivateFetchTarget('http://localhost:3000/health')).toBe(true);
    expect(isLikelyLocalOrPrivateFetchTarget('http://192.168.1.10/status')).toBe(true);
  });
});