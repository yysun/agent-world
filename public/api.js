/**
 * API Service Module
 * 
 * Provides functions for interacting with the agent-world API endpoints:
 * - World management
 * - Agent operations (list, get, update)
 * - Chat functionality with SSE streaming
 * 
 * Features:
 * - RESTful API client using fetch
 * - Error handling and response validation
 * - SSE streaming support for chat
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

/**
 * Start a chat session with SSE streaming
 * @param {string} worldName - Name of the world
 * @param {Object} chatData - Chat message data
 * @param {Function} onMessage - Callback for each SSE message
 * @param {Function} onError - Callback for errors
 * @param {Function} onComplete - Callback when stream completes
 * @returns {EventSource} EventSource instance for manual control
 */
function startChat(worldName, chatData, onMessage, onError, onComplete) {
  if (!worldName || !chatData) {
    throw new Error('World name and chat data are required');
  }

  // First, send the POST request to initiate the chat
  const chatUrl = `${API_BASE_URL}/worlds/${encodeURIComponent(worldName)}/chat`;

  return fetch(chatUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
    },
    body: JSON.stringify(chatData),
  })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Create EventSource-like behavior from the fetch response
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      function readStream() {
        return reader.read().then(({ done, value }) => {
          if (done) {
            if (onComplete) onComplete();
            return;
          }

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') {
                if (onComplete) onComplete();
                return;
              }

              try {
                const message = JSON.parse(data);
                if (onMessage) onMessage(message);
              } catch (e) {
                console.warn('Failed to parse SSE message:', data);
              }
            }
          }

          return readStream();
        });
      }

      readStream().catch(error => {
        if (onError) onError(error);
      });

      // Return a simple controller object
      return {
        close: () => reader.cancel(),
      };
    })
    .catch(error => {
      if (onError) onError(error);
      throw error;
    });
}

/**
 * Alternative chat function that returns an EventSource
 * @param {string} worldName - Name of the world
 * @param {Object} chatData - Chat message data
 * @returns {EventSource} EventSource for SSE streaming
 */
function createChatEventSource(worldName, chatData) {
  if (!worldName || !chatData) {
    throw new Error('World name and chat data are required');
  }

  // Note: This approach requires the server to accept SSE connections via GET
  // with parameters, or we need to establish the connection differently
  const url = new URL(`${API_BASE_URL}/worlds/${encodeURIComponent(worldName)}/chat`);

  // For EventSource, we typically need to send initial data via URL params
  // or establish the connection through a different mechanism
  Object.keys(chatData).forEach(key => {
    url.searchParams.append(key, JSON.stringify(chatData[key]));
  });

  return new EventSource(url.toString());
}

// Export the API functions
export {
  getWorlds,
  getAgents,
  getAgent,
  createAgent,
  updateAgent,
  startChat,
  createChatEventSource,
};