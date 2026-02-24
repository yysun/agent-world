/**
 * Agent Queue Display - Compact active/queued agent indicator for chat header
 *
 * Purpose:
 * - Show the currently active agent and compact queued agent avatars
 * - Bring web header behavior closer to desktop app simplicity
 *
 * Features:
 * - Active agent badge with green activity dot
 * - Up to three queued avatars with overflow count
 * - Reuses existing agent sprite system
 *
 * Implementation Notes:
 * - Uses AppRun JSX and simple props-only rendering
 * - Falls back to hidden rendering when there is no active/queued data
 *
 * Recent Changes:
 * - 2026-02-14: Initial implementation for web chat header parity
 */

import { app } from 'apprun';

export interface QueueAgent {
  name: string;
  spriteIndex: number;
}

export interface AgentQueueDisplayProps {
  activeAgent?: QueueAgent | null;
  queuedAgents?: QueueAgent[];
}

export function AgentQueueDisplay(props: AgentQueueDisplayProps) {
  const activeAgent = props.activeAgent || null;
  const queuedAgents = Array.isArray(props.queuedAgents) ? props.queuedAgents : [];

  if (!activeAgent && queuedAgents.length === 0) {
    return null;
  }

  const visibleQueued = queuedAgents.slice(0, 3);
  const overflow = queuedAgents.length - visibleQueued.length;

  return (
    <div className="agent-queue-display" role="status" aria-live="polite">
      {activeAgent ? (
        <div className="agent-queue-active" title={`Active: ${activeAgent.name}`}>
          <div className={`message-avatar agent-sprite sprite-${activeAgent.spriteIndex}`}></div>
          <span className="agent-queue-active-dot" aria-hidden="true"></span>
        </div>
      ) : null}

      {visibleQueued.length > 0 ? (
        <div className="agent-queue-list" title="Queued agents">
          {visibleQueued.map((agent) => (
            <div key={`${agent.name}-${agent.spriteIndex}`} className="agent-queue-item" title={agent.name}>
              <div className={`message-avatar agent-sprite sprite-${agent.spriteIndex}`}></div>
            </div>
          ))}
          {overflow > 0 ? <div className="agent-queue-overflow">+{overflow}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
