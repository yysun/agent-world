/**
 * Design-System Radio Primitive
 *
 * Purpose:
 * - Provide a generic radio input control wrapper.
 *
 * Key Features:
 * - Preserves native radio semantics.
 * - Applies the shared renderer accent treatment by default.
 * - Keeps group labeling and behavior with caller-owned markup.
 *
 * Implementation Notes:
 * - Intentionally minimal: this is a base control, not a labeled field pattern.
 *
 * Recent Changes:
 * - 2026-03-23: Added after classifying radio inputs as primitives.
 */

import type React from 'react';

export interface RadioProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {}

export default function Radio({ className = '', ...props }: RadioProps) {
  return (
    <input
      type="radio"
      className={['accent-primary', className].filter(Boolean).join(' ')}
      {...props}
    />
  );
}