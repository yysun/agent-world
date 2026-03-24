/**
 * Purpose:
 * - Compose the World feature update surface from feature-owned handler slices.
 *
 * Key Features:
 * - Merges lifecycle, composer, streaming, message, history, and management handlers.
 * - Re-exports route-local World UI handlers through a dedicated slice.
 *
 * Notes on Implementation:
 * - The legacy page-level `World.update.ts` file now serves as a compatibility facade over this module.
 *
 * Summary of Recent Changes:
 * - 2026-03-24: Added composed World update slices for the layered AppRun refactor.
 */

import type { Update } from 'apprun';
import type { WorldComponentState } from '../../../types';
import type { WorldEventName } from '../../../types/events';
import { worldComposerHandlers } from './composer';
import { worldHistoryHandlers } from './history';
import { worldLifecycleHandlers } from './lifecycle';
import { worldManagementHandlers } from './management';
import { worldMessageHandlers } from './messages';
import { worldStreamingHandlers } from './streaming';

export { worldRouteUiHandlers } from './route-ui';

export const worldUpdateHandlers: Update<WorldComponentState, WorldEventName> = {
  ...worldLifecycleHandlers,
  ...worldComposerHandlers,
  ...worldStreamingHandlers,
  ...worldMessageHandlers,
  ...worldHistoryHandlers,
  ...worldManagementHandlers,
};