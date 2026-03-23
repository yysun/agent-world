/**
 * Design-System Button Primitive
 *
 * Purpose:
 * - Provide a generic button control with semantic variants and sizes.
 *
 * Key Features:
 * - Supports primary, secondary, outline, ghost, and danger variants.
 * - Supports small, medium, and icon sizing.
 * - Preserves standard button semantics and disabled behavior.
 *
 * Implementation Notes:
 * - Built entirely from renderer foundation tokens/classes.
 * - Keeps the API composition-oriented so feature components control copy and meaning.
 *
 * Recent Changes:
 * - 2026-03-23: Added as part of the corrected atomic primitive extraction.
 */

import type React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'icon';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const BUTTON_BASE_CLASS_NAME = 'inline-flex items-center justify-center rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60';

const BUTTON_VARIANT_CLASS_NAMES: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
  outline: 'border border-input bg-background text-foreground hover:bg-muted',
  ghost: 'text-foreground hover:bg-muted',
  danger: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
};

const BUTTON_SIZE_CLASS_NAMES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1 text-xs',
  md: 'px-4 py-2 text-sm',
  icon: 'h-9 w-9 p-0',
};

export default function Button({
  type = 'button',
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={[
        BUTTON_BASE_CLASS_NAME,
        BUTTON_VARIANT_CLASS_NAMES[variant],
        BUTTON_SIZE_CLASS_NAMES[size],
        className,
      ].filter(Boolean).join(' ')}
      {...props}
    />
  );
}