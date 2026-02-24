/**
 * App Frame Layout Component
 * Purpose:
 * - Render the outer desktop renderer frame and primary shell composition.
 *
 * Key Features:
 * - Root full-screen wrapper with shared background/text classes.
 * - Primary horizontal frame for sidebar + main content regions.
 * - Overlay region rendered after the main frame for modals/prompts.
 *
 * Implementation Notes:
 * - Uses slot-like props to keep orchestration in `App.jsx` while removing bulky wrapper markup.
 * - Preserves original DOM order and class names.
 *
 * Recent Changes:
 * - 2026-02-17: Extracted from `App.jsx` as part of Phase 4 component decomposition.
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