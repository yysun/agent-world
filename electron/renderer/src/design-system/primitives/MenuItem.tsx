/**
 * Design-System MenuItem Primitive
 *
 * Purpose:
 * - Provide a generic row-style action control for menus and pick lists.
 *
 * Key Features:
 * - Full-width text-aligned button layout.
 * - Optional selected state styling.
 * - Reusable for dropdown and list action surfaces.
 *
 * Implementation Notes:
 * - Exposes a neutral button API rather than feature-specific menu semantics.
 *
 * Recent Changes:
 * - 2026-03-23: Added as part of the corrected atomic primitive extraction.
 */

import type React from 'react';

export interface MenuItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
}

const MENU_ITEM_BASE_CLASS_NAME = 'flex w-full items-center rounded-md px-2 py-1.5 text-left transition-colors';

export default function MenuItem({
  type = 'button',
  selected = false,
  className = '',
  ...props
}: MenuItemProps) {
  return (
    <button
      type={type}
      aria-pressed={selected || undefined}
      data-selected={selected ? 'true' : 'false'}
      className={[
        MENU_ITEM_BASE_CLASS_NAME,
        selected
          ? 'bg-accent text-accent-foreground'
          : 'text-foreground hover:bg-accent hover:text-accent-foreground',
        className,
      ].filter(Boolean).join(' ')}
      {...props}
    />
  );
}