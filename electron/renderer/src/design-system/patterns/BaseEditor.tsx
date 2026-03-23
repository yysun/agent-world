/**
 * BaseEditor Pattern
 *
 * Purpose:
 * - Provide a generic editor/workbench shell with an optional toolbar and optional secondary pane.
 *
 * Key Features:
 * - Flex-based primary content area with optional secondary column.
 * - Toolbar inset support for macOS traffic-light clearance in full-area editor views.
 * - Domain-agnostic slot contract: callers supply content and any secondary pane explicitly.
 *
 * Implementation Notes:
 * - Stateless layout shell; parent components own all behavior and state.
 * - Does not import or default to business-specific UI.
 *
 * Recent Changes:
 * - 2026-03-23: Removed the default editor chat dependency so the pattern no longer imports business-specific UI.
 * - 2026-03-23: Increased collapsed-editor toolbar inset so the Back button clears the floating restore button with more space.
 * - 2026-03-23: Added optional toolbar inset support so full-area editors can clear the macOS traffic lights when the left sidebar is collapsed.
 * - 2026-03-08: Initial implementation as part of editor skill-editor feature.
 */

import type React from 'react';

export default function BaseEditor({
  toolbar,
  children,
  rightPane,
  reserveTrafficLightSpace = false,
}: {
  toolbar?: React.ReactNode;
  children: React.ReactNode;
  rightPane?: React.ReactNode;
  reserveTrafficLightSpace?: boolean;
}) {
  const hasRightPane = rightPane !== undefined && rightPane !== null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {toolbar ? (
        <div className={`flex-none border-b border-border bg-background pt-2 ${reserveTrafficLightSpace ? 'pb-3 pl-36 pr-5' : 'px-4 py-2'}`}>
          {toolbar}
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1">
        <div className={`flex min-w-0 flex-col overflow-hidden ${hasRightPane ? 'flex-[3]' : 'flex-1'}`}>
          {children}
        </div>
        {hasRightPane ? (
          <div className="min-w-0 flex-[1] overflow-hidden">
            {rightPane}
          </div>
        ) : null}
      </div>
    </div>
  );
}