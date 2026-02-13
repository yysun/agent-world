/**
 * Electron Main Lifecycle Wiring
 *
 * Features:
 * - Registers `window-all-closed` and `activate` handlers.
 * - Ensures deterministic cleanup and window recreation behavior.
 *
 * Implementation Notes:
 * - Uses dependency injection for app/window APIs to simplify testing.
 * - Keeps platform-specific quit logic centralized.
 *
 * Recent Changes:
 * - 2026-02-13: Relaxed lifecycle `app.on` typing to match Electron overload signatures without composition casts.
 * - 2026-02-13: Widened app listener signature typing to align with Electron `app.on` overloads under strict TypeScript checks.
 * - 2026-02-12: Added extracted lifecycle wiring module for Phase 3 modularization.
 */

export interface LifecycleAppLike {
  on: (...args: unknown[]) => unknown;
}

export interface MainLifecycleDependencies {
  app: LifecycleAppLike;
  platform: string;
  getWindowCount: () => number;
  clearChatEventSubscriptions: () => void;
  unsubscribeFromLogEvents: () => void;
  createMainWindow: () => void;
  quit: () => void;
}

export function setupMainLifecycle(dependencies: MainLifecycleDependencies): void {
  const {
    app,
    platform,
    getWindowCount,
    clearChatEventSubscriptions,
    unsubscribeFromLogEvents,
    createMainWindow,
    quit
  } = dependencies;

  app.on('window-all-closed', () => {
    clearChatEventSubscriptions();
    unsubscribeFromLogEvents();
    if (platform !== 'darwin') {
      quit();
    }
  });

  app.on('activate', () => {
    if (getWindowCount() === 0) {
      createMainWindow();
    }
  });
}
