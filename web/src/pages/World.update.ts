/**
 * World Update Handlers
 *
 * Combines world initialization and message handling logic.
 *
 * Features:
 * - Loads world and agent data
 * - Deduplicates and sorts messages
 * - Handles loading and error states
 * - User message sending
 * - SSE event handlers for chat streaming
 * - Agent message count updates
 * - Error handling for message send/receive
 * - Agent/world message clearing
 * - Settings selection handlers
 *
 * Implementation:
 * - Merged from world-update-init.ts and world-update-messages.ts on 2025-07-25
 *
 * Changes:
 * - Initial merge of world-update-init.ts and world-update-messages.ts
 */

import { app } from 'apprun';
import api from '../api';
import {
  sendChatMessage,
  handleStreamStart,
  handleStreamChunk,
  handleStreamEnd,
  handleStreamError,
  handleMessage,
  handleConnectionStatus,
  handleError,
  handleComplete
} from '../utils/sse-client';
import type { WorldComponentState, Agent } from '../types';
import toKebabCase from '../utils/toKebabCase';
import { renderMarkdown } from '../utils/markdown';
export const worldUpdateHandlers = {

  '/World': async function* (state: WorldComponentState, name: string): AsyncGenerator<WorldComponentState> {
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

      // Convert all agent memories to messages (no deduplication)
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

      yield {
        ...state,
        worldName,
        world: {
          name: worldName,
          agents: worldAgents,
          llmCallLimit: (world as any).llmCallLimit || (world as any).turnLimit
        },
        messages: sortedMessages,
        loading: false,
        error: null,
        isWaiting: false,
        selectedSettingsTarget: 'world',
        selectedAgent: null,
        activeAgent: null
      };

    } catch (error: any) {
      yield {
        ...state,
        worldName,
        world: { name: worldName, agents: [], llmCallLimit: undefined },
        loading: false,
        error: error.message || 'Failed to load world data',
        isWaiting: false,
        selectedSettingsTarget: 'world',
        selectedAgent: null,
        activeAgent: null
      };
    }
  },

  // Message Handlers
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
  'handleStreamStart': (state: WorldComponentState, data: any): WorldComponentState => {
    const baseState = handleStreamStart(state as any, data) as WorldComponentState;
    const agentName = data.sender;
    const agent = state.world?.agents.find(a => a.name === agentName);

    return {
      ...baseState,
      isWaiting: false,
      activeAgent: agent ? { spriteIndex: agent.spriteIndex, name: agent.name } : null
    };
  },
  'handleStreamChunk': (state: WorldComponentState, data: any): WorldComponentState => {
    return handleStreamChunk(state as any, data) as WorldComponentState;
  },
  'handleStreamEnd': (state: WorldComponentState, data: any): WorldComponentState => {
    const baseState = handleStreamEnd(state as any, data) as WorldComponentState;
    return {
      ...baseState,
      activeAgent: null
    };
  },
  'handleStreamError': (state: WorldComponentState, data: any): WorldComponentState => {
    const baseState = handleStreamError(state as any, data) as WorldComponentState;
    return {
      ...baseState,
      activeAgent: null
    };
  },
  'handleMessage': (state: WorldComponentState, data: any): WorldComponentState => {
    return handleMessage(state as any, data) as WorldComponentState;
  },
  'handleConnectionStatus': (state: WorldComponentState, data: any): WorldComponentState => {
    return handleConnectionStatus(state as any, data) as WorldComponentState;
  },
  'handleError': (state: WorldComponentState, data: any): WorldComponentState => {
    return handleError(state as any, data) as WorldComponentState;
  },
  'handleComplete': (state: WorldComponentState, data: any): WorldComponentState => {
    return handleComplete(state as any, data) as WorldComponentState;
  },

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
      chatHistory: {
        ...state.chatHistory,
        loading: true,
        error: null
      }
    };

    try {
      const chats = await api.listChats(state.worldName);
      return {
        ...newState,
        chatHistory: {
          ...newState.chatHistory,
          chats,
          loading: false
        }
      };
    } catch (error: any) {
      return {
        ...newState,
        chatHistory: {
          ...newState.chatHistory,
          loading: false,
          error: error.message || 'Failed to load chat history'
        }
      };
    }
  },

  // Toggle between settings and chat history sidebar
  'toggle-settings-chat-history': (state: WorldComponentState): WorldComponentState => {
    let nextTarget: 'world' | 'chat';
    if (state.selectedSettingsTarget !== 'world') {
      nextTarget = 'world';
      return {
        ...state,
        selectedSettingsTarget: nextTarget
      };
    } else {
      app.run('select-chat-history')
    }
  },

  // Chat history event handlers
  'chat-history-refresh': async (state: WorldComponentState): Promise<WorldComponentState> => {
    const newState = {
      ...state,
      chatHistory: {
        ...state.chatHistory,
        loading: true,
        error: null
      }
    };

    try {
      const chats = await api.listChats(state.worldName);
      return {
        ...newState,
        chatHistory: {
          ...newState.chatHistory,
          chats,
          loading: false
        }
      };
    } catch (error: any) {
      return {
        ...newState,
        chatHistory: {
          ...newState.chatHistory,
          loading: false,
          error: error.message || 'Failed to refresh chat history'
        }
      };
    }
  },

  'chat-history-show-load-confirm': (state: WorldComponentState, chat: any): WorldComponentState => ({
    ...state,
    chatHistory: {
      ...state.chatHistory,
      showLoadConfirm: true,
      selectedChat: chat
    }
  }),

  'chat-history-load-confirm': async (state: WorldComponentState): Promise<WorldComponentState> => {
    if (!state.chatHistory.selectedChat) return state;

    const newState = {
      ...state,
      chatHistory: {
        ...state.chatHistory,
        loading: true,
        error: null
      }
    };

    try {
      await api.restoreFromChat(state.worldName, state.chatHistory.selectedChat.id);

      // Refresh the world data after restore
      app.run('/World', state.worldName);

      return {
        ...newState,
        chatHistory: {
          ...newState.chatHistory,
          loading: false,
          showLoadConfirm: false,
          selectedChat: null
        }
      };
    } catch (error: any) {
      return {
        ...newState,
        chatHistory: {
          ...newState.chatHistory,
          loading: false,
          error: error.message || 'Failed to restore from chat'
        }
      };
    }
  },

  'chat-history-show-delete-confirm': (state: WorldComponentState, chat: any): WorldComponentState => ({
    ...state,
    chatHistory: {
      ...state.chatHistory,
      showDeleteConfirm: true,
      selectedChat: chat
    }
  }),

  'chat-history-delete-confirm': async (state: WorldComponentState): Promise<WorldComponentState> => {
    if (!state.chatHistory.selectedChat) return state;

    const newState = {
      ...state,
      chatHistory: {
        ...state.chatHistory,
        loading: true,
        error: null
      }
    };

    try {
      await api.deleteChat(state.worldName, state.chatHistory.selectedChat.id);
      const chats = await api.listChats(state.worldName);

      // If the deleted chat was the current chat, create a new one
      const updatedState = {
        ...newState,
        chatHistory: {
          ...newState.chatHistory,
          chats,
          loading: false,
          showDeleteConfirm: false,
          selectedChat: null
        }
      };

      if (state.currentChat.id === state.chatHistory.selectedChat.id) {
        updatedState.messages = [];
        updatedState.currentChat = {
          id: null,
          name: 'New Chat',
          isSaved: false,
          messageCount: 0,
          lastUpdated: new Date()
        };
        updatedState.userInput = '';
      }

      return updatedState;
    } catch (error: any) {
      return {
        ...newState,
        chatHistory: {
          ...newState.chatHistory,
          loading: false,
          error: error.message || 'Failed to delete chat'
        }
      };
    }
  },

  'chat-history-summarize': async (state: WorldComponentState, chat: any): Promise<WorldComponentState> => {
    const newState = {
      ...state,
      chatHistory: {
        ...state.chatHistory,
        loading: true,
        error: null
      }
    };

    try {
      const summary = await api.summarizeChat(state.worldName, chat.id);
      const chats = await api.listChats(state.worldName);

      return {
        ...newState,
        chatHistory: {
          ...newState.chatHistory,
          chats,
          loading: false
        }
      };
    } catch (error: any) {
      return {
        ...newState,
        chatHistory: {
          ...newState.chatHistory,
          loading: false,
          error: error.message || 'Failed to summarize chat'
        }
      };
    }
  },

  'chat-history-hide-modals': (state: WorldComponentState): WorldComponentState => ({
    ...state,
    chatHistory: {
      ...state.chatHistory,
      showCreateForm: false,
      showLoadConfirm: false,
      showDeleteConfirm: false,
      selectedChat: null
    }
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
  }
};
