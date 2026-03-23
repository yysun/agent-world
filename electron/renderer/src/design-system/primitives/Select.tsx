/**
 * Design-System Select Primitive
 *
 * Purpose:
 * - Provide a generic select control wrapper.
 *
 * Key Features:
 * - Supports default and sidebar visual tones.
 * - Supports compact and regular sizes.
 * - Preserves native select semantics and caller-owned options.
 *
 * Implementation Notes:
 * - Uses semantic field-style aliases from Foundations.
 *
 * Recent Changes:
 * - 2026-03-23: Added as part of the next atomic primitive extraction slice.
 */

import type React from 'react';
import { FIELD_TONE_CLASS_NAMES, type FieldTone } from '../foundations/field-styles';

type SelectSize = 'sm' | 'md';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  tone?: FieldTone;
  size?: SelectSize;
}

const SELECT_BASE_CLASS_NAME = 'w-full rounded-md border outline-none';

const SELECT_SIZE_CLASS_NAMES: Record<SelectSize, string> = {
  sm: 'px-3 py-2 text-xs',
  md: 'px-4 py-2 text-sm',
};

export default function Select({
  tone = 'default',
  size = 'sm',
  className = '',
  ...props
}: SelectProps) {
  return (
    <select
      className={[
        SELECT_BASE_CLASS_NAME,
        FIELD_TONE_CLASS_NAMES[tone],
        SELECT_SIZE_CLASS_NAMES[size],
        className,
      ].filter(Boolean).join(' ')}
      {...props}
    />
  );
}