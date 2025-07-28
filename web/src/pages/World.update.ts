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

      const messageMap = new Map();
      const worldAgents: Agent[] = await Promise.all(world.agents.map(async (agent, index) => {
        if (agent.memory && Array.isArray(agent.memory)) {
          agent.memory.forEach((memoryItem: any) => {
            const messageKey = `${memoryItem.createdAt || Date.now()}-${memoryItem.text || memoryItem.content || ''}`;

            if (!messageMap.has(messageKey)) {
              const originalSender = memoryItem.sender || agent.name;
              let messageType = 'agent';
              if (originalSender === 'HUMAN' || originalSender === 'USER') {
                messageType = 'user';
              }

              messageMap.set(messageKey, {
                id: memoryItem.id || messageKey,
                sender: originalSender,
                text: memoryItem.text || memoryItem.content || '',
                createdAt: memoryItem.createdAt || new Date().toISOString(),
                type: messageType,
                streamComplete: true,
                fromAgentId: agent.id
              });
            }
          });
        }

        const systemPrompt = agent.systemPrompt || '';

        return {
          ...agent,
          spriteIndex: index % 9,
          messageCount: agent.memory?.length || 0,
          provider: agent.provider || 'openai',
          model: agent.model || 'gpt-4',
          temperature: agent.temperature ?? 0.7,
          systemPrompt: systemPrompt,
          description: agent.description || '',
          type: agent.type || 'default',
          status: agent.status || 'active',
          llmCallCount: agent.llmCallCount || 0,
          memory: agent.memory || [],
          createdAt: agent.createdAt || new Date(),
          lastActive: agent.lastActive || new Date()
        } as Agent;
      }));

      const sortedMessages = Array.from(messageMap.values()).sort((a, b) => {
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
        agents: worldAgents,
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
  'update-input': (state: WorldComponentState, e): WorldComponentState => ({
    ...state,
    userInput: e.target.value
  }),

  'key-press': (state: WorldComponentState, e) => {
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
    const agent = state.agents.find(a => a.name === agentName);

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
    const agentName = data.sender;

    let finalState = {
      ...baseState,
      activeAgent: null
    };

    if (agentName && agentName !== 'HUMAN') {
      const updatedAgents = finalState.agents.map(agent => {
        if (agent.name === agentName) {
          return {
            ...agent,
            messageCount: agent.messageCount + 1
          };
        }
        return agent;
      });

      const updatedWorld = finalState.world ? {
        ...finalState.world,
        agents: updatedAgents
      } : null;

      const updatedSelectedAgent = finalState.selectedAgent?.name === agentName
        ? { ...finalState.selectedAgent, messageCount: finalState.selectedAgent.messageCount + 1 }
        : finalState.selectedAgent;

      finalState = {
        ...finalState,
        world: updatedWorld,
        agents: updatedAgents,
        selectedAgent: updatedSelectedAgent
      };
    }

    return finalState;
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

      const updatedAgents = state.agents.map(a =>
        a.id === agent.id ? { ...a, messageCount: 0 } : a
      );

      const filteredMessages = (state.messages || []).filter(msg => msg.sender !== agent.name);

      const updatedSelectedAgent = state.selectedAgent?.id === agent.id
        ? { ...state.selectedAgent, messageCount: 0 }
        : state.selectedAgent;

      const updatedWorld = state.world ? {
        ...state.world,
        agents: updatedAgents
      } : null;

      return {
        ...state,
        world: updatedWorld,
        agents: updatedAgents,
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
        state.agents.map(agent => api.clearAgentMemory(state.worldName, agent.name))
      );

      const updatedAgents = state.agents.map(agent => ({ ...agent, messageCount: 0 }));

      const updatedSelectedAgent = state.selectedAgent
        ? { ...state.selectedAgent, messageCount: 0 }
        : null;

      const updatedWorld = state.world ? {
        ...state.world,
        agents: updatedAgents
      } : null;

      return {
        ...state,
        world: updatedWorld,
        agents: updatedAgents,
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

    // Convert agent.name to kebab-case
    const kebabName = (agent.name || '')
      .toLowerCase()
      .replace(/[_\s]+/g, '-')
      .replace(/[^a-z0-9-]/g, '');

    return {
      ...state,
      selectedSettingsTarget: 'agent',
      selectedAgent: agent,
      messages: (state.messages || []).filter(message => !message.userEntered),
      userInput: '@' + kebabName + ' '
    };
  },

  // Agent deletion handler
  'delete-agent': async (state: WorldComponentState, agent: Agent): Promise<WorldComponentState> => {
    try {
      await api.deleteAgent(state.worldName, agent.name);

      // Remove agent from agents array
      const updatedAgents = state.agents.filter(a => a.id !== agent.id);
      
      // Remove agent messages from the message list
      const filteredMessages = (state.messages || []).filter(msg => msg.sender !== agent.name);

      // Update world to remove the agent
      const updatedWorld = state.world ? {
        ...state.world,
        agents: updatedAgents
      } : null;

      // Clear selected agent if it was the deleted one
      const updatedSelectedAgent = state.selectedAgent?.id === agent.id ? null : state.selectedAgent;
      const updatedSelectedSettingsTarget = state.selectedAgent?.id === agent.id ? 'world' : state.selectedSettingsTarget;

      return {
        ...state,
        world: updatedWorld,
        agents: updatedAgents,
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
  }
};
