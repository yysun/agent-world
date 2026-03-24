/*
 * Purpose:
 * - Preserve the legacy swipe-carousel import path while the implementation lives in the Home feature.
 *
 * Key features:
 * - Re-exports the Home feature carousel component and helper utilities.
 *
 * Notes on implementation:
 * - Keep this file as a compatibility shim during the layered migration.
 *
 * Summary of recent changes:
 * - 2026-03-24: Reduced this file to a compatibility re-export so Home owns its feature-specific carousel UI.
 */

export { default } from '../features/home/views/swipe-carousel';
export * from '../features/home/views/swipe-carousel';
