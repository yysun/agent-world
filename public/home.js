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
 * - Added conversation control buttons (scroll to top, clear messages)
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
import { AgentModal, openAgentModal, closeAgentModalHandler } from './components/agent-modal.js';
import { updateModalAgent } from './utils/agent-modal-state.js';
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

// Send message with error handling using generator pattern for loading states
const sendQuickMessage = async function* (state) {
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

  // Add user message immediately and show sending state
  const userMessage = {
    id: Date.now() + Math.random(),
    type: 'user-message',
    sender: USER_ID,
    text: message,
    timestamp: new Date().toISOString(),
    worldName: state.worldName,
    sending: true // Add sending indicator
  };

  // Yield initial state with user message and sending indicator
  yield {
    ...state,
    messages: [...state.messages, userMessage],
    quickMessage: '',
    wsError: null,
    needScroll: true,
    isSending: true
  };

  try {
    await sendChatMessage(state.worldName, message, USER_ID);
    
    // Return final state with sending completed
    return {
      ...state,
      messages: [...state.messages, { ...userMessage, sending: false }],
      quickMessage: '',
      wsError: null,
      needScroll: true,
      isSending: false
    };
  } catch (error) {
    console.error('Failed to send message:', error);
    return {
      ...state,
      messages: [...state.messages, 
        { ...userMessage, sending: false },
        {
          id: Date.now() + Math.random(),
          type: 'error',
          sender: 'System',
          text: 'Failed to send message: ' + error.message,
          timestamp: new Date().toISOString(),
          worldName: state.worldName,
          hasError: true
        }
      ],
      quickMessage: '',
      wsError: 'Failed to send message',
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
  return {
    ...state,
    messages: [],
    wsError: null
  };
};

// Modal update handlers
const updateModalAgentName = (state, e) => {
  const name = e.target.value;
  return updateModalAgent(state, { name });
};

const updateModalAgentSystemPrompt = (state, e) => {
  const systemPrompt = e.target.value;
  return updateModalAgent(state, { systemPrompt });
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
              ${world.name === state.worldName ? html`
                <button 
                  class="world-chip-add-btn" 
                  title="Add agent to this world"
                  @click=${run(openAgentModal, null)}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <path d="M12 5v14M5 12h14"/>
                  </svg>
                </button>
              ` : ''}
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
    ${state.agentModal?.isOpen ? AgentModal(state.agentModal, closeAgentModalHandler) : ''}
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
  closeAgentModal: closeAgentModalHandler,
  updateModalAgentName,
  updateModalAgentSystemPrompt,
  displayAgentMemory,
  clearAgentMemory,
  clearAgentMemoryFromModal,
  selectWorld,
  onQuickInput,
  onQuickKeypress,
  sendQuickMessage,
  scrollToTop,
  clearMessages
};

export default new Component(state, view, update, {
  global_event: true
});