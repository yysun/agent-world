/*
 * Home Component - World Selection Interface
 * 
 * Features:
 * - World carousel that shows at least 3 worlds at once
 * - Navigation arrows with highlighted states at boundaries
 * - Responsive world cards with center/side positioning
 * - Interactive world selection with description display
 * - Indicator dots for world navigation
 * - Real-time API integration for world data
 * - Loading and error states for better UX
 * - Tailwind CSS utilities for layout, spacing, and typography
 * 
 * Implementation:
 * - AppRun component with TypeScript interfaces
 * - Dynamic visibility logic for optimal world display
 * - Highlighted arrow states for better UX
 * - Responsive design with Tailwind breakpoints (mobile, tablet, desktop)
 * - Async API calls with proper error handling
 * - Preserves Doodle CSS for buttons and decorative borders
 * 
 * Recent Changes:
 * - 2026-02-10: Fixed world navigation to use world IDs (with fallback) instead of world names
 * - Integrated Tailwind CSS utilities for layout and spacing
 * - Added responsive utilities with custom breakpoints
 * - Migrated typography to Tailwind text utilities
 * - Preserved Doodle CSS classes for visual consistency
 * - Replaced mock data with API calls to getWorlds()
 * - Added proper TypeScript typing with HomeState interface
 * - Added loading, error, and empty states handling
 * - Fixed type errors and improved type safety
 * - Enhanced error handling with retry functionality
 */

import { app, Component } from 'apprun';
import api from '../api';
import WorldEdit from '../components/world-edit';
import type { World } from '../types';

interface HomeState {
  worlds: World[];
  currentIndex: number;
  loading: boolean;
  error: string | null;
  // Simplified world edit state - just boolean flags and mode
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
        currentIndex: 0,
        loading: false,
        error: null,
        // Simplified world edit state
        showWorldEdit: false,
        worldEditMode: 'create',
        selectedWorldForEdit: null,
      } as HomeState;
    } catch (error: any) {
      return {
        worlds: [],
        currentIndex: 0,
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
        <div className="max-w-7xl mx-auto px-8 py-4">
          <div className="flex flex-col items-center justify-center min-h-screen">
            <div className="text-2xl text-text-secondary">Loading worlds...</div>
          </div>
        </div>
      );
    }

    if (state.error) {
      return (
        <div className="max-w-7xl mx-auto px-8 py-4">
          <div className="flex flex-col items-center justify-center min-h-screen gap-4">
            <div className="text-center">
              <h3 className="text-2xl font-bold text-text-primary mb-2">Error loading worlds</h3>
              <p className="text-lg text-text-secondary mb-4">{state.error}</p>
              <button className="btn btn-primary px-6 py-3" $onclick='/' >
                Retry
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (state.worlds.length === 0) {
      return (
        <div className="max-w-7xl mx-auto px-8 py-4">
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
      <div className="max-w-7xl mx-auto px-8 py-4 min-h-screen flex flex-col justify-center">
        {/* Banner */}
        <div className="flex justify-center mb-8">
          <h1 className="banner-title text-4xl tablet:text-5xl desktop:text-6xl font-bold text-center">
            PICK YOUR WORLD
          </h1>
        </div>

        {/* World Carousel */}
        <div className="flex justify-center mb-8">
          <div className="world-carousel flex items-center justify-center gap-4">
            {/* Left Arrow */}
            <button
              className="btn carousel-arrow w-16 h-16 tablet:w-20 tablet:h-20 flex items-center justify-center text-4xl"
              $onclick='prev-world'
            >
              ‹
            </button>

            {/* World Cards */}
            <div className="world-cards flex items-center gap-4">
              {state.worlds.map((world, index) => {
                const isCenter = index === state.currentIndex;
                // Show at least 3 items: if we have 3 or fewer worlds, show all
                // If we have more than 3, show center + 1 on each side
                let isVisible = false;
                if (state.worlds.length <= 3) {
                  isVisible = true; // Show all when 3 or fewer
                } else {
                  isVisible = Math.abs(index - state.currentIndex) <= 1;
                }

                if (!isVisible) return null;

                return (
                  <button
                    className={`btn world-card-btn ${isCenter ? 'btn-primary center' : 'btn-secondary side'} flex flex-col items-center justify-center min-w-48 h-48 tablet:min-w-40 tablet:h-40 mobile:min-w-36 mobile:h-36 rounded-2xl shadow-sm`}
                    $onclick={isCenter ? ['enter-world', world] : ['select-world', world]}
                  >
                    <span className="world-name text-lg font-medium">
                      {world.name}
                    </span>
                  </button>
                );
              })}
            </div>
            {/* Right Arrow */}
            <button
              className="btn carousel-arrow w-16 h-16 tablet:w-20 tablet:h-20 flex items-center justify-center text-4xl"
              $onclick='next-world'
            >
              ›
            </button>
          </div>
        </div>

        {/* World Indicators */}
        <div className="flex justify-center mb-8">
          <div className="world-indicators flex gap-2">
            {state.worlds.map((world, index) => (
              <button
                className={`world-dot ${index === state.currentIndex ? 'active' : ''}`}
                $onclick={['select-world', world]}
                title={world.name}
              />
            ))}
          </div>
        </div>

        {/* World Description */}
        <div className="flex justify-center">
          <div className="description-card max-w-2xl w-full p-6 rounded-xl shadow-md">
            <h4 className="description-title text-2xl font-bold text-center mb-4">
              {state.worlds[state.currentIndex]?.name || 'Unknown World'}
            </h4>
            <p className="description-text text-base text-center text-text-secondary mb-6">
              {state.worlds[state.currentIndex]?.description || 'No description available'}
            </p>
            <div className="action-buttons flex items-center justify-center gap-4">
              <button className="btn add-world-btn w-12 h-12 flex items-center justify-center rounded-lg" title="Add New World" $onclick="open-world-create">
                <span className="plus-icon text-2xl">+</span>
              </button>
              <a href={'/World/' + encodeURIComponent(state.worlds[state.currentIndex]?.id || state.worlds[state.currentIndex]?.name || '')}>
                <button className="btn btn-primary enter-btn px-8 py-3 rounded-lg text-lg">
                  Enter {state.worlds[state.currentIndex]?.name || 'World'}
                </button>
              </a>
              <button
                className="btn add-world-btn delete-world-btn w-12 h-12 flex items-center justify-center rounded-lg"
                title="Delete World"
                $onclick={['open-world-delete', state.worlds[state.currentIndex]]}
              >
                <span className="plus-icon text-2xl">×</span>
              </button>
            </div>
          </div>
        </div>

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
    'prev-world': (state: HomeState): HomeState => ({
      ...state,
      currentIndex: state.currentIndex > 0 ? state.currentIndex - 1 : state.worlds.length - 1
    }),
    'next-world': (state: HomeState): HomeState => ({
      ...state,
      currentIndex: state.currentIndex < state.worlds.length - 1 ? state.currentIndex + 1 : 0
    }),
    'select-world': (state: HomeState, world: World): HomeState => {
      const index = state.worlds.findIndex(w => (w.id && w.id === world.id) || w.name === world.name);
      return { ...state, currentIndex: index >= 0 ? index : state.currentIndex };
    },
    'enter-world': (state: HomeState, world: World): void => { // no return - no render needed
      // Navigate to the world page
      window.location.href = '/World/' + encodeURIComponent(world.id || world.name);
    },

    // Simplified World Edit Event Handlers
    'open-world-create': (state: HomeState): HomeState => ({
      ...state,
      showWorldEdit: true,
      worldEditMode: 'create',
      selectedWorldForEdit: null
    }),

    'open-world-edit': (state: HomeState, world: World): HomeState => ({
      ...state,
      showWorldEdit: true,
      worldEditMode: 'edit',
      selectedWorldForEdit: world
    }),

    'open-world-delete': (state: HomeState, world: World): HomeState => ({
      ...state,
      showWorldEdit: true,
      worldEditMode: 'delete',
      selectedWorldForEdit: world
    }),

    'close-world-edit': (state: HomeState): HomeState => ({
      ...state,
      showWorldEdit: false
    }),

    // Global events from WorldEdit component - no return, no re-render before reload
    'world-saved': (state: HomeState) => {
      location.reload(); // Simple refresh after CRUD
    },
    'world-deleted': (state: HomeState) => {
      location.reload();
    }
  };
}
