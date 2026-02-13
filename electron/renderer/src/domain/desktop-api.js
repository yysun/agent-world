/**
 * Desktop API Domain Helpers
 * Purpose:
 * - Provide renderer-safe access to the preload desktop bridge.
 *
 * Features:
 * - Bridge availability validation for `window.agentWorldDesktop`
 * - Backward-compatible API fallback (`deleteSession` -> `deleteChat`)
 * - Error message normalization helper
 *
 * Implementation Notes:
 * - Helpers are pure and side-effect free.
 * - Compatibility fallback keeps older preload bridges usable.
 *
 * Recent Changes:
 * - 2026-02-12: Extracted desktop bridge access and error normalization from App orchestration.
 */

export function getDesktopApi() {
  const api = window.agentWorldDesktop;
  if (!api) {
    throw new Error('Desktop API bridge is unavailable.');
  }

  // Compatibility: older preload bridges exposed `deleteSession` but not `deleteChat`.
  if (typeof api.deleteChat !== 'function' && typeof api.deleteSession === 'function') {
    return {
      ...api,
      deleteChat: api.deleteSession
    };
  }

  return api;
}

export function safeMessage(error, fallback) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
