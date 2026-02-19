/**
 * World Component - Real-time world interface with agents and chat
 *
 * Features:
 * - Centered agent list with message badges and real-time SSE chat streaming
 * - Right panel always shows Chat History (no settings panel toggle)
 * - Agent selection highlighting with message filtering and CRUD modals
 * - AppRun MVU pattern with modular components and extracted handlers
 * - Tailwind CSS utilities for layout, spacing, and responsive design
 * 
 * Implementation:
 * - Flexbox layout with Tailwind utilities
 * - Responsive grid and spacing with Tailwind classes
 * - Preserves Doodle CSS for buttons and decorative elements
 * - Custom CSS for agent sprites, animations, and message styling
 * 
 * Recent Changes:
 * - 2026-02-19: Added chat-history search query state wiring for session filtering in the right panel.
 * - 2026-02-14: Added generic HITL approval modal for option-list system prompts with web response submission wiring.
 * - 2026-02-14: Added web send/stop composer wiring via `currentChatId` and `isStopping` props.
 * - 2026-02-08: Removed legacy manual tool-intervention dialog rendering and state wiring
 * - 2026-02-08: Pass world agents into WorldChat for correct per-agent message avatars
 * - Integrated Tailwind CSS utilities for layout and spacing
 * - Added flexbox utilities for component structure
 * - Migrated modal overlays to Tailwind positioning
 * - Preserved agent sprites and animation CSS
 * - Maintained Doodle borders on buttons and fieldsets
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
    isStopping: false,
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
    needScroll: false,  // Always false by default, set true only when new content added
    currentChat: null,
    chatSearchQuery: '',
    editingMessageId: null,
    editingText: '',
    messageToDelete: null,
    activeAgentFilters: [] as string[],  // Per-agent badge toggle filter state
    agentActivities: {},

    // Streaming state (Phase 1)
    pendingStreamUpdates: new Map<string, string>(),
    debounceFrameId: null,

    // Activity state (Phase 1)
    activeTools: [],
    isBusy: false,
    elapsedMs: 0,
    activityStartTime: null,
    elapsedIntervalId: null,

    // HITL approval prompt state
    hitlPromptQueue: [],
    submittingHitlRequestId: null
  };

  override view = (state: WorldComponentState) => {
    const activeHitlPrompt = state.hitlPromptQueue?.length ? state.hitlPromptQueue[0] : null;

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
        <div className="world-container flex flex-col h-screen">
          <div className="world-columns flex flex-1 overflow-hidden">
            <div className="chat-column flex flex-col flex-1">
              <div className="agents-section">
                <div className="agents-row flex items-center gap-4 px-4 py-2">
                  <div className="text-text-secondary">Error</div>
                </div>
              </div>
              <div className="error-state flex items-center justify-center flex-1 p-4">
                <div className="text-center">
                  <p className="text-lg text-text-primary mb-4">Error: {state.error}</p>
                  <button className="btn btn-primary px-6 py-3" $onclick={['/World', state.worldName]}>Retry</button>
                </div>
              </div>
            </div>
            <div className="settings-column w-96">
              <div className="settings-section p-4">
                <div className="settings-row flex gap-2">
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
      <div className="world-container flex flex-col h-screen">
        <div className="world-columns flex flex-1 overflow-hidden">
          <div className="chat-column flex flex-col flex-1">
            <div className="agents-section">
              <div className="agents-row agents-row-with-back flex items-center gap-4 px-4 py-2">
                <div className="back-button-container">
                  <a href="/">
                    <button className="back-button flex items-center justify-center" title="Back to Worlds">
                      <span className="world-back-icon">←</span>
                    </button>
                  </a>
                </div>
                <div className="agents-list-container flex-1">
                  {!state.world?.agents?.length ? (
                    <div className="no-agents text-text-secondary">No agents in this world:
                      <span> {safeHTML('<a href="#" onclick="app.run(\'open-agent-create\')">Create Agent</a>')}</span>
                    </div>
                  ) : (
                    <div className="agents-list flex flex-wrap gap-6 justify-center items-center">
                      {state.world?.agents.map((agent, index) => {
                        const isSelected = state.selectedSettingsTarget === 'agent' && state.selectedAgent?.id === agent.id;
                        const isFilterActive = state.activeAgentFilters.includes(agent.id);
                        return (
                          <div key={`agent-${agent.id || index}`} className={`agent-item ${isSelected ? 'selected' : ''} flex flex-col items-center gap-1 px-4 cursor-pointer`} $onclick={['open-agent-edit', agent]}>
                            <div className="agent-sprite-container relative">
                              <div className={`agent-sprite sprite-${agent.spriteIndex} w-16 h-16`}></div>
                              <div
                                className={`message-badge ${isFilterActive ? 'active' : ''} absolute`}
                                $onclick={['toggle-agent-filter', agent.id]}
                              >
                                {agent.messageCount}
                              </div>
                            </div>
                            <div className="agent-name text-sm text-center">{agent.name}</div>
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
              rawMessages={state.rawMessages}
              userInput={state.userInput}
              messagesLoading={state.messagesLoading}
              isSending={state.isSending}
              isWaiting={state.isWaiting}
              needScroll={state.needScroll}
              activeAgent={state.activeAgent}
              agents={state.world?.agents || []}
              selectedAgent={state.selectedSettingsTarget === 'agent' ? state.selectedAgent : null}
              currentChat={state.currentChat?.name}
              currentChatId={state.currentChat?.id || null}
              editingMessageId={state.editingMessageId}
              editingText={state.editingText}
              agentFilters={state.activeAgentFilters}
              isBusy={state.isBusy || state.isWaiting}
              elapsedMs={state.elapsedMs}
              activeTools={state.activeTools}
              isStopping={state.isStopping}
            />
          </div>

          <div className="settings-column w-96">
            <div className="settings-section p-4">
              <div className="settings-row flex gap-2">
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
              chatSearchQuery={state.chatSearchQuery}
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

        {activeHitlPrompt && (
          <div className="modal-overlay fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="modal-content chat-history-modal bg-white rounded-lg p-6 max-w-md" onclick={(e: Event) => e.stopPropagation()}>
              <h3 className="text-xl font-bold mb-4">{activeHitlPrompt.title || 'Approval required'}</h3>
              <p className="delete-confirmation-text whitespace-pre-wrap mb-4">
                {(activeHitlPrompt.message || 'Please choose an option to continue.').replace(/\n\s*\n+/g, '\n')}
              </p>
              <div className="form-actions flex gap-2 justify-end flex-nowrap overflow-x-auto pb-1">
                {activeHitlPrompt.options.map((option) => {
                  const isSubmitting = state.submittingHitlRequestId === activeHitlPrompt.requestId;
                  return (
                    <button
                      key={option.id}
                      className="btn-secondary px-4 py-2 rounded shrink-0"
                      disabled={isSubmitting}
                      $onclick={['respond-hitl-option', {
                        requestId: activeHitlPrompt.requestId,
                        optionId: option.id,
                        chatId: activeHitlPrompt.chatId
                      }]}
                    >
                      <div className="font-bold">{option.label}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Chat Delete Confirmation Modal */}
        {state.chatToDelete && (
          <div className="modal-overlay fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" $onclick="chat-history-hide-modals">
            <div className="modal-content chat-history-modal bg-white rounded-lg p-6 max-w-md" onclick={(e: Event) => e.stopPropagation()}>
              <button
                className="modal-close-btn absolute top-4 right-4 text-2xl"
                $onclick="chat-history-hide-modals"
                title="Close"
              >
                ×
              </button>
              <h3 className="text-xl font-bold mb-4">Delete Chat</h3>
              <p className="delete-confirmation-text mb-2">
                Are you sure you want to delete chat <span className="delete-confirmation-name font-bold">"{state.chatToDelete.name}"</span>?
              </p>
              <p className="warning delete-confirmation-warning text-system mb-4">
                ⚠️ This action cannot be undone.
              </p>
              <div className="form-actions flex gap-2 justify-end">
                <button
                  className="btn-danger px-4 py-2 rounded"
                  $onclick={['delete-chat-from-history', { chatId: state.chatToDelete.id }]}
                >
                  Delete Chat
                </button>
                <button className="btn-secondary px-4 py-2 rounded" $onclick="chat-history-hide-modals">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Message Delete Confirmation Modal */}
        {state.messageToDelete && (
          <div className="modal-overlay fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" $onclick="hide-delete-message-confirm">
            <div className="modal-content chat-history-modal bg-white rounded-lg p-6 max-w-md" onclick={(e: Event) => e.stopPropagation()}>
              <button
                className="modal-close-btn absolute top-4 right-4 text-2xl"
                $onclick="hide-delete-message-confirm"
                title="Close"
              >
                ×
              </button>
              <h3 className="text-xl font-bold mb-4">Delete Message</h3>
              <p className="delete-confirmation-text mb-2">
                Are you sure you want to delete this message?
              </p>
              <p className="warning delete-confirmation-warning text-system mb-4">
                ⚠️ This action will delete the message and all messages after it. This cannot be undone.
              </p>
              <div className="form-actions flex gap-2 justify-end">
                <button
                  className="btn-danger px-4 py-2 rounded"
                  $onclick="delete-message-confirmed"
                >
                  Delete Message
                </button>
                <button className="btn-secondary px-4 py-2 rounded" $onclick="hide-delete-message-confirm">
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

  /**
   * Phase 2: Cleanup lifecycle - cancel RAF and timers on unmount
   */
  override unload = () => {
    if (this.state.debounceFrameId !== null) {
      cancelAnimationFrame(this.state.debounceFrameId);
    }
    if (this.state.elapsedIntervalId !== null) {
      clearInterval(this.state.elapsedIntervalId);
    }
  };

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
