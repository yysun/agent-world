/**
 * Purpose:
 * - Provide Home feature update handlers outside the route entry component.
 *
 * Key Features:
 * - Owns world-edit modal open/close state transitions for the Home page.
 * - Keeps route pages focused on AppRun entry concerns.
 *
 * Notes on Implementation:
 * - Handlers remain synchronous and AppRun-friendly.
 *
 * Summary of Recent Changes:
 * - 2026-03-24: Added Home feature update handlers for the layered refactor.
 */

import type { World } from '../../../types';
import type { HomeViewState } from '../views/home-page-view';

export const homePageUpdateHandlers = {
  'open-world-create': (state: HomeViewState): HomeViewState => ({
    ...state,
    showWorldEdit: true,
    worldEditMode: 'create',
    selectedWorldForEdit: null,
  }),

  'open-world-edit': (state: HomeViewState, world: World): HomeViewState => ({
    ...state,
    showWorldEdit: true,
    worldEditMode: 'edit',
    selectedWorldForEdit: world,
  }),

  'open-world-delete': (state: HomeViewState, world: World): HomeViewState => ({
    ...state,
    showWorldEdit: true,
    worldEditMode: 'delete',
    selectedWorldForEdit: world,
  }),

  'close-world-edit': (state: HomeViewState): HomeViewState => ({
    ...state,
    showWorldEdit: false,
  }),

  'world-saved': (): void => {
    location.reload();
  },

  'world-deleted': (): void => {
    location.reload();
  },
};