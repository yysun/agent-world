/**
 * Skills Feature Components Barrel
 *
 * Purpose:
 * - Expose skill-management business UI owned by the renderer skills feature.
 *
 * Key Features:
 * - Groups the skill editor surface and its folder tree pane.
 * - Provides a stable feature-scoped import surface for app orchestration and tests.
 *
 * Implementation Notes:
 * - These components remain business-specific and must not move into `design-system/`.
 *
 * Recent Changes:
 * - 2026-03-23: Added the initial feature-scoped skills components barrel.
 */

export { default as SkillEditor } from './SkillEditor';
export { default as SkillFolderPane } from './SkillFolderPane';