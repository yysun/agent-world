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
 * - 2026-04-14: Kept project viewer desktop API types in sync with editable project file support.
 * - 2026-04-14: Re-exported project viewer folder/content types from shared IPC contracts.
 * - 2026-02-12: Added renderer type bridge to consume shared IPC contracts in Phase 4.
 */

export type {
  AppUpdateState,
  ChatEventPayload,
  DesktopApi,
  GitHubSkillSummary,
  LocalSkillSummary,
  LogLevel,
  ProjectFileReadResult,
  ProjectFolderEntry,
  RendererLoggingConfig,
  SkillFolderEntry
} from '../../../shared/ipc-contracts';
