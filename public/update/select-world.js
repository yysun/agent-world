//@ts-check
/**
 * World Selection Event Handlers - Updated for unified app-state
 *
 * Features:
 * - Uses unified AppState structure
 * - World data fetching with REST API integration  
 * - Automatic agent loading per world
 * - Message clearing on world change
 * - World persistence to localStorage
 * - Type-safe state operations
 */

import * as api from '../api.js';
import { selectWorld as selectWorldState, updateAgents, clearMessages } from '../app-state.js';

/**
 * Select world and load its data
 * @param {import('../app-state.js').AppState} state
 * @param {string} worldName
 * @returns {Promise<import('../app-state.js').AppState>}
 */
export const selectWorld = async (state, worldName) => {
  // Find world by name to get ID
  const world = state.worlds.find(w => w.name === worldName);
  if (!world) {
    console.error('World not found:', worldName);
    return state;
  }

  if (world.id === state.selectedWorldId) return state;

  // Save selected world to localStorage
  if (worldName) {
    localStorage.setItem('selectedWorldName', worldName);
  } else {
    localStorage.removeItem('selectedWorldName');
  }

  // Update state with selected world
  let newState = selectWorldState(state, world.id);
  newState = clearMessages(newState);

  if (world.id) {
    try {
      // Get agents for this world using REST API
      const agentsData = await api.getAgents(worldName);
      newState = updateAgents(newState, agentsData);
    } catch (error) {
      console.error('Failed to fetch world data:', error);
      // Simple error handling - just log and continue with empty agents
      newState = updateAgents(newState, []);
    }
  }

  return newState;
};
