/**
 * ElapsedTimeCounter Component - Display Operation Duration
 *
 * Purpose:
 * - Show elapsed time since operation started
 * - Format as mm:ss or hh:mm:ss for long operations
 * - Compact display for header integration
 *
 * Key Features:
 * - Receives elapsedMs from activity state
 * - Auto-formats based on duration
 * - Accessible time announcement
 *
 * Implementation Notes:
 * - No internal timer, receives updates from parent
 * - Pure display component
 *
 * Recent Changes:
 * - 2026-02-10: Initial implementation
 */

import React from 'react';

/**
 * Format milliseconds as human-readable time
 * @param {number} ms - Elapsed time in milliseconds
 * @returns {string} Formatted time string
 */
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

/**
 * @param {Object} props
 * @param {number} props.elapsedMs - Elapsed time in milliseconds
 * @param {boolean} [props.showIcon] - Whether to show clock icon
 * @param {string} [props.className] - Additional CSS classes
 */
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
