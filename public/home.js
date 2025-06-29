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

import { getAvatarInitials, getAvatarColor } from './utils.js';
import { AgentModal } from './agent.js';
import { toggleTheme, applyTheme, getThemeIcon } from './theme.js';
import MessageBroker, { MESSAGE_TYPES } from './message-broker.js';

const { app, Component, html, run } = window.apprun;
const USER_ID = 'user1'; // Placeholder for user ID, can be replaced with actual user management

const DEFAULT_WORLD_NAME = 'Default World';

// Initial state
const state = async () => {
  // Initialize message broker
  try {
    await MessageBroker.init({
      mode: localStorage.getItem('operationMode') || 'static',
      websocketUrl: 'ws://localhost:3000/ws'
    });
  } catch (error) {
    console.warn('Message broker initialization failed:', error);
  }

  let worlds = [];

  try {
    // Try to get worlds via message broker
    const response = await MessageBroker.sendMessage(MESSAGE_TYPES.WORLD_LIST);
    worlds = response.data || [];
  } catch (error) {
    console.warn('Could not fetch worlds:', error);
  }

  // Auto-create default world if none exist - STATIC MODE ONLY
  if ((!worlds || worlds.length === 0) && MessageBroker.getOperationMode() === 'static') {
    try {
      const defaultWorld = {
        name: DEFAULT_WORLD_NAME,
        description: 'Default world for Agent interactions'
      };

      const response = await MessageBroker.sendMessage(MESSAGE_TYPES.WORLD_CREATE, defaultWorld);
      if (response.data) {
        worlds = [response.data];
      } else {
        // Fallback for static mode when creation fails
        worlds = [{ id: 'default-world', name: DEFAULT_WORLD_NAME, agentCount: 0 }];
      }
    } catch (error) {
      console.warn('Could not create default world in static mode:', error);
      // Fallback state for static mode
      worlds = [{ id: 'default-world', name: DEFAULT_WORLD_NAME, agentCount: 0 }];
    }
  }

  const worldName = worlds.length > 0 ? worlds[0].name : null;
  const theme = localStorage.getItem('theme') || 'system';
  applyTheme(theme);

  // Initialize WebSocket state properties (no connection yet)
  const initialState = {
    worlds,
    theme,
    operationMode: localStorage.getItem('operationMode') || 'static',
    connectionStatus: 'disconnected',
    messages: [],
    currentMessage: '',
    wsError: null
  };

  // Set up message broker event listeners
  MessageBroker.on('message_received', (messageData) => {
    app.run('handleWebSocketMessage', messageData);
  });

  MessageBroker.on('connection_open', () => {
    app.run('handleConnectionStatus', 'connected');
  });

  MessageBroker.on('connection_closed', () => {
    app.run('handleConnectionStatus', 'disconnected');
  });

  MessageBroker.on('connection_error', (errorData) => {
    app.run('handleWebSocketError', errorData);
  });

  return selectWorld(initialState, worldName);
};


// Event handlers
const selectWorld = async (state, worldName) => {
  if (worldName === state.worldName) return state;

  // Disconnect from previous world
  if (state.worldName && MessageBroker.getConnectionState() === 'connected') {
    try {
      await MessageBroker.sendMessage(MESSAGE_TYPES.UNSUBSCRIBE, { worldName: state.worldName });
    } catch (error) {
      console.warn('Failed to unsubscribe from previous world:', error);
    }
  }

  // Clear messages when switching worlds
  const newState = {
    ...state,
    worldName,
    messages: [],
    connectionStatus: 'disconnected'
  };

  if (worldName) {
    try {
      // Subscribe to new world
      await MessageBroker.sendMessage(MESSAGE_TYPES.SUBSCRIBE, { worldName });
      newState.connectionStatus = 'connected';

      // Get agents for the selected world
      const response = await MessageBroker.sendMessage(MESSAGE_TYPES.AGENT_LIST, { worldName });
      newState.agents = response.data || [];

    } catch (error) {
      console.warn('Failed to select world:', error);
      newState.connectionStatus = 'error';
      newState.agents = [];
    }
  }

  return newState;
};

// WebSocket event handlers via message broker
const handleWebSocketMessage = (state, messageData) => {
  const message = {
    id: Date.now() + Math.random(),
    type: messageData.type || 'agent',
    sender: messageData.sender || messageData.agentName || 'system',
    text: messageData.message || messageData.text || messageData.content || '',
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
  console.error('Message broker error:', error);
  return {
    ...state,
    connectionStatus: 'error',
    wsError: error.message || 'Communication error'
  };
};

const openAgentModal = (state, agent = null) => {
  return ({
    ...state,
    editingAgent: agent || { name: 'New Agent', config: {}, status: 'New' },
    showAgentModel: true
  });
};

const closeAgentModal = async (state, save) => {
  try {
    if (save && state.editingAgent) {
      if (state.editingAgent.id) {
        // Update existing agent
        await MessageBroker.sendMessage(MESSAGE_TYPES.AGENT_UPDATE, {
          id: state.editingAgent.id,
          ...state.editingAgent
        });
      } else {
        // Create new agent
        await MessageBroker.sendMessage(MESSAGE_TYPES.AGENT_CREATE, {
          ...state.editingAgent,
          worldName: state.worldName
        });
      }

      // Refresh agents list
      try {
        const response = await MessageBroker.sendMessage(MESSAGE_TYPES.AGENT_LIST, { worldName: state.worldName });
        const updatedAgents = response.data || [];
        return {
          ...state,
          showAgentModel: false,
          agents: updatedAgents
        };
      } catch (error) {
        console.warn('Failed to refresh agents:', error);
      }
    }

    return {
      ...state,
      showAgentModel: false
    };
  } catch (error) {
    console.error('Error closing agent modal:', error);
    return {
      ...state,
      error: error.message
    };
  }
};

const handleThemeToggle = (state) => {
  const newTheme = toggleTheme();
  return { ...state, theme: newTheme };
};

const updateCurrentMessage = (state, value) => {
  return { ...state, currentMessage: value };
};

const addNewWorld = async (state) => {
  const worldName = prompt('Enter world name:');
  if (!worldName || !worldName.trim()) {
    return state;
  }

  try {
    const newWorld = {
      name: worldName.trim(),
      description: `World created by user: ${worldName.trim()}`
    };

    const response = await MessageBroker.sendMessage(MESSAGE_TYPES.WORLD_CREATE, newWorld);

    if (response.data) {
      // Refresh worlds list
      const worldsResponse = await MessageBroker.sendMessage(MESSAGE_TYPES.WORLD_LIST);
      const updatedWorlds = worldsResponse.data || [];

      return {
        ...state,
        worlds: updatedWorlds,
        worldName: response.data.name // Auto-select the new world
      };
    }

    return state;
  } catch (error) {
    console.error('Failed to create world:', error);
    return {
      ...state,
      error: 'Failed to create world: ' + error.message
    };
  }
};

const createNewWorld = async (state, worldName = DEFAULT_WORLD_NAME) => {
  try {
    // Try to create world via message broker (works in both static and server modes)
    const newWorld = {
      id: worldName.toLowerCase().replace(/\s+/g, '-'),
      name: worldName,
      agentCount: 0
    };

    // Add to local state immediately for better UX
    const updatedWorlds = [...state.worlds, newWorld];

    // If this is the first world, automatically select it
    const shouldAutoSelect = state.worlds.length === 0;

    const newState = {
      ...state,
      worlds: updatedWorlds
    };

    if (shouldAutoSelect) {
      return selectWorld(newState, worldName);
    }

    return newState;
  } catch (error) {
    console.error('Error creating world:', error);
    return {
      ...state,
      wsError: `Failed to create world: ${error.message}`
    };
  }
};

const onKeypress = (state, e) => {
  if (e.key === 'Enter') {
    return sendMessage(state);
  }
  return state; // No state change for other keys
};

const sendMessage = async (state) => {
  const message = state.currentMessage?.trim();

  // Validate message input
  if (!message) {
    return state; // Don't send empty messages
  }

  if (!state.worldName) {
    console.warn('No world selected');
    return state;
  }

  if (MessageBroker.getConnectionState() !== 'connected') {
    console.warn('Message broker not connected');
    return {
      ...state,
      wsError: 'Not connected to server'
    };
  }

  try {
    // Send message via message broker
    const messageData = {
      sender: USER_ID,
      worldName: state.worldName,
      content: message,
      type: 'message'
    };

    await MessageBroker.sendMessage(MESSAGE_TYPES.CHAT_MESSAGE, messageData);

    // Add user message to local state immediately for better UX
    const userMessage = {
      id: Date.now() + Math.random(),
      type: 'message',
      sender: USER_ID,
      text: message,
      timestamp: new Date().toISOString(),
      worldName: state.worldName
    };

    return {
      ...state,
      messages: [...state.messages, userMessage],
      currentMessage: '', // Clear input field
      wsError: null
    };
  } catch (error) {
    console.error('Failed to send message:', error);
    return {
      ...state,
      wsError: 'Failed to send message: ' + error.message
    };
  }
};

const toggleOperationMode = async (state) => {
  const currentMode = localStorage.getItem('operationMode') || 'static';
  const newMode = currentMode === 'static' ? 'server' : 'static';

  // Store the new mode preference
  localStorage.setItem('operationMode', newMode);

  try {
    // Reinitialize message broker with new mode
    await MessageBroker.init({
      mode: newMode,
      websocketUrl: 'ws://localhost:3000/ws'
    });

    // Refresh worlds list for new mode
    const response = await MessageBroker.sendMessage(MESSAGE_TYPES.WORLD_LIST);
    const worlds = response.data || [];

    return {
      ...state,
      operationMode: newMode,
      worlds,
      worldName: worlds.length > 0 ? worlds[0].name : null,
      connectionStatus: messageBroker.getConnectionState(),
      messages: [] // Clear messages when switching modes
    };
  } catch (error) {
    console.error('Failed to switch operation mode:', error);
    return {
      ...state,
      error: 'Failed to switch to ' + newMode + ' mode: ' + error.message
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
            <div class="operation-mode-toggle">
              <button class="mode-toggle-btn" @click=${run(toggleOperationMode)} title="Switch between Static and Server modes">
                <span class="mode-indicator ${state.operationMode}">${state.operationMode === 'static' ? '📱' : '🌐'}</span>
                <span class="mode-text">${state.operationMode}</span>
              </button>
            </div>
            <button class="theme-toggle" @click=${run(handleThemeToggle)}>
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
              <button class="world-tab add-world-tab" @click=${run(addNewWorld)}>
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
                @input=${(e) => app.run('updateCurrentMessage', e.target.value)}
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
  handleWebSocketError,
  updateCurrentMessage,
  toggleOperationMode
};



export default new Component(state, view, update, { global_event: true });