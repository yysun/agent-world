/**
 * App Overlays Host Component
 * Purpose:
 * - Compose top-level overlay/modal components used by the desktop renderer.
 *
 * Key Features:
 * - Renders HITL prompt modal when requests are active.
 * - Renders prompt/world-config editor modals for agent/world editing flows.
 *
 * Implementation Notes:
 * - Receives grouped prop objects from `App.jsx` orchestration.
 * - Preserves existing overlay render order.
 *
 * Recent Changes:
 * - 2026-02-17: Added for Phase 5 final integration cleanup.
 */

import HitlPromptModal from './HitlPromptModal.jsx';
import EditorModalsHost from './EditorModalsHost.jsx';

export default function AppOverlaysHost({ hitlPromptProps, editorModalsProps }) {
  return (
    <>
      <HitlPromptModal {...hitlPromptProps} />
      <EditorModalsHost {...editorModalsProps} />
    </>
  );
}