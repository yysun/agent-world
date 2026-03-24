/**
 * Purpose:
 * - Preserve the legacy layout import path while the web app transitions to the app-shell layer.
 *
 * Key Features:
 * - Re-exports the dedicated app-shell layout component.
 *
 * Notes on Implementation:
 * - Existing callers can keep this import path temporarily during the layered architecture migration.
 *
 * Summary of Recent Changes:
 * - 2026-03-24: Replaced inline layout markup with an app-shell compatibility re-export.
 */

export { AppShellLayout as default } from '../app-shell';

