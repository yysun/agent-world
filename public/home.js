//@ts-check
/**
 * Home Page Component - Main interface for Agent World
 *
 * Architecture: REST API + SSE streaming with AppRun framework
 * Features: World selection, agent grid, real-time chat, theme toggle
 * Components: WorldCard, AgentCard, AgentModal, Message
 * 
 * Recent Fixes:
 * - Fixed world chips agent count display
 * - Fixed duplicate message prevention via server-side filtering
 * - Consolidated redundant code and comments
 */

const { Component, html, run } = window["apprun"];

import { applyTheme, toggleTheme, getThemeIcon } from './theme.js';
import {
  initializeState, selectWorld,
  displayAgentMemory, clearAgentMemory, clearAgentMemoryFromModal
} from './update/index.js';
import {
  sendChatMessage,
  handleStreamStart, handleStreamChunk, handleStreamEnd, handleStreamError,
  handleMessage, handleConnectionStatus, handleError, handleComplete,
  incrementAgentMemorySize
} from './sse-client.js';
import { AgentModal, openAgentModal, closeAgentModal, updateEditingAgent } from './components/agent-modal.js';
import { AgentCard } from './components/agent-card.js';
import Message from './components/message.js';

const USER_ID = 'human';

// Initial state with theme initialization
const state = async () => {
  const theme = localStorage.getItem('theme') || 'system';
  applyTheme(theme);
  return await initializeState();
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

// Send message with error handling
const sendQuickMessage = async (state) => {
  const message = state.quickMessage?.trim();

  if (!message || !state.worldName) {
    const errorText = !message ? 'Please enter a message' : 'No world selected';
    return {
      ...state,
      wsError: errorText,
      messages: [...state.messages, {
        id: Date.now() + Math.random(),
        type: 'error',
        sender: 'System',
        text: errorText,
        timestamp: new Date().toISOString(),
        worldName: state.worldName,
        hasError: true
      }],
      needScroll: true
    };
  }

  // Add user message immediately
  const userMessage = {
    id: Date.now() + Math.random(),
    type: 'user-message',
    sender: USER_ID,
    text: message,
    timestamp: new Date().toISOString(),
    worldName: state.worldName
  };

  const newState = {
    ...state,
    messages: [...state.messages, userMessage],
    quickMessage: '',
    wsError: null,
    needScroll: true
  };

  try {
    await sendChatMessage(state.worldName, message, USER_ID);
    return newState;
  } catch (error) {
    console.error('Failed to send message:', error);
    return {
      ...newState,
      wsError: 'Failed to send message',
      messages: [...newState.messages, {
        id: Date.now() + Math.random(),
        type: 'error',
        sender: 'System',
        text: 'Failed to send message: ' + error.message,
        timestamp: new Date().toISOString(),
        worldName: state.worldName,
        hasError: true
      }],
      needScroll: true
    };
  }
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
          ${state.worlds?.map(world => html`
            <button 
              class="world-chip ${world.name === state.worldName ? 'active' : ''}"
              @click=${run('selectWorld', world.name)}
            >
              ${world.name}
              <span class="world-chip-count">${world.name === state.worldName ? (state.agents?.length || 0) : (world.agentCount || 0)}</span>
            </button>
          `)}
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
                ${state.worldName ? 'Start a conversation by typing a message below' : 'Select a world to start chatting'}
              </div>`
    }
          </div>
        </div>

        <div class="simple-input-container">
          <div class="simple-input-wrapper">
            <input
              type="text"
              class="simple-input"
              placeholder="${state.worldName ? 'Quick message...' : 'Select a world first...'}"
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
    ${state.showAgentModel ? AgentModal(state.editingAgent, closeAgentModal) : ''}
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
  closeAgentModal,
  updateEditingAgent,
  displayAgentMemory,
  clearAgentMemory,
  clearAgentMemoryFromModal,
  selectWorld,
  onQuickInput,
  onQuickKeypress,
  sendQuickMessage
};

export default new Component(state, view, update, {
  global_event: true
});