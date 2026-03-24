/**
 * Purpose:
 * - Expose chat history and session World update handlers.
 *
 * Key Features:
 * - Groups chat search, history modal, and create/load/delete chat flows.
 *
 * Notes on Implementation:
 * - Delegates to the migrated runtime implementation to preserve current session behavior.
 *
 * Summary of Recent Changes:
 * - 2026-03-24: Added history handler slicing for the World update surface.
 */

import type { Update } from 'apprun';
import type { WorldComponentState } from '../../../types';
import type { WorldEventName } from '../../../types/events';
import { worldUpdateHandlers as runtimeWorldUpdateHandlers } from './runtime';

export const worldHistoryHandlers: Update<WorldComponentState, WorldEventName> = {
  'update-chat-search': runtimeWorldUpdateHandlers['update-chat-search'],
  'chat-history-show-delete-confirm': runtimeWorldUpdateHandlers['chat-history-show-delete-confirm'],
  'chat-history-hide-modals': runtimeWorldUpdateHandlers['chat-history-hide-modals'],
  'create-new-chat': runtimeWorldUpdateHandlers['create-new-chat'],
  'load-chat-from-history': runtimeWorldUpdateHandlers['load-chat-from-history'],
  'delete-chat-from-history': runtimeWorldUpdateHandlers['delete-chat-from-history'],
};