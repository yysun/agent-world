
//@ts-check
/**
 * Home Page Component - Main interface for Agent World
 *
 * Core Features:
 * - Enhanced world selection cards with beautiful card-based design, agent previews, and visual statistics
 * - Improved "Add World" card with modern styling and engaging visual feedback
 * - Agent grid display with avatar cards, styled action buttons, and modal integration
 * - Real-time conversation area with streaming message support
 * - Auto-scroll to bottom functionality for new messages
 * - Theme toggle functionality
 * - Proper input handling with immediate character capture and state clearing
 * - Error message handling with visual indicators and conversation integration
 *
 * World Card Features:
 * - Card-based design replacing old tab layout for better visual hierarchy
 * - World icons with hover animations and state-based styling
 * - Agent count statistics with user-friendly icons
 * - Agent preview avatars showing up to 3 agents with overflow indicator
 * - Connection status indicators for active worlds with animated feedback
 * - Responsive design that adapts to different screen sizes
 * - Enhanced hover effects with subtle animations and color transitions
 * - Empty state messaging for worlds without agents
 *
 * Add World Card Features:
 * - Dedicated card design with dashed borders and gradient backgrounds
 * - Animated icon that changes on hover with smooth transitions
 * - Context-aware messaging (first world vs additional worlds)
 * - Consistent styling that matches the overall design language
 * - Engaging hover effects with transform animations
 *
 * WebSocket Integration:
 * - Handles system/world/message events and SSE streaming
 * - Real-time chunk accumulation with visual indicators
 * - Connection status tracking and error handling
 * - Error messages added to conversation with red left border styling
 *
 * Agent Card Features:
 * - Click on card to display agent memory in conversation area
 * - Edit button (pencil icon) to open agent editor modal - positioned top-right, appears on hover
 * - Removed clear/delete button from agent cards for cleaner interface
 * - Action buttons with event propagation stopping to prevent card click interference
 * - Improved styling with hover effects and proper visual feedback
 *
 * UI Improvements:
 * - Revolutionary world card design with modern aesthetics and micro-interactions
 * - Enhanced visual hierarchy with proper spacing and typography
 * - Responsive layout that works seamlessly across devices
 * - Improved agent cards (160px) to accommodate action buttons properly
 * - Enhanced SVG action buttons with hover effects, shadows, and proper sizing
 * - Fixed memory display to show actual content instead of [object Object]
 * - Memory content parsing supports string, object with content/text/message properties, and JSON fallback
 * - Chat-like memory visualization with proper alignment and darker gray user message styling
 *
 * Implementation:
 * - AppRun component with simplified event handling via run()
 * - Event handlers organized in update/ modules for better maintainability
 * - Agent-related functionality extracted to update/agent-actions.js
 * - Responsive layout with auto-scroll on message updates
 * - Input field properly bound to state with @input and @keypress handlers
 * - Error state management with visual feedback in conversation
 * - Enhanced world cards showing agent names, counts, and preview avatars
 * - Robust state.agents handling with Array.isArray() check to prevent TypeError
 *
 * Recent Changes:
 * - Completely redesigned world selection from tabs to beautiful cards
 * - Added world icons with contextual colors and hover animations
 * - Implemented agent preview system showing up to 3 agent avatars
 * - Enhanced add world card with modern design and engaging interactions
 * - Added comprehensive responsive design for mobile and tablet devices
 * - Improved visual hierarchy with better spacing and typography
 * - Enhanced hover effects and micro-interactions throughout
 * - Added agent count statistics with user-friendly icons
 * - Implemented connection status indicators with smooth animations
 * - Created adaptive messaging for empty states and first-time users
 * - Added gradient backgrounds and subtle shadow effects for depth
 * - Enhanced accessibility with proper hover states and focus indicators
 */

const { Component, html, run } = window["apprun"];

import { applyTheme, toggleTheme, getThemeIcon } from './theme.js';
import { getAvatarColor, getAvatarInitials } from './utils.js';
import {
  initializeState, selectWorld,
  handleWebSocketMessage, handleConnectionStatus, handleWebSocketError,
  displayAgentMemory, clearAgentMemory, clearAgentMemoryFromModal
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
  if (state.needScroll) scrollToBottom(state);

  // Debug logging for agents
  console.log('🖼️ View render - state:', state);

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
    const isActive = state.worldName === world.name;

    return html`
                  <div
                    class="world-card ${isActive ? 'active' : ''}"
                    @click=${run(selectWorld, world.name)}
                    data-world="${world.name}"
                    title="${agentCount === 0 ? 'No agents in this world' :
        agentCount === 1 ? `1 agent: ${agents[0]?.name || 'Unknown'}` :
          `${agentCount} agents: ${agents.map(a => a.name).join(', ')}`}"
                  >
                    <div class="world-card-header">
                      <div class="world-icon">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <circle cx="12" cy="12" r="10"/>
                          <path d="M8 12h8M12 8v8"/>
                        </svg>
                      </div>
                      <div class="world-name">${world.name}</div>
                      ${isActive ? html`
                        <span class="connection-status ${state.connectionStatus}">
                          ${state.connectionStatus === 'connected' ? '●' :
          state.connectionStatus === 'connecting' ? '◐' :
            state.connectionStatus === 'error' ? '✕' : '○'}
                        </span>
                      ` : ''}
                    </div>
                    <div class="world-card-content">
                      <div class="world-stats">
                        <div class="stat-item">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                            <circle cx="12" cy="7" r="4"/>
                          </svg>
                          <span class="stat-value">${agentCount}</span>
                          <span class="stat-label">${agentCount === 1 ? 'Agent' : 'Agents'}</span>
                        </div>
                      </div>
                      ${agentCount > 0 ? html`
                        <div class="agent-preview">
                          ${agents.slice(0, 3).map(agent => html`
                            <div class="agent-preview-item" title="${agent.name}">
                              <div class="agent-preview-avatar" style="background-color: ${getAvatarColor(agent.name)}">
                                ${getAvatarInitials(agent.name)}
                              </div>
                            </div>
                          `)}
                          ${agentCount > 3 ? html`
                            <div class="agent-preview-more">+${agentCount - 3}</div>
                          ` : ''}
                        </div>
                      ` : html`
                        <div class="empty-world">
                          <span>No agents yet</span>
                        </div>
                      `}
                    </div>
                  </div>
                `;
  })}
              <div class="world-card add-world-card" @click="addNewWorld">
                <div class="world-card-header">
                  <div class="world-icon add-world-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M12 5v14M5 12h14"/>
                    </svg>
                  </div>
                  <div class="world-name">Add World</div>
                </div>
                <div class="world-card-content">
                  <div class="add-world-content">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                      <circle cx="12" cy="12" r="10"/>
                      <path d="M12 8v8M8 12h8"/>
                    </svg>
                    <span>Create new world</span>
                  </div>
                </div>
              </div>
            </div>
          ` : html`
            <div class="world-tabs">
              <div class="world-card add-world-card" @click="addNewWorld">
                <div class="world-card-header">
                  <div class="world-icon add-world-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M12 5v14M5 12h14"/>
                    </svg>
                  </div>
                  <div class="world-name">Add World</div>
                </div>
                <div class="world-card-content">
                  <div class="add-world-content">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                      <circle cx="12" cy="12" r="10"/>
                      <path d="M12 8v8M8 12h8"/>
                    </svg>
                    <span>Create your first world</span>
                  </div>
                </div>
              </div>
            </div>
          `}

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

            ${Array.isArray(state.agents) ? state.agents.map(agent => html`
              <div class="agent-card" @click=${run('displayAgentMemory', agent)}>
                <div class="avatar-container">
                  <div class="avatar" style="background-color: ${getAvatarColor(agent.name)}">
                    ${getAvatarInitials(agent.name)}
                  </div>
                </div>
                <h3 class="agent-name">${`${agent.name}`}</h3>
                <p class="agent-role">${agent.memory?.length || 0} memories</p>
                <div class="agent-actions">
                  <button class="action-btn edit-btn" title="Edit agent" @click=${run('openAgentModal', agent)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                      <path d="m18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </button>
                </div>
              </div>
            `) : ''}
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
            </div >
          </div >

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
        <path d="m5 12 7-7 7 7M12 19V5" />
      </svg>
    </button>
  </div>
          </div >
        </main >
      </div >
  ${state.showAgentModel ? AgentModal(state.editingAgent, closeAgentModal) : ''}
`;
};

const update = {
  '/,#': state => state,
  handleWebSocketMessage,
  handleConnectionStatus,
  handleWebSocketError,
  openAgentModal,
  closeAgentModal,
  displayAgentMemory,
  clearAgentMemory,
  clearAgentMemoryFromModal
};

export default new Component(state, view, update, {
  global_event: true
});