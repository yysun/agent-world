/**
 * Playwright web E2E configuration.
 *
 * Purpose:
 * - Configure the real browser web E2E suite for the repo.
 *
 * Key Features:
 * - Runs the browser specs under `tests/web-e2e/`.
 * - Starts the real local server and Vite web app against an isolated workspace.
 * - Keeps execution serial for real-provider chat flows.
 *
 * Implementation Notes:
 * - Tests use the real REST API and SSE path, not mocked browser shims.
 * - The web server process stays alive across tests; world reset happens per test via HTTP bootstrap.
 *
 * Recent Changes:
 * - 2026-03-11: Reduced the web Playwright per-test and expect timeout budget to 5 seconds.
 * - 2026-03-10: Added initial Playwright web harness config for real browser E2E coverage.
 * - 2026-03-10: Forced the full Chromium channel for web E2E to avoid bundled headless-shell launch hangs on this workstation.
 * - 2026-03-10: Disabled Chromium sandboxing for Playwright web E2E to match the local desktop environment.
 */

import * as path from 'node:path';
import { defineConfig } from '@playwright/test';

const WEB_WORKSPACE_PATH = path.resolve(process.cwd(), '.tmp', 'web-playwright-workspace');
export const WEB_E2E_TIMEOUT_MS = 5_000;

export default defineConfig({
  testDir: './tests/web-e2e',
  fullyParallel: false,
  workers: 1,
  timeout: WEB_E2E_TIMEOUT_MS,
  expect: {
    timeout: WEB_E2E_TIMEOUT_MS,
  },
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:8080',
    channel: 'chromium',
    headless: true,
    launchOptions: {
      args: ['--no-sandbox'],
    },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run web:e2e:serve',
    url: 'http://127.0.0.1:8080',
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: '3000',
      AGENT_WORLD_AUTO_OPEN: 'false',
      AGENT_WORLD_STORAGE_TYPE: 'sqlite',
      AGENT_WORLD_DATA_PATH: WEB_WORKSPACE_PATH,
      AGENT_WORLD_PROJECT_PATH: WEB_WORKSPACE_PATH,
      AGENT_WORLD_WORKSPACE_PATH: WEB_WORKSPACE_PATH,
      AGENT_WORLD_QUEUE_NO_RESPONSE_FALLBACK_MS: process.env.AGENT_WORLD_QUEUE_NO_RESPONSE_FALLBACK_MS || '250',
    },
  },
});
