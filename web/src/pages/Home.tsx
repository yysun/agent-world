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
import { getWorlds, createWorld, updateWorld, deleteWorld } from '../api';
import WorldEdit from '../components/world-edit';
import type { World, WorldEditState } from '../types';

interface HomeState {
  worlds: World[];
  currentIndex: number;
  loading: boolean;
  error: string | null;
  worldEdit: WorldEditState;
}

export default class HomeComponent extends Component<HomeState> {
  state = async () => {
    const worlds = await getWorlds();
    return {
      worlds,
      currentIndex: 0,
      loading: false,
      error: null,
      worldEdit: {
        isOpen: false,
        mode: 'create',
        selectedWorld: null,
        formData: {
          name: '',
          description: '',
          turnLimit: 5
        },
        loading: false,
        error: null
      }
    };
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
                  $onclick={['delete-world', state.worlds[state.currentIndex]?.name]}
                >
                  <span class="plus-icon">×</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* World Edit Modal */}
        <WorldEdit
          isOpen={state.worldEdit.isOpen}
          mode={state.worldEdit.mode}
          selectedWorld={state.worldEdit.selectedWorld}
          formData={state.worldEdit.formData}
          loading={state.worldEdit.loading}
          error={state.worldEdit.error}
        />
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

    // World Edit Event Handlers
    'open-world-create': (state: HomeState): HomeState => ({
      ...state,
      worldEdit: {
        ...state.worldEdit,
        isOpen: true,
        mode: 'create',
        selectedWorld: null,
        formData: {
          name: '',
          description: '',
          turnLimit: 5
        },
        error: null
      }
    }),

    'open-world-edit': (state: HomeState, world: World): HomeState => ({
      ...state,
      worldEdit: {
        ...state.worldEdit,
        isOpen: true,
        mode: 'edit',
        selectedWorld: world,
        formData: {
          name: world.name,
          description: world.description || '',
          turnLimit: world.turnLimit || 5
        },
        error: null
      }
    }),

    'close-world-edit': (state: HomeState): HomeState => ({
      ...state,
      worldEdit: {
        ...state.worldEdit,
        isOpen: false,
        error: null
      }
    }),

    'update-world-form': (state: HomeState, field: string, e: Event): HomeState => {
      const target = e.target as HTMLInputElement;
      const value = field === 'turnLimit' ? parseInt(target.value) || 5 : target.value;
      
      return {
        ...state,
        worldEdit: {
          ...state.worldEdit,
          formData: {
            ...state.worldEdit.formData,
            [field]: value
          },
          error: null
        }
      };
    },

    'save-world': async (state: HomeState): Promise<HomeState> => {
      const { mode, formData, selectedWorld } = state.worldEdit;
      
      if (!formData.name.trim()) {
        return {
          ...state,
          worldEdit: {
            ...state.worldEdit,
            error: 'World name is required'
          }
        };
      }

      try {
        // Set loading state
        const loadingState = {
          ...state,
          worldEdit: {
            ...state.worldEdit,
            loading: true,
            error: null
          }
        };
        app.run('#', loadingState);

        let updatedWorld: World;
        if (mode === 'create') {
          updatedWorld = await createWorld({
            name: formData.name,
            description: formData.description,
            turnLimit: formData.turnLimit,
            agents: []
          });
        } else {
          updatedWorld = await updateWorld(selectedWorld!.name, {
            name: formData.name,
            description: formData.description,
            turnLimit: formData.turnLimit
          });
        }

        // Refresh world list
        const worlds = await getWorlds();
        
        return {
          ...state,
          worlds,
          worldEdit: {
            ...state.worldEdit,
            isOpen: false,
            loading: false,
            error: null
          }
        };
      } catch (error) {
        return {
          ...state,
          worldEdit: {
            ...state.worldEdit,
            loading: false,
            error: error instanceof Error ? error.message : 'Failed to save world'
          }
        };
      }
    },

    'delete-world': async (state: HomeState, worldName: string): Promise<HomeState> => {
      if (!worldName) return state;
      
      if (!confirm(`Are you sure you want to delete "${worldName}"? This action cannot be undone.`)) {
        return state;
      }

      try {
        await deleteWorld(worldName);
        
        // Refresh world list
        const worlds = await getWorlds();
        const newCurrentIndex = Math.min(state.currentIndex, worlds.length - 1);
        
        return {
          ...state,
          worlds,
          currentIndex: Math.max(0, newCurrentIndex)
        };
      } catch (error) {
        return {
          ...state,
          error: error instanceof Error ? error.message : 'Failed to delete world'
        };
      }
    },
  };
}

