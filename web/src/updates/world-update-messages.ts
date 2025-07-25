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
  }
};
