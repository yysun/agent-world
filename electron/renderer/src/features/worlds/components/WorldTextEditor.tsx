/**
 * World Text Editor Component
 *
 * Purpose:
 * - Render a full-area workspace editor for long-form world draft text fields.
 *
 * Key Features:
 * - Uses the shared `BaseEditor` workspace shell with Back and Apply actions.
 * - Switches title, help text, placeholder, and monospace mode by world field.
 * - Provides a large textarea for Variables and MCP Config editing.
 *
 * Implementation Notes:
 * - Controlled component; parent owns draft state and dirty/discard behavior.
 * - Apply writes only to the in-memory world form draft via parent callbacks.
 *
 * Recent Changes:
 * - 2026-04-11: Added the initial full-area world text editor for Variables and MCP Config.
 */

import React from 'react';
import BaseEditor from '../../../design-system/patterns/BaseEditor';
import { Button, Textarea } from '../../../design-system/primitives';

export type WorldTextEditorField = 'variables' | 'mcpConfig';

export default function WorldTextEditor({
  worldName,
  field,
  value,
  onChange,
  onBack,
  onApply,
  hasUnappliedChanges,
  leftSidebarCollapsed = false,
}: {
  worldName: string;
  field: WorldTextEditorField;
  value: string;
  onChange: (value: string) => void;
  onBack: () => void;
  onApply: () => void;
  hasUnappliedChanges: boolean;
  leftSidebarCollapsed?: boolean;
}) {
  const normalizedWorldName = String(worldName || '').trim() || 'Untitled World';
  const isVariablesField = field === 'variables';
  const fieldLabel = isVariablesField ? 'Variables (.env)' : 'MCP Config';
  const fieldHelpText = isVariablesField
    ? 'Use env-style key/value lines. These updates apply only to the active world draft until you save the world.'
    : 'Edit the world MCP JSON here. Validation still happens when you save the world draft.';
  const placeholder = isVariablesField
    ? 'working_directory=/path/to/project\nOPENAI_API_KEY=...'
    : '{\n  "mcpServers": {}\n}';

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
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-foreground/60">{fieldLabel}</p>
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
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">World Draft</p>
          <h1 className="mt-1 text-sm font-semibold text-foreground">{fieldLabel} for {normalizedWorldName}</h1>
          <p className="mt-1 text-xs text-muted-foreground">{fieldHelpText}</p>
        </div>
        <div className="min-h-0 flex-1 p-4">
          <Textarea
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            monospace={!isVariablesField}
            className="h-full min-h-[240px] resize-none"
          />
        </div>
      </div>
    </BaseEditor>
  );
}