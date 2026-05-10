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
 * - 2026-05-10: Stopped floating the queue/composer/status stack over the transcript so messages end above the composer instead of scrolling underneath it.
 * - 2026-03-11: Restored the fixed floating composer inset so queue overlay does not expand message-panel bottom padding.
 * - 2026-03-05: Increased queue/composer overlap (`-mb-6`) so the queue card sits lower, closer to the composer input.
 * - 2026-03-05: Added dedicated `queuePanel` slot rendered above `ComposerBar` so queued user messages appear before the composer.
 * - 2026-03-04: Floated queue/composer/status stack above the message area and exposed a CSS inset variable for message-panel bottom padding.
 * - 2026-02-28: Moved status-bar slot into the composer column so status content aligns with composer width/position.
 * - 2026-02-17: Extracted from `App.jsx` as part of Phase 4 component decomposition.
 * - 2026-02-17: Simplified integration contract to grouped prop objects for message/composer/right-panel composition.
 */

import { ComposerBar, MessageListPanel } from '../../../features/chat';
import RightPanelShell from './RightPanelShell';
import RightPanelContent from './RightPanelContent';

export default function MainContentArea({
  messageListProps,
  composerProps,
  rightPanelShellProps,
  rightPanelContentProps,
  queuePanel,
  statusBar,
}) {
  return (
    <div className="flex min-h-0 flex-1">
      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <MessageListPanel {...messageListProps} />

        <div className="shrink-0">
          {queuePanel}
          <ComposerBar {...composerProps} />
          {statusBar}
        </div>
      </section>

      <RightPanelShell {...rightPanelShellProps}>
        <RightPanelContent {...rightPanelContentProps} />
      </RightPanelShell>
    </div>
  );
}
