/**
 * Settings Feature Components Barrel
 *
 * Purpose:
 * - Expose settings-specific business UI owned by the renderer settings feature.
 *
 * Key Features:
 * - Groups settings row widgets that compose the settings panel.
 * - Provides a single feature-scoped import surface for settings toggles.
 *
 * Implementation Notes:
 * - These components are business-specific and must remain outside `design-system/`.
 *
 * Recent Changes:
 * - 2026-03-23: Added the initial feature-scoped settings components barrel.
 */

export { default as SettingsSkillSwitch } from './SettingsSkillSwitch';
export { default as SettingsSwitch } from './SettingsSwitch';