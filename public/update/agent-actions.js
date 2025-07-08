//@ts-check
/**
 * Agent Actions Module - Agent Memory Display and Management
 *
 * Consolidated module providing:
 * - Agent memory display in conversation area with chat-like formatting
 * - Memory clearing functionality with actual API calls
 * - Smart memory loading for AgentInfo objects (fetches full Agent data when needed)
 * - Real-time memory count updates and state synchronization
 * - Proper error handling and user feedback
 * 
 * Key Features:
 * - Chat-like interface with role-based message styling
 * - Automatic full agent data fetching when memory array is missing
 * - Backward compatibility with both AgentInfo and full Agent objects
 * - Memory operations with proper API integration and state updates
 * 
 * TypeScript definitions available in agent-actions.d.ts
 */

import * as api from '../api.js';

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
      if (!state.worldName) {
        throw new Error('No world selected');
      }
      const fullAgent = await api.getAgent(state.worldName, agent.name);
      agent = fullAgent;
    } catch (error) {
      console.error('Failed to fetch agent memory:', error);
      const errorMessage = {
        id: Date.now() + Math.random(),
        type: 'error',
        sender: 'System',
        text: `Failed to load memories for agent "${agent?.name || 'Unknown'}": ${error.message}`,
        timestamp: new Date().toISOString(),
        worldName: state.worldName
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
      worldName: state.worldName
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
      worldName: state.worldName
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
    if (!state.worldName) {
      throw new Error('No world selected');
    }

    // Call the actual API to clear agent memory
    await api.clearAgentMemory(state.worldName, agent.name);

    // Refresh agents list to update memory counts
    const updatedAgents = await api.getAgents(state.worldName);

    const confirmMessage = {
      id: Date.now() + Math.random(),
      type: 'system',
      sender: 'System',
      text: `Successfully cleared all memories for agent "${agent.name}".`,
      timestamp: new Date().toISOString(),
      worldName: state.worldName
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
      worldName: state.worldName,
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
    if (!state.worldName) {
      throw new Error('No world selected');
    }

    // Call the actual API to clear agent memory
    await api.clearAgentMemory(state.worldName, agent.name);

    // Refresh agents list to update memory counts
    const updatedAgents = await api.getAgents(state.worldName);

    const confirmMessage = {
      id: Date.now() + Math.random(),
      type: 'system',
      sender: 'System',
      text: `Successfully cleared all memories for agent "${agent.name}" from modal.`,
      timestamp: new Date().toISOString(),
      worldName: state.worldName
    };

    // Close modal using global event
    const { app } = window["apprun"];
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
      worldName: state.worldName,
      hasError: true
    };

    // Close modal using global event even on error
    const { app } = window["apprun"];
    app.run('hide-agent-modal');

    return {
      ...state,
      messages: [...state.messages, errorMessage],
      needScroll: true
    };
  }
};

// Export all functions for AppRun integration
