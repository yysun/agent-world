/**
 * State Integration Example - How to use standardized state in components
 * 
 * This file demonstrates how to integrate the new standardized state schema
 * into the home component while maintaining backward compatibility.
 * 
 * Migration Strategy:
 * 1. Gradual adoption - components can opt into new schema
 * 2. Backward compatibility - legacy components continue to work
 * 3. State transformation - automatic conversion between formats
 * 4. Type safety - JSDoc provides IDE support and validation
 */

import { StateManager } from '../utils/state-manager.js';
import {
  createInitialAppState,
  migrateLegacyState
} from '../types/app-state-schema.js';

/**
 * Enhanced state initialization with new schema
 */
export const enhancedInitializeState = async () => {
  // Start with standardized state
  const stateManager = new StateManager(createInitialAppState());

  // Set theme preference
  const theme = localStorage.getItem('theme') || 'system';
  stateManager.state.ui.theme = theme;

  // Set loading state
  stateManager.state.connection.status = 'connecting';
  stateManager.state.connection.isLoading = true;

  try {
    // Load worlds using REST API
    const { getWorlds } = await import('../api.js');
    const worlds = await getWorlds();

    stateManager.updateWorld({
      available: worlds,
      isLoading: false,
      error: null
    });

    // Auto-select world
    const persistedWorldName = localStorage.getItem('selectedWorldName');
    let worldName = null;

    if (persistedWorldName && worlds.find(w => w.name === persistedWorldName)) {
      worldName = persistedWorldName;
    } else if (worlds.length > 0) {
      worldName = worlds[0].name;
    }

    if (worldName) {
      stateManager.selectWorld(worldName);

      // Load agents for selected world
      const { getAgents } = await import('../api.js');
      const agents = await getAgents(worldName);
      stateManager.setAgents(agents);
    }

    stateManager.state.connection.status = 'connected';
    stateManager.state.connection.isLoading = false;

    // Return in legacy format for current components
    return stateManager.getState(true);

  } catch (error) {
    console.error('Failed to initialize state:', error);

    stateManager.state.connection.status = 'error';
    stateManager.state.connection.isLoading = false;
    stateManager.state.errors.global = error.message || 'Failed to connect to server';

    return stateManager.getState(true);
  }
};

/**
 * Enhanced message handling with new schema
 */
export const enhancedSendQuickMessage = async function* (legacyState) {
  const stateManager = new StateManager(legacyState);
  const chatState = stateManager.getChatState();
  const worldState = stateManager.getWorldState();

  const message = chatState.quickMessage?.trim();

  if (!message || !worldState.current) {
    const errorText = !message ? 'Please enter a message' : 'No world selected';

    stateManager.updateChat({ error: errorText });
    stateManager.addMessage({
      id: Date.now() + Math.random(),
      type: 'error',
      sender: 'System',
      text: errorText,
      timestamp: new Date().toISOString(),
      worldName: worldState.current,
      hasError: true
    });

    yield stateManager.getState(true);
    return;
  }

  // Add user message and set sending state
  const userMessage = {
    id: Date.now() + Math.random(),
    type: 'user-message',
    sender: 'human',
    text: message,
    timestamp: new Date().toISOString(),
    worldName: worldState.current,
    sending: true
  };

  stateManager.addMessage(userMessage);
  stateManager.updateChat({
    quickMessage: '',
    isSending: true,
    error: null
  });

  yield stateManager.getState(true);

  try {
    const { sendChatMessage } = await import('../sse-client.js');
    await sendChatMessage(worldState.current, message, 'human');

    // Update message as sent
    const messages = stateManager.getChatState().messages;
    const updatedMessages = messages.map(msg =>
      msg.id === userMessage.id ? { ...msg, sending: false } : msg
    );

    stateManager.updateChat({
      messages: updatedMessages,
      isSending: false
    });

    return stateManager.getState(true);

  } catch (error) {
    console.error('Failed to send message:', error);

    // Add error message and update state
    const errorMessage = {
      id: Date.now() + Math.random(),
      type: 'error',
      sender: 'System',
      text: 'Failed to send message: ' + error.message,
      timestamp: new Date().toISOString(),
      worldName: worldState.current,
      hasError: true
    };

    stateManager.addMessage(errorMessage);
    stateManager.updateChat({
      isSending: false,
      error: 'Failed to send message'
    });

    return stateManager.getState(true);
  }
};

/**
 * Enhanced agent modal handlers with new schema
 */
export const enhancedModalHandlers = {
  /**
   * Update agent name in modal
   */
  updateModalAgentName: (legacyState, e) => {
    const stateManager = new StateManager(legacyState);
    stateManager.updateModalAgent({ name: e.target.value });
    return stateManager.getState(true);
  },

  /**
   * Update agent system prompt in modal
   */
  updateModalAgentSystemPrompt: (legacyState, e) => {
    const stateManager = new StateManager(legacyState);
    stateManager.updateModalAgent({ systemPrompt: e.target.value });
    return stateManager.getState(true);
  },

  /**
   * Clear messages with enhanced state management
   */
  clearMessages: (legacyState) => {
    const stateManager = new StateManager(legacyState);
    stateManager.clearMessages();
    return stateManager.getState(true);
  },

  /**
   * Scroll to top (UI action)
   */
  scrollToTop: (legacyState) => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return legacyState; // No state change needed
  }
};

/**
 * Migration helper for existing update handlers
 */
export function migrateUpdateHandler(handlerFn) {
  return (legacyState, ...args) => {
    // Try new schema first
    try {
      const stateManager = new StateManager(legacyState);
      const result = handlerFn(stateManager.getState(), ...args);

      if (result && typeof result === 'object') {
        const newStateManager = new StateManager(result);
        return newStateManager.getState(true);
      }

      return legacyState;
    } catch (error) {
      // Fallback to original handler
      console.warn('Migration fallback:', error);
      return handlerFn(legacyState, ...args);
    }
  };
}

/**
 * Example of how to gradually migrate the home component update object
 */
export const enhancedUpdate = {
  '/,#': state => state,

  // Enhanced handlers using new schema
  updateModalAgentName: enhancedModalHandlers.updateModalAgentName,
  updateModalAgentSystemPrompt: enhancedModalHandlers.updateModalAgentSystemPrompt,
  clearMessages: enhancedModalHandlers.clearMessages,
  scrollToTop: enhancedModalHandlers.scrollToTop,

  // Keep existing handlers but wrap them for migration
  sendQuickMessage: enhancedSendQuickMessage,

  // Legacy handlers (gradually migrate these)
  onQuickInput: (state, e) => ({ ...state, quickMessage: e.target.value }),
  onQuickKeypress: (state, e) => {
    if (e.key === 'Enter') {
      const message = e.target.value.trim();
      e.target.value = '';
      return message ? enhancedSendQuickMessage({ ...state, quickMessage: message }) : state;
    }
  }
};
