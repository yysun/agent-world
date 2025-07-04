/**
 * Agent Modal Component
 * Features:
 * - Modal dialog for creating/editing agents
 * - Agent name input with validation
 * - System prompt textarea for agent configuration with multiple property fallbacks
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
 *
 * Recent changes:
 * - Added debug logging to investigate agent object structure
 * - Implemented fallback property access for system prompt display
 * - Fixed save logic to properly update system prompts
 * - Added system prompt updates for both new and existing agents
 */

import * as wsApi from '../ws-api.js';

const { html, run } = window["apprun"];

export const AgentModal = (agent, close) => {
  // Debug: Log agent object structure to understand available properties
  console.log('🔍 Agent Modal Debug - Agent object:', agent);
  console.log('🔍 Agent properties:', Object.keys(agent || {}));

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
              value="${systemPrompt}"
              @input=${(e) => {
      // Update the agent object with the new system prompt value
      if (agent) {
        agent.systemPrompt = e.target.value;
        // Also try other possible property names
        agent.prompt = e.target.value;
        if (agent.config) {
          agent.config.systemPrompt = e.target.value;
        }
      }
    }}
              placeholder="Define the agent's behavior and personality..."
            ></textarea>
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
  return {
    ...state,
    editingAgent: agent || { name: 'New Agent', config: {}, status: 'New' },
    showAgentModel: true
  };
};

export const closeAgentModal = async (state, save) => {
  try {
    if (save && state.editingAgent) {
      if (state.editingAgent.status === 'New') {
        // For new agents, create with initial prompt if provided
        await wsApi.createAgent(state.worldName, {
          name: state.editingAgent.name,
          description: state.editingAgent.description || 'Agent created via modal'
        });

        // If there's a system prompt, update it after creation
        const systemPrompt = state.editingAgent.systemPrompt || state.editingAgent.prompt || '';
        if (systemPrompt) {
          await wsApi.updateAgent(state.worldName, state.editingAgent.name, {
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
        await wsApi.updateAgent(state.worldName, state.editingAgent.name, updateData);
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


