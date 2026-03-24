/**
 * Purpose:
 * - Expose world and agent management World update handlers.
 *
 * Key Features:
 * - Groups export and clear-message operations under one management slice.
 *
 * Notes on Implementation:
 * - Delegates to the migrated runtime implementation to preserve existing management behavior.
 *
 * Summary of Recent Changes:
 * - 2026-03-24: Added management handler slicing for the World update surface.
 */

import type { Update } from 'apprun';
import type { WorldComponentState } from '../../../types';
import type { WorldEventName } from '../../../types/events';
import { worldUpdateHandlers as runtimeWorldUpdateHandlers } from './runtime';

export const worldManagementHandlers: Update<WorldComponentState, WorldEventName> = {
  'delete-agent': runtimeWorldUpdateHandlers['delete-agent'],
  'export-world-markdown': runtimeWorldUpdateHandlers['export-world-markdown'],
  'view-world-markdown': runtimeWorldUpdateHandlers['view-world-markdown'],
  'clear-agent-messages': runtimeWorldUpdateHandlers['clear-agent-messages'],
  'clear-world-messages': runtimeWorldUpdateHandlers['clear-world-messages'],
};