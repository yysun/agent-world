/**
 * Design-System IconButton Primitive
 *
 * Purpose:
 * - Provide an icon-only button primitive with required accessible labeling.
 *
 * Key Features:
 * - Wraps the base Button primitive.
 * - Requires an accessible label.
 * - Supports icon-focused sizing overrides through the standard className prop.
 *
 * Implementation Notes:
 * - Keeps feature-specific icon meaning outside the primitive.
 *
 * Recent Changes:
 * - 2026-03-23: Added as part of the corrected atomic primitive extraction.
 */

import type React from 'react';
import Button, { type ButtonProps } from './Button';

export interface IconButtonProps extends Omit<ButtonProps, 'children' | 'size'> {
  label: string;
  children: React.ReactNode;
}

export default function IconButton({
  label,
  title,
  children,
  className = '',
  ...props
}: IconButtonProps) {
  return (
    <Button
      aria-label={label}
      title={title ?? label}
      size="icon"
      className={className}
      {...props}
    >
      {children}
    </Button>
  );
}