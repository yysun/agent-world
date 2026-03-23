/**
 * Design-System Checkbox Primitive
 *
 * Purpose:
 * - Provide a generic checkbox input control wrapper.
 *
 * Key Features:
 * - Preserves native checkbox semantics.
 * - Applies the shared renderer accent treatment by default.
 * - Keeps surrounding labels and layout with caller-owned markup.
 *
 * Implementation Notes:
 * - Intentionally minimal: this is a base control, not a settings-specific row widget.
 *
 * Recent Changes:
 * - 2026-03-23: Added after classifying checkbox inputs as primitives.
 */

import type React from 'react';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {}

export default function Checkbox({ className = '', ...props }: CheckboxProps) {
  return (
    <input
      type="checkbox"
      className={['accent-primary', className].filter(Boolean).join(' ')}
      {...props}
    />
  );
}