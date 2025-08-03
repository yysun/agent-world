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
 * Updated: 2025-08-03 - Consolidated and removed redundancy
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

// Utility functions for message processing
const createMessageFromMemory = (memoryItem: any, agent: Agent): any => {
  const sender = toKebabCase(memoryItem.sender || agent.name);
  const messageType = (sender === 'HUMAN' || sender === 'USER') ? 'user' : 'agent';

  return {
    id: memoryItem.id || `${memoryItem.createdAt || Date.now()}-${Math.random()}`,
    sender,
    text: memoryItem.text || memoryItem.content || '',
    createdAt: memoryItem.createdAt || new Date().toISOString(),
    type: messageType,
    fromAgentId: agent.id
  };
};

const processAgentMemories = async (agents: any[]): Promise<{ agents: Agent[], messages: any[] }> => {
  let allMessages: any[] = [];

  const processedAgents: Agent[] = await Promise.all(agents.map(async (agent, index) => {
    if (agent.memory && Array.isArray(agent.memory)) {
      const agentMessages = agent.memory.map((memoryItem: any) =>
        createMessageFromMemory(memoryItem, agent)
      );
      allMessages = allMessages.concat(agentMessages);
    }

    return {
      ...agent,
      spriteIndex: index % 9,
      messageCount: agent.memory?.length || 0,
    } as Agent;
  }));

  // Sort messages by creation time
  const sortedMessages = allMessages.sort((a, b) =>
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  return { agents: processedAgents, messages: sortedMessages };
};

// World initialization with core auto-restore
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

    // Core getWorld() automatically restores last chat
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

    let messages: any[] = [];

    // Load specific chat if chatId provided
    if (chatId) {
      try {
        const chatData = await api.getChat(worldName, chatId);
        if (chatData?.messages) {
          messages = chatData.messages;
        }
      } catch (error) {
        console.warn('Failed to load specific chat:', error);
      }
    }

    // Process agent memories as fallback
    const { agents: worldAgents, messages: agentMessages } = await processAgentMemories(world.agents);
    const finalMessages = messages.length > 0 ? messages : agentMessages;

    yield {
      ...state,
      worldName,
      world: { ...world, agents: worldAgents },
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


// Event handlers for SSE and system events
const handleSystemEvent = async (state: WorldComponentState, data: any): Promise<WorldComponentState> => {
  console.log('Received system event:', data);

  if (data?.action === 'chat-created' || data?.action === 'chat-updated') {
    const world = await api.getWorld(state.worldName);
    return world ? { ...state, world } : { ...state, error: 'World not found' };
  }
  return state;
};

const handleMessageEvent = <T extends WorldComponentState>(state: T, data: any): T => {
  const messageData = data || {};
  const senderName = messageData.sender || messageData.agentName || 'Agent';

  // Find and update agent message count
  let fromAgentId: string | undefined;
  if (state.world?.agents) {
    const agent = state.world.agents.find((a: any) => a.name === senderName);
    if (agent) {
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
    wsError: errorMessage,
    messages: [...(state.messages || []), errorMsg],
    needScroll: true
  };
};


export const worldUpdateHandlers = {

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
  'select-world-settings': (state: WorldComponentState): WorldComponentState => ({
    ...state,
    selectedSettingsTarget: 'world',
    selectedAgent: null,
    messages: (state.messages || []).filter(message => !message.userEntered)
  }),

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

  'select-chat-history': async (state: WorldComponentState): Promise<WorldComponentState> => ({
    ...state,
    selectedSettingsTarget: 'chat',
    selectedAgent: null,
    messages: (state.messages || []).filter(message => !message.userEntered)
  }),

  'toggle-settings-chat-history': (state: WorldComponentState): WorldComponentState => {
    if (state.selectedSettingsTarget !== 'world') {
      return { ...state, selectedSettingsTarget: 'world' };
    } else {
      app.run('select-chat-history');
      return state;
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

      const result = await api.createNewChat(state.worldName);
      if (!result.success) {
        yield { ...state, loading: false, error: 'Failed to create new chat' };
        return;
      }

      const refreshedWorld = await api.getWorld(state.worldName);
      yield {
        ...state,
        loading: false,
        world: refreshedWorld,
        messages: [],
        selectedAgent: null,
        activeAgent: null,
        userInput: '',
        chatToDelete: null
      };
    } catch (error: any) {
      yield { ...state, loading: false, error: error.message || 'Failed to create new chat' };
    }
  },

  'load-chat-from-history': async function* (state: WorldComponentState, chatId: string): AsyncGenerator<WorldComponentState> {
    try {
      yield { ...state, loading: true };

      const result = await api.loadChatById(state.worldName, chatId);
      if (!result.success) {
        yield { ...state, loading: false, error: 'Failed to load chat' };
        return;
      }

      const chatData = await api.getChat(state.worldName, chatId);
      yield {
        ...state,
        loading: false,
        world: result.world,
        messages: chatData.messages || [],
        selectedAgent: null,
        activeAgent: null,
        userInput: '',
        error: null,
        chatToDelete: null
      };
    } catch (error: any) {
      yield { ...state, loading: false, error: error.message || 'Failed to load chat from history' };
    }
  },

  'delete-chat-from-history': async function* (state: WorldComponentState, chatId: string): AsyncGenerator<WorldComponentState> {
    try {
      yield { ...state, loading: true, chatToDelete: null };

      await api.deleteChat(state.worldName, chatId);
      const world = await api.getWorld(state.worldName);
      const shouldClearMessages = world.currentChatId === null || world.currentChatId === chatId;

      yield {
        ...state,
        world,
        loading: false,
        chatToDelete: null,
        messages: shouldClearMessages ? [] : state.messages
      };
    } catch (error: any) {
      yield { ...state, loading: false, chatToDelete: null, error: error.message || 'Failed to delete chat' };
    }
  },

  'reloadWorldChats': async function* (state: WorldComponentState, data: { worldName?: string }): AsyncGenerator<WorldComponentState> {
    try {
      if (data.worldName && data.worldName !== state.worldName) return;

      const refreshedWorld = await api.getWorld(state.worldName);
      if (refreshedWorld) {
        yield { ...state, world: refreshedWorld };
      }
    } catch (error: any) {
      console.warn('Failed to reload world chats:', error.message);
    }
  }
};
