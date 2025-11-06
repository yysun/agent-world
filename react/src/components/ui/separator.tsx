/**
 * Separator Component - shadcn-style separator
 * 
 * Purpose: Visual divider between content sections
 * 
 * Features:
 * - Horizontal or vertical orientation
 * - Consistent styling with border color
 */

import React from 'react';

export interface SeparatorProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: 'horizontal' | 'vertical';
  decorative?: boolean;
}

const Separator = React.forwardRef<HTMLDivElement, SeparatorProps>(
  ({ className = '', orientation = 'horizontal', decorative = true, ...props }, ref) => {
    return (
      <div
        ref={ref}
        role={decorative ? 'none' : 'separator'}
        aria-orientation={orientation}
        className={`shrink-0 bg-border ${orientation === 'horizontal' ? 'h-[1px] w-full' : 'h-full w-[1px]'
          } ${className}`}
        {...props}
      />
    );
  }
);
Separator.displayName = 'Separator';

export { Separator };
