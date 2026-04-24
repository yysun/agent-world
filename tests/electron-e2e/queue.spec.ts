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
 * - The floating queue panel is intentionally hidden unless at least two queue items remain,
 *   so these tests pause the queue, enqueue two messages through the real UI, and only then
 *   resume processing before asserting on the panel.
 * - These tests mirror the intent of web/queue.spec.ts while using Electron-specific affordances.
 *
 * Recent Changes:
 * - 2026-04-24: Updated queue E2E setup to pause, queue, and resume real backlog so the two-item visibility gate is satisfied deterministically.
 * - 2026-03-10: Added initial Electron queue lifecycle E2E coverage to match web queue.spec.ts parity.
 */

import { test, expect } from './support/fixtures.js';
import {
  CHAT_NAMES,
  addQueueMessageToCurrentChat,
  deleteAllAgents,
  getDesktopState,
  launchAndPrepare,
  pauseCurrentChatQueue,
  resumeCurrentChatQueue,
  selectSessionByName,
  waitForAssistantToken,
  waitForQueuePanel,
  waitForQueueStatus,
} from './support/electron-harness.js';

async function refreshQueueUiForCurrentSession(page: Parameters<typeof launchAndPrepare>[0]): Promise<void> {
  const state = await getDesktopState(page);
  const currentSession = state.sessions.find((session) => session.id === state.currentChatId);
  const alternateSession = state.sessions.find((session) => session.id !== state.currentChatId);

  if (!currentSession?.name || !alternateSession?.name) {
    throw new Error('Expected both current and alternate desktop sessions while refreshing the queue UI.');
  }

  await selectSessionByName(page, alternateSession.name);
  await selectSessionByName(page, currentSession.name);
}

async function seedQueuedBacklog(
  page: Parameters<typeof launchAndPrepare>[0],
  firstMessage: string,
  secondMessage: string,
): Promise<void> {
  await pauseCurrentChatQueue(page);
  await addQueueMessageToCurrentChat(page, firstMessage);
  await addQueueMessageToCurrentChat(page, secondMessage);
  await refreshQueueUiForCurrentSession(page);
  await waitForQueuePanel(page);
  await waitForQueueStatus(page, 'Queued');
}

async function createErroredQueueBacklog(page: Parameters<typeof launchAndPrepare>[0], contentPrefix: string): Promise<void> {
  await pauseCurrentChatQueue(page);
  await addQueueMessageToCurrentChat(page, `${contentPrefix} first`);
  await addQueueMessageToCurrentChat(page, `${contentPrefix} second`);
  await refreshQueueUiForCurrentSession(page);
  await waitForQueuePanel(page);
  await resumeCurrentChatQueue(page);
}

test.describe('Queue – processing indicator', () => {
  test('queue panel shows Processing status while the agent is handling a message', async ({ page }) => {
    await launchAndPrepare(page);
    await seedQueuedBacklog(page, 'Queue indicator token queue-indicator', 'Queued follower token queue-follower');
    await resumeCurrentChatQueue(page);
    // The queue panel must appear with Processing status before the response completes.
    await waitForQueuePanel(page);
    await waitForQueueStatus(page, 'Processing');
    // Eventually the response arrives and the send button returns.
    await waitForAssistantToken(page, 'queue-indicator', 30_000);
  });
});

test.describe('Queue – stop processing', () => {
  test('Stop queue button in the queue panel can interrupt active processing', async ({ page }) => {
    await launchAndPrepare(page);
    await seedQueuedBacklog(
      page,
      'Write a detailed step-by-step explanation of how a web browser renders a page, covering at least ten distinct phases.',
      'Queued follower token queue-follower',
    );
    await resumeCurrentChatQueue(page);
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
    await createErroredQueueBacklog(page, 'Queue failure token queue-failed');
    const queuePanel = await waitForQueuePanel(page);
    await waitForQueueStatus(page, 'Error');
    // The error item must be visible inside the queue panel.
    await expect(queuePanel.getByLabel('Status: Error').first()).toBeVisible();
  });

  test('error state exposes a Retry control inside the queue panel', async ({ page }) => {
    await launchAndPrepare(page);
    await deleteAllAgents(page);
    await createErroredQueueBacklog(page, 'Queue failure retry token queue-retry');
    const queuePanel = await waitForQueuePanel(page);
    await waitForQueueStatus(page, 'Error');
    // The Retry button must be reachable inside the queue panel.
    await expect(queuePanel.getByLabel('Retry failed message').first()).toBeVisible();
  });
});
