/**
 * Playwright web config regression tests.
 *
 * Purpose:
 * - Lock the web E2E Playwright timeout contract and runner env hydration contract.
 *
 * Key Features:
 * - Verifies the per-test timeout exposed by the web Playwright config.
 * - Verifies the Playwright expect timeout stays aligned with the per-test timeout.
 * - Verifies the Playwright config can hydrate runner env vars from `.env` before tests bootstrap.
 *
 * Implementation Notes:
 * - Imports the real Playwright config module directly for a deterministic config-level assertion.
 * - Avoids running browser tests to keep coverage fast and local.
 *
 * Recent Changes:
 * - 2026-03-24: Added regression coverage for `.env` hydration into the Playwright runner env.
 * - 2026-03-11: Added regression coverage for the 5 second web Playwright timeout budget.
 */

import { describe, expect, it, vi } from 'vitest';

import playwrightWebConfig, {
  hydratePlaywrightWebEnv,
  WEB_E2E_TIMEOUT_MS,
} from '../playwright.web.config';

describe('playwright.web.config', () => {
  it('sets the web E2E test timeout to 5 seconds', () => {
    expect(WEB_E2E_TIMEOUT_MS).toBe(5_000);
    expect(playwrightWebConfig.timeout).toBe(5_000);
  });

  it('stops the web E2E run on the first failure', () => {
    expect(playwrightWebConfig.maxFailures).toBe(1);
  });

  it('keeps the expect timeout aligned with the test timeout', () => {
    expect(playwrightWebConfig.expect?.timeout).toBe(WEB_E2E_TIMEOUT_MS);
  });

  it('hydrates the Playwright runner env from dotenv before tests bootstrap', () => {
    const env: NodeJS.ProcessEnv = {};
    const loadEnv = vi.fn(({ processEnv }: { processEnv: NodeJS.ProcessEnv }) => {
      processEnv.GOOGLE_API_KEY = 'test-google-key';
      processEnv.AGENT_WORLD_QUEUE_NO_RESPONSE_FALLBACK_MS = '125';
      return { parsed: { GOOGLE_API_KEY: 'test-google-key' } };
    });

    const hydratedEnv = hydratePlaywrightWebEnv(env, '/tmp/agent-world', loadEnv);

    expect(hydratedEnv).toBe(env);
    expect(hydratedEnv.GOOGLE_API_KEY).toBe('test-google-key');
    expect(hydratedEnv.AGENT_WORLD_QUEUE_NO_RESPONSE_FALLBACK_MS).toBe('125');
  });
});
