/**
 * API Service Module (Legacy REST API)
 * 
 * Provides functions for interacting with the agent-world REST API endpoints:
 * - World management
 * - Agent operations (list, get, update)
 * 
 * Note: Chat functionality has been moved to ws-api.js for WebSocket-based messaging
 * Consider migrating to ws-api.js for real-time functionality
 * 
 * Features:
 * - RESTful API client using fetch
 * - Error handling and response validation
 * - Base URL configuration
 */

// Base API URL - can be configured
const API_BASE_URL = '';

/**
 * Generic fetch wrapper with error handling
 */
async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;

  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response;
  } catch (error) {
    console.error(`API request failed for ${endpoint}:`, error);
    throw error;
  }
}

/**
 * Get all worlds
 * @returns {Promise<Array>} List of worlds
 */
async function getWorlds() {
  const response = await apiRequest('/worlds');
  return response.json();
}

/**
 * Get all agents in a specific world
 * @param {string} worldName - Name of the world
 * @returns {Promise<Array>} List of agents in the world
 */
async function getAgents(worldName) {
  if (!worldName) {
    throw new Error('World name is required');
  }

  const response = await apiRequest(`/worlds/${encodeURIComponent(worldName)}/agents`);
  return response.json();
}

/**
 * Get a specific agent from a world
 * @param {string} worldName - Name of the world
 * @param {string} agentName - Name of the agent
 * @returns {Promise<Object>} Agent data
 */
async function getAgent(worldName, agentName) {
  if (!worldName || !agentName) {
    throw new Error('Both world name and agent name are required');
  }

  const response = await apiRequest(`/worlds/${encodeURIComponent(worldName)}/agents/${encodeURIComponent(agentName)}`);
  return response.json();
}

/**
 * Create a new agent in a world (coming soon)
 * @param {string} worldName - Name of the world
 * @param {Object} agentData - Agent configuration data
 * @returns {Promise<Object>} Created agent data
 */
async function createAgent(worldName, agentData) {
  if (!worldName || !agentData) {
    throw new Error('World name and agent data are required');
  }

  const response = await apiRequest(`/worlds/${encodeURIComponent(worldName)}/agents`, {
    method: 'POST',
    body: JSON.stringify(agentData),
  });

  return response.json();
}

/**
 * Update an existing agent
 * @param {string} worldName - Name of the world
 * @param {string} agentName - Name of the agent
 * @param {Object} updateData - Partial agent data to update
 * @returns {Promise<Object>} Updated agent data
 */
async function updateAgent(worldName, agentName, updateData) {
  if (!worldName || !agentName || !updateData) {
    throw new Error('World name, agent name, and update data are required');
  }

  const response = await apiRequest(`/worlds/${encodeURIComponent(worldName)}/agents/${encodeURIComponent(agentName)}`, {
    method: 'PATCH',
    body: JSON.stringify(updateData),
  });

  return response.json();
}

// Export the API functions
export {
  getWorlds,
  getAgents,
  getAgent,
  createAgent,
  updateAgent,
};