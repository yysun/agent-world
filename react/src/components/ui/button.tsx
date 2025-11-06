/**
 * Button Component - shadcn-style button
 * 
 * Purpose: Reusable button component with variants
 * 
 * Features:
 * - Multiple variants (default, outline, ghost, destructive)
 * - Size options (sm, default, lg)
 * - Disabled state styling
 * - Full accessibility support
 */

import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost' | 'destructive' | 'secondary';
  size?: 'sm' | 'default' | 'lg';
  children?: React.ReactNode;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'default', size = 'default', children, ...props }, ref) => {
    const baseStyles = 'inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50';

    const variants = {
      default: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow',
      outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
      ghost: 'hover:bg-accent hover:text-accent-foreground',
      destructive: 'bg-red-500 text-white hover:bg-red-600 shadow',
      secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80 shadow-sm',
    };

    const sizes = {
      sm: 'h-8 px-3 text-xs',
      default: 'h-10 px-4 py-2',
      lg: 'h-11 px-8',
    };

    const variantClass = variants[variant];
    const sizeClass = sizes[size];

    return (
      <button
        className={`${baseStyles} ${variantClass} ${sizeClass} ${className}`}
        ref={ref}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';

export { Button };
