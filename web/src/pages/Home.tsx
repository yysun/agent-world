/*
 * Home Component - World Selection Interface
 *
 * Renders the banner and delegates all carousel/navigation UI to SwipeCarousel.
 * Retains only the WorldEdit modal state and its open/close handlers.
 *
 * Recent Changes:
 * - 2026-03-10: Added stable home-page selectors for Playwright web E2E coverage.
 */

import { app, Component } from 'apprun';
import api from '../api';
import { HomePageView, homePageUpdateHandlers } from '../features/home';
import type { HomeViewState } from '../features/home';
import { WorldEdit } from '../features/world';

export default class HomeComponent extends Component<HomeViewState> {

  is_global_event = () => true;

  declare props: Readonly<{}>;

  state = async () => {
    try {
      const worlds = await api.getWorlds();
      return {
        worlds,
        loading: false,
        error: null,
        showWorldEdit: false,
        worldEditMode: 'create',
        selectedWorldForEdit: null,
      } as HomeViewState;
    } catch (error: any) {
      return {
        worlds: [],
        loading: false,
        error: error.message || 'Failed to load worlds',
        showWorldEdit: false,
        worldEditMode: 'create',
        selectedWorldForEdit: null,
      } as HomeViewState;
    }
  };

  view = (state: HomeViewState) => <>
    <HomePageView state={state} />
    {state.showWorldEdit ? (
      <WorldEdit
        world={state.selectedWorldForEdit}
        mode={state.worldEditMode}
        parentComponent={this}
      />
    ) : null}
  </>;

  update = homePageUpdateHandlers;
}
