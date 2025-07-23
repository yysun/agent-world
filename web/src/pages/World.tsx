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
 * - Agent memory deduplication using messageMap with timestamp-based sorting
 * - Interactive settings panel: click gear for world settings, click agent for agent settings
 * - Dynamic settings content based on selection (world vs agent)
 * - Modular component architecture using WorldChat and WorldSettings components
 * - World settings displayed by default in settings panel
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
 * - MessageMap deduplication system using timestamp+text keys for unique message identification
 * - Chronological message ordering with timestamp-based ascending sort
 * - Uses AppRun $ directive pattern for all event handling (click, input, keypress)
 * - Settings state management with selectedSettingsTarget and selectedAgent
 * - Component composition with WorldChat and WorldSettings for separation of concerns
 * - Default selectedSettingsTarget set to 'world' for immediate world info display
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
 * - Added messageMap deduplication system in '/World' handler for agent memory consolidation
 * - Implemented timestamp-based ascending sort for chronological message display
 * - Updated to use $ directive pattern throughout (gear button, agent clicks)
 * - Added dynamic settings panel with world/agent selection
 * - Removed notification checkbox, replaced with contextual settings
 * - Enhanced settings to show world or agent-specific information
 * - Refactored to use WorldChat and WorldSettings components for better separation of concerns
 * - Maintained all functionality while improving component modularity
 * - Set world settings as default display in settings panel for better UX
 */

import { app, Component } from 'apprun';
import { getWorld, getAgentMemory, type Agent, type Message } from '../api';
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
import WorldChat from '../components/world-chat';
import WorldSettings from '../components/world-settings';

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
  selectedSettingsTarget: 'world' | 'agent' | null;
  selectedAgent: WorldAgent | null;
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
      isSending: false,
      selectedSettingsTarget: 'world',
      selectedAgent: null
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
            <button $onclick={['/World', state.worldName]}>Retry</button>
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
                  <div key={`agent-${agent.id || index}`} className="agent-item" $onclick={['select-agent-settings', agent]}>
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
            <button className="world-settings-btn" title="World Settings" $onclick="select-world-settings">
              <span className="world-gear-icon">⚙</span>
            </button>
          </div>
        </div>

        <div className="world-layout">
          {/* Chat Interface */}
          <div className="chat-row full-height">
            {/* chat interface */}
            <WorldChat
              worldName={state.worldName}
              messages={state.messages}
              userInput={state.userInput}
              messagesLoading={state.messagesLoading}
              isSending={state.isSending}
            />

            {/* chat settings */}
            <WorldSettings
              worldName={state.worldName}
              agentCount={state.agents.length}
              messageCount={state.messages.length}
              selectedSettingsTarget={state.selectedSettingsTarget}
              selectedAgent={state.selectedAgent}
            />
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

        // Load world data including agents
        const world = await getWorld(worldName);

        // Create messageMap to deduplicate messages from all agents
        const messageMap = new Map();

        // Transform agents with UI properties and collect their memory items
        const worldAgents: WorldAgent[] = world.agents.map((agent, index) => {
          // Add agent's memory items to messageMap for deduplication
          if (agent.memory && Array.isArray(agent.memory)) {
            agent.memory.forEach((memoryItem: any) => {
              // Use a combination of timestamp and text as unique key to avoid duplicates
              const messageKey = `${memoryItem.timestamp || Date.now()}-${memoryItem.text || memoryItem.content || ''}`;

              // Only add if not already in map
              if (!messageMap.has(messageKey)) {
                messageMap.set(messageKey, {
                  id: memoryItem.id || messageKey,
                  sender: agent.name,
                  text: memoryItem.text || memoryItem.content || '',
                  timestamp: memoryItem.timestamp || new Date().toISOString(),
                  type: 'agent',
                  streamComplete: true
                });
              }
            });
          }

          return {
            ...agent,
            spriteIndex: index % 9, // Cycle through 9 sprite indices
            messageCount: agent.memory?.length || 0, // Use agent's memory length for message count
            memorySize: agent.memorySize || 0 // Ensure memorySize is present
          };
        });

        // Convert messageMap to array and sort by timestamp ascending
        const sortedMessages = Array.from(messageMap.values()).sort((a, b) => {
          const timeA = new Date(a.timestamp).getTime();
          const timeB = new Date(b.timestamp).getTime();
          return timeA - timeB;
        });

        yield {
          ...state,
          worldName,
          agents: worldAgents,
          messages: sortedMessages,
          agentsLoading: false,
          loading: false,
          error: null,
          selectedSettingsTarget: 'world',
          selectedAgent: null
        };

      } catch (error: any) {
        yield {
          ...state,
          worldName,
          loading: false,
          error: error.message || 'Failed to load world data',
          selectedSettingsTarget: 'world',
          selectedAgent: null
        };
      }
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

    // Settings selection handlers
    'select-world-settings': (state: WorldComponentState): WorldComponentState => ({
      ...state,
      selectedSettingsTarget: 'world',
      selectedAgent: null
    }),

    'select-agent-settings': (state: WorldComponentState, agent: WorldAgent): WorldComponentState => ({
      ...state,
      selectedSettingsTarget: 'agent',
      selectedAgent: agent
    }),
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

