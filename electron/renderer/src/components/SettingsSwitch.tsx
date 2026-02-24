/**
 * Settings Switch Component
 * Purpose:
 * - Render a labeled toggle switch used in renderer settings panels.
 *
 * Key Features:
 * - Accessible switch semantics (`role="switch"`, `aria-checked`).
 * - Visual on/off styling aligned with sidebar theme tokens.
 *
 * Implementation Notes:
 * - Stateless presentational component; state is controlled by parent.
 * - `onClick` is required for toggling behavior.
 *
 * Recent Changes:
 * - 2026-02-16: Extracted from `App.jsx` as part of renderer refactor Phase 2.
 */

export default function SettingsSwitch({ label, checked, onClick }) {
  return (
    <div className="flex items-center justify-between rounded-md pr-1 py-1">
      <span className="text-xs font-bold text-sidebar-foreground/90">{label}</span>
      <button
        type="button"
        role="switch"
        aria-label={label}
        aria-checked={checked}
        onClick={onClick}
        className="rounded-full"
      >
        <span className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${checked ? 'bg-sidebar-primary/62' : 'bg-sidebar-foreground/24'}`}>
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-4' : 'translate-x-1'}`} />
        </span>
      </button>
    </div>
  );
}
