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
 * - 2026-04-24: Added a focused Electron E2E that asserts the sidebar HITL indicator appears on the owning chat across session switches and clears after approval.
 * - 2026-04-23: Added a regression that re-editing a pending HITL turn clears the stale
 *   approval prompt and prevents it from replaying after a session switch.
 * - 2026-03-10: Fixed HITL session-scope bug: queue is preserved across session switches and
 *   activeHitlPrompt/hasActiveHitlPrompt are now derived via selectHitlPromptForSession/
 *   hasHitlPromptForSession (hitl-scope.ts). Unskipped HITL scope+replay test.
 * - 2026-03-10: Added initial real Electron Playwright chat-flow matrix coverage.
 * - 2026-03-10: Switched HITL prompts to a deterministic shell_cmd approval flow using a disposable workspace file.
 * - 2026-03-10: Added full coverage for edit-error, edit-HITL, queue retry/skip/clear, delete chain, and cross-session contamination tests.
 */

import type { Page } from '@playwright/test';
import { test, expect } from './support/fixtures.js';
import {
  CHAT_NAMES,
  createNewSession,
  deleteAllAgents,
  deleteLatestUserMessage,
  editLatestUserMessage,
  expectNotificationText,
  launchAndPrepare,
  getDesktopState,
  respondToHitlPrompt,
  selectSessionByName,
  sendComposerMessage,
  setSeededAgentSystemPrompt,
  waitForAssistantToken,
  waitForPersistedAssistantToken,
  waitForHitlPrompt,
  waitForQueuePanel,
  waitForQueueStatus,
} from './support/electron-harness.js';
import {
  PRESENTATION_CLARIFY_QUESTION,
  buildPresentationClarificationFallbackPrompt,
} from './support/seeded-agent.js';

const HITL_DELETE_TARGET = '.e2e-hitl-delete-me.txt';
const HITL_SHELL_SUCCESS_TOKEN = `E2E_SHELL_OK: ${HITL_DELETE_TARGET}`;

function buildShellHitlPrompt(label: string): string {
  return [
    `Use shell_cmd to remove ${HITL_DELETE_TARGET} from the current working directory.`,
    'Call shell_cmd directly and do not use human_intervention_request; the shell_cmd tool itself will request approval if needed.',
    'Do not ask me for confirmation in plain text.',
    `After approval, confirm completion for ${label}.`,
  ].join(' ');
}

async function createFailedQueueBacklog(
  page: Page,
  contentPrefix: string,
): Promise<void> {
  await sendComposerMessage(page, `${contentPrefix} first`);
  await page.getByLabel('Send message').waitFor({ state: 'visible', timeout: 15_000 });
  await sendComposerMessage(page, `${contentPrefix} second`);
}

async function getSessionIndicator(page: Page, name: string) {
  const state = await getDesktopState(page);
  const chatId = state.sessionIdsByName[name];
  if (!chatId) {
    throw new Error(`Session "${name}" was not found in the current world.`);
  }

  return getSessionIndicatorById(page, chatId);
}

async function getSessionIndicatorById(
  page: Page,
  chatId: string,
) {
  const normalizedChatId = String(chatId || '').trim();
  if (!normalizedChatId) {
    throw new Error('Session chat ID is required to resolve the sidebar indicator.');
  }

  return page
    .getByTestId(`session-item-${normalizedChatId}`)
    .locator('div.min-w-0 span[aria-hidden="true"]');
}

async function expectSessionIndicatorPending(
  page: Page,
  name: string,
): Promise<void> {
  await expect.poll(async () => {
    return await (await getSessionIndicator(page, name)).getAttribute('class');
  }, {
    timeout: 15_000,
    message: `Expected session "${name}" to show the pending HITL indicator.`,
  }).toMatch(/bg-amber-(300|400)/);
}

function buildPlainTextSetupPrompt(token: string): string {
  return [
    `Setup token ${token}.`,
    'Reply in plain text only.',
    'Do not call any tools, skills, or approval flows.',
  ].join(' ');
}

async function expectSessionIndicatorPendingById(
  page: Page,
  chatId: string,
): Promise<void> {
  await expect.poll(async () => {
    return await (await getSessionIndicatorById(page, chatId)).getAttribute('class');
  }, {
    timeout: 15_000,
    message: `Expected session "${chatId}" to show the pending HITL indicator.`,
  }).toMatch(/bg-amber-(300|400)/);
}

async function expectSessionIndicatorNotPending(
  page: Page,
  name: string,
): Promise<void> {
  await expect.poll(async () => {
    return await (await getSessionIndicator(page, name)).getAttribute('class');
  }, {
    timeout: 15_000,
    message: `Expected session "${name}" to clear the pending HITL indicator.`,
  }).not.toMatch(/bg-amber-/);
}

async function expectSessionIndicatorNotPendingById(
  page: Page,
  chatId: string,
): Promise<void> {
  await expect.poll(async () => {
    return await (await getSessionIndicatorById(page, chatId)).getAttribute('class');
  }, {
    timeout: 15_000,
    message: `Expected session "${chatId}" to clear the pending HITL indicator.`,
  }).not.toMatch(/bg-amber-/);
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
    await expect(page.getByText('this world has no agents available')).toBeVisible();
  });

  test('edit success', async ({ page }) => {
    await launchAndPrepare(page);
    await sendComposerMessage(page, buildPlainTextSetupPrompt('current-edit-success-setup'));
    await waitForAssistantToken(page, 'current-edit-success-setup');
    await editLatestUserMessage(page, 'Edited current chat success token current-edit-success');
    await expectNotificationText(page, 'Message edited successfully');
    await waitForAssistantToken(page, 'current-edit-success');
  });

  test('edit HITL and resume', async ({ page }) => {
    await launchAndPrepare(page);
    await sendComposerMessage(page, buildPlainTextSetupPrompt('current-edit-hitl-setup'));
    await waitForAssistantToken(page, 'current-edit-hitl-setup');
    await editLatestUserMessage(page, buildShellHitlPrompt('loaded current chat edit'));
    await respondToHitlPrompt(page, 'Approve', 60_000);
    await waitForAssistantToken(page, HITL_SHELL_SUCCESS_TOKEN);
  });

  test('re-editing a pending HITL turn clears the stale prompt and prevents replay', async ({ page }) => {
    await launchAndPrepare(page);
    await selectSessionByName(page, CHAT_NAMES.current);
    await sendComposerMessage(page, buildPlainTextSetupPrompt('current-edit-clear-hitl-setup'));
    await waitForAssistantToken(page, 'current-edit-clear-hitl-setup');

    await editLatestUserMessage(page, buildShellHitlPrompt('loaded current chat re-edit clear'));
    await waitForHitlPrompt(page, 60_000);

    await editLatestUserMessage(page, 'Edited current chat success token current-edit-clears-hitl');
    await expectNotificationText(page, 'Message edited successfully');
    await expect(page.getByTestId('hitl-prompt')).toHaveCount(0);
    await waitForPersistedAssistantToken(page, 'current-edit-clears-hitl', 60_000);

    await selectSessionByName(page, CHAT_NAMES.switched);
    await expect(page.getByTestId('hitl-prompt')).toHaveCount(0);

    await selectSessionByName(page, CHAT_NAMES.current);
    await expect(page.getByTestId('hitl-prompt')).toHaveCount(0);
  });

  test('edit error after responders become unavailable', async ({ page }) => {
    await launchAndPrepare(page);
    // Explicitly select this chat since the world-load default may differ.
    await selectSessionByName(page, CHAT_NAMES.current);
    await sendComposerMessage(page, buildPlainTextSetupPrompt('current-edit-error-setup'));
    await waitForAssistantToken(page, 'current-edit-error-setup');
    await deleteAllAgents(page);
    await editLatestUserMessage(page, 'Edited current chat error token current-edit-error');
    await expectNotificationText(page, 'edited');
    await expect(page.getByText('this world has no agents available')).toBeVisible();
  });

  test('queue clear works for the loaded current chat', async ({ page }) => {
    await launchAndPrepare(page);
    await selectSessionByName(page, CHAT_NAMES.current);
    await deleteAllAgents(page);
    await createFailedQueueBacklog(page, 'Current chat queued error for queue clear');
    const queuePanel = await waitForQueuePanel(page);
    await waitForQueueStatus(page, 'Error');
    await queuePanel.getByLabel('Clear queue').click();
    await expect(page.getByTestId('message-queue-panel')).toHaveCount(0);
  });

  test('queue retry and skip work in the loaded current chat', async ({ page }) => {
    await launchAndPrepare(page);
    await selectSessionByName(page, CHAT_NAMES.current);
    await deleteAllAgents(page);
    await createFailedQueueBacklog(page, 'Current chat queued error for retry skip');
    const queuePanel = await waitForQueuePanel(page);
    await waitForQueueStatus(page, 'Error');
    await queuePanel.getByLabel('Retry failed message').first().click();
    await waitForQueueStatus(page, 'Error');
    await queuePanel.getByLabel('Skip failed message').first().click();
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
  test('sidebar pending indicator stays on the owning chat across session switches and clears after approval', async ({ page }) => {
    await launchAndPrepare(page);
    await expectSessionIndicatorNotPending(page, CHAT_NAMES.current);
    await expectSessionIndicatorNotPending(page, CHAT_NAMES.switched);

    await selectSessionByName(page, CHAT_NAMES.switched);
    await sendComposerMessage(page, buildShellHitlPrompt('switched chat sidebar indicator'));
    await waitForHitlPrompt(page, 60_000);
    await expectSessionIndicatorPending(page, CHAT_NAMES.switched);
    await expectSessionIndicatorNotPending(page, CHAT_NAMES.current);

    await selectSessionByName(page, CHAT_NAMES.current);
    await expect(page.getByTestId('hitl-prompt')).toHaveCount(0);
    await expectSessionIndicatorPending(page, CHAT_NAMES.switched);
    await expectSessionIndicatorNotPending(page, CHAT_NAMES.current);

    await selectSessionByName(page, CHAT_NAMES.switched);
    await respondToHitlPrompt(page, 'Approve', 60_000);
    await waitForAssistantToken(page, HITL_SHELL_SUCCESS_TOKEN, 60_000);
    await expectSessionIndicatorNotPending(page, CHAT_NAMES.switched);
  });

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
    await expect(page.getByText('this world has no agents available')).toBeVisible();
  });

  test('edit success after switching chats', async ({ page }) => {
    await launchAndPrepare(page);
    await selectSessionByName(page, CHAT_NAMES.switched);
    await sendComposerMessage(page, buildPlainTextSetupPrompt('switched-edit-success-setup'));
    await waitForAssistantToken(page, 'switched-edit-success-setup');
    await editLatestUserMessage(page, 'Edited switched chat success token switched-edit-success');
    await expectNotificationText(page, 'Message edited successfully');
    await waitForAssistantToken(page, 'switched-edit-success');
  });

  test('queue retry and skip work after switching chats', async ({ page }) => {
    await launchAndPrepare(page);
    await selectSessionByName(page, CHAT_NAMES.switched);
    await deleteAllAgents(page);
    await createFailedQueueBacklog(page, 'Switched chat queued error');
    const queuePanel = await waitForQueuePanel(page);
    await waitForQueueStatus(page, 'Error');
    await queuePanel.getByLabel('Retry failed message').first().click();
    await waitForQueueStatus(page, 'Error');
    await queuePanel.getByLabel('Skip failed message').first().click();
    await expect(page.getByTestId('message-queue-panel')).toHaveCount(0);
  });

  test('edit error after switching chats and responders are unavailable', async ({ page }) => {
    await launchAndPrepare(page);
    await selectSessionByName(page, CHAT_NAMES.switched);
    await sendComposerMessage(page, buildPlainTextSetupPrompt('switched-edit-error-setup'));
    await waitForAssistantToken(page, 'switched-edit-error-setup');
    await deleteAllAgents(page);
    await editLatestUserMessage(page, 'Edited switched chat error token switched-edit-error');
    await expectNotificationText(page, 'edited');
    await expect(page.getByText('this world has no agents available')).toBeVisible();
  });

  test('edit HITL and resume after switching chats', async ({ page }) => {
    await launchAndPrepare(page);
    await selectSessionByName(page, CHAT_NAMES.switched);
    await sendComposerMessage(page, buildPlainTextSetupPrompt('switched-edit-hitl-setup'));
    await waitForAssistantToken(page, 'switched-edit-hitl-setup');
    await editLatestUserMessage(page, buildShellHitlPrompt('switched chat edit'));
    await respondToHitlPrompt(page, 'Approve', 60_000);
    await waitForAssistantToken(page, HITL_SHELL_SUCCESS_TOKEN);
  });

  test('queue clear works after switching chats', async ({ page }) => {
    await launchAndPrepare(page);
    await selectSessionByName(page, CHAT_NAMES.switched);
    await deleteAllAgents(page);
    await createFailedQueueBacklog(page, 'Switched chat queued error for queue clear');
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
  test('sidebar pending indicator stays on a newly created chat across session switches and clears after approval', async ({ page }) => {
    await launchAndPrepare(page);
    await expectSessionIndicatorNotPending(page, CHAT_NAMES.current);
    await expectSessionIndicatorNotPending(page, CHAT_NAMES.switched);

    const newChatId = await createNewSession(page);
    await expectSessionIndicatorNotPendingById(page, newChatId);

    await sendComposerMessage(page, buildShellHitlPrompt('new chat sidebar indicator'));
    await waitForHitlPrompt(page, 60_000);
    await expectSessionIndicatorPendingById(page, newChatId);
    await expectSessionIndicatorNotPending(page, CHAT_NAMES.current);
    await expectSessionIndicatorNotPending(page, CHAT_NAMES.switched);

    await selectSessionByName(page, CHAT_NAMES.current);
    await expect(page.getByTestId('hitl-prompt')).toHaveCount(0);
    await expectSessionIndicatorPendingById(page, newChatId);

    await page.getByTestId(`session-item-${newChatId}`).click();
    await expect.poll(async () => (await getDesktopState(page)).currentChatId, {
      timeout: 15_000,
      message: 'Expected the new chat session to become selected again.',
    }).toBe(newChatId);

    await respondToHitlPrompt(page, 'Approve', 60_000);
    await waitForAssistantToken(page, HITL_SHELL_SUCCESS_TOKEN, 60_000);
    await expectSessionIndicatorNotPendingById(page, newChatId);
  });

  test('create new chat and send success', async ({ page }) => {
    await launchAndPrepare(page);
    await createNewSession(page);
    await sendComposerMessage(page, 'New chat success token new-send-success');
    await waitForAssistantToken(page, 'new-send-success');
  });

  test('create new chat and keep a presentation clarification fallback to one assistant turn', async ({ page }) => {
    await launchAndPrepare(page);
    await setSeededAgentSystemPrompt(page, buildPresentationClarificationFallbackPrompt());
    await createNewSession(page);
    await sendComposerMessage(page, 'PRESENTATION_CLARIFY: create a presentation for this project.');
    await waitForAssistantToken(page, PRESENTATION_CLARIFY_QUESTION, 30_000);
    await expect(page.getByTestId('hitl-prompt')).toHaveCount(0);

    await page.waitForTimeout(2_000);

    const nonUserMessages = await page.evaluate(async () => {
      const api = (window as any).agentWorldDesktop;
      const worlds = await api.listWorlds();
      const targetWorld = Array.isArray(worlds)
        ? worlds.find((entry: any) => String(entry?.id || '').trim() === 'e2e-test') || worlds[0]
        : null;
      if (!targetWorld?.id) {
        throw new Error('e2e-test world is not available in the desktop app.');
      }

      await api.loadWorld(targetWorld.id);
      const chatHeaderEl = document.querySelector('[title*="Click to copy chat ID:"]');
      const titleAttr = chatHeaderEl?.getAttribute('title') || '';
      const match = titleAttr.match(/chat ID:\s*(\S+)/);
      const currentChatId = match?.[1] || '';
      if (!currentChatId) {
        throw new Error('Unable to resolve current chat ID for presentation clarification assertion.');
      }

      const messages = await api.getMessages(targetWorld.id, currentChatId);
      return Array.isArray(messages)
        ? messages.filter((message: any) => {
          const role = String(message?.role || '').trim().toLowerCase();
          const sender = String(message?.sender || '').trim().toLowerCase();
          if (role === 'user') {
            return false;
          }
          if (!role && (sender === 'human' || sender === 'user')) {
            return false;
          }
          return true;
        }).map((message: any) => String(message?.content || '').trim())
        : [];
    });

    expect(nonUserMessages).toEqual([PRESENTATION_CLARIFY_QUESTION]);
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
    await expect(page.getByText('this world has no agents available')).toBeVisible();
  });

  test('create new chat and edit success', async ({ page }) => {
    await launchAndPrepare(page);
    await createNewSession(page);
    await sendComposerMessage(page, buildPlainTextSetupPrompt('new-edit-setup'));
    await waitForAssistantToken(page, 'new-edit-setup');
    await editLatestUserMessage(page, 'Edited new chat success token new-edit-success');
    await expectNotificationText(page, 'Message edited successfully');
    await waitForAssistantToken(page, 'new-edit-success');
  });

  test('create new chat and edit error when responders are unavailable', async ({ page }) => {
    await launchAndPrepare(page);
    await createNewSession(page);
    await sendComposerMessage(page, buildPlainTextSetupPrompt('new-edit-error-setup'));
    await waitForAssistantToken(page, 'new-edit-error-setup');
    await deleteAllAgents(page);
    await editLatestUserMessage(page, 'Edited new chat error token new-edit-error');
    await expectNotificationText(page, 'edited');
    await expect(page.getByText('this world has no agents available')).toBeVisible();
  });

  test('create new chat and clear an errored queue item', async ({ page }) => {
    await launchAndPrepare(page);
    await createNewSession(page);
    await deleteAllAgents(page);
    await createFailedQueueBacklog(page, 'New chat queued error for queue clear');
    const queuePanel = await waitForQueuePanel(page);
    await waitForQueueStatus(page, 'Error');
    await queuePanel.getByLabel('Clear queue').click();
    await expect(page.getByTestId('message-queue-panel')).toHaveCount(0);
  });

  test('create new chat and edit HITL', async ({ page }) => {
    await launchAndPrepare(page);
    await createNewSession(page);
    await sendComposerMessage(page, buildPlainTextSetupPrompt('new-edit-hitl-setup'));
    await waitForAssistantToken(page, 'new-edit-hitl-setup');
    await editLatestUserMessage(page, buildShellHitlPrompt('new chat edit'));
    await respondToHitlPrompt(page, 'Approve', 60_000);
    await waitForAssistantToken(page, HITL_SHELL_SUCCESS_TOKEN, 60_000);
  });

  test('queue retry and skip work in a new chat', async ({ page }) => {
    await launchAndPrepare(page);
    await createNewSession(page);
    await deleteAllAgents(page);
    await createFailedQueueBacklog(page, 'New chat queued error for retry skip');
    const queuePanel = await waitForQueuePanel(page);
    await waitForQueueStatus(page, 'Error');
    await queuePanel.getByLabel('Retry failed message').first().click();
    await waitForQueueStatus(page, 'Error');
    await queuePanel.getByLabel('Skip failed message').first().click();
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
