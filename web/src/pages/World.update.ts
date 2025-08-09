/**
 * World Update Handlers - Core-Centric AppRun Event System
 * 
 * Architecture:
 * - Core handles: Auto-restoration, auto-save, memory management
 * - Frontend handles: Display, user input, SSE streaming, UI state
 * 
 * Features:
 * - World initialization with core auto-restore via getWorld()
 * - Chat management (create, load, delete) with proper state restoration
 * - Real-time messaging via SSE with auto-save integration
 * - Agent/world memory management and UI controls
 * - Settings and chat history navigation with modal management
 * - Markdown export functionality with HTML rendering
 * 
 * Updated: 2025-08-09 - Removed selectedSettingsTarget localStorage persistence
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
import type { WorldComponentState, Agent, AgentMessage, Message } from '../types';
import toKebabCase from '../utils/toKebabCase';
import { renderMarkdown } from '../utils/markdown';

// Utility functions for message processing
const createMessageFromMemory = (memoryItem: AgentMessage, agentName: string): Message => {
  const sender = toKebabCase(memoryItem.sender || agentName);
  const messageType = (sender === 'HUMAN' || sender === 'USER') ? 'user' : 'agent';

  return {
    id: `msg-${Date.now() + Math.random()}`,
    sender,
    text: memoryItem.content || '',
    createdAt: memoryItem.createdAt,
    type: messageType,
    fromAgentId: agentName
  };
};

// World initialization with core auto-restore
async function* initWorld(state: WorldComponentState, name: string, chatId?: string): AsyncGenerator<WorldComponentState> {
  if (!name) {
    location.href = '/';
    return;
  }
  try {
    const worldName = decodeURIComponent(name);

    // Default selectedSettingsTarget to 'world' on init (no persistence)
    state.selectedSettingsTarget = 'world';
    state.worldName = worldName;
    state.loading = true;

    const world = await api.getWorld(worldName);
    if (!world) {
      throw new Error('World not found: ' + worldName);
    }

    if (!chatId || !(chatId in world.chats)) {
      chatId = world.currentChatId;
    }

    if (world.currentChatId !== chatId) {
      await api.setChat(worldName, chatId);
    }

    let messages: any[] = [];

    for (const agent of world.agents.values()) {
      agent.messageCount = 0; // Reset message count for UI
      for (const memoryItem of agent.memory || []) {
        if (memoryItem.chatId === chatId) {
          agent.messageCount++;
          const message = createMessageFromMemory(memoryItem, agent.name);
          messages.push(message);
        }
      }
    }

    yield {
      ...state,
      world,
      currentChat: world.chats.find(c => c.id === chatId) || null,
      messages,
      loading: false,
    };

  } catch (error: any) {
    yield {
      ...state,
      error: error.message || 'Failed to load world data',
      loading: false,
    };
  }
}


// Event handlers for SSE and system events
const handleSystemEvent = async (state: WorldComponentState, data: any): Promise<WorldComponentState> => {
  console.log('Received system event:', data);
  // console.log('Received message event:', data);
  if (data.content === 'chat-title-updated') {
    const updates = initWorld(state, state.worldName, data.chatId);
    for await (const update of updates) {
      state = { ...state, ...update };
    }
    return state;
  }
};

const handleMessageEvent = async <T extends WorldComponentState>(state: T, data: any): Promise<T> => {

  const messageData = data || {};
  const senderName = messageData.sender;

  // Find and update agent message count
  let fromAgentId: string | undefined;
  if (state.world?.agents) {
    const agent = state.world.agents.find((a: any) => a.name === senderName);
    if (agent) {
      if (!agent.messageCount) {
        agent.messageCount = 0;
      }
      agent.messageCount++;
      fromAgentId = agent.id;
    }
  }

  const newMessage = {
    id: Date.now() + Math.random(),
    type: messageData.type || 'message',
    sender: senderName,
    text: messageData.content || messageData.message || '',
    createdAt: messageData.createdAt || new Date().toISOString(),
    worldName: messageData.worldName || state.worldName,
    fromAgentId
  };

  return {
    ...state,
    messages: [...(state.messages || []), newMessage],
    needScroll: true,
    isWaiting: false
  };
};

const handleError = <T extends WorldComponentState>(state: T, error: any): T => {
  const errorMessage = error.message || 'SSE error';

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
    error: errorMessage,
    messages: [...(state.messages || []), errorMsg],
    needScroll: true
  };
};


export const worldUpdateHandlers = {

  initWorld,

  '/World': initWorld,

  // Basic input and messaging handlers
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
    const messageText = state.userInput?.trim();
    if (!messageText) return state;

    const userMessage = {
      id: `msg-${Date.now() + Math.random()}`,
      type: 'user',
      sender: 'HUMAN',
      text: messageText,
      createdAt: new Date(),
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
      return { ...newState, isSending: false };
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

  // Memory management handlers
  'clear-agent-messages': async (state: WorldComponentState, agent: Agent): Promise<WorldComponentState> => {
    try {
      await api.clearAgentMemory(state.worldName, agent.name);

      const updatedAgents = state.world?.agents.map(a =>
        a.id === agent.id ? { ...a, messageCount: 0 } : a
      ) ?? [];

      const updatedSelectedAgent = state.selectedAgent?.id === agent.id
        ? { ...state.selectedAgent, messageCount: 0 }
        : state.selectedAgent;

      return {
        ...state,
        world: state.world ? { ...state.world, agents: updatedAgents } : null,
        messages: (state.messages || []).filter(msg => msg.sender !== agent.name),
        selectedAgent: updatedSelectedAgent
      };
    } catch (error: any) {
      return { ...state, error: error.message || 'Failed to clear agent messages' };
    }
  },

  'clear-world-messages': async (state: WorldComponentState): Promise<WorldComponentState> => {
    try {
      await Promise.all(
        (state.world?.agents ?? []).map(agent => api.clearAgentMemory(state.worldName, agent.name))
      );

      const updatedAgents = (state.world?.agents ?? []).map(agent => ({ ...agent, messageCount: 0 }));
      const updatedSelectedAgent = state.selectedAgent ? { ...state.selectedAgent, messageCount: 0 } : null;

      return {
        ...state,
        world: state.world ? { ...state.world, agents: updatedAgents } : null,
        messages: [],
        selectedAgent: updatedSelectedAgent
      };
    } catch (error: any) {
      return { ...state, error: error.message || 'Failed to clear world messages' };
    }
  },

  // Settings and navigation handlers
  'select-world-settings': (state: WorldComponentState): WorldComponentState => {
    return {
      ...state,
      selectedSettingsTarget: 'world',
      selectedAgent: null,
      messages: (state.messages || []).filter(message => !message.userEntered)
    };
  },

  'select-agent-settings': (state: WorldComponentState, agent: Agent): WorldComponentState => {
    const isCurrentlySelected = state.selectedSettingsTarget === 'agent' && state.selectedAgent?.id === agent.id;

    if (isCurrentlySelected) {
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


  'toggle-settings-chat-history': (state: WorldComponentState): WorldComponentState => {
    if (state.selectedSettingsTarget !== 'world') {
      return { ...state, selectedSettingsTarget: 'world' };
    } else {
      return { ...state, selectedSettingsTarget: 'chat' };
    }
  },

  // Modal and deletion handlers
  'chat-history-show-delete-confirm': (state: WorldComponentState, chat: any): WorldComponentState => ({
    ...state,
    chatToDelete: chat
  }),

  'chat-history-hide-modals': (state: WorldComponentState): WorldComponentState => ({
    ...state,
    chatToDelete: null
  }),

  'delete-agent': async (state: WorldComponentState, agent: Agent): Promise<WorldComponentState> => {
    try {
      await api.deleteAgent(state.worldName, agent.name);

      const updatedAgents = (state.world?.agents ?? []).filter(a => a.id !== agent.id);
      const isSelectedAgent = state.selectedAgent?.id === agent.id;

      return {
        ...state,
        world: state.world ? { ...state.world, agents: updatedAgents } : null,
        messages: (state.messages || []).filter(msg => msg.sender !== agent.name),
        selectedAgent: isSelectedAgent ? null : state.selectedAgent,
        selectedSettingsTarget: isSelectedAgent ? 'world' : state.selectedSettingsTarget
      };
    } catch (error: any) {
      return { ...state, error: error.message || 'Failed to delete agent' };
    }
  },

  // Export and view handlers
  'export-world-markdown': async (state: WorldComponentState, worldName: string): Promise<WorldComponentState> => {
    try {
      window.location.href = `/api/worlds/${encodeURIComponent(worldName)}/export`;
      return state;
    } catch (error: any) {
      return { ...state, error: error.message || 'Failed to export world' };
    }
  },

  'view-world-markdown': async (state: WorldComponentState, worldName: string): Promise<WorldComponentState> => {
    try {
      const markdown = await api.getWorldMarkdown(worldName);
      const htmlContent = renderMarkdown(markdown);

      const fullHtml = `<!DOCTYPE html>
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
        pre { background: #f8f9fa; padding: 15px; border-radius: 5px; overflow-x: auto; }
        pre code { background: none; padding: 0; }
        ul { padding-left: 20px; }
        li { margin-bottom: 5px; }
        hr { border: none; height: 1px; background: #bdc3c7; margin: 30px 0; }
        strong { color: #2c3e50; }
    </style>
</head>
<body>${htmlContent}</body>
</html>`;

      const newWindow = window.open();
      if (newWindow) {
        newWindow.document.write(fullHtml);
        newWindow.document.close();
      }
      return state;
    } catch (error: any) {
      return { ...state, error: error.message || 'Failed to view world markdown' };
    }
  },

  // Chat management handlers
  'create-new-chat': async function* (state: WorldComponentState): AsyncGenerator<WorldComponentState> {
    try {
      yield { ...state, loading: true };

      const result = await api.newChat(state.worldName);
      if (!result.success) {
        yield { ...state, loading: false, error: 'Failed to create new chat' };
        return;
      }
      app.run('initWorld', state.worldName);
    } catch (error: any) {
      yield { ...state, loading: false, error: error.message || 'Failed to create new chat' };
    }
  },

  'load-chat-from-history': async function* (state: WorldComponentState, chatId: string): AsyncGenerator<WorldComponentState> {
    try {
      yield { ...state, loading: true };

      const result = await api.setChat(state.worldName, chatId);
      if (!result.success) {
        yield state;
      }
      app.run('initWorld', state.worldName, chatId);
    } catch (error: any) {
      yield { ...state, loading: false, error: error.message || 'Failed to load chat from history' };
    }
  },

  'delete-chat-from-history': async function* (state: WorldComponentState, chatId: string): AsyncGenerator<WorldComponentState> {
    try {
      yield { ...state, loading: true, chatToDelete: null };
      await api.deleteChat(state.worldName, chatId);
      app.run('initWorld', state.worldName);
    } catch (error: any) {
      yield { ...state, loading: false, chatToDelete: null, error: error.message || 'Failed to delete chat' };
    }
  },
};
