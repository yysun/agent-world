/**
 * Agent Modal Component
 * 
 * Features:
 * - Modal dialog for creating/editing agents with system prompt configuration
 * - Responsive design with proper modal overlay and form validation
 * - Full agent data loading via getAgent API for editing existing agents
 * - Multiple property fallbacks for system prompt (systemPrompt, prompt, system_prompt, config.systemPrompt)
 * - Clear memory functionality for existing agents
 * 
 * Implementation:
 * - Uses template literals with event bindings for create/edit modes
 * - Async agent data fetching with error handling and fallback
 * - Proper system prompt saving via updateAgent API with prompt parameter
 * - Debug logging for agent object structure investigation
 */

import * as api from '../api.js';

const { html, run } = window["apprun"];

export const AgentModal = (agent, close) => {
  // Debug: Log agent object structure and extract system prompt
  console.log('🔍 Agent Modal Debug - Agent object:', agent);

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

        <form class="agent-form" @submit=${run(close, true)}}>
          <div class="form-group">
            <textarea
              id="agent-system-prompt"
              class="form-textarea"
              rows="20"
              placeholder="Define the agent's behavior and personality..."
              .value=${systemPrompt}
            >
            ${systemPrompt}
            </textarea>
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

export const openAgentModal = async (state, agent = null) => {
  if (!agent) {
    // Creating new agent
    return {
      ...state,
      editingAgent: { name: 'New Agent', config: {}, status: 'New' },
      showAgentModel: true
    };
  }

  // Fetch full agent details for editing
  try {
    const fullAgent = await api.getAgent(state.worldName, agent.name);
    console.log('🔍 Full agent data retrieved:', fullAgent);
    return {
      ...state,
      editingAgent: fullAgent,
      showAgentModel: true
    };
  } catch (error) {
    console.error('Error fetching full agent details:', error);
    // Fallback to provided agent data
    return {
      ...state,
      editingAgent: agent,
      showAgentModel: true
    };
  }
};

export const closeAgentModal = async (state, save) => {
  try {
    if (save && state.editingAgent) {
      const systemPrompt = document.getElementById('agent-system-prompt')?.value || '';

      if (state.editingAgent.status === 'New') {
        // Create new agent
        await api.createAgent(state.worldName, {
          name: state.editingAgent.name,
          description: state.editingAgent.description || 'Agent created via modal'
        });

        // Update system prompt if provided
        if (systemPrompt) {
          await api.updateAgent(state.worldName, state.editingAgent.name, {
            prompt: systemPrompt
          });
        }
      } else {
        // Update existing agent
        const updateData = {};

        if (state.editingAgent.config) {
          updateData.config = state.editingAgent.config;
        }

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


