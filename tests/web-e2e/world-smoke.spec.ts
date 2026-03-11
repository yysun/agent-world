/**
 * Web browser world and chat management smoke E2E coverage.
 *
 * Purpose:
 * - Validate that world and chat management affordances in the web app remain reachable.
 *
 * Key Features:
 * - Verifies world selection, creation, and delete affordances on the home page.
 * - Verifies chat creation, search, and delete affordances inside the world page.
 * - Validates that deleting a chat removes it from the sidebar.
 * - Notes fast-fail credential check: tested at the Node bootstrap level in web-harness.ts.
 *
 * Implementation Notes:
 * - The Home carousel can contain many pre-existing worlds, so these checks first focus the seeded
 *   `e2e-test-web` card before asserting its enter/delete affordances.
 * - Chat search requires a query that matches at least one existing chat title;
 *   the default chat created by bootstrap is named "Chat 1" or similar, so we
  *   search for a partial string guaranteed to match.
 *
 * Recent Changes:
 * - 2026-03-10: Added initial world and chat management smoke coverage.
 */

import { test, expect } from './support/fixtures.js';
import {
  createNewChat,
  deleteChatById,
  getCurrentChatId,
  gotoHome,
  gotoWorld,
  selectChatById,
} from './support/web-harness.js';

async function focusHomeWorld(page: Parameters<typeof gotoHome>[0], worldName: string): Promise<void> {
  await page.getByTestId(`world-dot-${worldName}`).click();
}

test.describe('World management affordances', () => {
  test('world list is shown and entry affordance is reachable', async ({ page, bootstrapState }) => {
    await gotoHome(page);
    await expect(page.getByTestId('world-carousel')).toBeVisible();
    await focusHomeWorld(page, bootstrapState.worldName);
    await expect(page.getByTestId(`enter-world-${bootstrapState.worldName}`)).toBeVisible();
  });

  test('world create affordance is reachable from the home page carousel', async ({ page, bootstrapState }) => {
    await gotoHome(page);
    await expect(page.getByTestId('world-create')).toBeVisible();
  });

  test('world delete affordance is reachable for each listed world', async ({ page, bootstrapState }) => {
    await gotoHome(page);
    await focusHomeWorld(page, bootstrapState.worldName);
    await expect(page.getByTestId(`delete-world-${bootstrapState.worldName}`)).toBeVisible();
  });
});

test.describe('Chat management affordances', () => {
  test('chat creation button is reachable inside the world', async ({ page, bootstrapState }) => {
    await gotoWorld(page, bootstrapState);
    await expect(page.getByTestId('chat-create')).toBeVisible();
  });

  test('chat list shows existing chats with select and delete affordances', async ({ page, bootstrapState }) => {
    await gotoWorld(page, bootstrapState);
    await expect(page.getByTestId('chat-list')).toBeVisible();
    await expect(page.getByTestId(`chat-item-${bootstrapState.currentChatId}`)).toBeVisible();
    await expect(page.getByTestId(`chat-delete-${bootstrapState.currentChatId}`)).toBeVisible();
  });

  test('chat search input is reachable', async ({ page, bootstrapState }) => {
    await gotoWorld(page, bootstrapState);
    await expect(page.getByTestId('chat-search')).toBeVisible();
  });

  test('chat search filters the chat list', async ({ page, bootstrapState }) => {
    await gotoWorld(page, bootstrapState);

    // Seed a second chat so there are at least two to filter between.
    const secondChatId = await createNewChat(page);
    await selectChatById(page, bootstrapState.currentChatId);

    // Each chat item in the list must have a deterministic title set by the
    // backend (e.g. "Chat 1", "Chat 2"). Search for a substring known not to
    // match any title to verify the list empties.
    await page.getByTestId('chat-search').fill('zzz-no-match-zzz');
    await expect(page.getByText('No chats match "zzz-no-match-zzz".')).toBeVisible();
    await expect(page.getByTestId('chat-list')).toHaveCount(0);

    // Clear the search to restore all chats.
    await page.getByTestId('chat-search').fill('');
    await expect(page.getByTestId(`chat-item-${secondChatId}`)).toBeVisible();
  });
});

test.describe('Delete chat', () => {
  test('deleting a chat removes it from the sidebar', async ({ page, bootstrapState }) => {
    await gotoWorld(page, bootstrapState);

    // Create a second chat so we have something to delete without leaving the world.
    const chatToDeleteId = await createNewChat(page);
    await expect(page.getByTestId(`chat-item-${chatToDeleteId}`)).toBeVisible();

    // Switch to the original chat so we are not in the chat being deleted.
    await selectChatById(page, bootstrapState.currentChatId);
    await expect.poll(() => getCurrentChatId(page)).toBe(bootstrapState.currentChatId);

    // Delete the second chat.
    await deleteChatById(page, chatToDeleteId);

    // The deleted chat must no longer appear in the list.
    await expect(page.getByTestId(`chat-item-${chatToDeleteId}`)).toHaveCount(0);
  });
});

test.describe('World settings affordance', () => {
  test('world settings gear button is reachable inside the world page', async ({ page, bootstrapState }) => {
    await gotoWorld(page, bootstrapState);
    await expect(page.locator('button[title="World Settings"]:visible').first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Credentials fast-fail
// The fast-fail behaviour when GOOGLE_API_KEY is absent is validated at the
// Node bootstrap level inside bootstrapWorldState() (web-harness.ts) which
// throws a clear error before any browser is opened.  A browser-side test for
// this path would require a separate Playwright project with credentials
// withheld; that is out of scope for the first pass.
// ---------------------------------------------------------------------------
