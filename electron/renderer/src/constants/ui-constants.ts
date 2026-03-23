/**
 * Renderer UI Constants
 * Purpose:
 * - Centralize generic renderer UI constants and layout defaults that are not world, agent, or system domain defaults.
 *
 * Key Features:
 * - Theme storage key and titlebar drag-region style constants.
 * - Shared composer and header display limits.
 * - Shared main-column width and floating overlay layout defaults.
 *
 * Implementation Notes:
 * - Keep product defaults and domain-specific settings out of this file.
 * - Values here should remain safe for reuse across multiple renderer surfaces.
 *
 * Recent Changes:
 * - 2026-03-23: Split generic UI constants out of the mixed `app-constants` module.
 */

export const THEME_STORAGE_KEY = 'agent-world-desktop-theme';
export const COMPOSER_MAX_ROWS = 5;
export const MAX_HEADER_AGENT_AVATARS = 8;
export const MAIN_CONTENT_COLUMN_MAX_WIDTH_CLASS = 'max-w-[750px]';
export const DEFAULT_FLOATING_COMPOSER_HEIGHT = '8.5rem';

export const DRAG_REGION_STYLE = { WebkitAppRegion: 'drag' };
export const NO_DRAG_REGION_STYLE = { WebkitAppRegion: 'no-drag' };