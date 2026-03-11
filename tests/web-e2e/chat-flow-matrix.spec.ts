/**
 * Web browser chat-flow matrix E2E coverage.
 *
 * Purpose:
 * - Exercise the approved browser chat categories and lifecycle paths in the real web app.
 *
 * Key Features:
 * - Covers loaded-current-chat, switched-chat, and new-chat categories.
 * - Validates send, edit, HITL, and visible error-handling flows.
 * - Uses the real browser UI with real REST/SSE behavior.
 *
 * Implementation Notes:
 * - Real Gemini responses are used for send/edit/HITL flows.
 * - Error-path setup resets agents through the live API where the web UI has no compact equivalent seam.
 *
 * Recent Changes:
 * - 2026-03-11: Scoped switched-chat delete-isolation assertions to the conversation pane so the test
 *   follows rendered chat content instead of ambiguous duplicate page text.
 * - 2026-03-11: Hardened setup turns to explicitly forbid tool usage so real-model bootstrap messages do not
 *   accidentally create unrelated HITL prompts during switched-chat preparation.
 * - 2026-03-10: Added initial real web Playwright chat-flow matrix coverage.
 * - 2026-03-10: Added 60 s timeouts to all HITL waitForHitlPrompt, respondToHitlPrompt, and
 *   waitForAssistantToken calls to match the Electron harness HITL pattern.
 */

import { test, expect } from './support/fixtures.js';
import {
  HITL_SHELL_SUCCESS_MARKER,
  buildShellHitlPrompt,
  createNewChat,
  deleteAllAgents,
  deleteLatestMessage,
  editLatestUserMessage,
  getCurrentChatId,
  gotoWorld,
  respondToHitlPrompt,
  selectChatById,
  sendComposerMessage,
  waitForAssistantToken,
  waitForComposerSendReady,
  waitForWorldIdle,
  waitForErrorState,
  waitForHitlPrompt,
} from './support/web-harness.js';

const LONG_REAL_BROWSER_FLOW_TIMEOUT_MS = 30_000;
const LONG_REAL_BROWSER_HITL_TIMEOUT_MS = 60_000;

async function prepareEditableTurn(page: Parameters<typeof gotoWorld>[0], token: string): Promise<void> {
  await sendComposerMessage(
    page,
    `Setup token ${token}. Reply in plain text only. Do not call any tools, skills, or approval flows.`,
  );
  await waitForAssistantToken(page, token);
}

test.describe('Loaded Current Chat', () => {
  test.describe.configure({ timeout: LONG_REAL_BROWSER_FLOW_TIMEOUT_MS });

  test('send success', async ({ page, bootstrapState }) => {
    await gotoWorld(page, bootstrapState);
    await sendComposerMessage(page, 'Current chat success token current-send-success');
    await waitForAssistantToken(page, 'current-send-success');
  });

  test('send HITL and resume', async ({ page, bootstrapState }) => {
    test.setTimeout(LONG_REAL_BROWSER_HITL_TIMEOUT_MS);
    await gotoWorld(page, bootstrapState);
    await sendComposerMessage(page, buildShellHitlPrompt('loaded current chat'));
    await waitForHitlPrompt(page, 60_000);
    await respondToHitlPrompt(page, 'approve', 60_000);
    await waitForAssistantToken(page, HITL_SHELL_SUCCESS_MARKER, 60_000);
  });

  test('send error when responders are unavailable', async ({ page, bootstrapState }) => {
    await gotoWorld(page, bootstrapState);
    await deleteAllAgents(bootstrapState);
    await sendComposerMessage(page, 'Current chat error');
    await waitForErrorState(page);
  });

  test('edit success', async ({ page, bootstrapState }) => {
    await gotoWorld(page, bootstrapState);
    await prepareEditableTurn(page, 'current-edit-success-setup');
    await editLatestUserMessage(page, 'Edited current chat success token current-edit-success');
    await waitForAssistantToken(page, 'current-edit-success');
  });

  test('edit HITL and resume', async ({ page, bootstrapState }) => {
    test.setTimeout(LONG_REAL_BROWSER_HITL_TIMEOUT_MS);
    await gotoWorld(page, bootstrapState);
    await prepareEditableTurn(page, 'current-edit-hitl-setup');
    await editLatestUserMessage(page, buildShellHitlPrompt('loaded current chat edit'));
    await waitForHitlPrompt(page, 60_000);
    await respondToHitlPrompt(page, 'approve', 60_000);
    await waitForAssistantToken(page, HITL_SHELL_SUCCESS_MARKER, 60_000);
  });

  test('edit error after responders become unavailable', async ({ page, bootstrapState }) => {
    test.setTimeout(LONG_REAL_BROWSER_FLOW_TIMEOUT_MS);
    await gotoWorld(page, bootstrapState);
    await prepareEditableTurn(page, 'current-edit-error-setup');
    await waitForWorldIdle(page, LONG_REAL_BROWSER_FLOW_TIMEOUT_MS);
    await deleteAllAgents(bootstrapState);
    await editLatestUserMessage(page, 'Edited current chat error token current-edit-error');
    await waitForErrorState(page);
  });

  test('delete message chain success', async ({ page, bootstrapState }) => {
    test.setTimeout(LONG_REAL_BROWSER_FLOW_TIMEOUT_MS);
    await gotoWorld(page, bootstrapState);
    await prepareEditableTurn(page, 'current-delete-success-setup');
    const deletedTokenMessages = page
      .getByTestId('conversation-area')
      .getByText('current-delete-success-setup', { exact: false });
    await deleteLatestMessage(page);
    await expect(deletedTokenMessages).toHaveCount(0);
  });
});

test.describe('Switched Chat', () => {
  test.describe.configure({ timeout: LONG_REAL_BROWSER_FLOW_TIMEOUT_MS });

  async function prepareSwitchedChat(page: Parameters<typeof gotoWorld>[0], currentChatId: string): Promise<string> {
    await prepareEditableTurn(page, 'switched-chat-bootstrap');
    await waitForWorldIdle(page, LONG_REAL_BROWSER_FLOW_TIMEOUT_MS);
    const switchedChatId = await createNewChat(page);
    await selectChatById(page, currentChatId);
    await expect.poll(() => getCurrentChatId(page)).toBe(currentChatId);
    await selectChatById(page, switchedChatId);
    await expect.poll(() => getCurrentChatId(page)).toBe(switchedChatId);
    return switchedChatId;
  }

  test('send success after switching chats', async ({ page, bootstrapState }) => {
    await gotoWorld(page, bootstrapState);
    const switchedChatId = await prepareSwitchedChat(page, bootstrapState.currentChatId);
    await sendComposerMessage(page, 'Switched chat success token switched-send-success');
    await waitForAssistantToken(page, 'switched-send-success');
    await expect.poll(() => getCurrentChatId(page)).toBe(switchedChatId);
  });

  test('pending HITL stays scoped to the switched chat and replays on return', async ({ page, bootstrapState }) => {
    await gotoWorld(page, bootstrapState);
    const switchedChatId = await prepareSwitchedChat(page, bootstrapState.currentChatId);

    await sendComposerMessage(page, buildShellHitlPrompt('switched chat'));
    await waitForHitlPrompt(page, 60_000);

    await selectChatById(page, bootstrapState.currentChatId);
    await expect.poll(() => getCurrentChatId(page)).toBe(bootstrapState.currentChatId);
    await expect(page.getByTestId('hitl-prompt')).toHaveCount(0);

    await selectChatById(page, switchedChatId);
    await expect.poll(() => getCurrentChatId(page)).toBe(switchedChatId);
    await waitForHitlPrompt(page, 60_000);
    await respondToHitlPrompt(page, 'approve', 60_000);
    await waitForAssistantToken(page, HITL_SHELL_SUCCESS_MARKER, 60_000);
  });

  test('send error after switching chats when responders are unavailable', async ({ page, bootstrapState }) => {
    await gotoWorld(page, bootstrapState);
    await prepareSwitchedChat(page, bootstrapState.currentChatId);
    await waitForWorldIdle(page, LONG_REAL_BROWSER_FLOW_TIMEOUT_MS);
    await deleteAllAgents(bootstrapState);
    await sendComposerMessage(page, 'Switched chat error');
    await waitForErrorState(page);
  });

  test('edit success after switching chats', async ({ page, bootstrapState }) => {
    await gotoWorld(page, bootstrapState);
    await prepareSwitchedChat(page, bootstrapState.currentChatId);
    await prepareEditableTurn(page, 'switched-edit-success-setup');
    await editLatestUserMessage(page, 'Edited switched chat success token switched-edit-success');
    await waitForAssistantToken(page, 'switched-edit-success');
  });

  test('edit HITL after switching chats', async ({ page, bootstrapState }) => {
    test.setTimeout(LONG_REAL_BROWSER_HITL_TIMEOUT_MS);
    await gotoWorld(page, bootstrapState);
    await prepareSwitchedChat(page, bootstrapState.currentChatId);
    await prepareEditableTurn(page, 'switched-edit-hitl-setup');
    await editLatestUserMessage(page, buildShellHitlPrompt('switched chat edit'));
    await waitForHitlPrompt(page, 60_000);
    await respondToHitlPrompt(page, 'approve', 60_000);
    await waitForAssistantToken(page, HITL_SHELL_SUCCESS_MARKER, 60_000);
  });

  test('edit error after switching chats when responders are unavailable', async ({ page, bootstrapState }) => {
    await gotoWorld(page, bootstrapState);
    await prepareSwitchedChat(page, bootstrapState.currentChatId);
    await prepareEditableTurn(page, 'switched-edit-error-setup');
    await deleteAllAgents(bootstrapState);
    await editLatestUserMessage(page, 'Edited switched chat error token switched-edit-error');
    await waitForErrorState(page);
  });

  test('delete message chain success after switching chats', async ({ page, bootstrapState }) => {
    test.setTimeout(LONG_REAL_BROWSER_FLOW_TIMEOUT_MS);
    await gotoWorld(page, bootstrapState);
    await prepareSwitchedChat(page, bootstrapState.currentChatId);
    await prepareEditableTurn(page, 'switched-delete-success-setup');
    const deletedTokenMessages = page
      .getByTestId('conversation-area')
      .getByText('switched-delete-success-setup', { exact: false });
    await deleteLatestMessage(page);
    await expect(deletedTokenMessages).toHaveCount(0);
  });

  test('delete in one chat does not contaminate the other chat view', async ({ page, bootstrapState }) => {
    await gotoWorld(page, bootstrapState);
    const isolationTokenMessages = page
      .getByTestId('conversation-area')
      .getByText('chat-a-isolation-token', { exact: false });

    // Send a distinctive message in the original chat
    await sendComposerMessage(page, 'Isolation token chat-a-isolation-token');
    await waitForAssistantToken(page, 'chat-a-isolation-token');
    const originalChatId = bootstrapState.currentChatId;

    // Create a new chat and confirm we are in it
    const newChatId = await createNewChat(page);
    await expect.poll(() => getCurrentChatId(page)).toBe(newChatId);

    // Original chat's content must not bleed into the new chat
    await expect(isolationTokenMessages).toHaveCount(0);

    // Navigate back to original chat – content must still be there
    await selectChatById(page, originalChatId);
    await expect.poll(() => getCurrentChatId(page)).toBe(originalChatId);
    await expect(isolationTokenMessages.first()).toBeVisible();

    // Delete the message from the original chat
    await deleteLatestMessage(page);
    await expect(isolationTokenMessages).toHaveCount(0);

    // Switch back to the new chat – deletion must not have affected it
    await selectChatById(page, newChatId);
    await expect.poll(() => getCurrentChatId(page)).toBe(newChatId);
    await expect(isolationTokenMessages).toHaveCount(0);
  });
});

test.describe('New Chat', () => {
  test.describe.configure({ timeout: LONG_REAL_BROWSER_FLOW_TIMEOUT_MS });

  test('create new chat and send success', async ({ page, bootstrapState }) => {
    await gotoWorld(page, bootstrapState);
    const newChatId = await createNewChat(page);
    await expect.poll(() => getCurrentChatId(page)).toBe(newChatId);
    await sendComposerMessage(page, 'New chat success token new-send-success');
    await waitForAssistantToken(page, 'new-send-success');
  });

  test('create new chat and send HITL', async ({ page, bootstrapState }) => {
    await gotoWorld(page, bootstrapState);
    await createNewChat(page);
    await sendComposerMessage(page, buildShellHitlPrompt('new chat'));
    await waitForHitlPrompt(page, 60_000);
    await respondToHitlPrompt(page, 'approve', 60_000);
    await waitForAssistantToken(page, HITL_SHELL_SUCCESS_MARKER, 60_000);
  });

  test('create new chat and send error when responders are unavailable', async ({ page, bootstrapState }) => {
    await gotoWorld(page, bootstrapState);
    await createNewChat(page);
    await deleteAllAgents(bootstrapState);
    await sendComposerMessage(page, 'New chat error');
    await waitForErrorState(page);
  });

  test('create new chat and edit success', async ({ page, bootstrapState }) => {
    await gotoWorld(page, bootstrapState);
    await createNewChat(page);
    await prepareEditableTurn(page, 'new-edit-success-setup');
    await editLatestUserMessage(page, 'Edited new chat success token new-edit-success');
    await waitForAssistantToken(page, 'new-edit-success');
  });

  test('create new chat and edit HITL', async ({ page, bootstrapState }) => {
    test.setTimeout(LONG_REAL_BROWSER_HITL_TIMEOUT_MS);
    await gotoWorld(page, bootstrapState);
    await createNewChat(page);
    await prepareEditableTurn(page, 'new-edit-hitl-setup');
    await editLatestUserMessage(page, buildShellHitlPrompt('new chat edit'));
    await waitForHitlPrompt(page, 60_000);
    await respondToHitlPrompt(page, 'approve', 60_000);
    await waitForAssistantToken(page, HITL_SHELL_SUCCESS_MARKER, 60_000);
  });

  test('create new chat and edit error when responders are unavailable', async ({ page, bootstrapState }) => {
    await gotoWorld(page, bootstrapState);
    await createNewChat(page);
    await prepareEditableTurn(page, 'new-edit-error-setup');
    await waitForWorldIdle(page, LONG_REAL_BROWSER_FLOW_TIMEOUT_MS);
    await deleteAllAgents(bootstrapState);
    await editLatestUserMessage(page, 'Edited new chat error token new-edit-error');
    await waitForErrorState(page);
  });

  test('create new chat and delete message chain success', async ({ page, bootstrapState }) => {
    test.setTimeout(LONG_REAL_BROWSER_FLOW_TIMEOUT_MS);
    await gotoWorld(page, bootstrapState);
    await createNewChat(page);
    await prepareEditableTurn(page, 'new-delete-success-setup');
    const deletedTokenMessages = page
      .getByTestId('conversation-area')
      .getByText('new-delete-success-setup', { exact: false });
    await deleteLatestMessage(page);
    await expect(deletedTokenMessages).toHaveCount(0);
  });
});
