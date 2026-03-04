/**
 * Main Content Area Component
 * Purpose:
 * - Compose the central main area layout: message panel, composer, and right side panel.
 *
 * Key Features:
 * - Renders message list panel with inline working indicator behavior.
 * - Renders composer bar with send/stop semantics.
 * - Renders status bar in the same main section column for composer-aligned placement.
 * - Renders right panel shell and nested right panel content.
 *
 * Implementation Notes:
 * - Receives all state and actions from `App.jsx` orchestration.
 * - Preserves existing render order and layout structure from the previous inline block.
 *
 * Recent Changes:
 * - 2026-03-04: Floated queue/composer/status stack above the message area and exposed a CSS inset variable for message-panel bottom padding.
 * - 2026-02-28: Moved status-bar slot into the composer column so status content aligns with composer width/position.
 * - 2026-02-17: Extracted from `App.jsx` as part of Phase 4 component decomposition.
 * - 2026-02-17: Simplified integration contract to grouped prop objects for message/composer/right-panel composition.
 */

import type React from 'react';
import ComposerBar from './ComposerBar';
import MessageListPanel from './MessageListPanel';
import RightPanelContent from './RightPanelContent';
import RightPanelShell from './RightPanelShell';

export default function MainContentArea({
  messageListProps,
  composerProps,
  rightPanelShellProps,
  rightPanelContentProps,
  statusBar,
}) {
  return (
    <div className="flex min-h-0 flex-1">
      <section
        className="relative flex min-h-0 min-w-0 flex-1 flex-col"
        style={{ '--floating-composer-height': '8.5rem' } as React.CSSProperties}
      >
        <MessageListPanel {...messageListProps} />

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20">
          <div className="pointer-events-auto">
            <ComposerBar {...composerProps} />
            {statusBar}
          </div>
        </div>
      </section>

      <RightPanelShell {...rightPanelShellProps}>
        <RightPanelContent {...rightPanelContentProps} />
      </RightPanelShell>
    </div>
  );
}
