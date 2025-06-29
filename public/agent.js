/**
 * Agent Modal Component
 * Features:
 * - Modal dialog for creating/editing agents
 * - Agent name input with validation
 * - System prompt textarea for agent configuration
 * - Form validation and submission handling
 * - Responsive design with proper modal overlay
 * 
 * Implementation:
 * - Uses template literals with event bindings
 * - Handles both create and edit modes
 * - Prevents modal close on content click
 * - Auto-saves agent data on input changes
 * 
 * Recent changes:
 */

export const AgentModal = (agent, close) => {
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
                @input=${(e) => {
        agent.name = e.target.value;
      }}
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
              value="${agent?.systemPrompt || ''}"
              @input=${(e) => {
      agent.systemPrompt = e.target.value;
    }}
              placeholder="Define the agent's behavior and personality..."
            ></textarea>
          </div>
          
          <div class="form-actions">
            <button type="button" class="btn btn-secondary" @click=${run(close, false)}>
              Cancel
            </button>
            <button type="submit" class="btn btn-primary">
              ${agent ? 'Update Agent' : 'Create Agent'}
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
};

