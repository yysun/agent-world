/**
 * Design-System AppFrameLayout Pattern
 *
 * Purpose:
 * - Render a generic desktop shell frame with sidebar, main content, and overlays.
 *
 * Key Features:
 * - Shared full-screen background and foreground styling.
 * - Stable slot-based composition for outer frame surfaces.
 * - Overlay region rendered after the main frame.
 *
 * Implementation Notes:
 * - Keeps orchestration outside the pattern via slot props.
 * - Kept API-compatible with the prior renderer-local pattern during migration.
 *
 * Recent Changes:
 * - 2026-03-23: Moved into the design-system pattern layer.
 */

export default function AppFrameLayout({ sidebar, mainContent, overlays }) {
  return (
    <div className="h-screen w-screen overflow-hidden bg-background text-foreground">
      <div className="flex h-full">
        {sidebar}
        {mainContent}
      </div>
      {overlays}
    </div>
  );
}