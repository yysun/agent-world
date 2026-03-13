/**
 * Unit Tests for Electron E2E Harness World Selection Helpers
 *
 * Purpose:
 * - Verify the desktop E2E harness retries only the expected flaky world-selector cases.
 *
 * Key Features:
 * - Covers exact selected-world label detection.
 * - Covers detached-element retry classification from dropdown re-renders.
 * - Covers non-retryable unrelated errors.
 *
 * Implementation Notes:
 * - Tests only the pure helper used by the Playwright harness.
 * - Keeps regression coverage deterministic without launching Electron.
 *
 * Recent Changes:
 * - 2026-03-12: Added regression coverage for world-selector re-render races in desktop E2E helpers.
 */

import { describe, expect, it } from 'vitest';

import {
  isRetryableWorldSelectionError,
  isTargetWorldSelected,
} from '../../electron-e2e/support/world-selection';

describe('electron harness world selection helpers', () => {
  it('treats the selector label as selected only when it matches the target world name', () => {
    expect(isTargetWorldSelected('e2e-test', 'e2e-test')).toBe(true);
    expect(isTargetWorldSelected('Select a world', 'e2e-test')).toBe(false);
  });

  it('retries detached-element failures caused by dropdown re-renders', () => {
    expect(
      isRetryableWorldSelectionError(
        new Error('locator.click: element was detached from the DOM while retrying the action'),
      ),
    ).toBe(true);
  });

  it('does not retry unrelated interaction failures', () => {
    expect(
      isRetryableWorldSelectionError(
        new Error('locator.click: Timeout 30000ms exceeded while waiting for element to be visible'),
      ),
    ).toBe(false);
  });
});
