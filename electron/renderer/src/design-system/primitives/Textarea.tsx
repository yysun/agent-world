/**
 * Design-System Textarea Primitive
 *
 * Purpose:
 * - Provide a generic multiline text-input wrapper.
 *
 * Key Features:
 * - Supports default and sidebar visual tones.
 * - Supports optional monospace styling.
 * - Supports compact and regular sizes.
 *
 * Implementation Notes:
 * - Uses semantic field-style aliases from Foundations.
 *
 * Recent Changes:
 * - 2026-03-23: Added optional `textareaRef` support so ref-dependent renderer surfaces can still use the shared primitive.
 * - 2026-03-23: Added as part of the next atomic primitive extraction slice.
 */

import type React from 'react';
import { FIELD_TONE_CLASS_NAMES, type FieldTone } from '../foundations/field-styles';

type TextareaSize = 'sm' | 'md';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  tone?: FieldTone;
  size?: TextareaSize;
  monospace?: boolean;
  textareaRef?: React.Ref<HTMLTextAreaElement>;
}

const TEXTAREA_BASE_CLASS_NAME = 'w-full rounded-md border outline-none';

const TEXTAREA_SIZE_CLASS_NAMES: Record<TextareaSize, string> = {
  sm: 'px-3 py-2 text-xs',
  md: 'p-4 text-sm',
};

export default function Textarea({
  tone = 'default',
  size = 'sm',
  monospace = false,
  textareaRef,
  className = '',
  ...props
}: TextareaProps) {
  return (
    <textarea
      ref={textareaRef}
      className={[
        TEXTAREA_BASE_CLASS_NAME,
        FIELD_TONE_CLASS_NAMES[tone],
        TEXTAREA_SIZE_CLASS_NAMES[size],
        monospace ? 'font-mono' : '',
        className,
      ].filter(Boolean).join(' ')}
      {...props}
    />
  );
}