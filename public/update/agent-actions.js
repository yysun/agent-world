/**
 * Agent Actions Module - Agent Memory Display Fix
 *
 * Handles agent-related actions and memory management:
 * - Display agent memory in conversation area
 * - Clear agent memory functionality with actual API calls
 * - Memory format parsing and chat-like display
 * - Automatic full agent data fetching when memory is not loaded
 *
 * Core Fix:
 * - Fixed issue where clicking agent card showed "no memories" despite having memories
 * - Added automatic full agent data fetching when memory array is missing but memorySize > 0
 * - Agent cards now properly load and display conversation history
 * - Fixed conversation area not updating when switching between agents (messages now replace instead of append)
 * - Maintains backward compatibility with both AgentInfo (memorySize) and full Agent (memory) objects
 *
 * Memory Display Features:
 * - Chat-like interface for agent memories
 * - User messages: right-aligned, 80% width, darker gray background
 * - Assistant messages: left-aligned, 80% width, standard background
 * - Automatic detection of message roles from memory structure
 * - Support for string, object with content/text/message properties, and JSON fallback
 * - Smart loading: fetches full agent data if memory array is missing but memorySize > 0
 *
 * Implementation:
 * - Proper memory content parsing for different formats
 * - System messages for empty memory states
 * - Role detection for user/assistant message styling
 * - Real API calls for memory clearing functionality
 * - Async agent data loading for complete memory access
 * - Error handling for failed agent data fetches
 */

import * as api from '../api.js';

export const displayAgentMemory = async (state, agent) => {
  // If agent doesn't have memory array but has memorySize > 0, fetch full agent data
  if (!agent?.memory && agent?.memorySize > 0) {
    try {
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

  if (!agent || !agent.memory || agent.memory.length === 0) {
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
      } else if (memory.text) {
        memoryText = memory.text;
      } else if (memory.message) {
        memoryText = memory.message;
      } else {
        // Fallback: stringify the object in a readable way
        memoryText = JSON.stringify(memory, null, 2);
      }

      // Determine if this is a user or assistant message based on the memory structure
      if (memory.role === 'user' || memory.type === 'user' || memory.sender === 'user') {
        messageType = 'memory-user';
        sender = memory.sender;
      } else if (memory.role === 'assistant' || memory.type === 'assistant' || memory.sender === 'assistant') {
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

export const clearAgentMemory = async (state, agent) => {
  try {
    // Call the actual API to clear agent memory
    await api.clearAgentMemory(state.worldName, agent.name);

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

export const clearAgentMemoryFromModal = async (state, agent) => {
  try {
    // Call the actual API to clear agent memory
    await api.clearAgentMemory(state.worldName, agent.name);

    const confirmMessage = {
      id: Date.now() + Math.random(),
      type: 'system',
      sender: 'System',
      text: `Successfully cleared all memories for agent "${agent.name}" from modal.`,
      timestamp: new Date().toISOString(),
      worldName: state.worldName
    };

    return {
      ...state,
      messages: [...state.messages, confirmMessage],
      showAgentModel: false, // Close the modal after clearing memory
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

    return {
      ...state,
      messages: [...state.messages, errorMessage],
      showAgentModel: false, // Close the modal even on error
      needScroll: true
    };
  }
};
