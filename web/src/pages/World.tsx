/**
 * World Component - Real-time world interface with agents and chat
 * 
 * Core Features:
 * - Centered agent list with message badges showing activity count
 * - Real-time SSE chat streaming with agent responses and visual indicators
 * - Interactive settings panel for world/agent configuration
 * - Agent selection highlighting with message filtering
 * - Agent Edit popup for CRUD operations with modal design
 * - Smart message deduplication using messageMap with createdAt sorting
 * 
 * Architecture:
 * - AppRun MVU pattern with async state initialization
 * - Modular components: WorldChat, WorldSettings, AgentEdit, WorldEdit
 * - TypeScript SSE client integration with proper error handling
 * - Extracted agent handlers to world-update.ts module
 * - Extracted world handlers to world-update-world.ts module
 * - State-driven rendering with loading/error states
 * 
 * Key Implementations:
 * - Message filtering: shows agent-specific messages when agent selected
 * - Real-time badge updates: increments messageCount on agent activity
 * - Toggle selection: click selected agent to deselect and show all messages
 * - Keyboard support: Escape key closes agent edit popup
 * - Agent memory consolidation with fromAgentId tracking
 * - User input pre-fill with @agent mentions when agent selected
 * 
 * Changes:
 * - Fixed create-new-chat handler to preserve current settings target instead of forcing world settings
 * - New chat creation now keeps current side panel state (chat history, agent settings, etc.)
 */

import { app, Component, safeHTML } from 'apprun';
import type { WorldComponentState, Agent } from '../types';
import { DEFAULT_CHAT_HISTORY_STATE } from '../types';
import WorldChat from '../components/world-chat';
import WorldSettings from '../components/world-settings';
import WorldChatHistory from '../components/world-chat-history';
import AgentEdit from '../components/agent-edit';
import WorldEdit from '../components/world-edit';
import { worldUpdateHandlers } from './World.update';
import api from '../api';
import { getCurrentChatState } from '../types';

export default class WorldComponent extends Component<WorldComponentState> {

  state = async (): Promise<WorldComponentState> => {
    // Minimal default state; all async world/chat loading is handled in /World handler
    return {
      worldName: 'World',
      world: null,
      messages: [],
      userInput: '',
      loading: true,
      error: null,
      messagesLoading: false,
      isSending: false,
      isWaiting: false,
      selectedSettingsTarget: 'chat',
      selectedAgent: null,
      activeAgent: null,
      showAgentEdit: false,
      agentEditMode: 'create',
      selectedAgentForEdit: null,
      showWorldEdit: false,
      worldEditMode: 'edit',
      selectedWorldForEdit: null,
      chatHistory: { ...DEFAULT_CHAT_HISTORY_STATE },
      connectionStatus: 'disconnected',
      wsError: null,
      needScroll: false
    };
  };

  view = (state: WorldComponentState) => {
    // Guard clauses for loading and error states
    if (state.loading) {
      return (
        <div className="world-container">
          <div className="world-columns">
            <div className="chat-column">
              <div className="agents-section">
                <div className="agents-row">
                  <div className="loading-agents">Loading...</div>
                </div>
              </div>
              <div className="loading-state">
                <p>Loading world data...</p>
              </div>
            </div>
            <div className="settings-column">
              <div className="settings-section">
                <div className="settings-row">
                  <button className="world-settings-btn" title="World Settings">
                    <span className="world-gear-icon">⚙</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (state.error) {
      return (
        <div className="world-container">
          <div className="world-columns">
            <div className="chat-column">
              <div className="agents-section">
                <div className="agents-row">
                  <div className="no-agents">Error</div>
                </div>
              </div>
              <div className="error-state">
                <p>Error: {state.error}</p>
                <button $onclick={['/World', state.worldName]}>Retry</button>
              </div>
            </div>
            <div className="settings-column">
              <div className="settings-section">
                <div className="settings-row">
                  <button className="world-settings-btn" title="World Settings">
                    <span className="world-gear-icon">⚙</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Main content view
    return (
      <div className="world-container">
        <div className="world-columns">
          <div className="chat-column">
            <div className="agents-section">
              <div className="agents-row agents-row-with-back">
                <div className="back-button-container">
                  <a href="/">
                    <button className="back-button" title="Back to Worlds">
                      <span className="world-back-icon">←</span>
                    </button>
                  </a>
                </div>
                <div className="agents-list-container">
                  {state.loading ? (
                    <div className="loading-agents">Loading agents...</div>
                  ) : !(state.world?.agents?.length) ? (
                    <div className="no-agents">No agents in this world:
                      <span> {safeHTML('<a href="#" onclick="app.run(\'open-agent-create\')">Create Agent</a>')}</span>
                    </div>
                  ) : (
                    <div className="agents-list">
                      {state.world?.agents.map((agent, index) => {
                        const isSelected = state.selectedSettingsTarget === 'agent' && state.selectedAgent?.id === agent.id;
                        return (
                          <div key={`agent-${agent.id || index}`} className={`agent-item ${isSelected ? 'selected' : ''}`} $onclick={['select-agent-settings', agent]}>
                            <div className="agent-sprite-container">
                              <div className={`agent-sprite sprite-${agent.spriteIndex}`}></div>
                              <div className="message-badge">{agent.messageCount}</div>
                            </div>
                            <div className="agent-name">{agent.name}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <WorldChat
              worldName={state.worldName}
              messages={state.messages}
              userInput={state.userInput}
              messagesLoading={state.messagesLoading}
              isSending={state.isSending}
              isWaiting={state.isWaiting}
              activeAgent={state.activeAgent}
              selectedAgent={state.selectedSettingsTarget === 'agent' ? state.selectedAgent : null}
              currentChat={getCurrentChatState(state.world)}
            />
          </div>

          <div className="settings-column">
            <div className="settings-section">
              <div className="settings-row">
                <button
                  className="world-settings-btn"
                  title="Toggle Settings/Chat History"
                  $onclick="toggle-settings-chat-history"
                >
                  <span className="world-gear-icon">⊕</span>
                </button>
                <button
                  className="world-settings-btn"
                  $onclick={['export-world-markdown', state.world.name]}
                  title="Export world to markdown file"
                  style={{ marginLeft: '8px' }}
                >
                  <span className="world-gear-icon">↓</span>
                </button>
                <button
                  className="world-settings-btn"
                  $onclick={['view-world-markdown', state.world.name]}
                  title="View world markdown in new tab"
                  style={{ marginLeft: '4px' }}
                >
                  <span className="world-gear-icon">&#x1F5CE;</span>
                </button>
              </div>
            </div>

            {state.selectedSettingsTarget === 'chat' ? (
              <WorldChatHistory
                worldName={state.worldName}
                chatHistory={state.chatHistory}
              />
            ) : (
              <WorldSettings
                world={state.world}
                selectedSettingsTarget={state.selectedSettingsTarget}
                selectedAgent={state.selectedAgent}
                totalMessages={(state.messages || []).length}
              />
            )}
          </div>
        </div>

        {state.showAgentEdit &&
          <AgentEdit
            agent={state.selectedAgentForEdit}
            mode={state.agentEditMode}
            worldName={state.worldName}
            parentComponent={this}
          />
        }

        {state.showWorldEdit &&
          <WorldEdit
            world={state.selectedWorldForEdit}
            mode={state.worldEditMode}
            parentComponent={this}
          />
        }
      </div>
    );
  };

  // we could select events to be global, but for simplicity we keep them local
  is_global_event = () => true;

  update = {
    // Route handler and message handlers (merged)
    ...worldUpdateHandlers,

    // New simplified agent edit event handlers
    'open-agent-create': (state: WorldComponentState): WorldComponentState => ({
      ...state,
      showAgentEdit: true,
      agentEditMode: 'create',
      selectedAgentForEdit: null
    }),

    'open-agent-edit': (state: WorldComponentState, agent: Agent): WorldComponentState => ({
      ...state,
      showAgentEdit: true,
      agentEditMode: 'edit',
      selectedAgentForEdit: agent
    }),

    'open-agent-delete': (state: WorldComponentState, agent: Agent): WorldComponentState => ({
      ...state,
      showAgentEdit: true,
      agentEditMode: 'delete',
      selectedAgentForEdit: agent
    }),

    'close-agent-edit': (state: WorldComponentState): WorldComponentState => ({
      ...state,
      showAgentEdit: false
    }),

    // World edit event handlers (simplified)
    'open-world-edit': (state: WorldComponentState): WorldComponentState => ({
      ...state,
      showWorldEdit: true,
      worldEditMode: 'edit',
      selectedWorldForEdit: state.world
    }),

    'close-world-edit': (state: WorldComponentState): WorldComponentState => ({
      ...state,
      showWorldEdit: false
    }),

    'agent-saved': (state: WorldComponentState): void => {
      // Refresh agents list and close modal
      location.reload(); // Reload to refresh agents list
    },

    'agent-deleted': (state: WorldComponentState): void => {
      // Refresh agents list and close modal
      location.reload();
    },

    // Handler for loading a chat from history
    'load-chat-from-history': async (state: WorldComponentState, chatId: string): Promise<WorldComponentState> => {
      try {
        
        await api.setCurrentChat(state.worldName, chatId);
        const world = await api.getWorld(state.worldName);
        return { ...state, world }
      } catch (error) {
        console.error('Failed to load chat:', error);
        return {
          ...state,
          error: `Failed to load chat: ${error.message}`
        };
      }
    },

    // Handler for deleting a chat
    'delete-chat-from-history': async (state: WorldComponentState, chatId: string): Promise<WorldComponentState> => {
      try {
        await api.deleteChat(state.worldName, chatId);
        const world = await api.getWorld(state.worldName);
        return { ...state, world }
      } catch (error) {
        console.error('Failed to delete chat:', error);
        return {
          ...state,
          error: `Failed to delete chat: ${error.message}`
        };
      }
    }
  };
}

