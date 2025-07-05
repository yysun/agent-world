/**
 * World Selection Event Handlers
 *
 * Features:
 * - World data fetching with REST API integration  
 * - Automatic agent loading per world
 * - Message clearing on world change
 * - World persistence to localStorage for session continuity
 * - Uses only REST API + SSE (no WebSocket)
 */

import * as api from '../api.js';

export const selectWorld = async (state, worldName) => {
  if (worldName === state.worldName) return state;

  // Save selected world to localStorage
  if (worldName) {
    localStorage.setItem('selectedWorldName', worldName);
  } else {
    localStorage.removeItem('selectedWorldName');
  }

  const newState = {
    ...state,
    worldName,
    messages: [],
    connectionStatus: 'connected' // REST API is always "connected"
  };

  if (worldName) {
    try {
      // Get world data and agents using REST API
      const agents = await api.getAgents(worldName);
      return { ...newState, agents };
    } catch (error) {
      console.error('Failed to fetch world data:', error);
      return { ...newState, agents: [], error: error.message };
    }
  }

  return { ...newState, agents: [] };
};
