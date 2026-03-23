/**
 * Activity Pulse Component
 *
 * Purpose:
 * - Provide a compact renderer status indicator for active/idle work states.
 *
 * Key Features:
 * - Accessible status announcement.
 * - Optional label text.
 * - Pure CSS pulse animation.
 *
 * Implementation Notes:
 * - Shared within renderer feature components, but intentionally kept out of design-system primitives.
 *
 * Recent Changes:
 * - 2026-03-23: Moved out of the primitive layer because it is a specialized status widget.
 */

import React from 'react';

export default function ActivityPulse({ isActive, label, className = '' }) {
  return (
    <div
      className={`flex items-center gap-1.5 ${className}`}
      role="status"
      aria-live="polite"
      aria-label={isActive ? 'Activity in progress' : 'Idle'}
    >
      <span className="relative flex h-2.5 w-2.5">
        {isActive ? (
          <>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
          </>
        ) : (
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-muted-foreground/40" />
        )}
      </span>
      {label ? (
        <span className={`text-xs ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>
          {label}
        </span>
      ) : null}
    </div>
  );
}