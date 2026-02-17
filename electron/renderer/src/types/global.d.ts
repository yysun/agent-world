/**
 * Renderer Global Window Type Declarations
 *
 * Purpose:
 * - Declare the typed desktop bridge API on `window` for renderer code.
 *
 * Key Features:
 * - Adds `window.agentWorldDesktop` typing from shared IPC contracts.
 *
 * Implementation Notes:
 * - Type-only declaration file; no runtime behavior changes.
 *
 * Recent Changes:
 * - 2026-02-12: Added global bridge typing for Phase 4 typed preload contracts.
 */

import type { DesktopApi } from './desktop-api';

declare global {
  interface Window {
    agentWorldDesktop: DesktopApi;
  }
}

export {};
