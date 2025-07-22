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
 * - Full TypeScript support with proper interfaces
 * 
 * Changes:
 * - Added TypeScript interfaces for all data types
 * - Fixed type errors with proper typing
 * - Maintained all existing CRUD functionality
 * - Enhanced type safety for better development experience
 */

// TypeScript interfaces
interface World {
  id?: string;
  name: string;
  description?: string;
}

interface Agent {
  id?: string;
  name: string;
  description?: string;
  [key: string]: any;
}

interface Message {
  role: string;
  content: string;
  timestamp?: string;
  [key: string]: any;
}

interface AgentMemory {
  messages: Message[];
  [key: string]: any;
}

interface ApiRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  [key: string]: any;
}

interface ErrorResponse {
  error: string;
  code?: string;
}

// Base API URL - can be configured
const API_BASE_URL = '/api';

/**
 * Generic fetch wrapper with error handling
 */
async function apiRequest(endpoint: string, options: ApiRequestOptions = {}): Promise<Response> {
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
        const errorData: ErrorResponse = await response.json();
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
 */
async function getWorlds(): Promise<World[]> {
  const response = await apiRequest('/worlds');
  return response.json();
}

/**
 * Create a new world
 */
async function createWorld(worldData: World): Promise<World> {
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
 */
async function updateWorld(worldName: string, updateData: Partial<World>): Promise<World> {
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
 */
async function deleteWorld(worldName: string): Promise<void> {
  if (!worldName) {
    throw new Error('World name is required');
  }

  await apiRequest(`/worlds/${encodeURIComponent(worldName)}`, {
    method: 'DELETE',
  });
}

/**
 * Get all agents in a specific world
 */
async function getAgents(worldName: string): Promise<Agent[]> {
  if (!worldName) {
    throw new Error('World name is required');
  }

  const response = await apiRequest(`/worlds/${encodeURIComponent(worldName)}/agents`);
  return response.json();
}

/**
 * Get a specific agent from a world
 */
async function getAgent(worldName: string, agentName: string): Promise<Agent> {
  if (!worldName || !agentName) {
    throw new Error('Both world name and agent name are required');
  }

  const response = await apiRequest(`/worlds/${encodeURIComponent(worldName)}/agents/${encodeURIComponent(agentName)}`);
  return response.json();
}

/**
 * Create a new agent in a world
 */
async function createAgent(worldName: string, agentData: Agent): Promise<Agent> {
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
 */
async function updateAgent(worldName: string, agentName: string, updateData: Partial<Agent>): Promise<Agent> {
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
 */
async function deleteAgent(worldName: string, agentName: string): Promise<void> {
  if (!worldName || !agentName) {
    throw new Error('World name and agent name are required');
  }

  await apiRequest(`/worlds/${encodeURIComponent(worldName)}/agents/${encodeURIComponent(agentName)}`, {
    method: 'DELETE',
  });
}

/**
 * Get agent memory
 */
async function getAgentMemory(worldName: string, agentName: string): Promise<AgentMemory> {
  if (!worldName || !agentName) {
    throw new Error('World name and agent name are required');
  }

  const response = await apiRequest(`/worlds/${encodeURIComponent(worldName)}/agents/${encodeURIComponent(agentName)}/memory`);
  return response.json();
}

/**
 * Append messages to agent memory
 */
async function appendAgentMemory(worldName: string, agentName: string, messages: Message[]): Promise<AgentMemory> {
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
 */
async function clearAgentMemory(worldName: string, agentName: string): Promise<void> {
  if (!worldName || !agentName) {
    throw new Error('World name and agent name are required');
  }

  await apiRequest(`/worlds/${encodeURIComponent(worldName)}/agents/${encodeURIComponent(agentName)}/memory`, {
    method: 'DELETE',
  });
}

/**
 * Comprehensive world update function for bulk operations
 */
async function updateWorldComprehensive(worldName: string, updateData: Partial<World>): Promise<World> {
  // For now, this is the same as updateWorld since we implemented basic world updates
  // In the future, this could handle complex operations like agent bulk updates
  return updateWorld(worldName, updateData);
}

// Export the API functions
export type { World, Agent, Message, AgentMemory };

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