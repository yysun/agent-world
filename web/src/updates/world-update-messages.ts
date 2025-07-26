/**
 * World Message Handlers
 *
 * Extracted from WorldComponent (World.tsx)
 * Handles message send and receive logic, including SSE events.
 *
 * Features:
 * - User message sending
 * - SSE event handlers for chat streaming
 * - Agent message count updates
 * - Error handling for message send/receive
 *
 * Changes:
 * - Extracted from World.tsx on 2025-07-25
 */
import { app } from 'apprun';
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
} from '../sse-client';
import type { WorldComponentState, Agent } from '../types';
import { clearAgentMemory } from '../api';

export const worldMessageHandlers = {
  // Update user input
  'update-input': (state: WorldComponentState, e): WorldComponentState => ({
    ...state,
    userInput: e.target.value
  }),

  'key-press': (state: WorldComponentState, e) => {
    if (e.key === 'Enter' && (state.userInput || '').trim()) {
      // Use apprun app.run outside this handler
      app.run('send-message');
    }
  },

  // Send message action
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

  // Agent Message Clearing Handlers (moved from world-update-agent.ts)
  'clear-agent-messages': async (state: WorldComponentState, agent: Agent): Promise<WorldComponentState> => {
    try {
      await clearAgentMemory(state.worldName, agent.name);

      // Update agent's message count and remove agent's messages from display
      const updatedAgents = state.agents.map(a =>
        a.id === agent.id ? { ...a, messageCount: 0 } : a
      );

      // Remove agent's messages from the message list
      const filteredMessages = (state.messages || []).filter(msg => msg.sender !== agent.name);

      // Update selected agent if it's the same one
      const updatedSelectedAgent = state.selectedAgent?.id === agent.id
        ? { ...state.selectedAgent, messageCount: 0 }
        : state.selectedAgent;

      // Update world object with updated agents
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
      // Clear messages for all agents
      await Promise.all(
        state.agents.map(agent => clearAgentMemory(state.worldName, agent.name))
      );

      // Update all agents' message counts
      const updatedAgents = state.agents.map(agent => ({ ...agent, messageCount: 0 }));

      // Update selected agent if any
      const updatedSelectedAgent = state.selectedAgent
        ? { ...state.selectedAgent, messageCount: 0 }
        : null;

      // Update world object with updated agents
      const updatedWorld = state.world ? {
        ...state.world,
        agents: updatedAgents
      } : null;

      return {
        ...state,
        world: updatedWorld,
        agents: updatedAgents,
        messages: [], // Clear all messages
        selectedAgent: updatedSelectedAgent
      };
    } catch (error: any) {
      return {
        ...state,
        error: error.message || 'Failed to clear world messages'
      };
    }
  },

  // Settings selection handlers (moved from world-update-agent.ts)
  'select-world-settings': (state: WorldComponentState): WorldComponentState => ({
    ...state,
    selectedSettingsTarget: 'world',
    selectedAgent: null,
    messages: (state.messages || []).filter(message => !message.userEntered)
  }),

  'select-agent-settings': (state: WorldComponentState, agent: Agent): WorldComponentState => {
    // If clicking on already selected agent, deselect it (show world settings)
    if (state.selectedSettingsTarget === 'agent' && state.selectedAgent?.id === agent.id) {
      return {
        ...state,
        selectedSettingsTarget: 'world',
        selectedAgent: null,
        messages: (state.messages || []).filter(message => !message.userEntered),
        userInput: ''
      };
    }

    // Otherwise, select the agent
    return {
      ...state,
      selectedSettingsTarget: 'agent',
      selectedAgent: agent,
      messages: (state.messages || []).filter(message => !message.userEntered),
      userInput: '@' + agent.name + ' '
    };
  }
};
