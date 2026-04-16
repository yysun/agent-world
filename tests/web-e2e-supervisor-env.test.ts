/**
 * Web E2E supervisor env regression tests.
 *
 * Purpose:
 * - Lock the Playwright web E2E supervisor to explicit `.env` hydration before child processes spawn.
 *
 * Key Features:
 * - Verifies the supervisor loads `.env` into the provided environment object.
 * - Prevents provider-backed web E2E flows from depending on implicit parent-shell env state.
 *
 * Implementation Notes:
 * - Imports the real supervisor helper directly for deterministic env assertions.
 * - Avoids spawning child processes so the regression coverage stays fast and local.
 *
 * Summary of Recent Changes:
 * - 2026-04-16: Added coverage for explicit `.env` hydration in the web E2E supervisor.
 */

import { describe, expect, it, vi } from 'vitest';

import { hydrateStartWebServersEnv } from './web-e2e/support/start-web-servers.mjs';

describe('web e2e supervisor env', () => {
  it('hydrates child-process env from dotenv before startup', () => {
    const env: NodeJS.ProcessEnv = {};
    const loadEnv = vi.fn(({ processEnv }: { processEnv: NodeJS.ProcessEnv }) => {
      processEnv.GOOGLE_API_KEY = 'test-google-key';
      return { parsed: { GOOGLE_API_KEY: 'test-google-key' } };
    });

    const hydratedEnv = hydrateStartWebServersEnv(env, '/tmp/agent-world', loadEnv);

    expect(hydratedEnv).toBe(env);
    expect(hydratedEnv.GOOGLE_API_KEY).toBe('test-google-key');
    expect(loadEnv).toHaveBeenCalledOnce();
    expect(loadEnv).toHaveBeenCalledWith({
      path: '/tmp/agent-world/.env',
      processEnv: env,
      quiet: true,
    });
  });
});