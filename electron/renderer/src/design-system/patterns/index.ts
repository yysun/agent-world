/**
 * Design-System Pattern Exports
 *
 * Purpose:
 * - Expose generic composed structures for the Electron renderer design system.
 *
 * Key Features:
 * - Provides a stable pattern-layer export surface.
 *
 * Implementation Notes:
 * - Only product-agnostic composed structures belong here.
 *
 * Recent Changes:
 * - 2026-03-23: Added `AppFrameLayout` to the pattern layer export surface.
 * - 2026-03-23: Added `BaseEditor` as the first generic pattern export.
 * - 2026-03-23: Added `LabeledField` for repeated form label-plus-control structure.
 * - 2026-03-23: Added `PanelActionBar` for repeated side-panel footer action layout.
 * - 2026-03-23: Added `TextEditorDialog` for repeated modal text-editing structure.
 */

export { default as AppFrameLayout } from './AppFrameLayout';
export { default as BaseEditor } from './BaseEditor';
export { default as LabeledField } from './LabeledField';
export { default as PanelActionBar } from './PanelActionBar';
export { default as TextEditorDialog } from './TextEditorDialog';