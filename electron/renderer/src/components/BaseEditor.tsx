/**
 * BaseEditor Component
 * Purpose:
 * - Two-column editor shell: left content area (3/4) and right AI chat pane (1/4).
 *
 * Key Features:
 * - Flex-based two-column layout (flex-[3] left, flex-[1] right).
 * - Accepts toolbar slot rendered above the left column content.
 * - Accepts arbitrary children for the left editable content area.
 * - Accepts optional right pane override (defaults to EditorChatPane).
 *
 * Implementation Notes:
 * - Stateless layout shell; all state lives in parent (SkillEditor / App).
 * - Fills the full available height of MainWorkspaceLayout main region.
 *
 * Recent Changes:
 * - 2026-03-23: Increased collapsed-editor toolbar inset so the Back button clears the floating restore button with more space.
 * - 2026-03-23: Added optional toolbar inset support so full-area editors can clear the macOS traffic lights when the left sidebar is collapsed.
 * - 2026-03-08: Initial implementation as part of editor skill-editor feature.
 */

import React from 'react';
import EditorChatPane from './EditorChatPane';

export default function BaseEditor({
  toolbar,
  children,
  chatPaneContext,
  rightPane,
  reserveTrafficLightSpace = false,
}: {
  toolbar?: React.ReactNode;
  children: React.ReactNode;
  chatPaneContext?: string;
  rightPane?: React.ReactNode;
  reserveTrafficLightSpace?: boolean;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      {toolbar ? (
        <div className={`flex-none border-b border-border bg-background pt-2 ${reserveTrafficLightSpace ? 'pb-3 pl-36 pr-5' : 'px-4 py-2'}`}>
          {toolbar}
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1">
        <div className="flex flex-[3] flex-col min-w-0 overflow-hidden">
          {children}
        </div>
        <div className="flex-[1] min-w-0 overflow-hidden">
          {rightPane !== undefined ? rightPane : <EditorChatPane context={chatPaneContext} />}
        </div>
      </div>
    </div>
  );
}
