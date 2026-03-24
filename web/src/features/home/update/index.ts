/**
 * Purpose:
 * - Re-export Home feature update modules.
 *
 * Key Features:
 * - Provides a stable feature-layer import surface for Home update handlers.
 *
 * Notes on Implementation:
 * - Keeps route pages from depending on deep update file paths.
 *
 * Summary of Recent Changes:
 * - 2026-03-24: Added the Home feature update barrel exports.
 */

export { homePageUpdateHandlers } from './home-page-update';