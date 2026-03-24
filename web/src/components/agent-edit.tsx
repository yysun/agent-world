/**
 * Purpose:
 * - Preserve the legacy AgentEdit component import path during the feature-layer migration.
 *
 * Key Features:
 * - Re-exports the World feature agent-edit implementation.
 *
 * Notes on Implementation:
 * - This compatibility shim keeps existing imports stable while ownership moves to `features/world/views`.
 *
 * Summary of Recent Changes:
 * - 2026-03-24: Replaced the local implementation with a compatibility re-export.
 */

export { default } from '../features/world/views/agent-edit';
export * from '../features/world/views/agent-edit';
