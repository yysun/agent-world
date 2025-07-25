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
 */

import { app, Component } from 'apprun';
import type { WorldComponentState, Agent } from '../types';
import WorldChat from '../components/world-chat';
import WorldSettings from '../components/world-settings';
import AgentEdit from '../components/agent-edit';
import WorldEdit from '../components/world-edit';
import { agentUpdateHandlers } from '../updates/world-update-agent';
import { worldUpdateHandlers } from '../updates/world-update-world';
import { worldInitHandlers } from '../updates/world-update-init';
import { worldMessageHandlers } from '../updates/world-update-messages';

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
      messagesLoading: false,
      isSending: false,
      isWaiting: false,
      selectedSettingsTarget: 'world',
      selectedAgent: null,
      activeAgent: null,
      agentEdit: {
        isOpen: false,
        mode: 'create',
        selectedAgent: null,
        formData: {
          name: '',
          description: '',
          provider: '',
          model: '',
          temperature: 0.7,
          systemPrompt: ''
        },
        loading: false,
        error: null
      },
      worldEdit: {
        isOpen: false,
        mode: 'edit',
        selectedWorld: null,
        formData: {
          name: '',
          description: '',
          turnLimit: 5
        },
        loading: false,
        error: null
      },
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
              <div className="agents-row">
                {state.loading ? (
                  <div className="loading-agents">Loading agents...</div>
                ) : !state.agents?.length ? (
                  <div className="no-agents">No agents in this world</div>
                ) : (
                  <div className="agents-list">
                    {state.agents.map((agent, index) => {
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
          </div>

          <div className="settings-column">
            <div className="settings-section">
              <div className="settings-row">
                <button className="world-settings-btn" title="World Settings" $onclick="select-world-settings">
                  <span className="world-gear-icon">⊕</span>
                </button>
              </div>
            </div>

            <WorldSettings
              world={state.world}
              selectedSettingsTarget={state.selectedSettingsTarget}
              selectedAgent={state.selectedAgent}
              totalMessages={(state.messages || []).length}
            />
          </div>
        </div>

        <AgentEdit
          isOpen={state.agentEdit.isOpen}
          mode={state.agentEdit.mode}
          selectedAgent={state.agentEdit.selectedAgent}
          worldName={state.worldName}
          formData={state.agentEdit.formData}
          loading={state.agentEdit.loading}
          error={state.agentEdit.error}
        />

        <WorldEdit
          isOpen={state.worldEdit.isOpen}
          mode={state.worldEdit.mode}
          selectedWorld={state.worldEdit.selectedWorld}
          formData={state.worldEdit.formData}
          loading={state.worldEdit.loading}
          error={state.worldEdit.error}
        />
      </div>
    );
  };

  update = {
    // Route handler - loads world data when navigating to world page
    ...worldInitHandlers,
    ...worldMessageHandlers,
    ...agentUpdateHandlers,
    ...worldUpdateHandlers,

    'select-agent-settings': (state: WorldComponentState, agent: Agent): WorldComponentState => {
      const baseResult = agentUpdateHandlers['select-agent-settings'](state, agent);
      if (baseResult.selectedSettingsTarget === 'agent' && baseResult.selectedAgent) {
        return {
          ...baseResult,
          userInput: '@' + baseResult.selectedAgent.name + ' '
        };
      }
      return baseResult;
    },
    // Send message action
    // ...existing code...
  };
}

