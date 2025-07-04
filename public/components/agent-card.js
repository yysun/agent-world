/**
 * Agent Card Component - Enhanced agent display        <div class="agent-actions">
          <button 
            class="action-btn edit-btn" 
            title="Edit agent" 
            @click=${(e) => { e.stopPropagation(); run(openAgentModal, agent)(e); }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2-2v-7"/>
              <path d="m18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
        </div> Features:
 * - Beautiful card-based design with modern aesthetics and hover effects
 * - Avatar generation with color-coded backgrounds and initials
 * - Action buttons (edit) with smooth hover animations and proper positioning
 * - Message count display with user-friendly formatting using memorySize or memory.length
 * - Clear memory button (x) beside message count when messages exist
 * - Click-to-view memory functionality with proper event handling
 * - Add agent card with engaging design and clear call-to-action
 * - Responsive design that adapts to different screen sizes
 * - Enhanced visual feedback with transform animations and shadows
 *
 * Implementation:
 * - Modular component design for reusability
 * - Proper event handling with run() integration and event propagation control
 * - Avatar utility functions for consistent styling
 * - Action button positioning that appears on hover
 * - Memory management with inline clear functionality
 * - Supports both AgentInfo (memorySize) and full Agent (memory array) data structures
 * - Consistent styling that matches the overall design language
 *
 * Recent Changes:
 * - Fixed message count display to use memorySize from API or fallback to memory.length
 * - Changed "memories" to "messages" for better user understanding
 * - Added support for both AgentInfo and Agent data structures
 * - Improved event handling: edit and clear buttons now prevent card click propagation
 * - Agent card click properly loads agent memory for display
 */

const { html, run } = window["apprun"];
import { getAvatarColor, getAvatarInitials } from '../utils.js';

/**
 * Agent Card Component
 * @param {Object} agent - Agent data object
 * @param {Function} displayAgentMemory - Memory display handler
 * @param {Function} openAgentModal - Agent editor modal handler
 * @param {Function} clearAgentMemory - Memory clear handler
 * @returns {Object} AppRun html template
 */
export function AgentCard(agent, displayAgentMemory, openAgentModal, clearAgentMemory) {
  return html`
    <div class="agent-card" @click=${run(displayAgentMemory, agent)}>
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
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="m18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="agent-memory-section">
        <p class="agent-role">${agent.memorySize || agent.memory?.length || 0} messages</p>
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
 * Add Agent Card Component
 * @param {Function} openAgentModal - Agent creation modal handler
 * @returns {Object} AppRun html template
 */
export function AddAgentCard(openAgentModal) {
  return html`
    <div class="agent-card add-agent-card" @click=${run(openAgentModal)}>
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
