/*
 * Home Component - World Selection Interface
 *
 * Renders the banner and delegates all carousel/navigation UI to SwipeCarousel.
 * Retains only the WorldEdit modal state and its open/close handlers.
 */

import { app, Component } from 'apprun';
import api from '../api';
import WorldEdit from '../components/world-edit';
import SwipeCarousel from '../components/swipe-carousel';
import type { World } from '../types';

interface HomeState {
  worlds: World[];
  loading: boolean;
  error: string | null;
  showWorldEdit: boolean;
  worldEditMode: 'create' | 'edit' | 'delete';
  selectedWorldForEdit: World | null;
}

export default class HomeComponent extends Component<HomeState> {
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
      } as HomeState;
    } catch (error: any) {
      return {
        worlds: [],
        loading: false,
        error: error.message || 'Failed to load worlds',
        showWorldEdit: false,
        worldEditMode: 'create',
        selectedWorldForEdit: null,
      } as HomeState;
    }
  };

  view = (state: HomeState) => {
    if (state.loading) {
      return (
        <div className="home-page max-w-7xl mx-auto px-8 py-4">
          <div className="flex flex-col items-center justify-center min-h-screen">
            <div className="text-2xl text-text-secondary">Loading worlds...</div>
          </div>
        </div>
      );
    }

    if (state.error) {
      return (
        <div className="home-page max-w-7xl mx-auto px-8 py-4">
          <div className="flex flex-col items-center justify-center min-h-screen gap-4">
            <div className="text-center">
              <h3 className="text-2xl font-bold text-text-primary mb-2">Error loading worlds</h3>
              <p className="text-lg text-text-secondary mb-4">{state.error}</p>
              <button className="btn btn-primary px-6 py-3" $onclick='/'>Retry</button>
            </div>
          </div>
        </div>
      );
    }

    if (state.worlds.length === 0) {
      return (
        <div className="home-page max-w-7xl mx-auto px-8 py-4">
          <div className="flex flex-col items-center justify-center min-h-screen gap-4">
            <div className="text-center">
              <h3 className="text-2xl font-bold text-text-primary mb-2">No worlds found</h3>
              <p className="text-lg text-text-secondary mb-4">Create your first world to get started!</p>
              <button className="btn btn-primary px-6 py-3" $onclick="open-world-create">Create World</button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="home-page max-w-7xl mx-auto px-8 py-4 min-h-screen flex flex-col justify-center">
        {/* Banner */}
        <div className="flex justify-center mb-8">
          <h1 className="banner-title text-4xl tablet:text-5xl desktop:text-6xl font-bold text-center">
            PICK YOUR WORLD
          </h1>
        </div>

        {/* Swipe Carousel */}
        <SwipeCarousel worlds={state.worlds} />

        {/* World Edit Modal */}
        {state.showWorldEdit &&
          <WorldEdit
            world={state.selectedWorldForEdit}
            mode={state.worldEditMode}
            parentComponent={this}
          />
        }
      </div>
    );
  };

  update = {
    'open-world-create': (state: HomeState): HomeState => ({
      ...state,
      showWorldEdit: true,
      worldEditMode: 'create',
      selectedWorldForEdit: null,
    }),

    'open-world-edit': (state: HomeState, world: World): HomeState => ({
      ...state,
      showWorldEdit: true,
      worldEditMode: 'edit',
      selectedWorldForEdit: world,
    }),

    'open-world-delete': (state: HomeState, world: World): HomeState => ({
      ...state,
      showWorldEdit: true,
      worldEditMode: 'delete',
      selectedWorldForEdit: world,
    }),

    'close-world-edit': (state: HomeState): HomeState => ({
      ...state,
      showWorldEdit: false,
    }),

    'world-saved': () => { location.reload(); },
    'world-deleted': () => { location.reload(); },
  };
}
