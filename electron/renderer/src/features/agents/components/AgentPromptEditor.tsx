/**
 * Agent Prompt Editor Component
 *
 * Purpose:
 * - Render a full-area workspace editor for agent system-prompt drafts.
 *
 * Key Features:
 * - Uses the shared `BaseEditor` workspace shell with Back and Apply actions.
 * - Shows explicit draft context so the user knows which agent draft is being edited.
 * - Provides a full-height textarea for long prompt editing without modal constraints.
 *
 * Implementation Notes:
 * - Controlled component; parent owns draft state and dirty/discard behavior.
 * - Apply writes only to the in-memory form draft via parent callbacks.
 *
 * Recent Changes:
 * - 2026-04-11: Added the initial full-area agent system-prompt editor.
 */

import React from 'react';
import BaseEditor from '../../../design-system/patterns/BaseEditor';
import { Button, Textarea } from '../../../design-system/primitives';

export default function AgentPromptEditor({
  draftContextLabel,
  agentName,
  value,
  onChange,
  onBack,
  onApply,
  hasUnappliedChanges,
  leftSidebarCollapsed = false,
}: {
  draftContextLabel: string;
  agentName: string;
  value: string;
  onChange: (value: string) => void;
  onBack: () => void;
  onApply: () => void;
  hasUnappliedChanges: boolean;
  leftSidebarCollapsed?: boolean;
}) {
  const normalizedAgentName = String(agentName || '').trim() || 'Untitled Agent';

  const toolbar = (
    <div className="flex min-w-0 items-center gap-3">
      <Button
        variant="ghost"
        size="sm"
        onClick={onBack}
        aria-label="Back"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Back
      </Button>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-foreground/60">Agent System Prompt</p>
      </div>
      <Button
        variant="primary"
        size="sm"
        onClick={onApply}
        disabled={!hasUnappliedChanges}
      >
        Apply to Draft
      </Button>
    </div>
  );

  return (
    <BaseEditor toolbar={toolbar} reserveTrafficLightSpace={leftSidebarCollapsed}>
      <div className="flex h-full min-h-0 flex-col bg-background">
        <div className="border-b border-border px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">{draftContextLabel}</p>
          <h1 className="mt-1 text-sm font-semibold text-foreground">System Prompt for {normalizedAgentName}</h1>
          <p className="mt-1 text-xs text-muted-foreground">Apply updates to write them back into the current agent draft. Final persistence still happens from the right-side form.</p>
        </div>
        <div className="min-h-0 flex-1 p-4">
          <Textarea
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Enter the agent system prompt..."
            className="h-full min-h-[240px] resize-none"
          />
        </div>
      </div>
    </BaseEditor>
  );
}