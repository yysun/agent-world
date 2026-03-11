/**
 * Electron desktop queue lifecycle E2E coverage.
 *
 * Purpose:
 * - Exercise the message queue processing indicator and stop/interrupt flows in the real Electron app.
 *
 * Key Features:
 * - Validates the queue panel shows Processing status while a message is being handled.
 * - Validates the Stop queue button can interrupt active processing.
 * - Validates a failed item (no agents) is surfaced with Error status in the queue panel.
 * - Validates the error state exposes a Retry control inside the queue panel.
 *
 * Implementation Notes:
 * - Electron surfaces queue state through the message-queue-panel (data-testid) with labelled
 *   status badges (aria-label="Status: <label>"), Retry, Skip, Stop, and Clear action buttons.
 * - These tests mirror the intent of web/queue.spec.ts while using Electron-specific affordances.
 * - The stop-processing test sends a long prompt to widen the window before the response arrives.
 *
 * Recent Changes:
 * - 2026-03-10: Added initial Electron queue lifecycle E2E coverage to match web queue.spec.ts parity.
 */

import { test, expect } from './support/fixtures.js';
import {
  deleteAllAgents,
  launchAndPrepare,
  sendComposerMessage,
  waitForAssistantToken,
  waitForQueuePanel,
  waitForQueueStatus,
} from './support/electron-harness.js';

test.describe('Queue – processing indicator', () => {
  test('queue panel shows Processing status while the agent is handling a message', async ({ page }) => {
    await launchAndPrepare(page);
    await sendComposerMessage(page, 'Queue indicator token queue-indicator');
    // The queue panel must appear with Processing status before the response completes.
    await waitForQueuePanel(page);
    await waitForQueueStatus(page, 'Processing');
    // Eventually the response arrives and the send button returns.
    await waitForAssistantToken(page, 'queue-indicator');
  });
});

test.describe('Queue – stop processing', () => {
  test('Stop queue button in the queue panel can interrupt active processing', async ({ page }) => {
    await launchAndPrepare(page);
    // Send a prompt designed to produce a longer streaming response.
    await sendComposerMessage(
      page,
      'Write a detailed step-by-step explanation of how a web browser renders a page, covering at least ten distinct phases.',
    );
    const queuePanel = await waitForQueuePanel(page);
    await waitForQueueStatus(page, 'Processing');
    // Click the Stop queue button to interrupt.
    await queuePanel.getByLabel('Stop queue').click();
    // After stopping, the Send message button must return.
    await page.getByLabel('Send message').waitFor({ state: 'visible', timeout: 15_000 });
  });
});

test.describe('Queue – failed item', () => {
  test('failed item is surfaced as Error status in the queue panel', async ({ page }) => {
    await launchAndPrepare(page);
    await deleteAllAgents(page);
    await sendComposerMessage(page, 'Queue failure token queue-failed');
    const queuePanel = await waitForQueuePanel(page);
    await waitForQueueStatus(page, 'Error');
    // The error item must be visible inside the queue panel.
    await expect(queuePanel.getByLabel('Status: Error')).toBeVisible();
  });

  test('error state exposes a Retry control inside the queue panel', async ({ page }) => {
    await launchAndPrepare(page);
    await deleteAllAgents(page);
    await sendComposerMessage(page, 'Queue failure retry token queue-retry');
    const queuePanel = await waitForQueuePanel(page);
    await waitForQueueStatus(page, 'Error');
    // The Retry button must be reachable inside the queue panel.
    await expect(queuePanel.getByLabel('Retry failed message')).toBeVisible();
  });
});
