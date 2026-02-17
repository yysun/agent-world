/**
 * Settings Skill Switch Component
 * Purpose:
 * - Render a compact toggle switch for per-skill enable/disable rows.
 *
 * Key Features:
 * - Supports disabled mode with reduced contrast and interaction lock.
 * - Accessible switch semantics for keyboard/screen-reader support.
 *
 * Implementation Notes:
 * - Stateless presentational component controlled by parent state.
 * - Uses sidebar tokens for visual consistency with settings panel.
 *
 * Recent Changes:
 * - 2026-02-16: Extracted from `App.jsx` as part of renderer refactor Phase 2.
 */

export default function SettingsSkillSwitch({ label, checked, onClick, disabled }) {
  return (
    <div className="flex items-center justify-between rounded-md px-1 py-1">
      <span className={`text-xs ${disabled ? 'text-sidebar-foreground/45' : 'text-sidebar-foreground/80'}`}>{label}</span>
      <button
        type="button"
        role="switch"
        aria-label={label}
        aria-checked={checked}
        onClick={onClick}
        disabled={disabled}
        className="rounded-full disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors ${checked ? 'bg-sidebar-primary/62' : 'bg-sidebar-foreground/24'}`}>
          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
        </span>
      </button>
    </div>
  );
}
