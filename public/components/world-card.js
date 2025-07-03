/**
 * World Card Component - Enhanced world selection cards
 *
 * Features:
 * - Beautiful card-based design with modern aesthetics and reduced height
 * - World icons with hover animations and contextual colors
 * - Agent count statistics with user-friendly icons and inline add agent button
 * - Agent preview avatars showing up to 3 agents with overflow indicators
 * - Connection status indicators for active worlds with animated feedback
 * - Responsive design that adapts to different screen sizes
 * - Enhanced hover effects with subtle animations and color transitions
 * - Empty state messaging for worlds without agents
 * - Context-aware add world card with simplified design (removed duplicate + icon)
 * - Integrated add agent functionality directly within world cards
 *
 * UI Improvements:
 * - Reduced card height by adjusting padding for more compact layout
 * - Moved + button from world name line to agent statistics line for better UX
 * - Removed duplicate + icon from add world card content area
 * - Added small + button next to agent count for easy agent creation
 * - Eliminated need for separate add agent card since + is now on world cards
 *
 * Implementation:
 * - Modular component design for reusability
 * - Proper event handling with run() integration and event propagation control
 * - Avatar color generation using utility functions
 * - Consistent styling that matches the overall design language
 * - Add agent button positioned inline with agent statistics
 */

const { html, run } = window["apprun"];
import { getAvatarColor, getAvatarInitials } from '../utils.js';

/**
 * World Card Component
 * @param {Object} world - World data object
 * @param {string} currentWorldName - Currently selected world name
 * @param {string} connectionStatus - Current connection status
 * @param {Function} selectWorld - World selection handler
 * @param {Function} openAgentModal - Agent creation modal handler
 * @returns {Object} AppRun html template
 */
export function WorldCard(world, currentWorldName, connectionStatus, selectWorld, openAgentModal) {
  const agentCount = world.agentCount || 0;
  const agents = world.agents || [];
  const isActive = currentWorldName === world.name;

  return html`
    <div
      class="world-card ${isActive ? 'active' : ''}"
      @click=${run(selectWorld, world.name)}
      data-world="${world.name}"
      title="${agentCount === 0 ? 'No agents in this world' :
      agentCount === 1 ? `1 agent: ${agents[0]?.name || 'Unknown'}` :
        `${agentCount} agents: ${agents.map(a => a.name).join(', ')}`}"
    >
      <div class="world-card-header">
        <div class="world-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M2 12h20"/>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
          </svg>
        </div>
        <div class="world-name">${world.name}</div>
        ${isActive ? html`
          <span class="connection-status ${connectionStatus}">
            ${connectionStatus === 'connected' ? '●' :
        connectionStatus === 'connecting' ? '◐' :
          connectionStatus === 'error' ? '✕' : '○'}
          </span>
        ` : ''}
      </div>
      <div class="world-card-content">
        <div class="world-stats">
          <div class="stat-item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            <span class="stat-value">${agentCount}</span>
            <span class="stat-label">${agentCount === 1 ? 'Agent' : 'Agents'}</span>
            <button 
              class="add-agent-btn" 
              title="Add agent to this world"
              @click=${(e) => {
      e.stopPropagation();
      run(openAgentModal)(e);
    }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 5v14M5 12h14"/>
              </svg>
            </button>
          </div>
        </div>
        ${agentCount > 0 ? html`
          <div class="agent-preview">
            ${agents.slice(0, 3).map(agent => html`
              <div class="agent-preview-item" title="${agent.name}">
                <div class="agent-preview-avatar" style="background-color: ${getAvatarColor(agent.name)}">
                  ${getAvatarInitials(agent.name)}
                </div>
              </div>
            `)}
            ${agentCount > 3 ? html`
              <div class="agent-preview-more">+${agentCount - 3}</div>
            ` : ''}
          </div>
        ` : html`
          <div class="empty-world">
            <span>No agents yet</span>
          </div>
        `}
      </div>
    </div>
  `;
}

/**
 * Add World Card Component
 * @param {Function} addNewWorld - Add world handler
 * @param {boolean} isFirstWorld - Whether this is the first world being created
 * @returns {Object} AppRun html template
 */
export function AddWorldCard(addNewWorld, isFirstWorld = false) {
  return html`
    <div class="world-card add-world-card" @click=${run(addNewWorld)}>
      <div class="world-card-header">
        <div class="world-icon add-world-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 5v14M5 12h14"/>
          </svg>
        </div>
        <div class="world-name">Add World</div>
      </div>
      <div class="world-card-content">
        <div class="add-world-content">
          <span>${isFirstWorld ? 'Create your first world' : 'Create new world'}</span>
        </div>
      </div>
    </div>
  `;
}

export default { WorldCard, AddWorldCard };
