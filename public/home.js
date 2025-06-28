/**
 * Home Page Component
 * 
 * Features:
 * - World selection tabs
 * - Agent grid display with avatar cards
 * - Agent modal integration for create/edit operations
 * - Theme toggle functionality
 * - Conversation area (placeholder)
 * 
 * Implementation:
 * - Function-based AppRun component following simplified rules
 * - Agent modal receives props directly instead of global state
 * - Uses run() for local events (no registration in update object needed)
 * - Responsive grid layout for agents
 * 
 * Changes:
 * - Removed unnecessary event handler registration from update object
 * - Updated AgentModal to receive explicit props
 * - Follows AppRun simplified event handling rules
 */

import * as api from './api.js';
import { getAvatarInitials, getAvatarColor } from './utils.js';
import { AgentModal } from './agent.js';
import { toggleTheme, applyTheme, getThemeIcon } from './theme.js';
import wsApi from './ws-api.js';

const USER_ID = 'user1'; // Placeholder for user ID, can be replaced with actual user management

// Initial state
const state = async () => {
  const worlds = await api.getWorlds();
  const worldName = worlds.length > 0 ? worlds[0].name : null;
  const theme = localStorage.getItem('theme') || 'system';
  applyTheme(theme);

  // Initialize WebSocket state properties (no connection yet)
  const initialState = {
    worlds,
    theme,
    connectionStatus: 'disconnected',
    messages: [],
    currentMessage: '',
    wsError: null
  };

  return selectWorld(initialState, worldName);
};


// Event handlers
const selectWorld = async (state, worldName) => {
  if (worldName === state.worldName) return state;

  // Disconnect from previous world
  if (state.worldName && wsApi.isConnected()) {
    wsApi.disconnect();
  }

  // Clear messages when switching worlds
  const newState = {
    ...state,
    worldName,
    messages: [],
    connectionStatus: 'disconnected'
  };

  if (worldName) setTimeout(() => {
    // Connect to new world
    newState.connectionStatus = 'connecting';
    wsApi.connect();
  }, 500)

  const agents = await api.getAgents(worldName);
  return { ...newState, agents };
};

// WebSocket event handlers
const handleWebSocketMessage = (state, messageData) => {
  const message = {
    id: Date.now() + Math.random(),
    type: messageData.type || 'agent',
    sender: messageData.sender || messageData.agentName || 'system',
    text: messageData.message || messageData.text || '',
    timestamp: messageData.timestamp || new Date().toISOString(),
    worldName: state.worldName
  };

  return {
    ...state,
    messages: [...state.messages, message]
  };
};

const handleConnectionStatus = (state, status) => {
  return {
    ...state,
    connectionStatus: status,
    wsError: status === 'error' ? state.wsError : null
  };
};

const handleWebSocketError = (state, error) => {
  console.error('WebSocket error:', error);
  return {
    ...state,
    connectionStatus: 'error',
    wsError: error.message || 'WebSocket connection error'
  };
};

const openAgentModal = (state, agent = null) => {
  return ({
    ...state,
    editingAgent: agent || { name: 'New Agent', config: {}, status: 'New' },
    showAgentModel: true
  });
};

const closeAgentModal = (state, save) => {
  try {
    if (save) api.saveAgent(state.editingAgent);
    return ({
      ...state,
      showAgentModel: false
    });
  } catch (error) {
    console.error('Error closing agent modal:', error);
    return ({
      ...state,
      error
    });
  }
};

const onKeypress = (state, e) => {
  const value = e.target.value;
  state.currentMessage = value;
  if (e.key === 'Enter') {
    sendMessage(state, e);
  }
};

const sendMessage = (state) => {
  const message = state.currentMessage?.trim();

  // Validate message input
  if (!message) {
    return state; // Don't send empty messages
  }

  if (!state.worldName) {
    console.warn('No world selected');
    return state;
  }

  if (!wsApi.isConnected()) {
    console.warn('WebSocket not connected');
    return {
      ...state,
      wsError: 'Not connected to server'
    };
  }

  // Send message via WebSocket
  const success = wsApi.sendMessage({
    id: Date.now() + Math.random(),
    sender: USER_ID,
    worldName: state.worldName,
    content: message,
    type: 'message',
  });

  if (success) {
    // Add user message to local state immediately for better UX
    const userMessage = {
      type: 'message',
      sender: USER_ID,
      content: message,
      worldName: state.worldName
    };

    return {
      ...state,
      messages: [...state.messages, userMessage],
      currentMessage: '', // Clear input field
      wsError: null
    };
  } else {
    return {
      ...state,
      wsError: 'Failed to send message'
    };
  }
};


// view function
const view = (state) => {
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
                <p class="agent-role">${agent.config.model} ${agent.status || 'Agent'}</p>
              </div>
            `)}
          </div>
          <!-- Conversation area -->
          <div class="conversation-area">

            
            <div class="conversation-content">
              ${state.messages && state.messages.length > 0 ? html`
                ${state.messages.map(message => html`
                  <div class="conversation-message ${message.type}">
                    <div class="message-sender">${message.sender}</div>
                    <div class="message-text">${message.text}</div>
                    <div class="message-time">${new Date(message.timestamp).toLocaleTimeString()}</div>
                  </div>
                `)}
              ` : html`
                <div class="conversation-placeholder">
                  ${state.worldName ? 'Start a conversation by typing a message below' : 'Select a world to start chatting'}
                </div>
              `}
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
    })}
  `;
};

const update = {
  '/,#': state => state,
  handleWebSocketMessage,
  handleConnectionStatus,
  handleWebSocketError
}



export default new Component(state, view, update, { global_event: true });