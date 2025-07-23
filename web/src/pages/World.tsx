/**
 * World Component - Displays world interface with agents and chat
 * 
 * Features:
 * - Centered agent list in header without world title
 * - World name displayed as chat legend instead of header
 * - Full-height chat and settings layout using remaining screen space
 * - Back navigation to worlds list
 * - Message badges showing agent activity using memorySize
 * - Real-time data loading from API
 * - Loading and error state management
 * - Real-time SSE chat streaming with agent responses
 * - Live streaming message updates with visual indicators
 * - Smart message filtering: shows completed messages + active streams without duplication
 * 
 * Implementation:
 * - AppRun MVU (Model-View-Update) architecture
 * - Async state initialization with API data loading
 * - State-driven conditional rendering with guard clauses
 * - Immutable state updates with spread operator
 * - API integration for agents data
 * - Full TypeScript SSE client integration
 * - Real-time streaming chat with proper error handling
 * - Intelligent message filtering preserves conversation history while preventing duplication
 * 
 * Changes:
 * - Replaced mock data with API calls to api.ts
 * - Added loading and error states for better UX
 * - Implemented async data fetching with error handling
 * - Added proper TypeScript interfaces
 * - Enhanced state management following AppRun patterns
 * - Updated to use agent.memorySize for message count display
 * - Moved agent list to header row alongside world name for compact layout
 * - Removed world title from header, centered agents
 * - Changed chat legend to display world name
 * - Added full-height layout classes for better space utilization
 * - Integrated TypeScript SSE client for real-time chat streaming
 * - Added SSE event handlers for streaming messages
 * - Enhanced message display with streaming indicators and error states
 * - Implemented proper chat message sending with SSE responses
 * - Fixed message display: shows completed agent messages + live streams, prevents duplication
 */

import { app, Component } from 'apprun';
import { getAgents, getAgentMemory, type Agent, type Message } from '../api';
import {
  sendChatMessage,
  handleStreamStart,
  handleStreamChunk,
  handleStreamEnd,
  handleStreamError,
  handleMessage,
  handleConnectionStatus,
  handleError,
  handleComplete,
  incrementAgentMemorySize,
  type SSEComponentState
} from '../sse-client';

// Extended Agent interface for UI-specific properties
interface WorldAgent extends Agent {
  spriteIndex: number;
  messageCount: number;
  memorySize: number; // Ensure this is included for SSE compatibility
}

interface WorldComponentState extends SSEComponentState {
  worldName: string;
  agents: WorldAgent[];
  userInput: string;
  loading: boolean;
  error: string | null;
  agentsLoading: boolean;
  messagesLoading: boolean;
  isSending: boolean;
}

export default class WorldComponent extends Component<WorldComponentState> {

  is_global_event = () => true;

  state = async (): Promise<WorldComponentState> => {
    return {
      worldName: 'World',
      agents: [],
      messages: [],
      userInput: '',
      loading: true,
      error: null,
      agentsLoading: true,
      messagesLoading: false,
      isSending: false
    };
  };

  view = (state: WorldComponentState) => {
    // Guard clauses for loading and error states
    if (state.loading) {
      return (
        <div className="world-container">
          <div className="world-header">
            <div className="world-nav-buttons">
              <a href="/">
                <button className="back-button" title="Back to Worlds">
                  <span className="world-back-icon">←</span>
                </button>
              </a>
            </div>
            <div className="agents-list-centered">
              <div className="loading-agents">Loading...</div>
            </div>
            <div className="world-nav-buttons">
              <button className="world-settings-btn" title="World Settings">
                <span className="world-gear-icon">⚙</span>
              </button>
            </div>
          </div>
          <div className="loading-state">
            <p>Loading world data...</p>
          </div>
        </div>
      );
    }

    if (state.error) {
      return (
        <div className="world-container">
          <div className="world-header">
            <div className="world-nav-buttons">
              <a href="/">
                <button className="back-button" title="Back to Worlds">
                  <span className="world-back-icon">←</span>
                </button>
              </a>
            </div>
            <div className="agents-list-centered">
              <div className="no-agents">Error</div>
            </div>
            <div className="world-nav-buttons">
              <button className="world-settings-btn" title="World Settings">
                <span className="world-gear-icon">⚙</span>
              </button>
            </div>
          </div>
          <div className="error-state">
            <p>Error: {state.error}</p>
            <button $onclick="retry-load-data">Retry</button>
          </div>
        </div>
      );
    }

    // Main content view
    return (
      <div className="world-container">
        <div className="world-header">
          <div className="world-nav-buttons">
            <a href="/">
              <button className="back-button" title="Back to Worlds">
                <span className="world-back-icon">←</span>
              </button>
            </a>
          </div>
          <div className="agents-list-centered">
            {state.agentsLoading ? (
              <div className="loading-agents">Loading agents...</div>
            ) : state.agents.length === 0 ? (
              <div className="no-agents">No agents in this world</div>
            ) : (
              state.agents.map((agent, index) => {
                return (
                  <div key={`agent-${agent.id || index}`} className="agent-item">
                    <div className="agent-sprite-container">
                      <div className={`agent-sprite sprite-${agent.spriteIndex}`}></div>
                      {/* Show badge always for testing - change back to agent.messageCount > 0 later */}
                      <div className="message-badge">{agent.messageCount}</div>
                    </div>
                    <div className="agent-name">{agent.name}</div>
                  </div>
                );
              })
            )}
          </div>
          <div className="world-nav-buttons">
            <button className="world-settings-btn" title="World Settings">
              <span className="world-gear-icon">⚙</span>
            </button>
          </div>
        </div>

        <div className="world-layout">
          {/* Chat Interface */}
          <div className="chat-row full-height">
            {/* chat interface */}
            <fieldset className="chat-fieldset">
              <legend>{state.worldName}</legend>
              <div className="chat-container">
                {/* Conversation Area */}
                <div className="conversation-area" ref={e => e.scrollTop = e.scrollHeight}>
                  {state.messagesLoading ? (
                    <div className="loading-messages">Loading messages...</div>
                  ) : state.messages.length === 0 ? (
                    <div className="no-messages">No messages yet. Start a conversation!</div>
                  ) : (
                    state.messages
                      .filter(message => {
                        // Always show user messages
                        if (message.sender === 'HUMAN' || message.type === 'user') {
                          return true;
                        }
                        // For agent messages: show completed streams OR currently streaming
                        // This shows final messages but prevents duplication during streaming
                        return message.streamComplete === true || (message.isStreaming === true && !message.streamComplete);
                      })
                      .map((message, index) => (
                        <div key={message.id || index} className={`message ${message.sender === 'HUMAN' || message.type === 'user' ? 'user-message' : 'agent-message'}`}>
                          <div className="message-sender">{message.sender === 'HUMAN' || message.type === 'user' ? 'User' : message.sender}</div>
                          <div className="message-content">{message.text}</div>
                          <div className="message-timestamp">
                            {message.timestamp ? new Date(message.timestamp).toLocaleTimeString() : 'Now'}
                          </div>
                          {message.isStreaming && <div className="streaming-indicator">Typing...</div>}
                          {message.hasError && <div className="error-indicator">Error: {message.errorMessage}</div>}
                        </div>
                      ))
                  )}
                </div>

                {/* User Input Area */}
                <div className="input-area">
                  <div className="input-container">
                    <input
                      type="text"
                      className="message-input"
                      placeholder="Type your message..."
                      value={state.userInput}
                      $oninput='update-input'
                      $onkeypress='key-press'
                    />
                    <button
                      className="send-button"
                      $onclick="send-message"
                      disabled={!state.userInput.trim() || state.isSending}
                    >
                      {state.isSending ? 'Sending...' : 'Send'}
                    </button>
                  </div>
                </div>
              </div>
            </fieldset>

            {/* chat settings */}
            <fieldset className="settings-fieldset">
              <legend>Settings</legend>
              <div className="chat-settings">
                <label>
                  <input
                    type="checkbox"
                  />
                  Enable Notifications
                </label>
              </div>
            </fieldset>
          </div>
        </div>
      </div>
    );
  };

  update = {
    // Route handler - loads world data when navigating to world page
    '/World': async function* (state: WorldComponentState, name: string): AsyncGenerator<WorldComponentState> {
      const worldName = name ? decodeURIComponent(name) : 'New World';

      try {
        // Initial state with world name
        yield {
          ...state,
          worldName,
          loading: true,
          error: null
        };

        // Load agents data
        const agents = await getAgents(worldName);

        // Transform agents with UI properties
        const worldAgents: WorldAgent[] = agents.map((agent, index) => ({
          ...agent,
          spriteIndex: index % 9, // Cycle through 9 sprite indices
          messageCount: agent.memorySize || 0, // Use agent's memorySize property
          memorySize: agent.memorySize || 0 // Ensure memorySize is present
        }));

        yield {
          ...state,
          worldName,
          agents: worldAgents,
          agentsLoading: false,
          loading: false,
          error: null
        };

      } catch (error: any) {
        yield {
          ...state,
          worldName,
          loading: false,
          error: error.message || 'Failed to load world data'
        };
      }
    },

    // Retry loading data after error
    'retry-load-data': async function* (state: WorldComponentState): AsyncGenerator<WorldComponentState> {
      yield* this.update['/World'](state, state.worldName);
    },

    // Update user input
    'update-input': (state: WorldComponentState, e): WorldComponentState => ({
      ...state,
      userInput: e.target.value
    }),
    'key-press': (state: WorldComponentState, e) => {
      if (e.key === 'Enter' && state.userInput.trim()) {
        app.run('send-message');
      }
    },
    // Send message action
    'send-message': async (state: WorldComponentState): Promise<WorldComponentState> => {
      if (!state.userInput.trim()) return state;

      (document.activeElement as HTMLElement)?.blur(); // Remove focus from input

      // Store the user input before clearing it
      const messageText = state.userInput;

      const userMessage = {
        id: Date.now() + Math.random(),
        type: 'user',
        sender: 'HUMAN',
        text: messageText,
        timestamp: new Date().toISOString(),
        worldName: state.worldName
      };

      // Add user message and clear input immediately
      const newState = {
        ...state,
        messages: [...state.messages, userMessage],
        userInput: '',
        isSending: true
      };

      try {
        // Send message via SSE using the stored message text
        await sendChatMessage(state.worldName, messageText, 'HUMAN');

        return {
          ...newState,
          isSending: false
        };
      } catch (error: any) {
        return {
          ...newState,
          isSending: false,
          error: error.message || 'Failed to send message'
        };
      }
    },

    // SSE Event Handlers - wrapped for WorldComponentState compatibility
    'handleStreamStart': (state: WorldComponentState, data: any): WorldComponentState => {
      return handleStreamStart(state as any, data) as WorldComponentState;
    },
    'handleStreamChunk': (state: WorldComponentState, data: any): WorldComponentState => {
      return handleStreamChunk(state as any, data) as WorldComponentState;
    },
    'handleStreamEnd': (state: WorldComponentState, data: any): WorldComponentState => {
      return handleStreamEnd(state as any, data) as WorldComponentState;
    },
    'handleStreamError': (state: WorldComponentState, data: any): WorldComponentState => {
      return handleStreamError(state as any, data) as WorldComponentState;
    },
    'handleMessage': (state: WorldComponentState, data: any): WorldComponentState => {
      return handleMessage(state as any, data) as WorldComponentState;
    },
    'handleConnectionStatus': (state: WorldComponentState, data: any): WorldComponentState => {
      return handleConnectionStatus(state as any, data) as WorldComponentState;
    },
    'handleError': (state: WorldComponentState, data: any): WorldComponentState => {
      return handleError(state as any, data) as WorldComponentState;
    },
    'handleComplete': (state: WorldComponentState, data: any): WorldComponentState => {
      return handleComplete(state as any, data) as WorldComponentState;
    },
    'incrementAgentMemorySize': (state: WorldComponentState, data: any): WorldComponentState => {
      return incrementAgentMemorySize(state as any, data) as WorldComponentState;
    }
  };
}

