/**
 * Web browser app-shell E2E coverage.
 *
 * Purpose:
 * - Verify the real web app loads and a seeded world can be opened from the home page.
 *
 * Key Features:
 * - Covers home-page rendering through the real local server + Vite app.
 * - Validates searching for and opening a lightweight seeded world from the real UI.
 *
 * Implementation Notes:
 * - Seeds a lightweight world over the live API so this smoke test avoids the slower real-LLM fixture path.
 *
 * Recent Changes:
 * - 2026-03-24: Wait for the API health endpoint before resetting the seeded smoke world to avoid startup races in Test Explorer.
 * - 2026-03-11: Switched home entry coverage to the search + centered-card open flow and removed the dot/card selector ambiguity.
 * - 2026-03-10: Added initial app-shell smoke coverage for Playwright web E2E.
 */

import { test, expect } from '@playwright/test';
import { waitForApiReady } from './support/api-ready.js';
import { gotoHome, openWorldFromHome } from './support/web-harness.js';

const API_BASE_URL = 'http://127.0.0.1:3000/api';
const APP_SHELL_WORLD_NAME = 'e2e-app-shell-web';

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`App shell API request failed: ${response.status} ${response.statusText} for ${path}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

async function resetAppShellWorld(): Promise<void> {
  await waitForApiReady();

  const worlds = await apiRequest<Array<{ name?: string }>>('/worlds');
  const hasWorld = worlds.some((world) => String(world?.name || '').trim() === APP_SHELL_WORLD_NAME);

  if (hasWorld) {
    await apiRequest(`/worlds/${encodeURIComponent(APP_SHELL_WORLD_NAME)}`, { method: 'DELETE' });
  }

  await apiRequest('/worlds', {
    method: 'POST',
    body: JSON.stringify({
      name: APP_SHELL_WORLD_NAME,
      description: 'App shell smoke world',
      turnLimit: 5,
      variables: '',
    }),
  });
}

test.beforeAll(async () => {
  await resetAppShellWorld();
});

test('loads the home page and opens the seeded world', async ({ page }) => {
  await gotoHome(page);
  await expect(page.getByTestId('world-carousel')).toBeVisible();
  await openWorldFromHome(page, APP_SHELL_WORLD_NAME);
  await expect(page.getByTestId('world-page')).toBeVisible();
  await expect(page.getByTestId('chat-history')).toBeVisible();
});
