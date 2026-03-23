/**
 * EditorChatPane Component
 * Purpose:
 * - Placeholder AI assistant chat pane for the editor layout right column.
 *
 * Key Features:
 * - Context-aware heading to indicate what is being edited.
 * - Holds space for future conversational editing AI chat interface.
 *
 * Implementation Notes:
 * - Purely presentational; no live API calls yet.
 * - Renders inside the 1/4 right column of BaseEditor.
 *
 * Recent Changes:
 * - 2026-03-08: Initial implementation as part of editor skill-editor feature.
 */

import React from 'react';

export default function EditorChatPane({ context }: { context?: string }) {
  return (
    <div className="flex h-full flex-col border-l border-sidebar-border bg-sidebar">
      <div className="border-b border-sidebar-border px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-sidebar-foreground/60">
          AI Assistant
        </p>
        {context ? (
          <p className="mt-0.5 truncate text-xs text-sidebar-foreground/45">{context}</p>
        ) : null}
      </div>
      <div className="flex flex-1 items-center justify-center p-4">
        <p className="text-center text-xs text-sidebar-foreground/40">
          Chat-based editing coming soon.
        </p>
      </div>
    </div>
  );
}
