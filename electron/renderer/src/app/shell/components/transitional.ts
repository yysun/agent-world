/**
 * App Shell Transitional Component Seam
 * Purpose:
 * - Centralize the app shell's temporary access to renderer components that have not yet moved into an explicit feature or shell-owned layer.
 *
 * Key Features:
 * - Re-exports the remaining shell-consumed transitional components from one local seam.
 * - Makes it easy to audit and delete the last compatibility imports during future migrations.
 *
 * Implementation Notes:
 * - New renderer UI should not be added here; move ownership into `app/shell` or `features/<domain>` instead.
 * - This file exists to confine legacy `components/` access to a single shell-owned entry point.
 *
 * Recent Changes:
 * - 2026-03-24: Added to isolate app-shell access to the shrinking renderer `components/` compatibility layer.
 */

export { default as WorkingStatusBar } from '../../../components/WorkingStatusBar';
export { default as WorldInfoCard } from '../../../components/WorldInfoCard';
