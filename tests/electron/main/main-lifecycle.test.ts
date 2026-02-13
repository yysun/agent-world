/**
 * Unit Tests for Main Lifecycle Wiring
 *
 * Features:
 * - Verifies cleanup behavior on `window-all-closed`.
 * - Verifies platform-specific quit behavior.
 * - Verifies main-window recreation on `activate`.
 *
 * Implementation Notes:
 * - Uses an in-memory app event registry.
 * - Avoids Electron runtime by dependency injection.
 *
 * Recent Changes:
 * - 2026-02-12: Moved into layer-based tests/electron subfolder and updated module import paths.
 * - 2026-02-12: Added Phase 3 coverage for main lifecycle orchestration module.
 */

import { describe, it, expect, vi } from 'vitest';
import { setupMainLifecycle } from '../../../electron/main-process/lifecycle';

function createLifecycleHarness(platform: string, initialWindowCount = 0) {
  const listeners: Record<string, () => void> = {};
  const clearChatEventSubscriptions = vi.fn();
  const unsubscribeFromLogEvents = vi.fn();
  const createMainWindow = vi.fn();
  const quit = vi.fn();
  let windowCount = initialWindowCount;

  setupMainLifecycle({
    app: {
      on: (event, listener) => {
        listeners[event] = listener;
      }
    },
    platform,
    getWindowCount: () => windowCount,
    clearChatEventSubscriptions,
    unsubscribeFromLogEvents,
    createMainWindow,
    quit
  });

  return {
    listeners,
    clearChatEventSubscriptions,
    unsubscribeFromLogEvents,
    createMainWindow,
    quit,
    setWindowCount: (value: number) => {
      windowCount = value;
    }
  };
}

describe('setupMainLifecycle', () => {
  it('cleans subscriptions and quits app on non-darwin window-all-closed', () => {
    const harness = createLifecycleHarness('linux');
    harness.listeners['window-all-closed']();

    expect(harness.clearChatEventSubscriptions).toHaveBeenCalledTimes(1);
    expect(harness.unsubscribeFromLogEvents).toHaveBeenCalledTimes(1);
    expect(harness.quit).toHaveBeenCalledTimes(1);
  });

  it('does not quit app on darwin window-all-closed', () => {
    const harness = createLifecycleHarness('darwin');
    harness.listeners['window-all-closed']();

    expect(harness.clearChatEventSubscriptions).toHaveBeenCalledTimes(1);
    expect(harness.unsubscribeFromLogEvents).toHaveBeenCalledTimes(1);
    expect(harness.quit).not.toHaveBeenCalled();
  });

  it('recreates main window on activate when none are open', () => {
    const harness = createLifecycleHarness('linux', 0);
    harness.listeners.activate();
    expect(harness.createMainWindow).toHaveBeenCalledTimes(1);
  });

  it('does not recreate main window on activate when a window already exists', () => {
    const harness = createLifecycleHarness('linux', 1);
    harness.listeners.activate();
    expect(harness.createMainWindow).not.toHaveBeenCalled();
  });
});
