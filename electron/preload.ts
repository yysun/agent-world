/**
 * Electron Preload Entry
 *
 * Purpose:
 * - Initialize and expose the renderer-facing desktop bridge API.
 *
 * Key Features:
 * - Delegates bridge composition and exposure to modular preload helpers.
 * - Preserves stable `window.agentWorldDesktop` bridge behavior.
 *
 * Implementation Notes:
 * - Entry file intentionally thin; logic lives in `electron/preload/*`.
 *
 * Recent Changes:
 * - 2026-02-12: Converted preload entry from JavaScript to TypeScript for Phase 4 migration.
 * - 2026-02-12: Switched to modular bridge exposure via `preload/bridge.ts`.
 */

import { exposeDesktopApi } from './preload/bridge.js';

exposeDesktopApi();
