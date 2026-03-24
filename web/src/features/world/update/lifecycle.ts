/**
 * Purpose:
 * - Expose the lifecycle-owned World update handlers.
 *
 * Key Features:
 * - Groups route initialization handlers under a dedicated feature slice.
 *
 * Notes on Implementation:
 * - Current behavior delegates to the migrated runtime implementation.
 *
 * Summary of Recent Changes:
 * - 2026-03-24: Added lifecycle handler slicing for the World update surface.
 */

import type { Update } from 'apprun';
import type { WorldComponentState } from '../../../types';
import type { WorldEventName } from '../../../types/events';
import { worldUpdateHandlers as runtimeWorldUpdateHandlers } from './runtime';

export const worldLifecycleHandlers: Update<WorldComponentState, WorldEventName> = {
  'initWorld': runtimeWorldUpdateHandlers['initWorld'],
  '/World': runtimeWorldUpdateHandlers['/World'],
};