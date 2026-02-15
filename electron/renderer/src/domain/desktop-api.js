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

  const nextApi = { ...api };

  if (typeof nextApi.pickDirectory !== 'function' && typeof nextApi.openWorkspace === 'function') {
    nextApi.pickDirectory = nextApi.openWorkspace;
  }

  if (typeof nextApi.openWorkspace !== 'function' && typeof nextApi.pickDirectory === 'function') {
    nextApi.openWorkspace = nextApi.pickDirectory;
  }

  // Compatibility: older preload bridges exposed `deleteSession` but not `deleteChat`.
  if (typeof nextApi.deleteChat !== 'function' && typeof nextApi.deleteSession === 'function') {
    return {
      ...nextApi,
      deleteChat: nextApi.deleteSession
    };
  }

  return nextApi;
}

export function safeMessage(error, fallback) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
