//@ts-check
/**
 * Agent Modal Update Module - Complete agent modal and memory management
 *
 * Consolidated module providing:
 * - Agent modal opening and closing operations
 * - Agent creation and editing workflow management
 * - Agent refresh operations after modal updates
 * - Memory count updates after clearing operations
 * - Global event coordination between modal and parent components
 * - Agent memory display in conversation area with chat-like formatting
 * - Memory clearing functionality with actual API calls
 * - Smart memory loading for AgentInfo objects
 * - Real-time memory count updates and state synchronization
 * 
 * Key Features:
 * - Global AppRun event coordination (show-agent-modal, hide-agent-modal)
 * - Agent refresh after CRUD operations
 * - Memory count synchronization
 * - Chat-like interface with role-based message styling
 * - Automatic full agent data fetching when memory array is missing
 * - Backward compatibility with both AgentInfo and full Agent objects
 * - Memory operations with proper API integration and state updates
 * - Error handling and user feedback
 * 
 * TypeScript definitions available in agent-modal-update.d.ts
 */

import * as api from '../api.js';

const { app } = window["apprun"];

// ============================================================================
// Agent Memory Display and Management
// ============================================================================

/**
 * Display agent memory in chat-like conversation format.
 * Handles different memory formats and automatically fetches full agent data if needed.
 */
export const displayAgentMemory = async (state, agent) => {
  // Type guard to check if agent has full memory data
  const hasMemoryArray = agent && 'memory' in agent;

  // If agent doesn't have memory array but has memorySize > 0, fetch full agent data
  if (!hasMemoryArray && agent && 'memorySize' in agent && agent.memorySize > 0) {
    try {
      const worldName = getSelectedWorldName(state);
      if (!worldName) {
        throw new Error('No world selected');
      }
      const fullAgent = await api.getAgent(worldName, agent.name);
      agent = fullAgent;
    } catch (error) {
      console.error('Failed to fetch agent memory:', error);
      const errorMessage = {
        id: Date.now() + Math.random(),
        type: 'error',
        sender: 'System',
        text: `Failed to load memories for agent "${agent?.name || 'Unknown'}": ${error.message}`,
        timestamp: new Date().toISOString(),
        worldName: getSelectedWorldName(state)
      };

      return {
        ...state,
        messages: [errorMessage], // Replace messages instead of appending
      };
    }
  }

  // Check if agent has memory after potential fetch
  if (!agent || !('memory' in agent) || !agent.memory || agent.memory.length === 0) {
    const noMemoryMessage = {
      id: Date.now() + Math.random(),
      type: 'system',
      sender: 'System',
      text: `Agent "${agent?.name || 'Unknown'}" has no memories yet.`,
      timestamp: new Date().toISOString(),
      worldName: getSelectedWorldName(state)
    };

    return {
      ...state,
      messages: [noMemoryMessage], // Replace messages instead of appending
    };
  }

  const memoryMessages = agent.memory.map((memory, index) => {
    // Handle different memory formats
    let memoryText = '';
    let messageType = 'memory';
    let sender = agent.name;

    if (typeof memory === 'string') {
      memoryText = memory;
    } else if (typeof memory === 'object' && memory !== null) {
      // If memory is an object, try to extract meaningful content
      if (memory.content) {
        memoryText = memory.content;
      } else if ('text' in memory && typeof memory.text === 'string') {
        memoryText = memory.text;
      } else if ('message' in memory && typeof memory.message === 'string') {
        memoryText = memory.message;
      } else {
        // Fallback: stringify the object in a readable way
        memoryText = JSON.stringify(memory, null, 2);
      }

      // Determine if this is a user or assistant message based on the memory structure
      if (memory.role === 'user' || ('type' in memory && memory.type === 'user') || ('sender' in memory && memory.sender === 'user')) {
        messageType = 'memory-user';
        sender = (memory.sender && typeof memory.sender === 'string') ? memory.sender : 'User';
      } else if (memory.role === 'assistant' || ('type' in memory && memory.type === 'assistant') || ('sender' in memory && memory.sender === 'assistant')) {
        messageType = 'memory-assistant';
        sender = agent.name;
      }
    } else {
      memoryText = String(memory);
    }

    return {
      id: Date.now() + Math.random() + index,
      type: messageType,
      sender: sender,
      text: memoryText,
      timestamp: new Date().toISOString(),
      worldName: getSelectedWorldName(state)
    };
  });

  return {
    ...state,
    messages: memoryMessages, // Replace messages instead of appending
  };
};

/**
 * Clear agent memory with API call and state update.
 * Refreshes agent list to show updated memory counts.
 */
export const clearAgentMemory = async (state, agent) => {
  try {
    const worldName = getSelectedWorldName(state);
    if (!worldName) {
      throw new Error('No world selected');
    }

    // Call the actual API to clear agent memory
    await api.clearAgentMemory(worldName, agent.name);

    // Refresh agents list to update memory counts
    const updatedAgents = await api.getAgents(worldName);

    const confirmMessage = {
      id: Date.now() + Math.random(),
      type: 'system',
      sender: 'System',
      text: `Successfully cleared all memories for agent "${agent.name}".`,
      timestamp: new Date().toISOString(),
      worldName: worldName
    };

    return {
      ...state,
      agents: updatedAgents, // Update agents with refreshed memory counts
      messages: [...state.messages, confirmMessage],
      needScroll: true
    };
  } catch (error) {
    console.error('Error clearing agent memory:', error);

    const errorMessage = {
      id: Date.now() + Math.random(),
      type: 'error',
      sender: 'System',
      text: `Failed to clear memories for agent "${agent.name}": ${error.message}`,
      timestamp: new Date().toISOString(),
      worldName: getSelectedWorldName(state),
      hasError: true
    };

    return {
      ...state,
      messages: [...state.messages, errorMessage],
      needScroll: true
    };
  }
};

/**
 * Clear agent memory from modal with API call, state update, and modal close.
 * Ensures modal is closed even if the operation fails.
 */
export const clearAgentMemoryFromModal = async (state, agent) => {
  try {
    const worldName = getSelectedWorldName(state);
    if (!worldName) {
      throw new Error('No world selected');
    }

    // Call the actual API to clear agent memory
    await api.clearAgentMemory(worldName, agent.name);

    // Refresh agents list to update memory counts
    const updatedAgents = await api.getAgents(worldName);

    const confirmMessage = {
      id: Date.now() + Math.random(),
      type: 'system',
      sender: 'System',
      text: `Successfully cleared all memories for agent "${agent.name}" from modal.`,
      timestamp: new Date().toISOString(),
      worldName: worldName
    };

    // Close modal using global event
    app.run('hide-agent-modal');

    return {
      ...state,
      agents: updatedAgents, // Update agents with refreshed memory counts
      messages: [...state.messages, confirmMessage],
      needScroll: true
    };
  } catch (error) {
    console.error('Error clearing agent memory from modal:', error);

    const errorMessage = {
      id: Date.now() + Math.random(),
      type: 'error',
      sender: 'System',
      text: `Failed to clear memories for agent "${agent.name}": ${error.message}`,
      timestamp: new Date().toISOString(),
      worldName: getSelectedWorldName(state),
      hasError: true
    };

    // Close modal using global event even on error
    app.run('hide-agent-modal');

    return {
      ...state,
      messages: [...state.messages, errorMessage],
      needScroll: true
    };
  }
};

// ============================================================================
// Modal Control Functions
// ============================================================================

/**
 * Open agent modal with existing agent context
 */
export const openAgentModal = (state, agent) => {
  const worldName = getSelectedWorldName(state);
  app.run('show-agent-modal', { agent, worldName });
  return state;
};

/**
 * Open agent modal for creating new agent
 */
export const openAgentModalCreate = (state, e) => {
  if (e && e.stopPropagation) {
    e.stopPropagation();
  }
  const worldName = getSelectedWorldName(state);
  app.run('show-agent-modal', { agent: null, worldName });
  return state;
};

/**
 * Close agent modal
 */
export const closeAgentModal = (state) => {
  app.run('hide-agent-modal');
  return state;
};

// ============================================================================
// Agent Management Functions
// ============================================================================

/**
 * Handle agent updates from modal - refresh agent list
 */
export const handleAgentUpdated = async (state, { worldName, agent }) => {
  try {
    const updatedAgents = await api.getAgents(worldName);
    return {
      ...state,
      agents: updatedAgents
    };
  } catch (error) {
    console.error('Error refreshing agents:', error);
    return state;
  }
};

/**
 * Handle agent memory cleared from modal - update memory counts
 */
export const handleAgentMemoryCleared = (state, { worldName, agentName }) => {
  // Update the agent's memory count in the current agents list
  const updatedAgents = state.agents.map(agent =>
    agent.name === agentName ? { ...agent, memoryCount: 0 } : agent
  );

  return {
    ...state,
    agents: updatedAgents
  };
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get selected world name from state structure
 */
const getSelectedWorldName = (state) => {
  if (!state.selectedWorldId) return null;
  const world = state.worlds.find(w => w.id === state.selectedWorldId);
  return world ? world.name : null;
};

// Export all functions for AppRun integration
