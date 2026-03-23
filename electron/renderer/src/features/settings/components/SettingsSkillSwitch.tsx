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
 * - 2026-03-23: Rewired the raw switch markup onto the generic `Switch` primitive while keeping the skill-row pattern local.
 * - 2026-02-16: Extracted from `App.jsx` as part of renderer refactor Phase 2.
 */

import { Switch } from '../../../design-system/primitives';

export default function SettingsSkillSwitch({ label, checked, onClick, disabled }) {
  return (
    <div className="flex items-center justify-between rounded-md px-1 py-1">
      <span className={`text-xs ${disabled ? 'text-sidebar-foreground/45' : 'text-sidebar-foreground/80'}`}>{label}</span>
      <Switch
        aria-label={label}
        onClick={onClick}
        checked={checked}
        disabled={disabled}
        size="sm"
      />
    </div>
  );
}
