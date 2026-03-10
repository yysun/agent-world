/**
 * WorkingStatusBar Component
 *
 * Purpose:
 * - Display the current working status for the active chat session.
 * - Purely presentational: receives pre-computed status values, no event logic.
 *
 * Key Features:
 * - Shows animated pulse + per-agent names while agents are working.
 * - Shows static "Done" indicator when complete.
 * - Keeps a stable bar container mounted and clears content when idle.
 *
 * Implementation Notes:
 * - Consumes output of useWorkingStatus hook via App.tsx props.
 * - Reuses ActivityPulse and ThinkingIndicator for animation consistency.
 *
 * Recent Changes:
 * - 2026-03-06: Added selected-chat system-event overlay rendering between local notifications and working-state fallback.
 * - 2026-02-28: Preserved an always-mounted status bar row so hide behavior clears content instead of removing layout space.
 * - 2026-02-22: Created as part of status-registry migration (Phase 7.1).
 */

import React from 'react';
import type { SessionSystemStatusEntry } from '../domain/session-system-status';
import type { WorkingStatus } from '../domain/status-types';
import ActivityPulse from './ActivityPulse';
import ThinkingIndicator from './ThinkingIndicator';

export interface WorkingStatusBarProps {
  chatStatus: WorkingStatus;
  agentStatuses: { id: string; name: string; status: WorkingStatus }[];
  notification?: { text: string; kind: 'error' | 'success' | 'info' } | null;
  systemStatus?: SessionSystemStatusEntry | null;
}

const notificationTextClass: Record<string, string> = {
  error: 'text-destructive',
  success: 'text-green-500',
  info: 'text-muted-foreground',
};

export default function WorkingStatusBar({ chatStatus, agentStatuses, notification, systemStatus }: WorkingStatusBarProps) {
  if (notification) {
    return (
      <div className="px-4 pb-1" data-testid="working-status-bar">
        <div
          className={`mx-auto flex min-h-5 w-full max-w-[750px] items-center gap-1.5 text-xs ${notificationTextClass[notification.kind] ?? 'text-muted-foreground'}`}
          data-testid="working-status-notification"
        >
          <span>{notification.text}</span>
        </div>
      </div>
    );
  }

  if (systemStatus) {
    return (
      <div className="px-4 pb-1" data-testid="working-status-bar">
        <div
          className={`mx-auto flex min-h-5 w-full max-w-[750px] items-center gap-1.5 text-xs ${notificationTextClass[systemStatus.kind] ?? 'text-muted-foreground'}`}
          data-testid="working-status-system"
        >
          <span>{systemStatus.text}</span>
        </div>
      </div>
    );
  }

  if (chatStatus === 'idle') {
    return (
      <div className="px-4 pb-1" data-testid="working-status-bar">
        <div className="mx-auto flex min-h-5 w-full max-w-[750px] items-center text-xs text-muted-foreground" aria-hidden="true" />
      </div>
    );
  }

  if (chatStatus === 'complete') {
    return (
      <div className="px-4 pb-1" data-testid="working-status-bar">
        <div className="mx-auto flex min-h-5 w-full max-w-[750px] items-center gap-1.5 text-xs text-muted-foreground">
          <span className="text-green-500">✓</span>
          <span>Done</span>
        </div>
      </div>
    );
  }

  // working
  const workingAgents = agentStatuses.filter(a => a.status === 'working');

  return (
    <div className="px-4 pb-1" data-testid="working-status-bar">
      <div className="mx-auto flex min-h-5 w-full max-w-[750px] items-center gap-2">
        <ActivityPulse isActive={true} />
        {workingAgents.length > 0 ? (
          <div className="flex items-center gap-2 flex-wrap">
            {workingAgents.map(agent => (
              <ThinkingIndicator key={agent.id} text={agent.name} className="text-xs" />
            ))}
          </div>
        ) : (
          <ThinkingIndicator text="Working" className="text-xs" />
        )}
      </div>
    </div>
  );
}
