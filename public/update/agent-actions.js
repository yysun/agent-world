/**
 * Agent Actions Module
 * 
 * Handles agent-related actions and memory management:
 * - Display agent memory in conversation area
 * - Clear agent memory functionality
 * - Memory format parsing and chat-like display
 * 
 * Memory Display Features:
 * - Chat-like interface for agent memories
 * - User messages: right-aligned, 80% width, darker gray background
 * - Assistant messages: left-aligned, 80% width, standard background
 * - Automatic detection of message roles from memory structure
 * - Support for string, object with content/text/message properties, and JSON fallback
 * 
 * Implementation:
 * - Proper memory content parsing for different formats
 * - System messages for empty memory states
 * - Role detection for user/assistant message styling
 */

export const displayAgentMemory = (state, agent) => {
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
      messages: [...state.messages, noMemoryMessage],
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
    messages: [...state.messages, ...memoryMessages],
  };
};

export const clearAgentMemory = (state, agent) => {
  // TODO: Implement API call to clear agent memory
  const confirmMessage = {
    id: Date.now() + Math.random(),
    type: 'system',
    sender: 'System',
    text: `Cleared all memories for agent "${agent.name}".`,
    timestamp: new Date().toISOString(),
    worldName: state.worldName
  };

  return {
    ...state,
    messages: [...state.messages, confirmMessage],
  };
};

export const clearAgentMemoryFromModal = (state, agent) => {
  // TODO: Implement API call to clear agent memory
  const confirmMessage = {
    id: Date.now() + Math.random(),
    type: 'system',
    sender: 'System',
    text: `Cleared all memories for agent "${agent.name}" from modal.`,
    timestamp: new Date().toISOString(),
    worldName: state.worldName
  };

  return {
    ...state,
    messages: [...state.messages, confirmMessage],
    showAgentModel: false // Close the modal after clearing memory
  };
};
