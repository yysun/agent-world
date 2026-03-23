/**
 * Labeled Field Pattern
 *
 * Purpose:
 * - Provide a generic label-plus-control wrapper for renderer forms.
 *
 * Key Features:
 * - Renders a consistent stacked label and content layout.
 * - Supports custom wrapper and label styling when a consumer needs sizing overrides.
 * - Stays domain-agnostic by accepting arbitrary child content.
 *
 * Implementation Notes:
 * - This pattern owns only the repeated label/container structure, not field semantics.
 *
 * Recent Changes:
 * - 2026-03-23: Added after repeated labeled control wrappers were identified across world and agent forms.
 */

import type React from 'react';

export interface LabeledFieldProps {
  label: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  labelClassName?: string;
}

const LABELED_FIELD_CLASS_NAME = 'flex flex-col gap-1';
const LABELED_FIELD_LABEL_CLASS_NAME = 'text-xs font-bold text-sidebar-foreground/90';

export default function LabeledField({
  label,
  children,
  className = '',
  labelClassName = '',
}: LabeledFieldProps) {
  return (
    <div className={[LABELED_FIELD_CLASS_NAME, className].filter(Boolean).join(' ')}>
      <label className={[LABELED_FIELD_LABEL_CLASS_NAME, labelClassName].filter(Boolean).join(' ')}>{label}</label>
      {children}
    </div>
  );
}