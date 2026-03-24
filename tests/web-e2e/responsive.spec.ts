/**
 * Web browser responsive layout E2E coverage.
 *
 * Purpose:
 * - Verify the real web app keeps core home and world controls readable on a phone-sized viewport.
 *
 * Key Features:
 * - Confirms carousel arrows stay hidden on touch-sized home layouts.
 * - Confirms composer and chat-history controls keep readable font sizes and touch targets on mobile.
 *
 * Implementation Notes:
 * - Uses the live API and web app but creates its own simple world so no real LLM provider is required.
 * - Focuses on measurable layout outcomes (visibility, font size, touch target size, no horizontal overflow).
 *
 * Recent Changes:
 * - 2026-03-24: Wait for the API health endpoint before resetting the responsive world to avoid startup races in Test Explorer.
 * - 2026-03-11: Added a mobile chat-history width check so Doodle fieldset rules cannot leave a wide empty strip on the right.
 * - 2026-03-11: Added a mobile right-panel close-button regression so the overlay can be dismissed after opening.
 * - 2026-03-11: Added mobile right-panel checks so duplicate world-action rows stay hidden and chat-history fieldsets keep zero inset padding.
 * - 2026-03-11: Added a desktop carousel-arrow fit check so the home chevron controls stay legible inside their buttons.
 * - 2026-03-11: Added a direct dot-row fit assertion and restored outline-style inactive-dot coverage.
 * - 2026-03-11: Added a mobile visibility check for inactive carousel dots so they remain legible without hover.
 * - 2026-03-11: Added first-pass responsive E2E coverage for mobile home and world layouts.
 */

import { expect, test } from '@playwright/test';
import { waitForApiReady } from './support/api-ready.js';

const API_BASE_URL = 'http://127.0.0.1:3000/api';
const RESPONSIVE_WORLD_NAME = 'e2e-responsive-web';

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Responsive web E2E API request failed: ${response.status} ${response.statusText} for ${path}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

async function resetResponsiveWorld(): Promise<void> {
  await waitForApiReady();

  const worlds = await apiRequest<Array<{ name?: string }>>('/worlds');
  const hasWorld = worlds.some((world) => String(world?.name || '').trim() === RESPONSIVE_WORLD_NAME);

  if (hasWorld) {
    await apiRequest(`/worlds/${encodeURIComponent(RESPONSIVE_WORLD_NAME)}`, { method: 'DELETE' });
  }

  await apiRequest('/worlds', {
    method: 'POST',
    body: JSON.stringify({
      name: RESPONSIVE_WORLD_NAME,
      description: 'Responsive web layout regression world',
      turnLimit: 5,
      variables: '',
    }),
  });
}

test.beforeEach(async () => {
  await resetResponsiveWorld();
});

test('home carousel desktop arrows fit cleanly inside their buttons', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await expect(page.getByTestId('home-page')).toBeVisible();
  await expect(page.getByTestId('world-carousel')).toBeVisible();

  const arrowMetrics = await page.locator('.swipe-carousel-arrow').evaluateAll((elements) =>
    elements.map((element) => {
      const button = element as HTMLElement;
      const icon = button.querySelector('.carousel-arrow-icon') as SVGElement | null;
      return {
        clientWidth: button.clientWidth,
        clientHeight: button.clientHeight,
        scrollWidth: button.scrollWidth,
        scrollHeight: button.scrollHeight,
        iconWidth: icon?.getBoundingClientRect().width ?? 0,
        iconHeight: icon?.getBoundingClientRect().height ?? 0,
      };
    }),
  );

  expect(arrowMetrics).toHaveLength(2);
  for (const metric of arrowMetrics) {
    expect(metric.scrollWidth).toBeLessThanOrEqual(metric.clientWidth);
    expect(metric.scrollHeight).toBeLessThanOrEqual(metric.clientHeight);
    expect(metric.iconWidth).toBeGreaterThan(0);
    expect(metric.iconHeight).toBeGreaterThan(0);
  }
});

test('home carousel hides arrow controls on a phone-sized viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await expect(page.getByTestId('home-page')).toBeVisible();
  await expect(page.getByTestId('world-carousel')).toBeVisible();

  const arrowDisplays = await page.locator('.swipe-carousel-arrow').evaluateAll((elements) =>
    elements.map((element) => getComputedStyle(element).display),
  );
  const homeMetrics = await page.evaluate(() => {
    const row = document.querySelector('.world-dot-row') as HTMLElement | null;
    const inactiveDot = Array.from(document.querySelectorAll('.world-dot')).find(
      (element) => !element.classList.contains('active'),
    ) as HTMLElement | undefined;
    const styles = inactiveDot ? getComputedStyle(inactiveDot) : null;

    return {
      hasHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      dotRowClientWidthPx: row ? row.clientWidth : 0,
      dotRowScrollWidthPx: row ? row.scrollWidth : 0,
      inactiveDotWidthPx: styles ? Number.parseFloat(styles.width) : 0,
      inactiveDotBorderPx: styles ? Number.parseFloat(styles.borderLeftWidth) : 0,
      inactiveDotBackground: styles?.backgroundColor ?? '',
      inactiveDotBorderColor: styles?.borderLeftColor ?? '',
    };
  });

  expect(arrowDisplays).toEqual(['none', 'none']);
  expect(homeMetrics.hasHorizontalOverflow).toBe(false);
  expect(homeMetrics.dotRowScrollWidthPx).toBeLessThanOrEqual(homeMetrics.dotRowClientWidthPx);
  expect(homeMetrics.inactiveDotWidthPx).toBeGreaterThanOrEqual(7);
  expect(homeMetrics.inactiveDotBorderPx).toBeGreaterThanOrEqual(1);
  expect(homeMetrics.inactiveDotBackground).toBe('rgba(0, 0, 0, 0)');
  expect(homeMetrics.inactiveDotBorderColor).not.toBe('rgba(0, 0, 0, 0)');
});

test('world composer and history controls stay readable on a phone-sized viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/World/${encodeURIComponent(RESPONSIVE_WORLD_NAME)}`);
  await expect(page.getByTestId('world-page')).toBeVisible();
  await expect(page.getByTestId('composer-input')).toBeVisible();

  await page.getByRole('button', { name: 'Open chats and world actions' }).click();
  await expect(page.getByTestId('chat-history')).toBeVisible();

  const metrics = await page.evaluate(() => {
    const composerInput = document.querySelector('[data-testid="composer-input"]');
    const chatSearch = document.querySelector('[data-testid="chat-search"]');
    const chatCreate = document.querySelector('[data-testid="chat-create"]');
    const mobileActions = document.querySelector('.right-panel-mobile-header');
    const desktopActions = document.querySelector('.world-panel-world-actions');
    const chatHistory = document.querySelector('.settings-fieldset');
    const historyControls = document.querySelector('.chat-history-controls');
    const historyList = document.querySelector('.chat-list');

    return {
      composerFontPx: composerInput ? Number.parseFloat(getComputedStyle(composerInput).fontSize) : 0,
      searchFontPx: chatSearch ? Number.parseFloat(getComputedStyle(chatSearch).fontSize) : 0,
      createWidthPx: chatCreate ? Number.parseFloat(getComputedStyle(chatCreate).width) : 0,
      createHeightPx: chatCreate ? Number.parseFloat(getComputedStyle(chatCreate).height) : 0,
      mobileActionsDisplay: mobileActions ? getComputedStyle(mobileActions).display : '',
      desktopActionsDisplay: desktopActions ? getComputedStyle(desktopActions).display : '',
      chatHistoryPaddingTopPx: chatHistory ? Number.parseFloat(getComputedStyle(chatHistory).paddingTop) : -1,
      chatHistoryWidthPx: chatHistory ? chatHistory.getBoundingClientRect().width : 0,
      historyControlsWidthPx: historyControls ? historyControls.getBoundingClientRect().width : 0,
      historyListWidthPx: historyList ? historyList.getBoundingClientRect().width : 0,
      hasHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });

  expect(metrics.composerFontPx).toBeGreaterThanOrEqual(16);
  expect(metrics.searchFontPx).toBeGreaterThanOrEqual(16);
  expect(metrics.createWidthPx).toBeGreaterThanOrEqual(36);
  expect(metrics.createHeightPx).toBeGreaterThanOrEqual(36);
  expect(metrics.mobileActionsDisplay).toBe('flex');
  expect(['', 'none']).toContain(metrics.desktopActionsDisplay);
  expect(metrics.chatHistoryPaddingTopPx).toBe(0);
  expect(metrics.historyControlsWidthPx).toBeGreaterThanOrEqual(metrics.chatHistoryWidthPx - 24);
  expect(metrics.historyListWidthPx).toBeGreaterThanOrEqual(metrics.chatHistoryWidthPx - 24);
  expect(metrics.hasHorizontalOverflow).toBe(false);

  await page.locator('.right-panel-close').click();
  await expect(page.locator('.world-right-panel')).toHaveClass(/is-closed/);
});
