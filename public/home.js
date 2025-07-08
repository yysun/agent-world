//@ts-check
/**
 * Home Page Component - Main interface for Agent World
 *
 * Architecture: REST API + SSE streaming with AppRun framework using unified app-state
 * Features: World selection, agent grid, real-time chat, theme toggle
 * Components: WorldCard, AgentCard, AgentModal, Message
 * 
 * Recent Changes:
 * - Updated to use unified AppState structure from world-actions.js
 * - Type-safe state management with //@ts-check
 * - Simplified state operations using core types
 * - Removed redundant state transformations
 */

const { Component, html, run, app } = window["apprun"];

import { applyTheme, toggleTheme, getThemeIcon } from './theme.js';
import * as api from './api.js';
import {
  initializeState, selectWorld,
  displayAgentMemory, clearAgentMemory
} from './update/index.js';
import { addMessage, clearMessages as clearMessagesState } from './update/world-actions.js';
import {
  sendChatMessage,
  handleStreamStart, handleStreamChunk, handleStreamEnd, handleStreamError,
  handleMessage, handleConnectionStatus, handleError, handleComplete,
  incrementAgentMemorySize
} from './sse-client.js';
import { AgentCard } from './components/agent-card.js';
import Message from './components/message.js';
// Import the modal component to initialize it
import './components/agent-modal.js';

const USER_ID = 'human';

// Initial state with theme initialization
const state = async () => {
  const initialState = await initializeState();
  const theme = localStorage.getItem('theme') || 'system';
  applyTheme(theme);
  return { ...initialState, theme };
};

// Input handlers
const onQuickInput = (state, e) => ({ ...state, quickMessage: e.target.value });

const onQuickKeypress = (state, e) => {
  if (e.key === 'Enter') {
    const message = e.target.value.trim();
    e.target.value = '';
    return message ? sendQuickMessage({ ...state, quickMessage: message }) : state;
  }
};

// Send message with error handling using generator pattern for loading states
const sendQuickMessage = async function* (state) {
  const message = state.quickMessage?.trim();
  const selectedWorldName = getSelectedWorldName(state);

  if (!message || !selectedWorldName) {
    const errorText = !message ? 'Please enter a message' : 'No world selected';
    const errorMessage = {
      id: Date.now() + Math.random(),
      role: 'system',
      content: errorText,
      createdAt: new Date(),
      sender: 'System'
    };

    return {
      ...state,
      messages: [...state.messages, errorMessage],
      needScroll: true
    };
  }

  // Add user message immediately and show sending state
  const userMessage = {
    id: Date.now() + Math.random(),
    role: 'user',
    content: message,
    createdAt: new Date(),
    sender: USER_ID,
    sending: true
  };

  // Yield initial state with user message and sending indicator
  yield {
    ...state,
    messages: [...state.messages, userMessage],
    quickMessage: '',
    needScroll: true,
    isSending: true
  };

  try {
    await sendChatMessage(selectedWorldName, message, USER_ID);

    // Return final state with sending completed
    return {
      ...state,
      messages: [...state.messages, { ...userMessage, sending: false }],
      quickMessage: '',
      needScroll: true,
      isSending: false
    };
  } catch (error) {
    console.error('Failed to send message:', error);
    const errorMessage = {
      id: Date.now() + Math.random(),
      role: 'system',
      content: 'Failed to send message: ' + error.message,
      createdAt: new Date(),
      sender: 'System'
    };

    return {
      ...state,
      messages: [...state.messages, { ...userMessage, sending: false }, errorMessage],
      quickMessage: '',
      needScroll: true,
      isSending: false
    };
  }
};

// Scroll to top function
const scrollToTop = (state) => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
  return state;
};

// Clear messages function
const clearMessages = (state) => {
  return clearMessagesState(state);
};

// Modal event handlers - use global events
const openAgentModal = (state, agent) => {
  const worldName = getSelectedWorldName(state);
  app.run('show-agent-modal', { agent, worldName });
  return state;
};

const openAgentModalCreate = (state, e) => {
  if (e && e.stopPropagation) {
    e.stopPropagation();
  }
  const worldName = getSelectedWorldName(state);
  app.run('show-agent-modal', { agent: null, worldName });
  return state;
};

const closeAgentModal = (state) => {
  app.run('hide-agent-modal');
  return state;
};

// Handle agent updates from modal
const handleAgentUpdated = async (state, { worldName, agent }) => {
  try {
    const updatedAgents = await api.getAgents(worldName);
    return {
      ...state,
      agents: updatedAgents
    };
  } catch (error) {
    console.error('Error refreshing agents:', error);
    return state;
  }
};

// Handle agent memory cleared from modal
const handleAgentMemoryCleared = (state, { worldName, agentName }) => {
  // Update the agent's memory count in the current agents list
  const updatedAgents = state.agents.map(agent =>
    agent.name === agentName ? { ...agent, memoryCount: 0 } : agent
  );

  return {
    ...state,
    agents: updatedAgents
  };
};

// Auto-scroll after DOM updates
const scrollToBottom = (state) => {
  if (state?.needScroll) {
    requestAnimationFrame(() => {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
      state.needScroll = false;
    });
  }
};

// Helper functions to get computed values from new state structure
const getSelectedWorldName = (state) => {
  if (!state.selectedWorldId) return null;
  const world = state.worlds.find(w => w.id === state.selectedWorldId);
  return world ? world.name : null;
};


// Main view
const view = (state) => {
  if (state.needScroll) scrollToBottom(state);

  return html`
    <div class="connect-container">
      <header class="connect-header">
        <div class="header-left">
          <span class="logo">Agent World</span>
        </div>
        <div class="world-chips">
          ${state.worlds?.map(world => {
    const selectedWorldName = getSelectedWorldName(state);
    const isSelected = world.name === selectedWorldName;
    return html`
            <button 
              class="world-chip ${isSelected ? 'active' : ''}"
              @click=${run('selectWorld', world.name)}
            >
              ${world.name}
              <span class="world-chip-count">${isSelected ? (state.agents?.length || 0) : (world.agentCount || 0)}</span>
              ${isSelected ? html`
                <button 
                  class="world-chip-add-btn" 
                  title="Add agent to this world"
                  @click=${run('openAgentModalCreate')}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <path d="M12 5v14M5 12h14"/>
                  </svg>
                </button>
              ` : ''}
            </button>
          `})}
        </div>
        <div class="header-right">
          <button class="theme-toggle" @click=${run(toggleTheme)}>
            ${getThemeIcon(state.theme || 'system')}
          </button>
          <button class="menu-btn">☰</button>
        </div>
      </header>

      <main class="main-content">
        ${state.loading ? html`<div class="loading">Loading agents...</div>` : ''}

        <div class="agent-grid">
          ${Array.isArray(state.agents) ? state.agents
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      .map(agent => AgentCard(agent, displayAgentMemory, openAgentModal, clearAgentMemory)) : ''}
        </div>
        
        <div class="conversation-area">
          <div class="conversation-content">
            ${state.messages?.length > 0 ?
      state.messages.map(message => Message(message)) :
      html`<div class="conversation-placeholder">
                ${getSelectedWorldName(state) ? 'Start a conversation by typing a message below' : 'Select a world to start chatting'}
              </div>`
    }
          </div>
          ${state.messages?.length > 0 ? html`
            <div class="conversation-controls">
              <button class="control-button" @click=${run('clearMessages')} title="Clear messages">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c0-1 1-2 2-2v2"/>
                </svg>
              </button>
              <button class="control-button" @click=${run('scrollToTop')} title="Scroll to top">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="m18 15-6-6-6 6"/>
                </svg>
              </button>
            </div>
          ` : ''}
        </div>

        <div class="simple-input-container">
          <div class="simple-input-wrapper">
            <input
              type="text"
              class="simple-input"
              placeholder="${getSelectedWorldName(state) ? 'Quick message...' : 'Select a world first...'}"
              value="${state.quickMessage || ''}"
              @input=${run('onQuickInput')}
              @keypress=${run('onQuickKeypress')}
            >
            <button class="simple-send-button" @click=${run('sendQuickMessage')}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="m5 12 7-7 7 7M12 19V5" />
              </svg>
            </button>
          </div>
        </div>
      </main>
    </div>
  `;
};

const update = {
  '/,#': state => state,
  handleStreamStart,
  handleStreamChunk,
  handleStreamEnd,
  handleStreamError,
  handleMessage,
  handleConnectionStatus,
  handleError,
  handleComplete,
  incrementAgentMemorySize,
  openAgentModal,
  openAgentModalCreate,
  closeAgentModal,
  displayAgentMemory,
  clearAgentMemory,
  selectWorld,
  onQuickInput,
  onQuickKeypress,
  sendQuickMessage,
  scrollToTop,
  clearMessages,
  'agent-updated': handleAgentUpdated,
  'agent-memory-cleared': handleAgentMemoryCleared
};

export default new Component(state, view, update, {
  global_event: true
});