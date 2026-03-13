/**
 * Electron desktop chat-flow matrix E2E coverage.
 *
 * Purpose:
 * - Exercise the approved desktop chat categories and lifecycle paths in the real Electron app.
 *
 * Key Features:
 * - Covers new-chat, loaded-current-chat, and switched-chat categories.
 * - Validates send, edit, HITL, queue, delete chain, and visible error-handling flows.
 * - Uses the real preload bridge only for state setup where the UI has no direct control.
 * - Includes cross-session isolation (edit/delete does not contaminate sibling session view).
 *
 * Implementation Notes:
 * - Real Gemini responses are used for send/edit/HITL flows.
 * - Queue/error setup uses existing desktop bridge methods, not mocks.
 *
 * Recent Changes:
 * - 2026-03-10: Fixed HITL session-scope bug: queue is preserved across session switches and
 *   activeHitlPrompt/hasActiveHitlPrompt are now derived via selectHitlPromptForSession/
 *   hasHitlPromptForSession (hitl-scope.ts). Unskipped HITL scope+replay test.
 * - 2026-03-10: Added initial real Electron Playwright chat-flow matrix coverage.
 * - 2026-03-10: Switched HITL prompts to a deterministic shell_cmd approval flow using a disposable workspace file.
 * - 2026-03-10: Added full coverage for edit-error, edit-HITL, queue retry/skip/clear, delete chain, and cross-session contamination tests.
 */

import { test, expect } from './support/fixtures.js';
import {
  CHAT_NAMES,
  addQueueMessageToCurrentChat,
  createNewSession,
  deleteAllAgents,
  deleteLatestUserMessage,
  editLatestUserMessage,
  expectNotificationText,
  launchAndPrepare,
  respondToHitlPrompt,
  selectSessionByName,
  sendComposerMessage,
  waitForAssistantToken,
  waitForHitlPrompt,
  waitForQueuePanel,
  waitForQueueStatus,
} from './support/electron-harness.js';

const HITL_DELETE_TARGET = '.e2e-hitl-delete-me.txt';
const HITL_SHELL_SUCCESS_TOKEN = `E2E_SHELL_OK: ${HITL_DELETE_TARGET}`;

function buildShellHitlPrompt(label: string): string {
  return [
    `Use shell_cmd to remove ${HITL_DELETE_TARGET} from the current working directory.`,
    'Do not ask me for confirmation in plain text.',
    `After approval, confirm completion for ${label}.`,
  ].join(' ');
}

test.describe('Loaded Current Chat', () => {
  test('send success', async ({ page }) => {
    await launchAndPrepare(page);
    await sendComposerMessage(page, 'Current chat success token current-send-success');
    await waitForAssistantToken(page, 'current-send-success');
  });

  test('send HITL and resume', async ({ page }) => {
    await launchAndPrepare(page);
    await sendComposerMessage(page, buildShellHitlPrompt('loaded current chat'));
    await respondToHitlPrompt(page, 'Approve', 60_000);
    await waitForAssistantToken(page, HITL_SHELL_SUCCESS_TOKEN);
  });

  test('send error when responders are unavailable', async ({ page }) => {
    await launchAndPrepare(page);
    await deleteAllAgents(page);
    await sendComposerMessage(page, 'Current chat error');
    await waitForQueuePanel(page);
    await waitForQueueStatus(page, 'Error');
  });

  test('edit success', async ({ page }) => {
    await launchAndPrepare(page);
    await sendComposerMessage(page, 'Current edit success setup token current-edit-success-setup');
    await waitForAssistantToken(page, 'current-edit-success-setup');
    await editLatestUserMessage(page, 'Edited current chat success token current-edit-success');
    await expectNotificationText(page, 'Message edited successfully');
    await waitForAssistantToken(page, 'current-edit-success');
  });

  test('edit HITL and resume', async ({ page }) => {
    await launchAndPrepare(page);
    await sendComposerMessage(page, 'Current edit HITL setup token current-edit-hitl-setup');
    await waitForAssistantToken(page, 'current-edit-hitl-setup');
    await editLatestUserMessage(page, buildShellHitlPrompt('loaded current chat edit'));
    await respondToHitlPrompt(page, 'Approve', 60_000);
    await waitForAssistantToken(page, HITL_SHELL_SUCCESS_TOKEN);
  });

  test('edit error after responders become unavailable', async ({ page }) => {
    await launchAndPrepare(page);
    // Explicitly select this chat since the world-load default may differ.
    await selectSessionByName(page, CHAT_NAMES.current);
    await sendComposerMessage(page, 'Current edit error setup token current-edit-error-setup');
    await waitForAssistantToken(page, 'current-edit-error-setup');
    await deleteAllAgents(page);
    await editLatestUserMessage(page, 'Edited current chat error token current-edit-error');
    // The edit resubmission queues the message, but no agents → queue error.
    await expectNotificationText(page, 'edited');
    // The queue error is written asynchronously. Force the queue hook to reload
    // by switching sessions so the selectedSessionId change triggers loadQueue.
    await selectSessionByName(page, CHAT_NAMES.switched);
    await page.waitForTimeout(500);
    await selectSessionByName(page, CHAT_NAMES.current);
    await waitForQueuePanel(page);
    await waitForQueueStatus(page, 'Error');
  });

  test('queue clear works for the loaded current chat', async ({ page }) => {
    await launchAndPrepare(page);
    await deleteAllAgents(page);
    await sendComposerMessage(page, 'Current chat error for queue clear');
    const queuePanel = await waitForQueuePanel(page);
    await waitForQueueStatus(page, 'Error');
    await queuePanel.getByLabel('Clear queue').click();
    await expect(page.getByTestId('message-queue-panel')).toHaveCount(0);
  });

  test('queue retry and skip work in the loaded current chat', async ({ page }) => {
    await launchAndPrepare(page);
    await selectSessionByName(page, CHAT_NAMES.current);
    await deleteAllAgents(page);
    await addQueueMessageToCurrentChat(page, 'Current chat queued error for retry skip');
    const queuePanel = await waitForQueuePanel(page);
    await waitForQueueStatus(page, 'Error');
    await queuePanel.getByLabel('Retry failed message').click();
    await waitForQueueStatus(page, 'Error');
    await queuePanel.getByLabel('Skip failed message').click();
    await expect(page.getByTestId('message-queue-panel')).toHaveCount(0);
  });

  test('delete message chain in current chat', async ({ page }) => {
    await launchAndPrepare(page);
    await sendComposerMessage(page, 'Current chat delete token current-delete-chain');
    await waitForAssistantToken(page, 'current-delete-chain');
    await deleteLatestUserMessage(page);
    await expectNotificationText(page, 'Message deleted successfully');
    await expect(page.getByText('current-delete-chain', { exact: false })).toHaveCount(0);
  });

  test('edit in current chat does not contaminate switched chat view', async ({ page }) => {
    await launchAndPrepare(page);
    // Ensure we start in the correct current session (full-suite prior tests may leave a different session active).
    await selectSessionByName(page, CHAT_NAMES.current);
    // Establish a unique visible marker in the current session.
    await sendComposerMessage(page, 'Current chat isolation token current-isolation-marker');
    await waitForAssistantToken(page, 'current-isolation-marker');
    // Establish a unique visible marker in the switched session.
    await selectSessionByName(page, CHAT_NAMES.switched);
    await sendComposerMessage(page, 'Switched isolation token switched-isolation-marker');
    await waitForAssistantToken(page, 'switched-isolation-marker');
    // Delete the latest message chain in the switched session.
    await deleteLatestUserMessage(page);
    await expectNotificationText(page, 'Message deleted successfully');
    // Switched session: deleted message must be gone.
    await expect(page.getByText('switched-isolation-marker', { exact: false })).toHaveCount(0);
    // Current session: its messages must be completely unaffected.
    await selectSessionByName(page, CHAT_NAMES.current);
    await page.getByText('current-isolation-marker', { exact: false }).last().waitFor({ state: 'visible' });
  });
});

test.describe('Switched Chat', () => {
  test('send success after switching chats', async ({ page }) => {
    await launchAndPrepare(page);
    await selectSessionByName(page, CHAT_NAMES.switched);
    await sendComposerMessage(page, 'Switched chat success token switched-send-success');
    await waitForAssistantToken(page, 'switched-send-success');
  });

  test('pending HITL stays scoped to the switched chat and replays on return', async ({ page }) => {
    await launchAndPrepare(page);
    await selectSessionByName(page, CHAT_NAMES.switched);
    await sendComposerMessage(page, buildShellHitlPrompt('switched chat'));
    await waitForHitlPrompt(page, 60_000);

    await selectSessionByName(page, CHAT_NAMES.current);
    await expect(page.getByTestId('hitl-prompt')).toHaveCount(0);

    await selectSessionByName(page, CHAT_NAMES.switched);
    await respondToHitlPrompt(page, 'Approve', 60_000);
    await waitForAssistantToken(page, HITL_SHELL_SUCCESS_TOKEN, 60_000);
  });

  test('send error after switching chats when responders are unavailable', async ({ page }) => {
    await launchAndPrepare(page);
    await selectSessionByName(page, CHAT_NAMES.switched);
    await deleteAllAgents(page);
    await sendComposerMessage(page, 'Switched chat error');
    await waitForQueuePanel(page);
    await waitForQueueStatus(page, 'Error');
  });

  test('edit success after switching chats', async ({ page }) => {
    await launchAndPrepare(page);
    await selectSessionByName(page, CHAT_NAMES.switched);
    await sendComposerMessage(page, 'Switched edit success setup token switched-edit-success-setup');
    await waitForAssistantToken(page, 'switched-edit-success-setup');
    await editLatestUserMessage(page, 'Edited switched chat success token switched-edit-success');
    await expectNotificationText(page, 'Message edited successfully');
    await waitForAssistantToken(page, 'switched-edit-success');
  });

  test('queue retry and skip work after switching chats', async ({ page }) => {
    await launchAndPrepare(page);
    await selectSessionByName(page, CHAT_NAMES.switched);
    await deleteAllAgents(page);
    await addQueueMessageToCurrentChat(page, 'Switched chat queued error');
    const queuePanel = await waitForQueuePanel(page);
    await waitForQueueStatus(page, 'Error');
    await queuePanel.getByLabel('Retry failed message').click();
    await waitForQueueStatus(page, 'Error');
    await queuePanel.getByLabel('Skip failed message').click();
    await expect(page.getByTestId('message-queue-panel')).toHaveCount(0);
  });

  test('edit error after switching chats and responders are unavailable', async ({ page }) => {
    await launchAndPrepare(page);
    await selectSessionByName(page, CHAT_NAMES.switched);
    await sendComposerMessage(page, 'Switched edit error setup token switched-edit-error-setup');
    await waitForAssistantToken(page, 'switched-edit-error-setup');
    await deleteAllAgents(page);
    await editLatestUserMessage(page, 'Edited switched chat error token switched-edit-error');
    // The edit resubmission queues the message, but no agents → queue error.
    await expectNotificationText(page, 'edited');
    // Force the queue hook to reload by switching sessions.
    await selectSessionByName(page, CHAT_NAMES.current);
    await page.waitForTimeout(500);
    await selectSessionByName(page, CHAT_NAMES.switched);
    await waitForQueuePanel(page);
    await waitForQueueStatus(page, 'Error');
  });

  test('edit HITL and resume after switching chats', async ({ page }) => {
    await launchAndPrepare(page);
    await selectSessionByName(page, CHAT_NAMES.switched);
    await sendComposerMessage(page, 'Switched edit HITL setup token switched-edit-hitl-setup');
    await waitForAssistantToken(page, 'switched-edit-hitl-setup');
    await editLatestUserMessage(page, buildShellHitlPrompt('switched chat edit'));
    await respondToHitlPrompt(page, 'Approve', 60_000);
    await waitForAssistantToken(page, HITL_SHELL_SUCCESS_TOKEN);
  });

  test('queue clear works after switching chats', async ({ page }) => {
    await launchAndPrepare(page);
    await selectSessionByName(page, CHAT_NAMES.switched);
    await deleteAllAgents(page);
    await sendComposerMessage(page, 'Switched chat error for queue clear');
    const queuePanel = await waitForQueuePanel(page);
    await waitForQueueStatus(page, 'Error');
    await queuePanel.getByLabel('Clear queue').click();
    await expect(page.getByTestId('message-queue-panel')).toHaveCount(0);
  });

  test('delete message chain after switching chats', async ({ page }) => {
    await launchAndPrepare(page);
    await selectSessionByName(page, CHAT_NAMES.switched);
    await sendComposerMessage(page, 'Switched chat delete token switched-delete-chain');
    await waitForAssistantToken(page, 'switched-delete-chain');
    await deleteLatestUserMessage(page);
    await expectNotificationText(page, 'Message deleted successfully');
    await expect(page.getByText('switched-delete-chain', { exact: false })).toHaveCount(0);
  });
});

test.describe('New Chat', () => {
  test('create new chat and send success', async ({ page }) => {
    await launchAndPrepare(page);
    await createNewSession(page);
    await sendComposerMessage(page, 'New chat success token new-send-success');
    await waitForAssistantToken(page, 'new-send-success');
  });

  test('create new chat and send HITL', async ({ page }) => {
    await launchAndPrepare(page);
    await createNewSession(page);
    await sendComposerMessage(page, buildShellHitlPrompt('new chat'));
    await respondToHitlPrompt(page, 'Approve', 60_000);
    await waitForAssistantToken(page, HITL_SHELL_SUCCESS_TOKEN);
  });

  test('create new chat and send error when responders are unavailable', async ({ page }) => {
    await launchAndPrepare(page);
    await createNewSession(page);
    await deleteAllAgents(page);
    await sendComposerMessage(page, 'New chat error');
    await waitForQueuePanel(page);
    await waitForQueueStatus(page, 'Error');
  });

  test('create new chat and edit success', async ({ page }) => {
    await launchAndPrepare(page);
    await createNewSession(page);
    await sendComposerMessage(page, 'New chat edit setup token new-edit-setup');
    await waitForAssistantToken(page, 'new-edit-setup');
    await editLatestUserMessage(page, 'Edited new chat success token new-edit-success');
    await expectNotificationText(page, 'Message edited successfully');
    await waitForAssistantToken(page, 'new-edit-success');
  });

  test('create new chat and edit error when responders are unavailable', async ({ page }) => {
    await launchAndPrepare(page);
    const newChatId = await createNewSession(page);
    await sendComposerMessage(page, 'New chat edit error setup token new-edit-error-setup');
    await waitForAssistantToken(page, 'new-edit-error-setup');
    await deleteAllAgents(page);
    await editLatestUserMessage(page, 'Edited new chat error token new-edit-error');
    // The edit resubmission queues the message, but no agents → queue error.
    await expectNotificationText(page, 'edited');
    // The queue error is written asynchronously. Force the queue hook to reload
    // by switching sessions so the selectedSessionId change triggers loadQueue.
    await selectSessionByName(page, CHAT_NAMES.current);
    await page.waitForTimeout(500);
    await page.getByTestId(`session-item-${newChatId}`).click();
    await waitForQueuePanel(page);
    await waitForQueueStatus(page, 'Error');
  });

  test('create new chat and clear an errored queue item', async ({ page }) => {
    await launchAndPrepare(page);
    await createNewSession(page);
    await deleteAllAgents(page);
    await sendComposerMessage(page, 'New chat error for queue clear');
    const queuePanel = await waitForQueuePanel(page);
    await waitForQueueStatus(page, 'Error');
    await queuePanel.getByLabel('Clear queue').click();
    await expect(page.getByTestId('message-queue-panel')).toHaveCount(0);
  });

  test('create new chat and edit HITL', async ({ page }) => {
    await launchAndPrepare(page);
    await createNewSession(page);
    await sendComposerMessage(page, 'New chat edit HITL setup token new-edit-hitl-setup');
    await waitForAssistantToken(page, 'new-edit-hitl-setup');
    await editLatestUserMessage(page, buildShellHitlPrompt('new chat edit'));
    await respondToHitlPrompt(page, 'Approve', 60_000);
    await waitForAssistantToken(page, HITL_SHELL_SUCCESS_TOKEN, 60_000);
  });

  test('queue retry and skip work in a new chat', async ({ page }) => {
    await launchAndPrepare(page);
    await createNewSession(page);
    await deleteAllAgents(page);
    await addQueueMessageToCurrentChat(page, 'New chat queued error for retry skip');
    const queuePanel = await waitForQueuePanel(page);
    await waitForQueueStatus(page, 'Error');
    await queuePanel.getByLabel('Retry failed message').click();
    await waitForQueueStatus(page, 'Error');
    await queuePanel.getByLabel('Skip failed message').click();
    await expect(page.getByTestId('message-queue-panel')).toHaveCount(0);
  });

  test('create new chat and delete message chain', async ({ page }) => {
    await launchAndPrepare(page);
    await createNewSession(page);
    await sendComposerMessage(page, 'New chat delete token new-delete-chain');
    await waitForAssistantToken(page, 'new-delete-chain');
    await deleteLatestUserMessage(page);
    await expectNotificationText(page, 'Message deleted successfully');
    await expect(page.getByText('new-delete-chain', { exact: false })).toHaveCount(0);
  });
});
