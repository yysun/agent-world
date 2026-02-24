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
 * - Shows nothing when idle.
 *
 * Implementation Notes:
 * - Consumes output of useWorkingStatus hook via App.tsx props.
 * - Reuses ActivityPulse and ThinkingIndicator for animation consistency.
 *
 * Recent Changes:
 * - 2026-02-22: Created as part of status-registry migration (Phase 7.1).
 */

import React from 'react';
import type { WorkingStatus } from '../domain/status-types';
import ActivityPulse from './ActivityPulse';
import ThinkingIndicator from './ThinkingIndicator';

export interface WorkingStatusBarProps {
  chatStatus: WorkingStatus;
  agentStatuses: { id: string; name: string; status: WorkingStatus }[];
  notification?: { text: string; kind: 'error' | 'success' | 'info' } | null;
}

const notificationTextClass: Record<string, string> = {
  error: 'text-destructive',
  success: 'text-green-500',
  info: 'text-muted-foreground',
};

export default function WorkingStatusBar({ chatStatus, agentStatuses, notification }: WorkingStatusBarProps) {
  if (notification) {
    return (
      <div className="px-4 pb-1">
        <div className={`mx-auto flex w-full max-w-[750px] items-center gap-1.5 text-xs ${notificationTextClass[notification.kind] ?? 'text-muted-foreground'}`}>
          <span>{notification.text}</span>
        </div>
      </div>
    );
  }

  if (chatStatus === 'idle') {
    return null;
  }

  if (chatStatus === 'complete') {
    return (
      <div className="px-4 pb-1">
        <div className="mx-auto flex w-full max-w-[750px] items-center gap-1.5 text-xs text-muted-foreground">
          <span className="text-green-500">✓</span>
          <span>Done</span>
        </div>
      </div>
    );
  }

  // working
  const workingAgents = agentStatuses.filter(a => a.status === 'working');

  return (
    <div className="px-4 pb-1">
      <div className="mx-auto flex w-full max-w-[750px] items-center gap-2">
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
