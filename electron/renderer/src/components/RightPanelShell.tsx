/**
 * Right Panel Shell Component
 * Purpose:
 * - Render the right-side panel container, title bar, and close control.
 *
 * Key Features:
 * - Animated open/closed width and opacity states.
 * - Context-aware panel title based on active panel mode.
 * - Consistent close button and header chrome across panel content variants.
 *
 * Implementation Notes:
 * - Receives open state, panel mode, and close action from `App.jsx` orchestration.
 * - Renders children only when panel is open, preserving existing mount behavior.
 *
 * Recent Changes:
 * - 2026-02-17: Extracted from `App.jsx` as part of Phase 4 component decomposition.
 */

function getPanelTitle(panelMode) {
  if (panelMode === 'settings') return 'System Settings';
  if (panelMode === 'edit-world') return 'Edit World';
  if (panelMode === 'create-agent') return 'Create Agent';
  if (panelMode === 'edit-agent') return 'Edit Agent';
  return 'Create World';
}

export default function RightPanelShell({ panelOpen, panelMode, onClose, children }) {
  return (
    <aside
      className={`border-l border-sidebar-border bg-sidebar text-sidebar-foreground transition-all duration-300 ${panelOpen ? 'w-80 p-4 opacity-100' : 'w-0 p-0 opacity-0'
        }`}
    >
      {panelOpen ? (
        <div className="flex h-full flex-col">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs uppercase tracking-wide text-sidebar-foreground/70">
              {getPanelTitle(panelMode)}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="flex h-6 w-6 items-center justify-center rounded text-sidebar-foreground/70 transition-colors hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground"
              title="Close panel"
              aria-label="Close panel"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {children}
        </div>
      ) : null}
    </aside>
  );
}