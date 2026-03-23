/**
 * Design-System Card Primitive
 *
 * Purpose:
 * - Provide a generic bordered surface primitive for grouped content.
 *
 * Key Features:
 * - Supports neutral, muted, and elevated tones.
 * - Supports configurable padding.
 * - Keeps structure generic so feature components own semantics and layout.
 *
 * Implementation Notes:
 * - Renders a plain div to stay framework- and workflow-agnostic.
 *
 * Recent Changes:
 * - 2026-03-23: Added as part of the corrected atomic primitive extraction.
 */

import type React from 'react';

type CardTone = 'default' | 'muted' | 'elevated';
type CardPadding = 'none' | 'sm' | 'md' | 'lg';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: CardTone;
  padding?: CardPadding;
}

const CARD_BASE_CLASS_NAME = 'rounded-lg border';

const CARD_TONE_CLASS_NAMES: Record<CardTone, string> = {
  default: 'border-border bg-card',
  muted: 'border-border/70 bg-card/40',
  elevated: 'border-border bg-background shadow-xl',
};

const CARD_PADDING_CLASS_NAMES: Record<CardPadding, string> = {
  none: '',
  sm: 'p-2',
  md: 'p-3',
  lg: 'p-4',
};

export default function Card({
  tone = 'default',
  padding = 'md',
  className = '',
  ...props
}: CardProps) {
  return (
    <div
      className={[
        CARD_BASE_CLASS_NAME,
        CARD_TONE_CLASS_NAMES[tone],
        CARD_PADDING_CLASS_NAMES[padding],
        className,
      ].filter(Boolean).join(' ')}
      {...props}
    />
  );
}