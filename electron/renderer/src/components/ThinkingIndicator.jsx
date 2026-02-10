/**
 * ThinkingIndicator Component - Animated Placeholder During LLM Response
 *
 * Purpose:
 * - Display animated dots while waiting for first chunk
 * - Show "Thinking..." text with pulsing animation
 * - Provide visual feedback that the system is working
 *
 * Key Features:
 * - Pure CSS animation (no JS timers)
 * - Accessible aria-live for screen readers
 * - Configurable text and styling
 *
 * Implementation Notes:
 * - Show when streaming starts, hide once first chunk arrives
 * - Uses Tailwind utilities for animation
 *
 * Recent Changes:
 * - 2026-02-10: Initial implementation
 */

import React from 'react';

/**
 * @param {Object} props
 * @param {string} [props.text] - Custom thinking text
 * @param {string} [props.className] - Additional CSS classes
 */
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
