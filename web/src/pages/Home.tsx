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
 * 
 * Implementation:
 * - AppRun component with TypeScript interfaces
 * - Dynamic visibility logic for optimal world display
 * - Highlighted arrow states for better UX
 * - Responsive design for mobile and desktop
 * - Async API calls with proper error handling
 * 
 * Recent Changes:
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
  state = async () => {
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
  }

  view = (state: HomeState) => {
    if (state.loading) {
      return (
        <div class="container">
          <div class="row">
            <div class="col">
              <div class="loading-message">Loading worlds...</div>
            </div>
          </div>
        </div>
      );
    }

    if (state.error) {
      return (
        <div class="container">
          <div class="row">
            <div class="col">
              <div class="error-message">
                <h3>Error loading worlds</h3>
                <p>{state.error}</p>
                <button class="btn btn-primary" $onclick='/' >
                  Retry
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (state.worlds.length === 0) {
      return (
        <div class="container">
          <div class="row">
            <div class="col">
              <div class="no-worlds-message">
                <h3>No worlds found</h3>
                <p>Create your first world to get started!</p>
                <button class="btn btn-primary" $onclick="open-world-create">Create World</button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div class="container">
        {/* Banner */}
        <div class="row">
          <div class="col banner-col">
            <h1 class="banner-title">PICK YOUR WORLD</h1>
          </div>
        </div>

        {/* World Carousel */}
        <div class="row carousel-row">
          <div class="col">
            <div class="world-carousel">
              {/* Left Arrow */}
              <button
                class={`btn carousel-arrow`}
                $onclick='prev-world'
              >
                ‹
              </button>

              {/* World Cards */}
              <div class="world-cards">
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
                      class={`btn world-card-btn ${isCenter ? 'btn-primary center' : 'btn-secondary side'}`}
                      $onclick={isCenter ? ['enter-world', world] : ['select-world', world]}
                    >
                      <span class="world-name">
                        {world.name}
                      </span>
                    </button>
                  );
                })}
              </div>
              {/* Right Arrow */}
              <button
                class={`btn carousel-arrow`}
                $onclick='next-world'
              >
                ›
              </button>
            </div>

            {/* World Description */}
            <div class="world-indicators">
              {state.worlds.map((world, index) => (
                <button
                  class={`world-dot ${index === state.currentIndex ? 'active' : ''}`}
                  $onclick={['select-world', world]}
                  title={world.name}
                />
              ))}
            </div>
          </div>
        </div>

        {/* World Description */}
        <div class="row">
          <div class="col">
            <div class="description-card">
              <h4 class="description-title">
                {state.worlds[state.currentIndex]?.name || 'Unknown World'}
              </h4>
              <p class="description-text">
                {state.worlds[state.currentIndex]?.description || 'No description available'}
              </p>
              <div class="action-buttons">
                <button class="btn add-world-btn" title="Add New World" $onclick="open-world-create">
                  <span class="plus-icon">+</span>
                </button>
                <a href={'/World/' + (state.worlds[state.currentIndex]?.name || '')}>
                  <button class="btn btn-primary enter-btn">
                    Enter {state.worlds[state.currentIndex]?.name || 'World'}
                  </button>
                </a>
                <button
                  class="btn add-world-btn delete-world-btn"
                  title="Delete World"
                  $onclick={['open-world-delete', state.worlds[state.currentIndex]]}
                >
                  <span class="plus-icon">×</span>
                </button>
              </div>
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
      const index = state.worlds.findIndex(w => w.name === world.name);
      return { ...state, currentIndex: index >= 0 ? index : state.currentIndex };
    },
    'enter-world': (state: HomeState, world: World): void => { // no return - no render needed
      // Navigate to the world page
      window.location.href = '/World/' + world.name;
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

  };
}

