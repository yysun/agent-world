/**
 * API Service Module - Complete REST API Client
 * 
 * Provides functions for interacting with the agent-world REST API endpoints:
 * - World management (create, update, delete, list)
 * - Agent operations (create, read, update, delete, list)
 * - Agent memory management (get, append, clear)
 * 
 * Features:
 * - RESTful API client using fetch
 * - Comprehensive error handling with structured error format
 * - Base URL configuration
 * - Full CRUD operations for worlds and agents
 * - Memory management for agents
 * - Clean separation: Chat functionality moved to sse-client.js
 * 
 * Changes:
 * - Removed sendChatMessage function (moved to sse-client.js)
 * - Simplified to focus on REST operations only
 * - Clean API without SSE complexity
 * - Maintained all existing CRUD functionality
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
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;

      // Try to parse structured error response
      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMessage = errorData.error;
          if (errorData.code) {
            errorMessage += ` (${errorData.code})`;
          }
        }
      } catch (parseError) {
        // Fall back to status text if JSON parsing fails
      }

      throw new Error(errorMessage);
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
 * Create a new world
 * @param {Object} worldData - World configuration data
 * @param {string} worldData.name - Name of the world
 * @param {string} [worldData.description] - Optional description
 * @returns {Promise<Object>} Created world data
 */
async function createWorld(worldData) {
  if (!worldData || !worldData.name) {
    throw new Error('World data with name is required');
  }

  const response = await apiRequest('/worlds', {
    method: 'POST',
    body: JSON.stringify(worldData),
  });

  return response.json();
}

/**
 * Update an existing world
 * @param {string} worldName - Name of the world to update
 * @param {Object} updateData - Partial world data to update
 * @param {string} [updateData.name] - New name for the world
 * @param {string} [updateData.description] - New description for the world
 * @returns {Promise<Object>} Updated world data
 */
async function updateWorld(worldName, updateData) {
  if (!worldName || !updateData) {
    throw new Error('World name and update data are required');
  }

  const response = await apiRequest(`/worlds/${encodeURIComponent(worldName)}`, {
    method: 'PATCH',
    body: JSON.stringify(updateData),
  });

  return response.json();
}

/**
 * Delete a world
 * @param {string} worldName - Name of the world to delete
 * @returns {Promise<void>}
 */
async function deleteWorld(worldName) {
  if (!worldName) {
    throw new Error('World name is required');
  }

  await apiRequest(`/worlds/${encodeURIComponent(worldName)}`, {
    method: 'DELETE',
  });
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

/**
 * Delete an agent from a world
 * @param {string} worldName - Name of the world
 * @param {string} agentName - Name of the agent to delete
 * @returns {Promise<void>}
 */
async function deleteAgent(worldName, agentName) {
  if (!worldName || !agentName) {
    throw new Error('World name and agent name are required');
  }

  await apiRequest(`/worlds/${encodeURIComponent(worldName)}/agents/${encodeURIComponent(agentName)}`, {
    method: 'DELETE',
  });
}

/**
 * Get agent memory
 * @param {string} worldName - Name of the world
 * @param {string} agentName - Name of the agent
 * @returns {Promise<Object>} Agent memory data
 */
async function getAgentMemory(worldName, agentName) {
  if (!worldName || !agentName) {
    throw new Error('World name and agent name are required');
  }

  const response = await apiRequest(`/worlds/${encodeURIComponent(worldName)}/agents/${encodeURIComponent(agentName)}/memory`);
  return response.json();
}

/**
 * Append messages to agent memory
 * @param {string} worldName - Name of the world
 * @param {string} agentName - Name of the agent
 * @param {Array} messages - Array of message objects to append
 * @returns {Promise<Object>} Updated memory data
 */
async function appendAgentMemory(worldName, agentName, messages) {
  if (!worldName || !agentName || !messages) {
    throw new Error('World name, agent name, and messages are required');
  }

  const response = await apiRequest(`/worlds/${encodeURIComponent(worldName)}/agents/${encodeURIComponent(agentName)}/memory`, {
    method: 'POST',
    body: JSON.stringify({ messages }),
  });

  return response.json();
}

/**
 * Clear agent memory
 * @param {string} worldName - Name of the world
 * @param {string} agentName - Name of the agent
 * @returns {Promise<void>}
 */
async function clearAgentMemory(worldName, agentName) {
  if (!worldName || !agentName) {
    throw new Error('World name and agent name are required');
  }

  await apiRequest(`/worlds/${encodeURIComponent(worldName)}/agents/${encodeURIComponent(agentName)}/memory`, {
    method: 'DELETE',
  });
}

/**
 * Comprehensive world update function for bulk operations
 * @param {string} worldName - Name of the world
 * @param {Object} updateData - Comprehensive update data
 * @returns {Promise<Object>} Updated world data
 */
async function updateWorldComprehensive(worldName, updateData) {
  // For now, this is the same as updateWorld since we implemented basic world updates
  // In the future, this could handle complex operations like agent bulk updates
  return updateWorld(worldName, updateData);
}

// Export the API functions
export {
  // Core API function
  apiRequest,

  // World management
  getWorlds,
  createWorld,
  updateWorld,
  deleteWorld,
  updateWorldComprehensive,

  // Agent management
  getAgents,
  getAgent,
  createAgent,
  updateAgent,
  deleteAgent,

  // Agent memory management
  getAgentMemory,
  appendAgentMemory,
  clearAgentMemory,
};