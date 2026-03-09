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
 * - 2026-03-06: Added `readDesktopApi()` so renderer bootstrap can show a bridge error instead of crashing to a blank screen.
 * - 2026-02-12: Extracted desktop bridge access and error normalization from App orchestration.
 * - 2026-02-17: Migrated module from JS to TS and bound helpers to typed DesktopApi contract.
 */

import type { DesktopApi } from '../types/desktop-api';

type DesktopApiWithCompat = DesktopApi & {
  deleteSession?: DesktopApi['deleteChat'];
};

export function readDesktopApi(): DesktopApi | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const api = window.agentWorldDesktop;
  if (!api) {
    return null;
  }

  const nextApi: DesktopApiWithCompat = { ...api };

  if (typeof nextApi.pickDirectory !== 'function' && typeof nextApi.openWorkspace === 'function') {
    nextApi.pickDirectory = nextApi.openWorkspace;
  }

  if (typeof nextApi.openWorkspace !== 'function' && typeof nextApi.pickDirectory === 'function') {
    nextApi.openWorkspace = nextApi.pickDirectory;
  }

  if (typeof nextApi.deleteChat !== 'function' && typeof nextApi.deleteSession === 'function') {
    return {
      ...nextApi,
      deleteChat: nextApi.deleteSession,
    };
  }

  return nextApi;
}

export function getDesktopApi(): DesktopApi {
  const api = readDesktopApi();
  if (!api) {
    throw new Error('Desktop API bridge is unavailable.');
  }
  return api;
}

export function safeMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
