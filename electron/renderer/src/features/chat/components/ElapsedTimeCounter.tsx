/**
 * Elapsed Time Counter Component
 *
 * Purpose:
 * - Render elapsed operation time in a compact renderer-specific status format.
 *
 * Key Features:
 * - Formats elapsed milliseconds into human-readable time.
 * - Optional clock icon.
 * - Accessible timer semantics.
 *
 * Implementation Notes:
 * - Shared across renderer feature components, but intentionally kept out of design-system primitives.
 *
 * Recent Changes:
 * - 2026-03-23: Moved out of the primitive layer because it is a specialized timing widget.
 */

import React from 'react';

function formatElapsed(ms) {
  if (ms < 0) return '0s';

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  if (minutes > 0) {
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  return `${seconds}s`;
}

export default function ElapsedTimeCounter({ elapsedMs, showIcon = true, className = '' }) {
  if (elapsedMs <= 0) {
    return null;
  }

  const formattedTime = formatElapsed(elapsedMs);

  return (
    <div
      className={`flex items-center gap-1 text-xs text-muted-foreground ${className}`}
      role="timer"
      aria-live="off"
      aria-label={`Elapsed time: ${formattedTime}`}
    >
      {showIcon ? (
        <svg
          className="h-3 w-3"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      ) : null}
      <span className="tabular-nums">{formattedTime}</span>
    </div>
  );
}