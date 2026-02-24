/**
 * App Overlays Host Component
 * Purpose:
 * - Compose top-level overlay/modal components used by the desktop renderer.
 *
 * Key Features:
 * - Renders prompt/world-config editor modals for agent/world editing flows.
 *
 * Implementation Notes:
 * - Receives grouped prop objects from `App.jsx` orchestration.
 * - Preserves existing overlay render order.
 *
 * Recent Changes:
 * - 2026-02-20: Removed HITL modal overlay composition; HITL prompts now render inline in the message flow.
 * - 2026-02-17: Added for Phase 5 final integration cleanup.
 */

import EditorModalsHost from './EditorModalsHost';

export default function AppOverlaysHost({ editorModalsProps }) {
  return (
    <>
      <EditorModalsHost {...editorModalsProps} />
    </>
  );
}
