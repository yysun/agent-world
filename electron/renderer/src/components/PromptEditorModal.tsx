/**
 * Prompt Editor Modal Component
 *
 * Features:
 * - Full-screen overlay modal for editing long prompt text
 * - Controlled textarea value with apply/cancel actions
 * - Reusable for create/edit agent prompt targets
 *
 * Implementation Notes:
 * - Modal visibility is controlled by the parent via `open`
 * - Parent owns prompt value and apply behavior
 *
 * Recent Changes:
 * - 2026-02-14: Extracted from App.jsx during renderer component decomposition.
 */

import React from 'react';

export default function PromptEditorModal({
  open,
  value,
  onChange,
  onClose,
  onApply
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="flex h-[80vh] w-[80vw] max-w-4xl flex-col rounded-lg border border-border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-sm font-medium text-foreground">Edit System Prompt</h3>
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
            placeholder="Enter system prompt..."
            className="h-full w-full resize-none rounded-md border border-input bg-card p-4 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring"
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
