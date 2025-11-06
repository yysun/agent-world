/**
 * ChatTypingIndicator Component
 * 
 * Purpose: Animated indicator for streaming/thinking state
 * 
 * Features:
 * - Three-dot bounce animation (CSS-only)
 * - Customizable message text
 * - Accessible with ARIA live region
 * 
 * Implementation:
 * - Pure CSS animation using staggered delays
 * - No JavaScript animation for performance
 * - Matches assistant message styling
 * 
 * Changes:
 * - 2025-11-04: Created for Phase 2 - Core Components
 */

export interface ChatTypingIndicatorProps {
  /** Custom message text (default: "Assistant is thinking") */
  message?: string;

  /** Additional CSS classes */
  className?: string;
}

/**
 * ChatTypingIndicator - Displays animated thinking indicator
 * 
 * @component
 * @example
 * ```tsx
 * <ChatTypingIndicator message="Agent is responding..." />
 * ```
 */
export function ChatTypingIndicator({
  message = 'Assistant is thinking',
  className = '',
}: ChatTypingIndicatorProps) {
  return (
    <div
      className={`flex items-center gap-2 text-sm text-muted-foreground ${className}`}
      role="status"
      aria-live="polite"
      aria-label={message}
    >
      <span>{message}</span>
      <span className="flex gap-1" aria-hidden="true">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:0ms]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:150ms]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:300ms]" />
      </span>
    </div>
  );
}
