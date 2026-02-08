/**
 * API Service Module - Complete REST API Client for React App
 * 
 * Purpose: Provides REST API client for agent-world React frontend
 * Based on web/src/api.ts but adapted for React
 * 
 * Features:
 * - World management (CRUD operations, export)
 * - Agent operations (CRUD, memory management)
 * - Chat history management (create, load, restore state)
 * - Message management (send, delete)
 * - Error handling with structured responses
 * - TypeScript support
 *
 * Implementation:
 * - Shared fetch wrapper (`apiRequest`) with structured backend error parsing
 * - World creation payload defaults aligned with web frontend behavior
 * - Chat message endpoint payload kept minimal; SSE headers are set by sse-client
 * 
 * Changes:
 * - 2026-02-08: Removed legacy manual tool-intervention decision API helper
 * - 2026-02-07: Aligned world creation and chat message request payload handling with web/src/api.ts
 * - 2025-11-12: Created for React frontend refactoring from WebSocket to REST API
 */

import type {
  World,
  Agent,
} from '../types';

interface ErrorResponse {
  error: string;
  code?: string;
  details?: any[];
}

interface ApiRequestOptions extends RequestInit {
  headers?: Record<string, string>;
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
      let errorDetails = null;

      // Try to parse structured error response
      try {
        const errorData: ErrorResponse = await response.json();
        if (errorData.error) {
          errorMessage = errorData.error;
          if (errorData.code) {
            errorMessage += ` (${errorData.code})`;
          }
          if (errorData.details) {
            errorDetails = errorData.details;
          }
        }
      } catch (parseError) {
        // Fall back to status text if JSON parsing fails
      }

      const error = new Error(errorMessage) as any;
      if (errorDetails) {
        error.details = errorDetails;
      }
      throw error;
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
export async function getWorlds(): Promise<World[]> {
  const response = await apiRequest('/worlds');
  return response.json();
}

/**
 * Get a specific world with its agents
 */
export async function getWorld(worldName: string): Promise<World & { agents: Agent[] }> {
  if (!worldName) {
    throw new Error('World name is required');
  }

  const response = await apiRequest(`/worlds/${encodeURIComponent(worldName)}`);
  return response.json();
}

/**
 * Create a new world
 */
export async function createWorld(worldData: Partial<World>): Promise<World> {
  if (!worldData || !worldData.name) {
    throw new Error('World data with name is required');
  }

  // Match web frontend payload defaults to keep API behavior consistent.
  const completeWorld: World = {
    id: worldData.id ?? '',
    name: worldData.name,
    description: worldData.description || '',
    turnLimit: worldData.turnLimit ?? 5,
    chatLLMProvider: worldData.chatLLMProvider,
    chatLLMModel: worldData.chatLLMModel,
    mcpConfig: worldData.mcpConfig,
    agents: worldData.agents ?? [],
    currentChatId: worldData.currentChatId ?? '',
    chats: worldData.chats ?? [],
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
export async function updateWorld(worldName: string, updateData: Partial<World>): Promise<World> {
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
export async function deleteWorld(worldName: string): Promise<void> {
  if (!worldName) {
    throw new Error('World name is required');
  }

  await apiRequest(`/worlds/${encodeURIComponent(worldName)}`, {
    method: 'DELETE',
  });
}

/**
 * Create a new agent in a world
 */
export async function createAgent(worldName: string, agentData: Partial<Agent>): Promise<Agent> {
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
export async function updateAgent(worldName: string, agentName: string, updateData: Partial<Agent>): Promise<Agent> {
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
export async function deleteAgent(worldName: string, agentName: string): Promise<void> {
  if (!worldName || !agentName) {
    throw new Error('World name and agent name are required');
  }

  await apiRequest(`/worlds/${encodeURIComponent(worldName)}/agents/${encodeURIComponent(agentName)}`, {
    method: 'DELETE',
  });
}

/**
 * Clear agent memory using the DELETE memory endpoint
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
 * Set current chat for world
 */
export async function setChat(worldName: string, chatId: string): Promise<{
  world: any;
  chatId: string;
  success: boolean;
}> {
  const response = await apiRequest(`/worlds/${encodeURIComponent(worldName)}/setChat/${encodeURIComponent(chatId)}`, {
    method: 'POST'
  });
  return await response.json();
}

/**
 * Delete a chat
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
 * Create a new chat and set it as current
 */
export async function newChat(worldName: string): Promise<{
  world: any;
  chatId: string;
  success: boolean;
}> {
  if (!worldName) {
    throw new Error('World name is required');
  }

  const response = await apiRequest(`/worlds/${encodeURIComponent(worldName)}/chats`, {
    method: 'POST'
  });
  return await response.json();
}

/**
 * Delete a message
 */
export async function deleteMessage(
  worldName: string,
  messageId: string,
  chatId: string
): Promise<any> {
  if (!worldName || !messageId || !chatId) {
    throw new Error('World name, message ID, and chat ID are required');
  }

  const response = await apiRequest(
    `/worlds/${encodeURIComponent(worldName)}/messages/${encodeURIComponent(messageId)}`,
    {
      method: 'DELETE',
      body: JSON.stringify({ chatId }),
    }
  );
  return response.json();
}

/**
 * Send a message (returns Response for SSE streaming)
 */
export async function sendMessage(
  worldName: string,
  message: string,
  sender: string = 'human'
): Promise<Response> {
  if (!worldName || !message?.trim()) {
    throw new Error('World name and non-empty message are required');
  }

  return apiRequest(
    `/worlds/${encodeURIComponent(worldName)}/messages`,
    {
      method: 'POST',
      body: JSON.stringify({ message, sender }),
    }
  );
}

/**
 * Export world to markdown and download it
 */
export async function exportWorldToMarkdown(worldName: string): Promise<void> {
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
 * Export world to markdown and return content for viewing
 */
export async function getWorldMarkdown(worldName: string): Promise<string> {
  if (!worldName) {
    throw new Error('World name is required');
  }

  const response = await apiRequest(`/worlds/${encodeURIComponent(worldName)}/export`);
  return response.text();
}

// Export default API object
export default {
  apiRequest,
  getWorlds,
  getWorld,
  createWorld,
  updateWorld,
  deleteWorld,
  createAgent,
  updateAgent,
  deleteAgent,
  clearAgentMemory,
  setChat,
  deleteChat,
  newChat,
  deleteMessage,
  sendMessage,
  exportWorldToMarkdown,
  getWorldMarkdown,
};
