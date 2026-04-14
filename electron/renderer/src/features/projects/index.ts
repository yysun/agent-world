/**
 * Projects Feature Exports
 *
 * Purpose:
 * - Expose project-specific renderer components from the projects feature boundary.
 *
 * Key Features:
 * - Re-exports project viewer UI used by App workspace orchestration.
 *
 * Implementation Notes:
 * - Keeps feature-owned project browsing UI behind one stable import surface.
 *
 * Recent Changes:
 * - 2026-04-14: Added the initial projects feature barrel for the composer project viewer.
 */

export * from './components';