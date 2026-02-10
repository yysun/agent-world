/**
 * ActivityPulse Component - Visual Indicator During Active Operations
 *
 * Purpose:
 * - Pulsing dot indicator when agents/tools are working
 * - Compact header-friendly display
 * - Color-coded states (active, idle)
 *
 * Key Features:
 * - CSS animation for pulsing effect
 * - Optional label text
 * - Accessible status announcement
 *
 * Implementation Notes:
 * - Receives isBusy boolean from parent
 * - Pure CSS animation, no JS timers
 *
 * Recent Changes:
 * - 2026-02-10: Initial implementation
 */

import React from 'react';

/**
 * @param {Object} props
 * @param {boolean} props.isActive - Whether activity is in progress
 * @param {string} [props.label] - Optional label text
 * @param {string} [props.className] - Additional CSS classes
 */
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
