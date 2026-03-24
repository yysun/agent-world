/**
 * Purpose:
 * - Expose composer and outbound message World update handlers.
 *
 * Key Features:
 * - Groups message input, send/stop, and composer world-setting actions.
 *
 * Notes on Implementation:
 * - Delegates to the migrated runtime implementation to preserve behavior.
 *
 * Summary of Recent Changes:
 * - 2026-03-24: Added composer handler slicing for the World update surface.
 */

import type { Update } from 'apprun';
import type { WorldComponentState } from '../../../types';
import type { WorldEventName } from '../../../types/events';
import { worldUpdateHandlers as runtimeWorldUpdateHandlers } from './runtime';

export const worldComposerHandlers: Update<WorldComponentState, WorldEventName> = {
  'update-input': runtimeWorldUpdateHandlers['update-input'],
  'key-press': runtimeWorldUpdateHandlers['key-press'],
  'send-message': runtimeWorldUpdateHandlers['send-message'],
  'select-project-folder': runtimeWorldUpdateHandlers['select-project-folder'],
  'set-tool-permission': runtimeWorldUpdateHandlers['set-tool-permission'],
  'set-reasoning-effort': runtimeWorldUpdateHandlers['set-reasoning-effort'],
  'stop-message-processing': runtimeWorldUpdateHandlers['stop-message-processing'],
};