/**
 * Home Page Component - Main interface for Agent World
 *
 * Core Features:
 * - World selection tabs with WebSocket subscription management
 * - Agent grid display with avatar cards and modal integration
 * - Real-time conversation area with streaming message support
 * - Auto-scroll to bottom functionality for new messages
 * - Theme toggle functionality
 *
 * WebSocket Integration:
 * - Handles system/world/message events and SSE streaming
 * - Real-time chunk accumulation with visual indicators
 * - Connection status tracking and error handling
 *
 * Implementation:
 * - AppRun component with simplified event handling via run()
 * - Event handlers in update/ modules for organization
 * - Responsive layout with auto-scroll on message updates
 */

const { html, run } = window.apprun;

import * as api from './api.js';
import { getAvatarInitials, getAvatarColor } from './utils.js';
import { AgentModal } from './agent.js';
import { toggleTheme, applyTheme, getThemeIcon } from './theme.js';
import wsApi from './ws-api.js';
import Message from './components/message.js';
import {
  selectWorld,
  handleWebSocketMessage,
  handleConnectionStatus,
  handleWebSocketError,
  openAgentModal,
  closeAgentModal
} from './update/index.js';

const USER_ID = 'user1';

// Initial state
const state = async () => {
  const worlds = await api.getWorlds();
  const worldName = worlds.length > 0 ? worlds[0].name : null;
  const theme = localStorage.getItem('theme') || 'system';
  applyTheme(theme);

  return selectWorld({
    worlds,
    theme,
    connectionStatus: 'disconnected',
    messages: [],
    currentMessage: '',
    wsError: null
  }, worldName);
};

// Local event handlers
const onKeypress = (state, e) => {
  const value = e.target.value;
  state.currentMessage = value;
  if (e.key === 'Enter') {
    sendMessage(state, e);
  }
};

const sendMessage = (state) => {
  const message = state.currentMessage?.trim();

  if (!message || !state.worldName || !wsApi.isConnected()) {
    return {
      ...state,
      wsError: !message ? null : !state.worldName ? 'No world selected' : 'Not connected to server'
    };
  }

  const success = wsApi.sendWorldEvent(state.worldName, message, USER_ID);

  if (success) {
    const userMessage = {
      id: Date.now() + Math.random(),
      type: 'user-message',
      sender: USER_ID,
      text: message,
      timestamp: new Date().toISOString(),
      worldName: state.worldName
    };

    return {
      ...state,
      messages: [...state.messages, userMessage],
      currentMessage: '',
      wsError: null
    };
  }

  return { ...state, wsError: 'Failed to send message' };
};

// Auto-scroll to bottom after DOM updates
const scrollToBottom = () => {
  requestAnimationFrame(() => {
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: 'smooth'
    });
  });
};

app.on('scroll-to-bottom', scrollToBottom);

// Main view function
const view = (state) => {
  scrollToBottom(); // Schedule scroll after rendering

  return html`
      <div class="connect-container">
        <header class="connect-header">
          <div class="header-left">
            <span class="logo">Agent World</span>
          </div>
          <div class="header-right">
            <button class="theme-toggle" @click=${run(toggleTheme)}>
              ${getThemeIcon(state.theme || 'system')}
            </button>
            <button class="menu-btn">☰</button>
          </div>
        </header>

        <main class="main-content">
          <!-- World tabs -->
          ${state.worlds?.length > 0 ? html`
            <div class="world-tabs">
              ${state.worlds.map(world => html`
                <button
                  class="world-tab ${state.worldName === world.name ? 'active' : ''}"
                  @click=${run(selectWorld, world.name)}
                  data-world="${world.name}"
                >
                  ${world.name}
                  ${state.worldName === world.name ? html`
                    <span class="connection-status ${state.connectionStatus}">
                      ${state.connectionStatus === 'connected' ? '●' :
        state.connectionStatus === 'connecting' ? '◐' :
          state.connectionStatus === 'error' ? '✕' : '○'}
                    </span>
                  ` : ''}
                </button>
              `)}
              <button class="world-tab add-world-tab" @click="addNewWorld">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 5v14M5 12h14"/>
                </svg>
              </button>
            </div>
          ` : ''}

          <!-- Loading indicator -->
          ${state.loading ? html`
            <div class="loading">Loading agents...</div>
          ` : ''}

          <!-- Agents grid -->
          <div class="agent-grid">
            <!-- Add new agent card -->
            <div class="agent-card add-agent-card" @click=${run(openAgentModal)}>
              <div class="avatar-container">
                <div class="avatar add-avatar">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 5v14M5 12h14"/>
                  </svg>
                </div>
              </div>
              <h3 class="agent-name">Add Agent</h3>
              <p class="agent-role">create new agent</p>
            </div>

            ${state.agents?.map(agent => html`
              <div class="agent-card" @click=${run(openAgentModal, agent)}>
                <div class="avatar-container">
                  <div class="avatar" style="background-color: ${getAvatarColor(agent.name)}">
                    ${getAvatarInitials(agent.name)}
                  </div>
                </div>
                <h3 class="agent-name">${`${agent.name}`}</h3>
                <p class="agent-role">${agent.model} ${agent.status || 'Agent'}</p>
              </div>
            `)}
          </div>
          <!-- Conversation area -->
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

          <div class="message-input-container">
            <div class="message-input-wrapper">
              <input
                type="text"
                class="message-input"
                placeholder="${state.worldName ? 'How can I help you today?' : 'Select a world first...'}"
                value="${state.currentMessage || ''}"
                @keypress=${run(onKeypress)}
              >
              <button
                class="send-button"
                @click=${run(sendMessage)}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="m5 12 7-7 7 7M12 19V5"/>
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
  handleWebSocketMessage,
  handleConnectionStatus,
  handleWebSocketError
};

export default new Component(state, view, update, {
  global_event: true
});