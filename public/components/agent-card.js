/**
 * Agent Card Component
 *
 * Enhanced agent display with card-based design, avatar generation, action buttons,
 * message count display, and memory management functionality.
 *
 * Features:
 * - Card-based design with hover effects and modern aesthetics
 * - Avatar generation with color-coded backgrounds and initials  
 * - Action buttons with proper AppRun event handling
 * - Message count display and memory management
 * - Responsive design with consistent styling
 */

const { html, run } = window["apprun"];
import { getAvatarColor, getAvatarInitials } from '../utils.js';

/**
 * Agent Card - displays agent with edit and memory management
 */
export function AgentCard(agent, displayAgentMemory, openAgentModal, clearAgentMemory) {
  return html`
    <div class="agent-card">
      <div class="agent-header">
        <div class="agent-info">
          <div class="avatar-container">
            <div class="avatar" style="background-color: ${getAvatarColor(agent.name)}">
              ${getAvatarInitials(agent.name)}
            </div>
          </div>
          <h3 class="agent-name">${agent.name}</h3>
        </div>
        <div class="agent-actions">
          <button 
            class="action-btn edit-btn" 
            title="Edit agent" 
            @click=${run(openAgentModal, agent)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="m18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
        </div>
      </div>
      <div class="agent-memory-section">
        <p class="agent-role">
          <span
            class="message-count-link"
            title="View agent memory"
            @click=${run(displayAgentMemory, agent)}
          >
            ${agent.memorySize || agent.memory?.length || 0} messages
          </span>
        </p>
        ${(agent.memorySize || agent.memory?.length || 0) > 0 ? html`
          <button 
            class="clear-memory-btn" 
            title="Clear all memories"
            @click=${run(clearAgentMemory, agent)}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        ` : ''}
      </div>
    </div>
  `;
}

/**
 * Add Agent Card - prompts user to create new agent
 */
export function AddAgentCard(openAgentModal) {
  return html`
    <div class="agent-card add-agent-card" @click=${run(openAgentModal, null)}>
      <div class="avatar-container">
        <div class="avatar add-avatar">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 5v14M5 12h14"/>
          </svg>
        </div>
      </div>
      <h3 class="agent-name">Add Agent</h3>
      <p class="agent-role">create new agent</p>
    </div>
  `;
}

export default { AgentCard, AddAgentCard };
