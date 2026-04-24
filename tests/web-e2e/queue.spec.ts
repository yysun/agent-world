/**
 * Web browser queue lifecycle E2E coverage.
 *
 * Purpose:
 * - Exercise the message queue and processing-state lifecycle visible in the real web app.
 *
 * Key Features:
 * - Validates in-progress processing indicator appears while awaiting a response.
 * - Validates the stop button can interrupt active message processing.
 * - Validates failed processing is surfaced as the visible error state.
 * - Validates the error state exposes a reload/retry control.
 * - Queue management panel controls (retry, pause, resume, remove/skip, clear) are not yet
 *   present in the web UI — that describe block is skipped until the UI ships.
 *
 * Implementation Notes:
 * - The web app does not yet expose a queue management panel with per-item controls.
 * - The stop-processing test sends a prompt designed to produce a longer response
 *   to widen the window for the stop button to appear before processing completes.
 *
 * Recent Changes:
 * - 2026-04-24: Raised the timeout budget for async queue-failure error-state assertions so real SSE error promotion stays stable under suite load.
 * - 2026-03-10: Added initial queue lifecycle E2E coverage.
 * - 2026-03-10: Marked queue management panel describe block with test.describe.skip since
 *   those controls are not yet implemented in the web UI.
 */

import { test, expect } from './support/fixtures.js';
import {
  deleteAllAgents,
  gotoWorld,
  sendComposerMessage,
  waitForAssistantToken,
  waitForErrorState,
} from './support/web-harness.js';

const QUEUE_FAILURE_TIMEOUT_MS = 15_000;

test.describe('Queue – processing indicator', () => {
  test('hitl-waiting indicator appears while the agent is processing a response', async ({ page, bootstrapState }) => {
    await gotoWorld(page, bootstrapState);
    // Start sending — do NOT await a token yet; we want to observe the in-progress state.
    await sendComposerMessage(page, 'Queue indicator token queue-indicator');
    // The waiting indicator must appear before the response arrives.
    await page.getByTestId('hitl-waiting').waitFor({ state: 'visible', timeout: 15_000 });
    // Eventually the processing finishes and the indicator disappears.
    await waitForAssistantToken(page, 'queue-indicator');
  });
});

test.describe('Queue – stop processing', () => {
  test('stop button appears while processing and can interrupt the active response', async ({ page, bootstrapState }) => {
    await gotoWorld(page, bootstrapState);
    // Send a prompt likely to generate a longer streaming response.
    await sendComposerMessage(
      page,
      'Write a detailed step-by-step explanation of how a web browser renders a page, covering at least ten distinct phases.',
    );
    // The composer action button becomes a stop button while the agent is processing.
    await expect(page.getByTestId('composer-action')).toHaveAttribute('aria-label', /stop/i, {
      timeout: 15_000,
    });
    // Click stop to interrupt.
    await page.getByTestId('composer-action').click();
    // After stopping, the composer must return to the send state.
    await expect(page.getByTestId('composer-action')).toHaveAttribute('aria-label', /send/i, {
      timeout: 15_000,
    });
  });
});

test.describe('Queue – failed item', () => {
  test.describe.configure({ timeout: QUEUE_FAILURE_TIMEOUT_MS });

  test('failed processing is surfaced as the visible world-error-state overlay', async ({ page, bootstrapState }) => {
    await gotoWorld(page, bootstrapState);
    await deleteAllAgents(bootstrapState);
    await sendComposerMessage(page, 'Queue failure token queue-failed');
    await waitForErrorState(page, QUEUE_FAILURE_TIMEOUT_MS);
    // The error overlay is visible.
    await expect(page.getByTestId('world-error-state')).toBeVisible({ timeout: QUEUE_FAILURE_TIMEOUT_MS });
  });

  test('error state exposes a reload control that navigates back to the world', async ({ page, bootstrapState }) => {
    await gotoWorld(page, bootstrapState);
    await deleteAllAgents(bootstrapState);
    await sendComposerMessage(page, 'Queue failure reload token queue-reload');
    await waitForErrorState(page, QUEUE_FAILURE_TIMEOUT_MS);
    // The Retry button must be reachable inside the error overlay.
    await expect(page.getByTestId('world-error-state').getByRole('button', { name: /retry/i })).toBeVisible({ timeout: QUEUE_FAILURE_TIMEOUT_MS });
    // Clicking Retry reloads the world page.
    await page.getByTestId('world-error-state').getByRole('button', { name: /retry/i }).click();
    await page.getByTestId('world-page').waitFor({ state: 'visible', timeout: QUEUE_FAILURE_TIMEOUT_MS });
  });
});

// ---------------------------------------------------------------------------
// Queue management panel — controls not yet present in the web UI.
// Skipped until the web app ships the queue management panel with stable test IDs.
// ---------------------------------------------------------------------------
test.describe.skip('Queue – management panel (pending web UI)', () => {
  test('failed queue item is shown in the queue panel', async ({ page, bootstrapState }) => {
    await gotoWorld(page, bootstrapState);
    await deleteAllAgents(bootstrapState);
    await sendComposerMessage(page, 'Queue panel failed item');
    await waitForErrorState(page);
    // Expects a queue panel element that surfaces the failed item.
    await expect(page.getByTestId('queue-panel')).toBeVisible();
    await expect(page.getByTestId('queue-item-failed')).toBeVisible();
  });

  test('failed queue item can be retried individually', async ({ page, bootstrapState }) => {
    await gotoWorld(page, bootstrapState);
    await deleteAllAgents(bootstrapState);
    await sendComposerMessage(page, 'Queue panel retry item');
    await waitForErrorState(page);
    await expect(page.getByTestId('queue-item-failed')).toBeVisible();
    await page.getByTestId('queue-retry-item').click();
    // After retry the item should no longer show as failed.
    await expect(page.getByTestId('queue-item-failed')).toHaveCount(0);
  });

  test('failed queue item can be removed / skipped', async ({ page, bootstrapState }) => {
    await gotoWorld(page, bootstrapState);
    await deleteAllAgents(bootstrapState);
    await sendComposerMessage(page, 'Queue panel remove item');
    await waitForErrorState(page);
    await expect(page.getByTestId('queue-item-failed')).toBeVisible();
    await page.getByTestId('queue-remove-item').click();
    await expect(page.getByTestId('queue-item-failed')).toHaveCount(0);
  });

  test('queue can be paused then resumed', async ({ page, bootstrapState }) => {
    await gotoWorld(page, bootstrapState);
    await sendComposerMessage(page, 'Queue pause resume');
    await page.getByTestId('queue-pause').waitFor({ state: 'visible' });
    await page.getByTestId('queue-pause').click();
    await expect(page.getByTestId('queue-resume')).toBeVisible();
    await page.getByTestId('queue-resume').click();
    await waitForAssistantToken(page, 'Queue pause resume');
  });

  test('queue can be cleared', async ({ page, bootstrapState }) => {
    await gotoWorld(page, bootstrapState);
    await sendComposerMessage(page, 'Queue clear test');
    await page.getByTestId('queue-panel').waitFor({ state: 'visible' });
    await page.getByTestId('queue-clear').click();
    await expect(page.getByTestId('queue-panel')).toHaveCount(0);
  });
});
