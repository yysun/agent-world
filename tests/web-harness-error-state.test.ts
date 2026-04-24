/**
 * Web harness error-state regression tests.
 *
 * Purpose:
 * - Keep the web Playwright helper error matching aligned with the current browser error surfaces.
 *
 * Key Features:
 * - Verifies queue/system error text is treated as a visible failure state.
 * - Prevents routine system notices from being misclassified as errors.
 *
 * Implementation Notes:
 * - This suite exercises the pure matcher only and does not boot Playwright.
 *
 * Recent Changes:
 * - 2026-04-24: Added composer send settlement coverage so error overlays cannot masquerade as successful sends.
 * - 2026-03-12: Added coverage for inline system error matching used by the web E2E harness.
 */

import { describe, expect, it } from 'vitest';

import { classifyComposerSendSettleState } from './web-e2e/support/web-harness.js';
import { isRenderableSystemErrorText } from './web-e2e/support/error-state.js';

describe('isRenderableSystemErrorText', () => {
  it('matches queue dispatch error messages', () => {
    expect(isRenderableSystemErrorText('Queue failed to dispatch user message: no agent "@composer" found in this world.')).toBe(true);
  });

  it('matches no-agents queue dispatch error messages', () => {
    expect(isRenderableSystemErrorText('Queue failed to dispatch user message: this world has no agents available.')).toBe(true);
  });

  it('matches generic failure keywords surfaced by system messages', () => {
    expect(isRenderableSystemErrorText('Shell command timed out while processing the request.')).toBe(true);
  });

  it('ignores non-error system notices', () => {
    expect(isRenderableSystemErrorText('Chat title updated: Switched Chat')).toBe(false);
  });

  it('treats composer sends as successful only when a new message row appears', () => {
    expect(classifyComposerSendSettleState({
      messageCount: 3,
      hasWorldErrorState: true,
      hasConversationErrorIndicator: true,
      hasRenderableSystemError: true,
    }, 2)).toBe('sent');
  });

  it('treats composer error surfaces as failures when no new message row appears', () => {
    expect(classifyComposerSendSettleState({
      messageCount: 2,
      hasWorldErrorState: true,
      hasConversationErrorIndicator: false,
      hasRenderableSystemError: false,
    }, 2)).toBe('error');
  });
});