
//@ts-check
/**
 * Home Page Component - Main interface for Agent World
 *
 * Core Features:
 * - World selection tabs with WebSocket subscription management and agent details display
 * - Agent grid display with avatar cards and modal integration
 * - Real-time conversation area with streaming message support
 * - Auto-scroll to bottom functionality for new messages
 * - Theme toggle functionality
 * - Proper input handling with immediate character capture and state clearing
 * - Error message handling with visual indicators and conversation integration
 *
 * WebSocket Integration:
 * - Handles system/world/message events and SSE streaming
 * - Real-time chunk accumulation with visual indicators
 * - Connection status tracking and error handling
 * - Error messages added to conversation with red left border styling
 *
 * Implementation:
 * - AppRun component with simplified event handling via run()
 * - Event handlers in update/ modules for organization
 * - Responsive layout with auto-scroll on message updates
 * - Input field properly bound to state with @input and @keypress handlers
 * - Error state management with visual feedback in conversation
 * - Enhanced world tabs showing agent names, counts, and message statistics
 *
 * Recent Changes:
 * - Fixed missing character issue by using @input instead of relying on @keypress for text capture
 * - Fixed input clearing after message send by proper state management
 * - Added error messages to conversation state with red left border styling
 * - Enhanced error handling for send failures and validation errors
 * - Updated world selector tabs to display agent details and message counts
 */

const { Component, html, run } = window["apprun"];

import { applyTheme, toggleTheme, getThemeIcon } from './theme.js';
import { getAvatarColor, getAvatarInitials } from './utils.js';
import {
  initializeState, selectWorld,
  handleWebSocketMessage, handleConnectionStatus, handleWebSocketError
} from './update/index.js';
import { AgentModal, openAgentModal, closeAgentModal } from './components/agent-modal.js';
import { sendChatMessage } from './ws-api.js';
import Message from './components/message.js';

const USER_ID = 'user1';

// Initial state
const state = async () => {
  const theme = localStorage.getItem('theme') || 'system';
  applyTheme(theme);
  return initializeState();
};

// Local event handlers
const onInput = (state, e) => {
  return {
    ...state,
    currentMessage: e.target.value
  };
};

const onKeypress = (state, e) => {
  if (e.key === 'Enter') {
    e.target.value = ''; // Clear input field
    return sendMessage(state);
  }
  // return state; // No need to return state here - no screen update needed
};

const sendMessage = (state) => {
  const message = state.currentMessage?.trim();

  if (!message || !state.worldName) {
    const errorMessage = !message ? 'Please enter a message' :
      !state.worldName ? 'No world selected' :
        'Not connected to server';

    // Add error message to conversation
    const errorMsg = {
      id: Date.now() + Math.random(),
      type: 'error',
      sender: 'System',
      text: errorMessage,
      timestamp: new Date().toISOString(),
      worldName: state.worldName,
      hasError: true
    };

    return {
      ...state,
      wsError: errorMessage,
      messages: [...state.messages, errorMsg],
      needScroll: true
    };
  }

  const success = sendChatMessage(state.worldName, message, USER_ID);

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
      wsError: null,
      needScroll: true
    };
  }

  // Add error message for failed send
  const errorMsg = {
    id: Date.now() + Math.random(),
    type: 'error',
    sender: 'System',
    text: 'Failed to send message',
    timestamp: new Date().toISOString(),
    worldName: state.worldName,
    hasError: true
  };

  return {
    ...state,
    wsError: 'Failed to send message',
    messages: [...state.messages, errorMsg],
    needScroll: true
  };
};

// Auto-scroll to bottom after DOM updates
const scrollToBottom = (state) => {
  if (state?.needScroll) {
    requestAnimationFrame(() => {
      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: 'smooth'
      });
    });
    // Reset the needScroll flag
    state.needScroll = false;
  }
};


// Main view function
const view = (state) => {
  // Check if we need to scroll and update state
  const updatedState = scrollToBottom(state);

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
              ${state.worlds.map(world => {
    const agentCount = world.agentCount || 0;
    const agents = world.agents || [];
    const totalMessages = agents.reduce((sum, agent) => sum + (agent.messageCount || 0), 0);

    return html`
                  <button
                    class="world-tab ${state.worldName === world.name ? 'active' : ''}"
                    @click=${run(selectWorld, world.name)}
                    data-world="${world.name}"
                    title="${agentCount === 0 ? 'No agents' :
        agentCount === 1 ? `1 agent: ${agents[0]?.name || 'Unknown'} (${agents[0]?.messageCount || 0} messages)` :
          `${agentCount} agents: ${agents.map(a => a.name).join(', ')} (${totalMessages} total messages)`}"
                  >
                    <div class="world-tab-content">
                      <div class="world-name">${world.name}</div>
                      <div class="world-info">
                        ${agentCount === 0 ? 'No agents' :
        agentCount === 1 ? `${agents[0]?.name || 'Unknown'} (${agents[0]?.messageCount || 0})` :
          `${agentCount} agents (${totalMessages} msgs)`}
                      </div>
                    </div>
                    ${state.worldName === world.name ? html`
                      <span class="connection-status ${state.connectionStatus}">
                        ${state.connectionStatus === 'connected' ? '●' :
          state.connectionStatus === 'connecting' ? '◐' :
            state.connectionStatus === 'error' ? '✕' : '○'}
                      </span>
                    ` : ''}
                  </button>
                `;
  })}
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
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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
                <p class="agent-role">${agent.memory?.length || 0} memories</p>
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
                @input=${run(onInput)}
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