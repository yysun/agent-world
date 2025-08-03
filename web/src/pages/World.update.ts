/**
 * World Update Handlers - Simplified Core-Centric Approach
 *
 * Features:
 * - Simplified world initialization using core auto-restore functionality
 * - Core-managed chat session restoration via getWorld() 
 * - Auto-save handled automatically by core publishMessage
 * - Minimal frontend logic - just displays core state
 * - URL routing support for /world/:worldName/:chatId patterns
 * - Chat loading with full world state restoration via core
 * - Chat deletion with proper cleanup and modal management
 * - User message sending with core auto-save integration
 * - SSE event handlers for real-time chat streaming
 * - Agent message count updates and memory consolidation
 * - Error handling for message send/receive operations
 * - Agent/world message clearing functionality
 * - Settings selection handlers for UI state
 *
 * Simplified Architecture:
 * - Core handles: Auto-restoration, auto-save, memory management
 * - Frontend handles: Display, user input, SSE streaming
 * - Removed: Session storage, complex frontend logic, redundant APIs
 * - Uses: getWorld() for auto-restore, getWorldFresh() for new chats
 *
 * Handlers:
 * - world-initialize: Uses core getWorld() with auto-restore
 * - create-new-chat: Uses core getWorldFresh() for fresh start
 * - load-chat-from-history: Uses core chat restoration  
 * - delete-chat-from-history: Removes chat with proper cleanup and modal close
 * - send-message: Simple core publishMessage with auto-save
 * - SSE handlers: Real-time streaming from core events
 *
 * Implementation:
 * - Simplified from complex session management on 2025-07-31
 * - Removed session storage utilities and complex frontend logic
 * - Enhanced core functions handle all business logic
 * - Frontend focuses on user interface and event handling
 * - Fixed modal close issue on 2025-08-02: Removed duplicate handlers in World.tsx
 */

import { app } from 'apprun';
import api from '../api';
import {
  sendChatMessage,
  handleStreamStart,
  handleStreamChunk,
  handleStreamEnd,
  handleStreamError,
} from '../utils/sse-client';
import type { WorldComponentState, Agent } from '../types';
import toKebabCase from '../utils/toKebabCase';
import { renderMarkdown } from '../utils/markdown';

async function* initWorld(state: WorldComponentState, name: string, chatId: string): AsyncGenerator<WorldComponentState> {
  if (!name) {
    location.href = '/';
    return;
  }
  const worldName = decodeURIComponent(name);

  try {
    yield {
      ...state,
      worldName,
      loading: true,
      error: null,
      isWaiting: false,
      activeAgent: null
    };

    // SIMPLIFIED: Use core getWorld() which automatically restores last chat
    const world = await api.getWorld(worldName);
    if (!world) {
      yield {
        ...state,
        worldName,
        loading: false,
        error: 'World not found',
        isWaiting: false,
        selectedSettingsTarget: 'world',
        selectedAgent: null,
        activeAgent: null
      };
      return;
    }

    // Initialize messages
    let messages: any[] = [];

    // Check if specific chatId is provided
    if (chatId) {
      try {
        // Load specific chat with full state restoration
        const chatData = await api.getChat(worldName, chatId);
        if (chatData) {
          if (chatData.messages) {
            messages = chatData.messages;
          }
        }
      } catch (error) {
        console.warn('Failed to load specific chat:', error);
      }
    }
    // NOTE: No auto-restoration needed - core getWorld() already restored last chat automatically

    // Convert agent memories to messages as fallback if no chat messages
    let allMessages: any[] = [];
    const worldAgents: Agent[] = await Promise.all(world.agents.map(async (agent, index) => {
      if (agent.memory && Array.isArray(agent.memory)) {
        const agentMessages = agent.memory.map((memoryItem: any) => {
          const sender = toKebabCase(memoryItem.sender || agent.name);
          let messageType = 'agent';
          if (sender === 'HUMAN' || sender === 'USER') {
            messageType = 'user';
          }
          return {
            id: memoryItem.id || `${memoryItem.createdAt || Date.now()}-${Math.random()}`,
            sender,
            text: memoryItem.text || memoryItem.content || '',
            createdAt: memoryItem.createdAt || new Date().toISOString(),
            type: messageType,
            fromAgentId: agent.id
          };
        });
        allMessages = allMessages.concat(agentMessages);
      }
      return {
        ...agent,
        spriteIndex: index % 9,
        messageCount: agent.memory?.length || 0,
      } as Agent;
    }));

    // Sort all messages by createdAt
    const sortedMessages = allMessages.sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();
      return timeA - timeB;
    });

    // Use chat messages if available, otherwise fall back to agent memory
    const finalMessages = messages.length > 0 ? messages : sortedMessages;

    yield {
      ...state,
      worldName,
      world,
      messages: finalMessages,
      loading: false,
      error: null,
      isWaiting: false,
      selectedSettingsTarget: 'chat',
      selectedAgent: null,
      activeAgent: null,
      chatToDelete: null
    };

  } catch (error: any) {
    yield {
      ...state,
      worldName,
      world: null,
      loading: false,
      error: error.message || 'Failed to load world data',
      isWaiting: false,
      selectedSettingsTarget: 'world',
      selectedAgent: null,
      activeAgent: null
    };
  }
}


// handle system events
const handleSystemEvent = async (state: WorldComponentState, data: any): Promise<WorldComponentState> => {

  console.log('Received system event:', data);

  if (data?.action === 'chat-created' || data?.action === 'chat-updated') {
    const world = await api.getWorld(state.worldName);
    if (!world) {
      // Handle case where world is not found
      return {
        ...state,
        error: 'World not found'
      };
    } else {
      return {
        ...state,
        world
      };
    }
  }
  return state;
};

// Handle regular messages
const handleMessageEvent = <T extends WorldComponentState>(state: T, data: any): T => {

  console.log('Received message event:', data);

  const messageData = data|| {};
  const senderName = messageData.sender || messageData.agentName || 'Agent';

  // Find agent ID by sender name if state has agents
  let fromAgentId: string | undefined;
  if (state.world && Array.isArray(state.world.agents)) {
    const agent = state.world.agents.find((a: any) => a.name === senderName);
    agent && agent.messageCount++;
    fromAgentId = agent?.id;
  }

  const newMessage = {
    id: Date.now() + Math.random(),
    type: messageData.type || 'message',
    sender: senderName,
    text: messageData.content || messageData.message || '',
    createdAt: messageData.createdAt || new Date().toISOString(),
    worldName: messageData.worldName || state.worldName,
    fromAgentId: fromAgentId
  };

  return {
    ...state,
    messages: [...(state.messages || []), newMessage],
    needScroll: true,
    isWaiting: false
  };

};

// Handle errors
const handleError = <T extends WorldComponentState>(state: T, error: any): T => {
  const errorMessage = error.message || 'SSE error';

  // Add error message to conversation
  const errorMsg = {
    id: Date.now() + Math.random(),
    type: 'error',
    sender: 'System',
    text: errorMessage,
    createdAt: new Date().toISOString(),
    worldName: state.worldName,
    hasError: true
  };

  return {
    ...state,
    wsError: errorMessage,
    messages: [...(state.messages || []), errorMsg],
    needScroll: true
  };
};


export const worldUpdateHandlers = {

  '/World': initWorld,

  'update-input': (state: WorldComponentState, e: any): WorldComponentState => ({
    ...state,
    userInput: e.target.value
  }),

  'key-press': (state: WorldComponentState, e: any) => {
    if (e.key === 'Enter' && (state.userInput || '').trim()) {
      app.run('send-message');
    }
  },

  'send-message': async (state: WorldComponentState): Promise<WorldComponentState> => {
    if (!(state.userInput || '').trim()) return state;

    const messageText = state.userInput || '';

    const userMessage = {
      id: Date.now() + Math.random(),
      type: 'user',
      sender: 'HUMAN',
      text: messageText,
      createdAt: new Date().toISOString(),
      worldName: state.worldName,
      userEntered: true
    };

    const newState = {
      ...state,
      messages: [...(state.messages || []), userMessage],
      userInput: '',
      isSending: true,
      isWaiting: true
    };

    try {
      await sendChatMessage(state.worldName, messageText, 'HUMAN');

      return {
        ...newState,
        isSending: false
      };
    } catch (error: any) {
      return {
        ...newState,
        isSending: false,
        isWaiting: false,
        error: error.message || 'Failed to send message'
      };
    }
  },

    // SSE Event Handlers
  handleStreamStart,
  handleStreamChunk,
  handleStreamEnd,
  handleStreamError,
  handleMessageEvent,
  handleSystemEvent,
  handleError,

  // Agent Message Clearing Handlers
  'clear-agent-messages': async (state: WorldComponentState, agent: Agent): Promise<WorldComponentState> => {
    try {
      await api.clearAgentMemory(state.worldName, agent.name);

      const updatedAgents = state.world?.agents.map(a =>
        a.id === agent.id ? { ...a, messageCount: 0 } : a
      );

      const filteredMessages = (state.messages || []).filter(msg => msg.sender !== agent.name);

      const updatedSelectedAgent = state.selectedAgent?.id === agent.id
        ? { ...state.selectedAgent, messageCount: 0 }
        : state.selectedAgent;

      const updatedWorld = state.world ? {
        ...state.world,
        agents: updatedAgents ?? []
      } : null;

      return {
        ...state,
        world: updatedWorld,
        messages: filteredMessages,
        selectedAgent: updatedSelectedAgent
      };
    } catch (error: any) {
      return {
        ...state,
        error: error.message || 'Failed to clear agent messages'
      };
    }
  },

  'clear-world-messages': async (state: WorldComponentState): Promise<WorldComponentState> => {
    try {
      await Promise.all(
        (state.world?.agents ?? []).map(agent => api.clearAgentMemory(state.worldName, agent.name))
      );

      const updatedAgents = (state.world?.agents ?? []).map(agent => ({ ...agent, messageCount: 0 }));

      const updatedSelectedAgent = state.selectedAgent
        ? { ...state.selectedAgent, messageCount: 0 }
        : null;

      const updatedWorld = state.world ? {
        ...state.world,
        agents: updatedAgents ?? []
      } : null;

      return {
        ...state,
        world: updatedWorld,
        messages: [],
        selectedAgent: updatedSelectedAgent
      };
    } catch (error: any) {
      return {
        ...state,
        error: error.message || 'Failed to clear world messages'
      };
    }
  },

  // Settings selection handlers
  'select-world-settings': (state: WorldComponentState): WorldComponentState => ({
    ...state,
    selectedSettingsTarget: 'world',
    selectedAgent: null,
    messages: (state.messages || []).filter(message => !message.userEntered)
  }),

  'select-agent-settings': (state: WorldComponentState, agent: Agent): WorldComponentState => {
    if (state.selectedSettingsTarget === 'agent' && state.selectedAgent?.id === agent.id) {
      return {
        ...state,
        selectedSettingsTarget: 'world',
        selectedAgent: null,
        messages: (state.messages || []).filter(message => !message.userEntered),
        userInput: ''
      };
    }

    return {
      ...state,
      selectedSettingsTarget: 'agent',
      selectedAgent: agent,
      messages: (state.messages || []).filter(message => !message.userEntered),
      userInput: '@' + toKebabCase(agent.name || '') + ' '
    };
  },

  // Chat history settings handler
  'select-chat-history': async (state: WorldComponentState): Promise<WorldComponentState> => {
    const newState = {
      ...state,
      selectedSettingsTarget: 'chat' as const,
      selectedAgent: null,
      messages: (state.messages || []).filter(message => !message.userEntered),
      loading: true,
      error: null
    };

    try {
      // Chat data is already available in world.chats
      return {
        ...newState,
        loading: false
      };
    } catch (error: any) {
      return {
        ...newState,
        loading: false,
        error: error.message || 'Failed to load chat history'
      };
    }
  },

  // Toggle between settings and chat history sidebar
  'toggle-settings-chat-history': (state: WorldComponentState): WorldComponentState => {
    if (state.selectedSettingsTarget !== 'world') {
      // Switch to world settings
      return {
        ...state,
        selectedSettingsTarget: 'world'
      };
    } else {
      // Switch to chat history - trigger async handler
      app.run('select-chat-history');
      return state; // Return current state, async handler will update it
    }
  },

  'chat-history-show-delete-confirm': (state: WorldComponentState, chat: any): WorldComponentState => ({
    ...state,
    chatToDelete: chat
  }),

  'chat-history-delete-confirm': async (state: WorldComponentState): Promise<WorldComponentState> => {
    // This handler is no longer needed since we delete directly
    return state;
  },

  'chat-history-hide-modals': (state: WorldComponentState): WorldComponentState => ({
    ...state,
    chatToDelete: null
  }),

  // Agent deletion handler
  'delete-agent': async (state: WorldComponentState, agent: Agent): Promise<WorldComponentState> => {
    try {
      await api.deleteAgent(state.worldName, agent.name);

      // Remove agent from agents array
      const updatedAgents = (state.world?.agents ?? []).filter(a => a.id !== agent.id);

      // Remove agent messages from the message list
      const filteredMessages = (state.messages || []).filter(msg => msg.sender !== agent.name);

      // Update world to remove the agent
      const updatedWorld = state.world ? {
        ...state.world,
        agents: updatedAgents ?? []
      } : null;

      // Clear selected agent if it was the deleted one
      const updatedSelectedAgent = state.selectedAgent?.id === agent.id ? null : state.selectedAgent;
      const updatedSelectedSettingsTarget = state.selectedAgent?.id === agent.id ? 'world' : state.selectedSettingsTarget;

      return {
        ...state,
        world: updatedWorld,
        messages: filteredMessages,
        selectedAgent: updatedSelectedAgent,
        selectedSettingsTarget: updatedSelectedSettingsTarget
      };
    } catch (error: any) {
      return {
        ...state,
        error: error.message || 'Failed to delete agent'
      };
    }
  },

  // Export world to markdown file
  'export-world-markdown': async (state: WorldComponentState, worldName: string): Promise<WorldComponentState> => {
    try {
      // Trigger file download by navigating to the export endpoint
      window.location.href = `/api/worlds/${encodeURIComponent(worldName)}/export`;
      return state; // No state change needed for download
    } catch (error: any) {
      return {
        ...state,
        error: error.message || 'Failed to export world'
      };
    }
  },

  // View world markdown in new tab
  'view-world-markdown': async (state: WorldComponentState, worldName: string): Promise<WorldComponentState> => {
    try {
      const markdown = await api.getWorldMarkdown(worldName);
      const htmlContent = renderMarkdown(markdown);
      // Create HTML document
      const fullHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>World Export: ${worldName}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            line-height: 1.6;
            color: #333;
        }
        h1, h2, h3 { color: #2c3e50; }
        h1 { border-bottom: 2px solid #3498db; padding-bottom: 10px; }
        h2 { border-bottom: 1px solid #bdc3c7; padding-bottom: 5px; }
        code { 
            background: #f8f9fa; 
            padding: 2px 4px; 
            border-radius: 3px; 
            font-family: 'Monaco', 'Consolas', monospace;
        }
        pre {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 5px;
            overflow-x: auto;
        }
        pre code {
            background: none;
            padding: 0;
        }
        ul { padding-left: 20px; }
        li { margin-bottom: 5px; }
        hr { 
            border: none; 
            height: 1px; 
            background: #bdc3c7; 
            margin: 30px 0; 
        }
        strong { color: #2c3e50; }
    </style>
</head>
<body>
    ${htmlContent}
</body>
</html>`;

      // Open in new tab
      const newWindow = window.open();
      if (newWindow) {
        newWindow.document.write(fullHtml);
        newWindow.document.close();
      }

      return state; // No state change needed
    } catch (error: any) {
      return {
        ...state,
        error: error.message || 'Failed to view world markdown'
      };
    }
  },

  // Create new chat - clears all state and starts fresh
  'create-new-chat': async function* (state: WorldComponentState): AsyncGenerator<WorldComponentState> {
    try {
      yield { ...state, loading: true };

      // Call new API endpoint that creates chat and updates world
      const result = await api.createNewChat(state.worldName);

      if (result.success) {
        // Immediately refresh world data to get updated chat list
        const refreshedWorld = await api.getWorld(state.worldName);

        yield {
          ...state,
          loading: false,
          world: refreshedWorld,        // Updated world with currentChatId and refreshed chat list
          messages: [],                 // Fresh message state
          selectedAgent: null,
          activeAgent: null,
          userInput: '',
          chatToDelete: null
        };
      } else {
        yield {
          ...state,
          loading: false,
          error: 'Failed to create new chat'
        };
      }

    } catch (error: any) {
      yield {
        ...state,
        loading: false,
        error: error.message || 'Failed to create new chat'
      };
    }
  },  // Load specific chat from history with complete state restoration

  'load-chat-from-history': async function* (state: WorldComponentState, chatId: string): AsyncGenerator<WorldComponentState> {
    try {
      yield { ...state, loading: true };

      // Use new API endpoint that loads chat and updates world
      const result = await api.loadChatById(state.worldName, chatId);

      if (result.success) {
        // Get chat details for UI display
        const chatData = await api.getChat(state.worldName, chatId);

        yield {
          ...state,
          loading: false,
          world: result.world,          // Updated world with new currentChatId
          messages: chatData.messages || [],
          selectedAgent: null,
          activeAgent: null,
          userInput: '',
          error: null,
          chatToDelete: null
        };
      } else {
        yield {
          ...state,
          loading: false,
          error: 'Failed to load chat'
        };
      }

    } catch (error: any) {
      yield {
        ...state,
        loading: false,
        error: error.message || 'Failed to load chat from history'
      };
    }
  },

  // Delete chat from history
  'delete-chat-from-history': async function* (state: WorldComponentState, chatId: string): AsyncGenerator<WorldComponentState> {
    try {
      yield {
        ...state,
        loading: true,
        chatToDelete: null
      };

      // Delete chat via API
      await api.deleteChat(state.worldName, chatId);

      // Refresh chat history
      const world = await api.getWorld(state.worldName);

      // If we deleted the current chat, the backend should clear currentChatId
      const shouldClearMessages = world.currentChatId === null || world.currentChatId === chatId;

      yield {
        ...state,
        world, // Updated world with potentially cleared currentChatId
        loading: false,
        chatToDelete: null,
        messages: shouldClearMessages ? [] : state.messages
      };

    } catch (error: any) {
      yield {
        ...state,
        loading: false,
        chatToDelete: null,
        error: error.message || 'Failed to delete chat'
      };
    }
  },

  // Reload world chats (triggered by SSE events)
  'reloadWorldChats': async function* (state: WorldComponentState, data: { worldName?: string }): AsyncGenerator<WorldComponentState> {
    try {
      // Only reload if this event is for the current world
      if (data.worldName && data.worldName !== state.worldName) {
        return state;
      }

      // Refresh world data to get updated chat list
      const refreshedWorld = await api.getWorld(state.worldName);

      if (refreshedWorld) {
        yield {
          ...state,
          world: refreshedWorld
        };
      }
    } catch (error: any) {
      // Silently handle errors - don't disrupt user experience for background updates
      console.warn('Failed to reload world chats:', error.message);
    }
  }
};
