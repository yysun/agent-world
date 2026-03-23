/**
 * Design-System Switch Primitive
 *
 * Purpose:
 * - Provide a generic accessible switch control with renderer-consistent styling.
 *
 * Key Features:
 * - Preserves native switch semantics via `role="switch"` and `aria-checked`.
 * - Supports compact and default sizes.
 * - Keeps label ownership with the caller through standard button ARIA props.
 *
 * Implementation Notes:
 * - This is a control primitive only; labeled rows and settings-specific layout stay outside the primitive layer.
 *
 * Recent Changes:
 * - 2026-03-23: Added after repeated switch-control markup remained duplicated across settings and agent forms.
 */

import type React from 'react';

type SwitchSize = 'sm' | 'md';

export interface SwitchProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  checked: boolean;
  size?: SwitchSize;
}

const SWITCH_BUTTON_CLASS_NAME = 'rounded-full disabled:cursor-not-allowed disabled:opacity-60';

const SWITCH_TRACK_CLASS_NAMES: Record<SwitchSize, string> = {
  md: 'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
  sm: 'relative inline-flex h-4 w-8 items-center rounded-full transition-colors',
};

const SWITCH_THUMB_CLASS_NAMES: Record<SwitchSize, string> = {
  md: 'inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform',
  sm: 'inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform',
};

const SWITCH_CHECKED_TRANSLATE_CLASS_NAMES: Record<SwitchSize, string> = {
  md: 'translate-x-4',
  sm: 'translate-x-4',
};

const SWITCH_UNCHECKED_TRANSLATE_CLASS_NAMES: Record<SwitchSize, string> = {
  md: 'translate-x-1',
  sm: 'translate-x-0.5',
};

export default function Switch({
  type = 'button',
  checked,
  size = 'md',
  className = '',
  ...props
}: SwitchProps) {
  return (
    <button
      type={type}
      role="switch"
      aria-checked={checked}
      className={[SWITCH_BUTTON_CLASS_NAME, className].filter(Boolean).join(' ')}
      {...props}
    >
      <span
        className={[
          SWITCH_TRACK_CLASS_NAMES[size],
          checked ? 'bg-sidebar-primary/62' : 'bg-sidebar-foreground/24',
        ].join(' ')}
      >
        <span
          className={[
            SWITCH_THUMB_CLASS_NAMES[size],
            checked ? SWITCH_CHECKED_TRANSLATE_CLASS_NAMES[size] : SWITCH_UNCHECKED_TRANSLATE_CLASS_NAMES[size],
          ].join(' ')}
        />
      </span>
    </button>
  );
}