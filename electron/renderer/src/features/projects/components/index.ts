/**
 * Projects Feature Component Exports
 *
 * Purpose:
 * - Expose project-specific renderer components from the projects feature boundary.
 *
 * Key Features:
 * - Re-exports the project folder viewer/editor and folder tree pane.
 *
 * Implementation Notes:
 * - Keeps project-context browsing UI out of the transitional `components/` layer.
 *
 * Recent Changes:
 * - 2026-04-14: Added the initial projects feature component barrel for the composer project viewer.
 */

export { default as ProjectFolderPane } from './ProjectFolderPane';
export { default as ProjectFolderViewer } from './ProjectFolderViewer';