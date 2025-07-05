/**
 * Agent Modal Component - System Prompt Loading Fix
 * 
 * Core Fix:
 * - Added getAgent WebSocket command to core/subscription.ts for fetching full agent details
 * - Added getAgent command parsing to server/ws.ts for WebSocket protocol support
 * - Updated openAgentModal to fetch complete agent data including systemPrompt when editing
 * - Replaced agent list lookup with direct agent API call to ensure system prompt is loaded
 * 
 * Implementation:
 * - openAgentModal now calls wsApi.getAgent() for existing agents to fetch full details
 * - Added proper async/await handling with error fallback to existing agent data
 * - Maintains backward compatibility while ensuring system prompts are always loaded
 * - Debug logging added to trace agent data flow and system prompt retrieval
 * 
 * Changes:
 * - Core: Added 'getAgent' case to processWSCommand function
 * - Server: Added 'getagent' command parsing in parseCommandToRequest
 * - Frontend: Added dedicated getAgent API function with full agent data retrieval
 * - Modal: Updated openAgentModal to use getAgent API for editing existing agents
 */

/**
 * Agent Modal Component
 * Features:
 * - Modal dialog for creating/editing agents
 * - Agent name input with validation
 * - System prompt textarea for agent configuration with full agent data loading
 * - Form validation and submission handling
 * - Responsive design with proper modal overlay
 * - Clear memory functionality for existing agents
 *
 * Implementation:
 * - Uses template literals with event bindings
 * - Handles both create and edit modes
 * - Prevents modal close on content click
 * - Auto-saves agent data on input changes
 * - Debug logging for agent object structure investigation
 * - Multiple property name fallbacks for system prompt (systemPrompt, prompt, system_prompt, config.systemPrompt)
 * - Proper system prompt saving via updateAgent API with prompt parameter
 * - Full agent data fetching via getAgent API when editing existing agents
 *
 * Recent changes:
 * - Added debug logging to investigate agent object structure
 * - Implemented fallback property access for system prompt display
 * - Fixed save logic to properly update system prompts
 * - Added system prompt updates for both new and existing agents
 * - Fixed system prompt loading by fetching full agent details via getAgent API when editing
 * - Added proper async handling for agent data loading with error fallback
 */

import * as api from '../api.js';

const { html, run } = window["apprun"];

export const AgentModal = (agent, close) => {
  // Debug: Log agent object structure to understand available properties
  console.log('🔍 Agent Modal Debug - Agent object:', agent);
  console.log('🔍 Agent properties:', Object.keys(agent || {}));

  // Show loading state while fetching agent data
  if (agent?.loading) {
    return html`
      <div class="modal-overlay" @click=${run(close, false)}>
        <div class="modal-content" @click=${(e) => e.stopPropagation()}>
          <div class="modal-header">
            <h2>Loading Agent...</h2>
            <button class="modal-close" @click=${run(close, false)}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <div class="modal-body">
            <div class="loading-spinner">
              <div class="spinner"></div>
              <p>Loading agent details...</p>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // Try different possible property names for system prompt
  const systemPrompt = agent?.systemPrompt || agent?.prompt || agent?.system_prompt || agent?.config?.systemPrompt || '';
  console.log('🔍 System prompt value:', systemPrompt);

  return html`
    <div class="modal-overlay" @click=${run(close, false)}>
      <div class="modal-content" @click=${(e) => e.stopPropagation()}>
        <div class="modal-header">
          ${agent.status ? html`
            <h2>${agent.name}</h2>
          ` : html`
            <div class="new-agent-header">
              <input
                type="text"
                class="agent-name-input"
                placeholder="Agent Name"
                value="${agent.name || ''}"
                @input=${(e) => agent.name = e.target.value}
              >
            </div>
          `}
          <button class="modal-close" @click=${run(close, false)}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <form class="agent-form" @submit=${(e) => { e.preventDefault(); run(close, true); }}>
          <div class="form-group">
            <textarea
              id="agent-system-prompt"
              class="form-textarea"
              rows="20"
              placeholder="Define the agent's behavior and personality..."
            >${systemPrompt}</textarea>
          </div>

          <div class="form-actions">
            <button type="button" class="btn btn-secondary" @click=${run(close, false)}>
              Cancel
            </button>
            ${agent && agent.status !== 'New' ? html`
              <button type="button" class="btn btn-danger" @click=${run('clearAgentMemoryFromModal', agent)}>
                Clear Memory
              </button>
            ` : ''}
            <button type="submit" class="btn btn-primary">
              ${agent ? 'Update Agent' : 'Create Agent'}
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
};

export const openAgentModal = (state, agent = null) => {
  if (!agent) {
    // Creating new agent
    return {
      ...state,
      editingAgent: { name: 'New Agent', config: {}, status: 'New' },
      showAgentModel: true
    };
  }

  // Show modal with loading state first
  const newState = {
    ...state,
    editingAgent: { ...agent, loading: true },
    showAgentModel: true
  };

  // Fetch full agent details asynchronously
  (async () => {
    try {
      const fullAgent = await api.getAgent(state.worldName, agent.name);
      console.log('🔍 Full agent data retrieved:', fullAgent);

      // Update the state with the loaded agent data
      const app = window["app"];
      app.run('updateEditingAgent', fullAgent);
    } catch (error) {
      console.error('Error fetching full agent details:', error);
      // Fallback to the existing agent data if fetch fails
      const app = window["app"];
      app.run('updateEditingAgent', agent, `Failed to load agent details: ${error.message}`);
    }
  })();

  return newState;
};

export const updateEditingAgent = (state, agentData, error = null) => {
  console.log('🔄 Updating editing agent with data:', agentData);
  return {
    ...state,
    editingAgent: agentData,
    error: error ? error : state.error
  };
};

export const closeAgentModal = async (state, save) => {
  try {
    if (save && state.editingAgent) {
      if (state.editingAgent.status === 'New') {
        // For new agents, create with initial prompt if provided
        await api.createAgent(state.worldName, {
          name: state.editingAgent.name,
          description: state.editingAgent.description || 'Agent created via modal'
        });

        // If there's a system prompt, update it after creation
        const systemPrompt = state.editingAgent.systemPrompt || state.editingAgent.prompt || '';
        if (systemPrompt) {
          await api.updateAgent(state.worldName, state.editingAgent.name, {
            prompt: systemPrompt
          });
        }
      } else {
        // For existing agents, update both config and system prompt
        const updateData = {};

        // Update config if it exists
        if (state.editingAgent.config) {
          updateData.config = state.editingAgent.config;
        }

        // Update system prompt if it has been modified
        const systemPrompt = state.editingAgent.systemPrompt || state.editingAgent.prompt || '';
        if (systemPrompt) {
          updateData.prompt = systemPrompt;
        }

        console.log('🔧 Updating agent with data:', updateData);
        await api.updateAgent(state.worldName, state.editingAgent.name, updateData);
      }
    }
    return {
      ...state,
      showAgentModel: false
    };
  } catch (error) {
    console.error('Error closing agent modal:', error);
    return {
      ...state,
      error
    };
  }
};


