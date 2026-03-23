/**
 * Panel Action Bar Pattern
 *
 * Purpose:
 * - Provide a generic footer action layout for side-panel forms and dialogs.
 *
 * Key Features:
 * - Supports optional leading content plus a trailing action group.
 * - Preserves the shared side-panel footer shell styling.
 * - Stays domain-agnostic by accepting only slot content.
 *
 * Implementation Notes:
 * - This pattern owns layout only; callers still provide concrete buttons and handlers.
 *
 * Recent Changes:
 * - 2026-03-23: Added after repeated right-panel footer rows were identified across settings, world, and agent forms.
 */

import type React from 'react';

export interface PanelActionBarProps {
  leading?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

const PANEL_ACTION_BAR_BASE_CLASS_NAME = 'mt-auto flex gap-2 border-t border-sidebar-border bg-sidebar pt-2';

export default function PanelActionBar({ leading, children, className = '' }: PanelActionBarProps) {
  return (
    <div
      className={[
        PANEL_ACTION_BAR_BASE_CLASS_NAME,
        leading ? 'justify-between' : 'justify-end',
        className,
      ].filter(Boolean).join(' ')}
    >
      {leading ? <div>{leading}</div> : null}
      <div className="flex gap-2">{children}</div>
    </div>
  );
}