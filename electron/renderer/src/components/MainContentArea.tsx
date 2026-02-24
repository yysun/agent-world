/**
 * Main Content Area Component
 * Purpose:
 * - Compose the central main area layout: message panel, composer, and right side panel.
 *
 * Key Features:
 * - Renders message list panel with inline working indicator behavior.
 * - Renders composer bar with send/stop semantics.
 * - Renders right panel shell and nested right panel content.
 *
 * Implementation Notes:
 * - Receives all state and actions from `App.jsx` orchestration.
 * - Preserves existing render order and layout structure from the previous inline block.
 *
 * Recent Changes:
 * - 2026-02-17: Extracted from `App.jsx` as part of Phase 4 component decomposition.
 * - 2026-02-17: Simplified integration contract to grouped prop objects for message/composer/right-panel composition.
 */

import ComposerBar from './ComposerBar';
import MessageListPanel from './MessageListPanel';
import RightPanelContent from './RightPanelContent';
import RightPanelShell from './RightPanelShell';

export default function MainContentArea({
  messageListProps,
  composerProps,
  rightPanelShellProps,
  rightPanelContentProps,
}) {
  return (
    <div className="flex min-h-0 flex-1">
      <section className="flex min-w-0 flex-1 flex-col">
        <MessageListPanel {...messageListProps} />

        <ComposerBar {...composerProps} />
      </section>

      <RightPanelShell {...rightPanelShellProps}>
        <RightPanelContent {...rightPanelContentProps} />
      </RightPanelShell>
    </div>
  );
}