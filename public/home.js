
//@ts-check
/**
 * Home Page Component - Main interface for Agent World
 *
 * Core Features:
 * - Enhanced world selection with modular WorldCard and AddWorldCard components
 * - Improved agent grid using modular AgentCard and AddAgentCard components
 * - Real-time conversation area with REST API + SSE streaming support
 * - Auto-scroll to bottom functionality for new messages
 * - Theme toggle functionality
 * - Proper input handling with immediate character capture and state clearing
 * - Error message handling with visual indicators and conversation integration
 *
 * Component Architecture:
 * - WorldCard: Compact card design with world icons, agent previews, connection status, and inline add agent button
 * - AddWorldCard: Simplified add world card with streamlined design (removed duplicate + icon)
 * - AgentCard: Enhanced agent display with avatars, memory counts, and action buttons
 * - Message: Reusable message component for conversation display
 * - AgentModal: Modal component for agent creation and editing
 *
 * World Card Features:
 * - Compact card design with reduced height for better space utilization
 * - World icons with hover animations and state-based styling
 * - Agent count statistics with user-friendly icons and inline add agent button
 * - Agent preview avatars showing up to 3 agents with overflow indicator
 * - Connection status indicators for active worlds with animated feedback
 * - Responsive design that adapts to different screen sizes
 * - Enhanced hover effects with subtle animations and color transitions
 * - Empty state messaging for worlds without agents
 * - Integrated agent creation via + button next to agent count (eliminated separate add agent card)
 *
 * Agent Card Features:
 * - Click on card to display agent memory in conversation area
 * - Edit button (pencil icon) to open agent editor modal - positioned top-right, appears on hover
 * - Action buttons with event propagation stopping to prevent card click interference
 * - Improved styling with hover effects and proper visual feedback
 * - Memory count display with user-friendly formatting
 * - Avatar generation with color-coded backgrounds and initials
 *
 * REST API + SSE Integration:
 * - Uses REST API for all CRUD operations (worlds, agents, memory)
 * - Server-Sent Events (SSE) for real-time chat streaming
 * - No WebSocket dependency - fully migrated to REST + SSE architecture
 * - Real-time chunk accumulation with visual indicators via SSE
 * - Connection status tracking and error handling
 * - Error messages added to conversation with red left border styling
 *
 * UI Improvements:
 * - Modular component architecture for better maintainability and reusability
 * - Enhanced visual hierarchy with proper spacing and typography
 * - Responsive layout that works seamlessly across devices
 * - Enhanced SVG action buttons with hover effects, shadows, and proper sizing
 * - Fixed memory display to show actual content instead of [object Object]
 * - Memory content parsing supports string, object with content/text/message properties, and JSON fallback
 * - Chat-like memory visualization with proper alignment and darker gray user message styling
 *
 * Implementation:
 * - AppRun component with simplified event handling via run()
 * - Event handlers organized in update/ modules for better maintainability
 * - Component-based architecture with separate files for WorldCard, AgentCard, etc.
 * - Agent-related functionality extracted to update/agent-actions.js
 * - Responsive layout with auto-scroll on message updates
 * - Input field properly bound to state with @input and @keypress handlers
 * - Error state management with visual feedback in conversation
 * - Robust state.agents handling with Array.isArray() check to prevent TypeError
 *
 * Recent Changes:
 * - Extracted WorldCard and AddWorldCard components to components/world-card.js
 * - Extracted AgentCard component to components/agent-card.js (removed AddAgentCard)
 * - Reduced world card height by adjusting padding for more compact layout
 * - Moved + button from world name line to agent statistics line for better UX
 * - Removed duplicate + icon from add world card content area
 * - Added inline add agent button (+) next to agent count in world cards
 * - Eliminated separate add agent card since agent creation is now integrated into world cards
 * - Modularized component architecture for better code organization and reusability
 * - Improved component interfaces with proper parameter passing and event handling
 * - Enhanced event handling with proper function references and event propagation control
 * - Maintained all existing functionality while improving code structure and UI compactness
 * - Added comprehensive component documentation and feature descriptions
 * - Improved maintainability through separation of concerns and streamlined design
 * - **MIGRATION COMPLETE**: Fully migrated from WebSocket to REST API + SSE architecture
 * - Uses REST API for all CRUD operations and SSE for real-time chat streaming
 * - Removed all WebSocket dependencies and imports
 * - Updated message handlers to work with REST + SSE event streams
 */

const { Component, html, run } = window["apprun"];

import { applyTheme, toggleTheme, getThemeIcon } from './theme.js';
import { getAvatarColor, getAvatarInitials } from './utils.js';
import {
  initializeState, selectWorld,
  handleRestMessage, handleConnectionStatus, handleRestError,
  displayAgentMemory, clearAgentMemory, clearAgentMemoryFromModal
} from './update/index.js';
import { AgentModal, openAgentModal, closeAgentModal } from './components/agent-modal.js';
import { WorldCard, AddWorldCard } from './components/world-card.js';
import { AgentCard } from './components/agent-card.js';
import { sendChatMessage } from './api.js';
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

const sendMessage = async (state) => {
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
    currentMessage: '',
    wsError: null,
    needScroll: true
  };

  try {
    // Send chat message via REST API with SSE
    await sendChatMessage(
      state.worldName,
      message,
      USER_ID,
      (data) => {
        // Handle incoming messages from SSE
        const app = window["app"];
        app.run('handleRestMessage', data);
      },
      (error) => {
        // Handle errors
        const app = window["app"];
        app.run('handleRestError', error);
      },
      (completion) => {
        // Handle completion
        console.log('Chat session completed:', completion);
      }
    );

    return newState;
  } catch (error) {
    console.error('Failed to send message:', error);

    // Add error message for failed send
    const errorMsg = {
      id: Date.now() + Math.random(),
      type: 'error',
      sender: 'System',
      text: 'Failed to send message: ' + error.message,
      timestamp: new Date().toISOString(),
      worldName: state.worldName,
      hasError: true
    };

    return {
      ...newState,
      wsError: 'Failed to send message',
      messages: [...newState.messages, errorMsg],
      needScroll: true
    };
  }
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

        <main class="main-content">          <!-- World tabs -->
          ${state.worlds?.length > 0 ? html`
            <div class="world-tabs">
              ${state.worlds.map(world => WorldCard(world, state.worldName, state.connectionStatus, selectWorld, openAgentModal))}
              ${AddWorldCard(() => run('addNewWorld'), false)}
            </div>
          ` : html`
            <div class="world-tabs">
              ${AddWorldCard(() => run('addNewWorld'), true)}
            </div>
          `}

          <!-- Loading indicator -->
          ${state.loading ? html`
            <div class="loading">Loading agents...</div>
          ` : ''}

          <!-- Agents grid -->
          <div class="agent-grid">
            ${Array.isArray(state.agents) ? state.agents.map(agent => AgentCard(agent, displayAgentMemory, openAgentModal, clearAgentMemory)) : ''}
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
  handleRestMessage,
  handleConnectionStatus,
  handleRestError,
  openAgentModal,
  closeAgentModal,
  displayAgentMemory,
  clearAgentMemory,
  clearAgentMemoryFromModal
};

export default new Component(state, view, update, {
  global_event: true
});