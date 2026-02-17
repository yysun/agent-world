/**
 * AgentQueueDisplay Component - Show Multi-Agent Response Queue
 *
 * Purpose:
 * - Display which agents are processing or waiting
 * - Show agent names/avatars in queue order
 * - Indicate current active agent
 *
 * Key Features:
 * - Horizontal avatar stack for compact display
 * - Highlight currently active agent
 * - Badge showing queue position
 *
 * Implementation Notes:
 * - Receives agent queue from streaming state
 * - Shows initials when avatars not available
 *
 * Recent Changes:
 * - 2026-02-10: Initial implementation
 */

import React from 'react';

/**
 * @typedef {Object} QueuedAgent
 * @property {string} agentId
 * @property {string} agentName
 * @property {boolean} isActive
 */

/**
 * Get agent initials from name
 * @param {string} name
 * @returns {string}
 */
function getInitials(name) {
  const segments = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (segments.length === 0) return '?';
  if (segments.length === 1) {
    return segments[0].slice(0, 2).toUpperCase();
  }
  return `${segments[0][0] || ''}${segments[1][0] || ''}`.toUpperCase();
}

/**
 * @param {Object} props
 * @param {QueuedAgent[]} props.agents - Agents in response queue
 * @param {string} [props.className] - Additional CSS classes
 */
export default function AgentQueueDisplay({ agents, className = '' }) {
  if (!agents || agents.length === 0) {
    return null;
  }

  const activeAgent = agents.find((a) => a.isActive);
  const queuedAgents = agents.filter((a) => !a.isActive);

  return (
    <div
      className={`flex items-center gap-2 ${className}`}
      role="status"
      aria-live="polite"
      aria-label={`${agents.length} agent${agents.length === 1 ? '' : 's'} in queue`}
    >
      {activeAgent ? (
        <div className="flex items-center gap-1.5">
          <div
            className="relative flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground ring-2 ring-primary/30"
            title={`${activeAgent.agentName} (responding)`}
          >
            {getInitials(activeAgent.agentName)}
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-green-500" />
          </div>
          <span className="text-xs font-medium text-foreground">
            {activeAgent.agentName}
          </span>
        </div>
      ) : null}

      {queuedAgents.length > 0 ? (
        <div className="flex items-center">
          {activeAgent ? (
            <span className="mx-1.5 text-muted-foreground/50">→</span>
          ) : null}
          <div className="flex -space-x-2">
            {queuedAgents.slice(0, 3).map((agent, index) => (
              <div
                key={agent.agentId}
                className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-[10px] font-medium text-secondary-foreground ring-1 ring-background"
                title={`${agent.agentName} (waiting #${index + 1})`}
              >
                {getInitials(agent.agentName)}
              </div>
            ))}
            {queuedAgents.length > 3 ? (
              <div
                className="flex h-6 min-w-6 items-center justify-center rounded-full bg-muted px-1 text-[10px] font-medium text-muted-foreground ring-1 ring-background"
                title={`${queuedAgents.length - 3} more waiting`}
              >
                +{queuedAgents.length - 3}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
