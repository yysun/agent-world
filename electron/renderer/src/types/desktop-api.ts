/**
 * Renderer Desktop API Type Re-Exports
 *
 * Purpose:
 * - Expose shared desktop bridge types for renderer-side type consumers.
 *
 * Key Features:
 * - Re-exports shared preload/main IPC contract types.
 * - Enables a single source of truth for renderer bridge type references.
 *
 * Implementation Notes:
 * - Runtime is unaffected; this is type-only surface for TS consumers.
 *
 * Recent Changes:
 * - 2026-02-12: Added renderer type bridge to consume shared IPC contracts in Phase 4.
 */

export type { ChatEventPayload, DesktopApi } from '../../../shared/ipc-contracts';
