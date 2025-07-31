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
 * - Consolidated types using centralized types/index.ts
 * 
 * Changes:
 * - Added TypeScript interfaces for all data types
 * - Fixed type errors with proper typing
 * - Maintained all existing CRUD functionality
 * - Enhanced type safety for better development experience
 * - Eliminated duplicate interface definitions
 * - Reused consolidated types for consistency
 */

import type {
  World,
  Agent,
  Message,
  AgentMemoryResponse,
  AgentFormData,
  WorldFormData,
  ApiResponse,
  ApiRequestOptions,
  ChatInfo,
  WorldChat
} from './types';

interface ErrorResponse {
  error: string;
  code?: string;
}

// Base API URL - can be configured
const API_BASE_URL = '/api';

/**
 * Generic fetch wrapper with error handling
 */
export async function apiRequest(endpoint: string, options: ApiRequestOptions = {}): Promise<Response> {
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
 * Get a specific world with its agents
 */
async function getWorld(worldName: string): Promise<World & { agents: Agent[] }> {
  if (!worldName) {
    throw new Error('World name is required');
  }

  const response = await apiRequest(`/worlds/${encodeURIComponent(worldName)}`);
  return response.json();
}

/**
 * Create a new world
 * Accepts Partial<World> and fills in required fields (like agents) with defaults if missing.
 */
async function createWorld(worldData: Partial<World>): Promise<World> {
  if (!worldData || !worldData.name) {
    throw new Error('World data with name is required');
  }
  // Ensure required fields are present
  const completeWorld: World = {
    name: worldData.name,
    description: worldData.description || '',
    turnLimit: worldData.turnLimit ?? 5,
    agents: worldData.agents ?? [],
  };

  const response = await apiRequest('/worlds', {
    method: 'POST',
    body: JSON.stringify(completeWorld),
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
async function createAgent(worldName: string, agentData: Partial<Agent>): Promise<Agent> {
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
// async function getAgentMemory(worldName: string, agentName: string): Promise<AgentMemoryResponse> {
//   if (!worldName || !agentName) {
//     throw new Error('World name and agent name are required');
//   }

//   const response = await apiRequest(`/worlds/${encodeURIComponent(worldName)}/agents/${encodeURIComponent(agentName)}/memory`);
//   return response.json();
// }

/**
 * Clear agent memory
 */
export async function clearAgentMemory(worldName: string, agentName: string): Promise<void> {
  if (!worldName || !agentName) {
    throw new Error('World name and agent name are required');
  }

  await apiRequest(`/worlds/${encodeURIComponent(worldName)}/agents/${encodeURIComponent(agentName)}/memory`, {
    method: 'DELETE',
  });
}

/**
 * Export world to markdown and download it
 */
async function exportWorldToMarkdown(worldName: string): Promise<void> {
  if (!worldName) {
    throw new Error('World name is required');
  }

  const response = await apiRequest(`/worlds/${encodeURIComponent(worldName)}/export`);
  
  // Get the filename from Content-Disposition header
  const contentDisposition = response.headers.get('Content-Disposition');
  let filename = `${worldName}-export.md`;
  
  if (contentDisposition) {
    const match = contentDisposition.match(/filename="(.+)"/);
    if (match) {
      filename = match[1];
    }
  }

  // Get the markdown content
  const markdown = await response.text();

  // Create a blob and download it
  const blob = new Blob([markdown], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export world to markdown and return the content for viewing
 */
async function getWorldMarkdown(worldName: string): Promise<string> {
  if (!worldName) {
    throw new Error('World name is required');
  }

  const response = await apiRequest(`/worlds/${encodeURIComponent(worldName)}/export`);
  return response.text();
}

// Export the API functions
export default {
  // Core API function
  apiRequest,

  // World management
  getWorlds,
  getWorld,
  createWorld,
  updateWorld,
  deleteWorld,
  exportWorldToMarkdown,
  getWorldMarkdown,

  // Agent management
  getAgents,
  getAgent,
  createAgent,
  updateAgent,
  deleteAgent,

  // Agent memory management
  // getAgentMemory,
  clearAgentMemory,

  // Chat history management
  listChats,
  createChat,
  getChat,
  updateChat,
  deleteChat,
  restoreFromChat,
  summarizeChat,
};

// ========================
// CHAT HISTORY API
// ========================

/**
 * List all chat history entries for a world
 */
export async function listChats(worldName: string): Promise<ChatInfo[]> {
  if (!worldName) {
    throw new Error('World name is required');
  }

  const response = await apiRequest(`/worlds/${encodeURIComponent(worldName)}/chats`);
  const data = await response.json();
  
  return data.chats || [];
}

/**
 * Create a new chat history entry
 */
export async function createChat(worldName: string, chatData: { name: string; description?: string; captureSnapshot?: boolean }): Promise<WorldChat> {
  if (!worldName) {
    throw new Error('World name is required');
  }

  const response = await apiRequest(`/worlds/${encodeURIComponent(worldName)}/chats`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(chatData),
  });

  const data = await response.json();
  return data.chat;
}

/**
 * Get a specific chat history entry
 */
export async function getChat(worldName: string, chatId: string): Promise<WorldChat> {
  if (!worldName || !chatId) {
    throw new Error('World name and chat ID are required');
  }

  const response = await apiRequest(`/worlds/${encodeURIComponent(worldName)}/chats/${encodeURIComponent(chatId)}`);
  const data = await response.json();
  
  return data.chat;
}

/**
 * Update a chat history entry
 */
export async function updateChat(worldName: string, chatId: string, updates: { name?: string; description?: string; summary?: string; tags?: string[] }): Promise<WorldChat> {
  if (!worldName || !chatId) {
    throw new Error('World name and chat ID are required');
  }

  const response = await apiRequest(`/worlds/${encodeURIComponent(worldName)}/chats/${encodeURIComponent(chatId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });

  const data = await response.json();
  return data.chat;
}

/**
 * Delete a chat history entry
 */
export async function deleteChat(worldName: string, chatId: string): Promise<void> {
  if (!worldName || !chatId) {
    throw new Error('World name and chat ID are required');
  }

  await apiRequest(`/worlds/${encodeURIComponent(worldName)}/chats/${encodeURIComponent(chatId)}`, {
    method: 'DELETE',
  });
}

/**
 * Restore world state from a chat history entry
 */
export async function restoreFromChat(worldName: string, chatId: string): Promise<void> {
  if (!worldName || !chatId) {
    throw new Error('World name and chat ID are required');
  }

  await apiRequest(`/worlds/${encodeURIComponent(worldName)}/chats/${encodeURIComponent(chatId)}/restore`, {
    method: 'POST',
  });
}

/**
 * Generate a summary for a chat history entry
 */
export async function summarizeChat(worldName: string, chatId: string): Promise<string> {
  if (!worldName || !chatId) {
    throw new Error('World name and chat ID are required');
  }

  const response = await apiRequest(`/worlds/${encodeURIComponent(worldName)}/chats/${encodeURIComponent(chatId)}/summarize`, {
    method: 'POST',
  });

  const data = await response.json();
  return data.summary;
}