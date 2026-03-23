/**
 * Design-System Input Primitive
 *
 * Purpose:
 * - Provide a generic single-line text input wrapper.
 *
 * Key Features:
 * - Supports default and sidebar visual tones.
 * - Supports compact and regular sizes.
 * - Preserves standard input semantics and caller-owned behavior.
 *
 * Implementation Notes:
 * - Uses semantic field-style aliases from Foundations.
 *
 * Recent Changes:
 * - 2026-03-23: Added as part of the next atomic primitive extraction slice.
 */

import type React from 'react';
import { FIELD_TONE_CLASS_NAMES, type FieldTone } from '../foundations/field-styles';

type InputSize = 'sm' | 'md';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  tone?: FieldTone;
  size?: InputSize;
}

const INPUT_BASE_CLASS_NAME = 'w-full rounded-md border outline-none';

const INPUT_SIZE_CLASS_NAMES: Record<InputSize, string> = {
  sm: 'px-3 py-2 text-xs',
  md: 'px-4 py-2 text-sm',
};

export default function Input({
  tone = 'default',
  size = 'sm',
  className = '',
  ...props
}: InputProps) {
  return (
    <input
      className={[
        INPUT_BASE_CLASS_NAME,
        FIELD_TONE_CLASS_NAMES[tone],
        INPUT_SIZE_CLASS_NAMES[size],
        className,
      ].filter(Boolean).join(' ')}
      {...props}
    />
  );
}