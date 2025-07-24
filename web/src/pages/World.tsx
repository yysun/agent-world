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
 * - Modular components: WorldChat, WorldSettings, AgentEdit
 * - TypeScript SSE client integration with proper error handling
 * - Extracted agent handlers to world-update.ts module
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
import { getWorld } from '../api';
import {
  sendChatMessage,
  handleStreamStart,
  handleStreamChunk,
  handleStreamEnd,
  handleStreamError,
  handleMessage,
  handleConnectionStatus,
  handleError,
  handleComplete
} from '../sse-client';
import WorldChat from '../components/world-chat';
import WorldSettings from '../components/world-settings';
import AgentEdit from '../components/agent-edit';
import { agentUpdateHandlers } from '../updates/world-update';
import type { WorldComponentState, Agent } from '../types';

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
      </div>
    );
  };

  update = {
    // Route handler - loads world data when navigating to world page
    '/World': async function* (state: WorldComponentState, name: string): AsyncGenerator<WorldComponentState> {
      const worldName = name ? decodeURIComponent(name) : 'New World';

      try {
        yield {
          ...state,
          worldName,
          loading: true,
          error: null,
          isWaiting: false,
          activeAgent: null
        };

        const world = await getWorld(worldName);
        const messageMap = new Map();

        const worldAgents: Agent[] = await Promise.all(world.agents.map(async (agent, index) => {
          if (agent.memory && Array.isArray(agent.memory)) {
            agent.memory.forEach((memoryItem: any) => {
              const messageKey = `${memoryItem.createdAt || Date.now()}-${memoryItem.text || memoryItem.content || ''}`;

              if (!messageMap.has(messageKey)) {
                const originalSender = memoryItem.sender || agent.name;
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
                  streamComplete: true,
                  fromAgentId: agent.id
                });
              }
            });
          }

          const systemPrompt = agent.systemPrompt || '';

          return {
            ...agent,
            spriteIndex: index % 9,
            messageCount: agent.memory?.length || 0,
            provider: agent.provider || 'openai',
            model: agent.model || 'gpt-4',
            temperature: agent.temperature ?? 0.7,
            systemPrompt: systemPrompt,
            description: agent.description || '',
            type: agent.type || 'default',
            status: agent.status || 'active',
            llmCallCount: agent.llmCallCount || 0,
            memory: agent.memory || [],
            createdAt: agent.createdAt || new Date(),
            lastActive: agent.lastActive || new Date()
          } as Agent;
        }));

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
            llmCallLimit: (world as any).llmCallLimit || (world as any).turnLimit
          },
          agents: worldAgents,
          messages: sortedMessages,
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
      if (e.key === 'Enter' && (state.userInput || '').trim()) {
        app.run('send-message');
      }
    },

    ...agentUpdateHandlers,

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
    'send-message': async (state: WorldComponentState): Promise<WorldComponentState> => {
      if (!(state.userInput || '').trim()) return state;

      const messageText = state.userInput || '';

      const userMessage = {
        id: Date.now() + Math.random(),
        type: 'user',
        sender: 'HUMAN',
        text: messageText,
        createdAt: new Date().toISOString(),
        worldName: state.worldName,
        userEntered: true
      };

      const newState = {
        ...state,
        messages: [...(state.messages || []), userMessage],
        userInput: '',
        isSending: true,
        isWaiting: true
      };

      try {
        await sendChatMessage(state.worldName, messageText, 'HUMAN');

        return {
          ...newState,
          isSending: false
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
      const agentName = data.sender;
      const agent = state.agents.find(a => a.name === agentName);

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
      const agentName = data.sender;

      let finalState = {
        ...baseState,
        activeAgent: null
      };

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

        const updatedWorld = finalState.world ? {
          ...finalState.world,
          agents: updatedAgents
        } : null;

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

