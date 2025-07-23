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
 * 
 * Implementation:
 * - AppRun MVU (Model-View-Update) architecture
 * - Async state initialization with API data loading
 * - State-driven conditional rendering with guard clauses
 * - Immutable state updates with spread operator
 * - API integration for agents data
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
 */

import { app, Component } from 'apprun';
import { getAgents, getAgentMemory, type Agent, type Message } from '../api';

// Extended Agent interface for UI-specific properties
interface WorldAgent extends Agent {
  spriteIndex: number;
  messageCount: number;
}

interface WorldComponentState {
  worldName: string;
  agents: WorldAgent[];
  messages: Message[];
  userInput: string;
  loading: boolean;
  error: string | null;
  agentsLoading: boolean;
  messagesLoading: boolean;
}

export default class WorldComponent extends Component<WorldComponentState> {
  state = async (): Promise<WorldComponentState> => {
    return {
      worldName: 'World',
      agents: [],
      messages: [],
      userInput: '',
      loading: true,
      error: null,
      agentsLoading: true,
      messagesLoading: false
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
                      {agent.messageCount > 0 && (
                        <div className="message-badge">{agent.messageCount}</div>
                      )}
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
                <div className="conversation-area">
                  {state.messagesLoading ? (
                    <div className="loading-messages">Loading messages...</div>
                  ) : state.messages.length === 0 ? (
                    <div className="no-messages">No messages yet. Start a conversation!</div>
                  ) : (
                    state.messages.map((message, index) => (
                      <div key={message.id || index} className={`message ${message.role === 'user' ? 'user-message' : 'agent-message'}`}>
                        <div className="message-sender">{message.role === 'user' ? 'User' : message.role}</div>
                        <div className="message-content">{message.content}</div>
                        <div className="message-timestamp">
                          {message.timestamp ? new Date(message.timestamp).toLocaleTimeString() : 'Now'}
                        </div>
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
                      onInput={e => app.run('update-input', (e.target as HTMLInputElement).value)}
                      onKeyPress={e => e.key === 'Enter' && app.run('send-message')}
                    />
                    <button
                      className="send-button"
                      $onclick="send-message"
                      disabled={!state.userInput.trim()}
                    >
                      Send
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
          messageCount: agent.memorySize || 0 // Use agent's memorySize property
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
    'update-input': (state: WorldComponentState, value: string): WorldComponentState => ({
      ...state,
      userInput: value
    }),

    // Send message action
    'send-message': (state: WorldComponentState): WorldComponentState => {
      if (!state.userInput.trim()) return state;

      const newMessage: Message = {
        role: 'user',
        content: state.userInput,
        timestamp: new Date().toISOString()
      };

      return {
        ...state,
        messages: [...state.messages, newMessage],
        userInput: ''
      };
    }
  };
}

