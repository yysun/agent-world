/**
 * Unit Tests for Renderer Status Bar Service
 *
 * Features:
 * - Verifies global status read/write behavior.
 * - Verifies subscriber notifications on publish and clear.
 * - Verifies status kind normalization for invalid values.
 *
 * Implementation Notes:
 * - Uses in-memory module state only; no UI rendering required.
 * - Clears status after each test to avoid cross-test leakage.
 *
 * Recent Changes:
 * - 2026-02-13: Added immutability regression test to ensure callers cannot mutate internal status state via returned objects.
 * - 2026-02-13: Added coverage for shared renderer status-bar domain service.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearStatusBarStatus,
  getStatusBarStatus,
  publishStatusBarStatus,
  subscribeStatusBarStatus
} from '../../../electron/renderer/src/domain/status-bar';

afterEach(() => {
  clearStatusBarStatus();
});

describe('status-bar domain service', () => {
  it('publishes and returns status values', () => {
    const status = publishStatusBarStatus('Loaded', 'success');

    expect(status).toEqual({ text: 'Loaded', kind: 'success' });
    expect(getStatusBarStatus()).toEqual({ text: 'Loaded', kind: 'success' });
  });

  it('normalizes unsupported status kinds to info', () => {
    const status = publishStatusBarStatus('Hello', 'warning');

    expect(status).toEqual({ text: 'Hello', kind: 'info' });
  });

  it('returns a copy so external mutation does not change internal state', () => {
    const published = publishStatusBarStatus('Loaded', 'success');
    published.text = 'mutated';
    published.kind = 'error';

    expect(getStatusBarStatus()).toEqual({ text: 'Loaded', kind: 'success' });
  });

  it('notifies subscribers on publish and clear', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeStatusBarStatus(listener);

    publishStatusBarStatus('Running', 'info');
    clearStatusBarStatus();

    expect(listener).toHaveBeenCalledWith({ text: '', kind: 'info' });
    expect(listener).toHaveBeenCalledWith({ text: 'Running', kind: 'info' });
    expect(listener).toHaveBeenCalledTimes(3);

    unsubscribe();
  });

  it('stops notifications after unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeStatusBarStatus(listener);

    unsubscribe();
    publishStatusBarStatus('After unsubscribe', 'success');

    expect(listener).toHaveBeenCalledTimes(1);
  });
});
