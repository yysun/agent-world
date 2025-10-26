/**
 * World Component - Real-time world interface with agents and chat
 *
 * Features:
 * - Centered agent list with message badges and real-time SSE chat streaming
 * - Right panel always shows Chat History (no settings panel toggle)
 * - Agent selection highlighting with message filtering and CRUD modals
 * - AppRun MVU pattern with modular components and extracted handlers
 */

import { app, Component, safeHTML } from 'apprun';
import type { WorldComponentState, Agent } from '../types';
import type { WorldEventName } from '../types/events';
import WorldChat from '../components/world-chat';
import WorldChatHistory from '../components/world-chat-history';
import AgentEdit from '../components/agent-edit';
import WorldEdit from '../components/world-edit';
import { worldUpdateHandlers } from './World.update';

export default class WorldComponent extends Component<WorldComponentState, WorldEventName> {
  //                                                   ^^^^^^^^^^^^^^^^^^^  ^^^^^^^^^^^^^^^^
  //                                                   State type           Event type (AppRun native typed events)

  override state = {
    worldName: 'World',
    world: null,
    messages: [],
    userInput: '',
    loading: true,
    error: null,
    messagesLoading: false,
    isSending: false,
    isWaiting: false,
    selectedSettingsTarget: 'chat' as const,
    selectedAgent: null,
    activeAgent: null,
    showAgentEdit: false,
    agentEditMode: 'create' as const,
    selectedAgentForEdit: null,
    showWorldEdit: false,
    worldEditMode: 'edit' as const,
    selectedWorldForEdit: null,
    chatToDelete: null,
    connectionStatus: 'disconnected',
    needScroll: false,
    currentChat: null,
    editingMessageId: null,
    editingText: '',
    messageToDelete: null,
    activeAgentFilters: [] as string[]  // Per-agent badge toggle filter state
  };

  override view = (state: WorldComponentState) => {

    // Guard clauses for loading and error states
    // if (state.loading) {
    //   return (
    //     <div className="world-container">
    //       <div className="world-columns">
    //         <div className="chat-column">
    //           <div className="agents-section">
    //             <div className="agents-row">
    //               <div className="loading-agents">Loading...</div>
    //             </div>
    //           </div>
    //           <div className="loading-state">
    //             <p>Loading world data...</p>
    //           </div>
    //         </div>
    //         <div className="settings-column">
    //           <div className="settings-section">
    //             <div className="settings-row">
    //               <button className="world-settings-btn" title="World Settings">
    //                 <span className="world-gear-icon">⚙</span>
    //               </button>
    //             </div>
    //           </div>
    //         </div>
    //       </div>
    //     </div>
    //   );
    // }

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
                  {!state.world?.agents?.length ? (
                    <div className="no-agents">No agents in this world:
                      <span> {safeHTML('<a href="#" onclick="app.run(\'open-agent-create\')">Create Agent</a>')}</span>
                    </div>
                  ) : (
                    <div className="agents-list">
                      {state.world?.agents.map((agent, index) => {
                        const isSelected = state.selectedSettingsTarget === 'agent' && state.selectedAgent?.id === agent.id;
                        const isFilterActive = state.activeAgentFilters.includes(agent.id);
                        return (
                          <div key={`agent-${agent.id || index}`} className={`agent-item ${isSelected ? 'selected' : ''}`} $onclick={['open-agent-edit', agent]}>
                            <div className="agent-sprite-container">
                              <div className={`agent-sprite sprite-${agent.spriteIndex}`}></div>
                              <div
                                className={`message-badge ${isFilterActive ? 'active' : ''}`}
                                $onclick={['toggle-agent-filter', agent.id]}
                              >
                                {agent.messageCount}
                              </div>
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
              needScroll={state.needScroll}
              activeAgent={state.activeAgent}
              selectedAgent={state.selectedSettingsTarget === 'agent' ? state.selectedAgent : null}
              currentChat={state.currentChat?.name}
              editingMessageId={state.editingMessageId}
              editingText={state.editingText}
              agentFilters={state.activeAgentFilters}
            />
          </div>

          <div className="settings-column">
            <div className="settings-section">
              <div className="settings-row">
                <button
                  className="world-settings-btn"
                  title="Create New Agent"
                  $onclick="open-agent-create"
                >
                  <span className="world-gear-icon">+</span>
                </button>
                <button
                  className="world-settings-btn"
                  title="World Settings"
                  $onclick="open-world-edit"
                  style={{ marginLeft: '8px' }}
                >
                  <span className="world-gear-icon">⚙</span>
                </button>
                <button
                  className="world-settings-btn"
                  $onclick={['export-world-markdown', { worldName: state.world?.name }]}
                  title="Export world to markdown file"
                  style={{ marginLeft: '8px' }}
                >
                  <span className="world-gear-icon">↓</span>
                </button>
                <button
                  className="world-settings-btn"
                  $onclick={['view-world-markdown', { worldName: state.world?.name }]}
                  title="View world markdown in new tab"
                  style={{ marginLeft: '4px' }}
                >
                  <span className="world-gear-icon">&#x1F5CE;</span>
                </button>
              </div>
            </div>

            <WorldChatHistory
              world={state.world}
            />
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

        {/* Chat Delete Confirmation Modal */}
        {state.chatToDelete && (
          <div className="modal-overlay" $onclick="chat-history-hide-modals">
            <div className="modal-content chat-history-modal" onclick={(e: Event) => e.stopPropagation()}>
              <button
                className="modal-close-btn"
                $onclick="chat-history-hide-modals"
                title="Close"
              >
                ×
              </button>
              <h3>Delete Chat</h3>
              <p className="delete-confirmation-text">
                Are you sure you want to delete chat <span className="delete-confirmation-name">"{state.chatToDelete.name}"</span>?
              </p>
              <p className="warning delete-confirmation-warning">
                ⚠️ This action cannot be undone.
              </p>
              <div className="form-actions">
                <button
                  className="btn-danger"
                  $onclick={['delete-chat-from-history', { chatId: state.chatToDelete.id }]}
                >
                  Delete Chat
                </button>
                <button className="btn-secondary" $onclick="chat-history-hide-modals">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Message Delete Confirmation Modal */}
        {state.messageToDelete && (
          <div className="modal-overlay" $onclick="hide-delete-message-confirm">
            <div className="modal-content chat-history-modal" onclick={(e: Event) => e.stopPropagation()}>
              <button
                className="modal-close-btn"
                $onclick="hide-delete-message-confirm"
                title="Close"
              >
                ×
              </button>
              <h3>Delete Message</h3>
              <p className="delete-confirmation-text">
                Are you sure you want to delete this message?
              </p>
              <p className="warning delete-confirmation-warning">
                ⚠️ This action will delete the message and all messages after it. This cannot be undone.
              </p>
              <div className="form-actions">
                <button
                  className="btn-danger"
                  $onclick="delete-message-confirmed"
                >
                  Delete Message
                </button>
                <button className="btn-secondary" $onclick="hide-delete-message-confirm">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // we could select events to be global, but for simplicity we keep them local
  override is_global_event = () => true;

  override update = {
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

    // Badge toggle filter handler - toggle agent filter on/off
    'toggle-agent-filter': (state: WorldComponentState, agentId: string, e?: Event): WorldComponentState => {
      e?.stopPropagation(); // Prevent triggering parent agent-item click

      const currentFilters = state.activeAgentFilters || [];
      const isActive = currentFilters.includes(agentId);

      return {
        ...state,
        activeAgentFilters: isActive
          ? currentFilters.filter(id => id !== agentId)  // Remove if active
          : [...currentFilters, agentId]  // Add if not active
      };
    },

  };
}
