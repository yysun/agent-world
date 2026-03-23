/**
 * Settings Switch Component
 *
 * Purpose:
 * - Provide the renderer's labeled settings toggle row widget.
 *
 * Key Features:
 * - Controlled checked state.
 * - Optional disabled state.
 * - Sidebar-oriented label and switch presentation.
 *
 * Implementation Notes:
 * - Shared within settings-related renderer UI, but intentionally kept out of design-system primitives.
 *
 * Recent Changes:
 * - 2026-03-23: Rewired the raw switch markup onto the generic `Switch` primitive while keeping the settings-row pattern local.
 * - 2026-03-23: Moved out of the primitive layer because it encodes a settings-specific control pattern.
 */

import { Switch } from '../../../design-system/primitives';

export default function SettingsSwitch({ label, checked, onClick, disabled = false }) {
  return (
    <div className="flex items-center justify-between rounded-md pr-1 py-1">
      <span className="text-xs font-bold text-sidebar-foreground/90">{label}</span>
      <Switch
        aria-label={label}
        onClick={onClick}
        checked={checked}
        disabled={disabled}
      />
    </div>
  );
}