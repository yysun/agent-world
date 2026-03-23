/**
 * Thinking Indicator Component
 *
 * Purpose:
 * - Show the renderer's animated pending-work text widget.
 *
 * Key Features:
 * - Accessible status announcement.
 * - Optional text override.
 * - Pure CSS dot animation.
 *
 * Implementation Notes:
 * - Shared within renderer status displays, but intentionally kept out of design-system primitives.
 *
 * Recent Changes:
 * - 2026-03-23: Moved out of the primitive layer because it is a specialized pending-state widget.
 */

import React from 'react';

export default function ThinkingIndicator({ text = 'Thinking', className = '' }) {
  return (
    <div
      className={`flex items-center gap-1.5 text-sm text-muted-foreground ${className}`}
      role="status"
      aria-live="polite"
      aria-label={`${text}...`}
    >
      <span>{text}</span>
      <span className="flex gap-0.5">
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-pulse" style={{ animationDelay: '0ms' }} />
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-pulse" style={{ animationDelay: '150ms' }} />
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-pulse" style={{ animationDelay: '300ms' }} />
      </span>
    </div>
  );
}