/**
 * Web browser shell-stream parity E2E coverage.
 *
 * Purpose:
 * - Verify the real web app flips a live shell tool card from running to done without requiring a chat refresh.
 *
 * Key Features:
 * - Uses a deterministic slow shell command path so the running tool summary is observable in the UI.
 * - Confirms the merged shell tool card transitions from `running` to `done`.
 * - Confirms the running summary disappears instead of leaving duplicate shell tool cards behind.
 *
 * Implementation Notes:
 * - Runs against the real browser, API, SSE stream, and Gemini-backed E2E agent harness.
 * - Scopes assertions to the visible conversation area so transcript checks ignore unrelated page chrome.
 *
 * Recent Changes:
 * - 2026-03-12: Added initial shell-stream parity Playwright coverage for the orange-to-green tool status transition.
 */

import { test, expect } from './support/fixtures.js';
import {
  HITL_SHELL_SUCCESS_TOKEN,
  buildSlowShellPrompt,
  gotoWorld,
  sendComposerMessage,
  waitForAssistantToken,
  waitForToolSummaryStatus,
  waitForToolSummaryStatusGone,
} from './support/web-harness.js';

const SHELL_STREAM_E2E_TIMEOUT_MS = 60_000;

test.describe('Shell Stream Parity', () => {
  test.describe.configure({ timeout: SHELL_STREAM_E2E_TIMEOUT_MS });

  test('shell tool summary turns from running to done in the active chat', async ({ page, bootstrapState }) => {
    await gotoWorld(page, bootstrapState);
    await sendComposerMessage(page, buildSlowShellPrompt('shell-stream-parity'));

    const runningSummary = await waitForToolSummaryStatus(page, 'running', SHELL_STREAM_E2E_TIMEOUT_MS);
    await expect(runningSummary).toHaveClass(/tool-status-running/);

    const doneSummary = await waitForToolSummaryStatus(page, 'done', SHELL_STREAM_E2E_TIMEOUT_MS);
    await expect(doneSummary).toHaveClass(/tool-status-done/);
    await expect(
      page.getByTestId('conversation-area').locator('.tool-summary-line', { hasText: 'tool: shell_cmd - done' }),
    ).toHaveCount(1);

    await waitForToolSummaryStatusGone(page, 'running', SHELL_STREAM_E2E_TIMEOUT_MS);
    await waitForAssistantToken(page, HITL_SHELL_SUCCESS_TOKEN, SHELL_STREAM_E2E_TIMEOUT_MS);
  });
});
