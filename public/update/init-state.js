//@ts-check
/**
 * Initial State Module - Application state initialization using unified app-state
 *
 * Features:
 * - Uses new unified AppState structure from app-state.js
 * - Loads available worlds from REST API
 * - Auto-selects persisted world from localStorage
 * - Type-safe state operations with validation
 * - Simple error handling without complex recovery
 */

import * as api from '../api.js';
import { createInitialState, updateWorlds, selectWorld as selectWorldState } from '../app-state.js';

/**
 * Initialize application state with REST API
 * @returns {Promise<import('../app-state.js').AppState>} Initial application state
 */
export const initializeState = async () => {
  // Start with initial state
  let state = createInitialState();
  state.loading = true;

  try {
    // Load worlds using REST API
    const worldsData = await api.getWorlds();
    state = updateWorlds(state, worldsData);
    state.loading = false;

    // Get persisted world name from localStorage
    const persistedWorldName = localStorage.getItem('selectedWorldName');
    let selectedWorld = null;

    if (persistedWorldName && state.worlds.find(w => w.name === persistedWorldName)) {
      selectedWorld = persistedWorldName;
    } else if (state.worlds.length > 0) {
      selectedWorld = state.worlds[0].id; // Use ID instead of name
    }

    if (selectedWorld) {
      state = selectWorldState(state, selectedWorld);
      // Load agents for selected world
      try {
        const agentsData = await api.getAgents(selectedWorld);
        state = { ...state, agents: agentsData.filter(agent => agent && agent.id) };
      } catch (error) {
        console.error('Failed to load agents:', error);
      }
    }

    return state;
  } catch (error) {
    console.error('Failed to initialize state:', error);
    return {
      ...state,
      loading: false,
      // Simple error handling - just log and continue
    };
  }
};
