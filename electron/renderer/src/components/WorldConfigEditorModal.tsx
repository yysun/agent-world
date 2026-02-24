/**
 * World Config Editor Modal Component
 *
 * Features:
 * - Shared modal editor for world variables and MCP configuration text
 * - Dynamic title and placeholder by selected config field
 * - Controlled textarea with apply/cancel actions
 *
 * Implementation Notes:
 * - Parent controls open state, active field, and apply behavior
 * - Supports `variables` and `mcpConfig` field modes
 *
 * Recent Changes:
 * - 2026-02-14: Extracted from App.jsx during renderer component decomposition.
 */

import React from 'react';

export default function WorldConfigEditorModal({
  open,
  field,
  value,
  onChange,
  onClose,
  onApply
}) {
  if (!open) return null;

  const isVariablesField = field === 'variables';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="flex h-[80vh] w-[80vw] max-w-4xl flex-col rounded-lg border border-border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-sm font-medium text-foreground">
            {isVariablesField ? 'Edit Variables (.env)' : 'Edit MCP Configuration'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        <div className="flex-1 p-4">
          <textarea
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={isVariablesField
              ? 'Variables (.env), e.g. working_directory=/path/to/project'
              : 'Enter MCP servers configuration as JSON...'}
            className="h-full w-full resize-none rounded-md border border-input bg-card p-4 font-mono text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring"
            autoFocus
          />
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-input px-4 py-2 text-sm text-foreground hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onApply}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
