/**
 * Purpose:
 * - Expose message-display and transcript-mutation World update handlers.
 *
 * Key Features:
 * - Groups display toggles, dashboard transcript toggles, and edit/delete flows.
 *
 * Notes on Implementation:
 * - Delegates to the migrated runtime implementation to preserve transcript behavior.
 *
 * Summary of Recent Changes:
 * - 2026-03-24: Added message handler slicing for the World update surface.
 */

import type { Update } from 'apprun';
import type { WorldComponentState } from '../../../types';
import type { WorldEventName } from '../../../types/events';
import { worldUpdateHandlers as runtimeWorldUpdateHandlers } from './runtime';

export const worldMessageHandlers: Update<WorldComponentState, WorldEventName> = {
  'toggle-log-details': runtimeWorldUpdateHandlers['toggle-log-details'],
  'toggle-reasoning-output': runtimeWorldUpdateHandlers['toggle-reasoning-output'],
  'toggle-dashboard-history': runtimeWorldUpdateHandlers['toggle-dashboard-history'],
  'start-edit-message': runtimeWorldUpdateHandlers['start-edit-message'],
  'cancel-edit-message': runtimeWorldUpdateHandlers['cancel-edit-message'],
  'update-edit-text': runtimeWorldUpdateHandlers['update-edit-text'],
  'toggle-tool-output': runtimeWorldUpdateHandlers['toggle-tool-output'],
  'show-delete-message-confirm': runtimeWorldUpdateHandlers['show-delete-message-confirm'],
  'hide-delete-message-confirm': runtimeWorldUpdateHandlers['hide-delete-message-confirm'],
  'delete-message-confirmed': runtimeWorldUpdateHandlers['delete-message-confirmed'],
  'save-edit-message': runtimeWorldUpdateHandlers['save-edit-message'],
};