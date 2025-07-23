/**
 * World Component - Displays world interface with agents and chat
 * 
 * Features:
 * - Centered agent list in header without world title
 * - World name displayed as chat legend instead of header
 * - Full-height chat and settings layout using remaining screen space
 * - Back navigation to worlds list
 * - Message badges showing agent activity using messageCount
 * - Real-time data loading from API
 * - Loading and error state management
 * - Real-time SSE chat streaming with agent responses
 * - Live streaming message updates with visual indicators
 * - Smart message filtering: shows completed messages + active streams without duplication
 * - Agent memory deduplication using messageMap with createdAt-based sorting
 * - Interactive settings panel: click gear for world settings, click agent for agent settings
 * - Dynamic settings content based on selection (world vs agent)
 * - Modular component architecture using WorldChat and WorldSettings components
 * - World settings displayed by default in settings panel
 * - Agent selection highlighting: enlarged and highlighted avatar when selected for settings
 * - Message filtering: when agent selected, chat shows only that agent's messages + user messages
 * - Agent deselection: click selected agent again to deselect and show all messages
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
 * - MessageMap deduplication system using createdAt+text keys for unique message identification
 * - Chronological message ordering with createdAt-based ascending sort
 * - Uses AppRun $ directive pattern for all event handling (click, input, keypress)
 * - Settings state management with selectedSettingsTarget and selectedAgent
 * - Component composition with WorldChat and WorldSettings for separation of concerns
 * - Default selectedSettingsTarget set to 'world' for immediate world info display
 * - Simplified agent tracking using messageCount only (removed memorySize)
 * - Consolidated to use createdAt field exclusively (removed timestamp redundancy)
 * - Local agent messageCount updates: analyzes incoming messages to identify sender and increments count
 * - Real-time badge updates: messageCount reflects agent activity during live chat sessions
 * - CSS-based agent highlighting with .selected class for visual emphasis
 * - Conditional message filtering in WorldChat component based on selectedAgent prop
 * - Toggle selection logic: clicking selected agent deselects it and shows all world messages
 * 
 * Changes:
 * - Replaced mock data with API calls to api.ts
 * - Added loading and error states for better UX
 * - Implemented async data fetching with error handling
 * - Added proper TypeScript interfaces
 * - Enhanced state management following AppRun patterns
 * - Updated to use messageCount for message count display
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
 * - Implemented createdAt-based ascending sort for chronological message display
 * - Updated to use $ directive pattern throughout (gear button, agent clicks)
 * - Added dynamic settings panel with world/agent selection
 * - Removed notification checkbox, replaced with contextual settings
 * - Enhanced settings to show world or agent-specific information
 * - Refactored to use WorldChat and WorldSettings components for better separation of concerns
 * - Maintained all functionality while improving component modularity
 * - Set world settings as default display in settings panel for better UX
 * - Removed memorySize dependency from SSE client and frontend for simplification
 * - Consolidated agent tracking to use messageCount only
 * - Consolidated timestamp/createdAt fields to use createdAt exclusively throughout codebase
 * - Enhanced agent message badge updates: automatically increment messageCount when agents send messages
 * - Added local state updates for agent messageCount in handleMessage only
 * - Streamlined message tracking: removed duplicate logic, handleMessage handles all agent count updates
 * - Added agent selection highlighting with CSS styling and selected class management
 * - Implemented message filtering in WorldChat component based on selectedAgent
 * - Added toggle selection behavior: clicking selected agent deselects and shows all messages
 * - Enhanced visual feedback with enlarged avatars and highlight effects for selected agents
 */

import { app, Component } from 'apprun';
import { getWorld, getAgentMemory, clearAgentMemory, type Agent, type Message } from '../api';
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
  type SSEComponentState
} from '../sse-client';
import WorldChat from '../components/world-chat';
import WorldSettings from '../components/world-settings';

// Extended Agent interface for UI-specific properties
interface WorldAgent extends Agent {
  spriteIndex: number;
  messageCount: number;
  provider?: string;
  model?: string;
  temperature?: number;
  systemPrompt?: string;
}

interface WorldComponentState extends SSEComponentState {
  worldName: string;
  world: { name: string; agents: WorldAgent[]; llmCallLimit?: number } | null;
  agents: WorldAgent[];
  userInput: string;
  loading: boolean;
  error: string | null;
  agentsLoading: boolean;
  messagesLoading: boolean;
  isSending: boolean;
  isWaiting: boolean;
  selectedSettingsTarget: 'world' | 'agent' | null;
  selectedAgent: WorldAgent | null;
  activeAgent: { spriteIndex: number; name: string } | null;
}

export default class WorldComponent extends Component<WorldComponentState> {

  is_global_event = () => true;

  state = async (): Promise<WorldComponentState> => {
    return {
      worldName: 'World',
      world: null,
      agents: [],
      messages: [],
      userInput: '',
      loading: true,
      error: null,
      agentsLoading: true,
      messagesLoading: false,
      isSending: false,
      isWaiting: false,
      selectedSettingsTarget: 'world',
      selectedAgent: null,
      activeAgent: null
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
                const isSelected = state.selectedSettingsTarget === 'agent' && state.selectedAgent?.id === agent.id;
                return (
                  <div key={`agent-${agent.id || index}`} className={`agent-item ${isSelected ? 'selected' : ''}`} $onclick={['select-agent-settings', agent]}>
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
              isWaiting={state.isWaiting}
              activeAgent={state.activeAgent}
              selectedAgent={state.selectedSettingsTarget === 'agent' ? state.selectedAgent : null}
            />

            {/* chat settings */}
            <WorldSettings
              world={state.world}
              selectedSettingsTarget={state.selectedSettingsTarget}
              selectedAgent={state.selectedAgent}
              totalMessages={state.messages.length}
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
          error: null,
          isWaiting: false,
          activeAgent: null
        };

        // Load world data including agents
        const world = await getWorld(worldName);

        // Create messageMap to deduplicate messages from all agents
        const messageMap = new Map();

        // Transform agents with UI properties and collect their memory items
        const worldAgents: WorldAgent[] = await Promise.all(world.agents.map(async (agent, index) => {
          // Add agent's memory items to messageMap for deduplication
          if (agent.memory && Array.isArray(agent.memory)) {
            agent.memory.forEach((memoryItem: any) => {
              // Use a combination of createdAt and text as unique key to avoid duplicates
              const messageKey = `${memoryItem.createdAt || Date.now()}-${memoryItem.text || memoryItem.content || ''}`;

              // Only add if not already in map
              if (!messageMap.has(messageKey)) {
                // Preserve original sender from memory, fallback to agent name if not available
                const originalSender = memoryItem.sender || agent.name;

                // Determine message type based on sender - only HUMAN messages should be 'user' type
                let messageType = 'agent';
                if (originalSender === 'HUMAN' || originalSender === 'USER') {
                  messageType = 'user';
                }

                messageMap.set(messageKey, {
                  id: memoryItem.id || messageKey,
                  sender: originalSender,
                  text: memoryItem.text || memoryItem.content || '',
                  createdAt: memoryItem.createdAt || new Date().toISOString(),
                  type: messageType,
                  streamComplete: true
                });
              }
            });
          }

          // Use system prompt directly from agent data
          const systemPrompt = agent.systemPrompt || '';

          return {
            ...agent,
            spriteIndex: index % 9, // Cycle through 9 sprite indices
            messageCount: agent.memory?.length || 0, // Use agent's memory length for message count
            provider: agent.provider,
            model: agent.model,
            temperature: agent.temperature,
            systemPrompt: systemPrompt
          };
        }));

        // Convert messageMap to array and sort by createdAt ascending
        const sortedMessages = Array.from(messageMap.values()).sort((a, b) => {
          const timeA = new Date(a.createdAt).getTime();
          const timeB = new Date(b.createdAt).getTime();
          return timeA - timeB;
        });

        yield {
          ...state,
          worldName,
          world: {
            name: worldName,
            agents: worldAgents,
            llmCallLimit: (world as any).llmCallLimit || (world as any).turnLimit // Use turnLimit as fallback
          },
          agents: worldAgents,
          messages: sortedMessages,
          agentsLoading: false,
          loading: false,
          error: null,
          isWaiting: false,
          selectedSettingsTarget: 'world',
          selectedAgent: null,
          activeAgent: null
        };

      } catch (error: any) {
        yield {
          ...state,
          worldName,
          world: { name: worldName, agents: [], llmCallLimit: undefined },
          loading: false,
          error: error.message || 'Failed to load world data',
          isWaiting: false,
          selectedSettingsTarget: 'world',
          selectedAgent: null,
          activeAgent: null
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

    'select-agent-settings': (state: WorldComponentState, agent: WorldAgent): WorldComponentState => {
      // If clicking on already selected agent, deselect it (show world settings)
      if (state.selectedSettingsTarget === 'agent' && state.selectedAgent?.id === agent.id) {
        return {
          ...state,
          selectedSettingsTarget: 'world',
          selectedAgent: null
        };
      }

      // Otherwise, select the agent
      return {
        ...state,
        selectedSettingsTarget: 'agent',
        selectedAgent: agent,
        userInput: '@' + agent.name + ' ' // Pre-fill input with agent mention 
      };
    },

    // Clear messages handlers
    'clear-agent-messages': async (state: WorldComponentState, agent: WorldAgent): Promise<WorldComponentState> => {
      try {
        await clearAgentMemory(state.worldName, agent.name);

        // Update agent's message count and remove agent's messages from display
        const updatedAgents = state.agents.map(a =>
          a.id === agent.id ? { ...a, messageCount: 0 } : a
        );

        // Remove agent's messages from the message list
        const filteredMessages = state.messages.filter(msg => msg.sender !== agent.name);

        // Update selected agent if it's the same one
        const updatedSelectedAgent = state.selectedAgent?.id === agent.id
          ? { ...state.selectedAgent, messageCount: 0 }
          : state.selectedAgent;

        // Update world object with updated agents
        const updatedWorld = state.world ? {
          ...state.world,
          agents: updatedAgents
        } : null;

        return {
          ...state,
          world: updatedWorld,
          agents: updatedAgents,
          messages: filteredMessages,
          selectedAgent: updatedSelectedAgent
        };
      } catch (error: any) {
        return {
          ...state,
          error: error.message || 'Failed to clear agent messages'
        };
      }
    },

    'clear-world-messages': async (state: WorldComponentState): Promise<WorldComponentState> => {
      try {
        // Clear messages for all agents
        await Promise.all(
          state.agents.map(agent => clearAgentMemory(state.worldName, agent.name))
        );

        // Update all agents' message counts
        const updatedAgents = state.agents.map(agent => ({ ...agent, messageCount: 0 }));

        // Update selected agent if any
        const updatedSelectedAgent = state.selectedAgent
          ? { ...state.selectedAgent, messageCount: 0 }
          : null;

        // Update world object with updated agents
        const updatedWorld = state.world ? {
          ...state.world,
          agents: updatedAgents
        } : null;

        return {
          ...state,
          world: updatedWorld,
          agents: updatedAgents,
          messages: [], // Clear all messages
          selectedAgent: updatedSelectedAgent
        };
      } catch (error: any) {
        return {
          ...state,
          error: error.message || 'Failed to clear world messages'
        };
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
        createdAt: new Date().toISOString(),
        worldName: state.worldName
      };

      // Add user message, clear input, and show waiting indicator
      const newState = {
        ...state,
        messages: [...state.messages, userMessage],
        userInput: '',
        isSending: true,
        isWaiting: true
      };

      try {
        // Send message via SSE using the stored message text
        await sendChatMessage(state.worldName, messageText, 'HUMAN');

        return {
          ...newState,
          isSending: false
          // isWaiting will be set to false when streaming starts
        };
      } catch (error: any) {
        return {
          ...newState,
          isSending: false,
          isWaiting: false,
          error: error.message || 'Failed to send message'
        };
      }
    },

    // SSE Event Handlers - wrapped for WorldComponentState compatibility
    'handleStreamStart': (state: WorldComponentState, data: any): WorldComponentState => {
      const baseState = handleStreamStart(state as any, data) as WorldComponentState;

      // Find the agent that's starting to stream
      // data structure: { messageId, sender, worldName }
      const agentName = data.sender;
      const agent = state.agents.find(a => a.name === agentName);

      // Hide waiting indicator when streaming starts and set active agent
      return {
        ...baseState,
        isWaiting: false,
        activeAgent: agent ? { spriteIndex: agent.spriteIndex, name: agent.name } : null
      };
    },
    'handleStreamChunk': (state: WorldComponentState, data: any): WorldComponentState => {
      return handleStreamChunk(state as any, data) as WorldComponentState;
    },
    'handleStreamEnd': (state: WorldComponentState, data: any): WorldComponentState => {
      const baseState = handleStreamEnd(state as any, data) as WorldComponentState;

      // Extract agent name from the stream end data
      const agentName = data.sender;

      let finalState = {
        ...baseState,
        activeAgent: null // Clear active agent when streaming ends
      };

      // Update agent's messageCount when stream completes
      if (agentName && agentName !== 'HUMAN') {
        const updatedAgents = finalState.agents.map(agent => {
          if (agent.name === agentName) {
            return {
              ...agent,
              messageCount: agent.messageCount + 1
            };
          }
          return agent;
        });

        // Update world object with updated agents
        const updatedWorld = finalState.world ? {
          ...finalState.world,
          agents: updatedAgents
        } : null;

        // Update selected agent if it's the same one
        const updatedSelectedAgent = finalState.selectedAgent?.name === agentName
          ? { ...finalState.selectedAgent, messageCount: finalState.selectedAgent.messageCount + 1 }
          : finalState.selectedAgent;

        finalState = {
          ...finalState,
          world: updatedWorld,
          agents: updatedAgents,
          selectedAgent: updatedSelectedAgent
        };
      }

      return finalState;
    },
    'handleStreamError': (state: WorldComponentState, data: any): WorldComponentState => {
      const baseState = handleStreamError(state as any, data) as WorldComponentState;
      // Clear active agent when streaming errors
      return {
        ...baseState,
        activeAgent: null
      };
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
    }
  };
}

