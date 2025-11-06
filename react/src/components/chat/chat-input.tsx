/**
 * ChatInput Component
 * 
 * Purpose: Multi-line message input with send functionality
 * 
 * Features:
 * - Auto-resizing textarea (up to maxRows)
 * - Enter to send, Shift+Enter for newline
 * - Loading and disabled states
 * - Accessible with ARIA labels
 * 
 * Implementation:
 * - Keyboard shortcuts for better UX
 * - Visual feedback for all states
 * - Focus management
 * 
 * Changes:
 * - 2025-11-04: Created for Phase 3 - Input & Interaction
 */

import { useRef, useEffect } from 'react';

export interface ChatInputProps {
  /** Current input value */
  value: string;

  /** Value change handler */
  onChange: (value: string) => void;

  /** Submit handler */
  onSubmit: () => void;

  /** Disabled state */
  disabled?: boolean;

  /** Placeholder text */
  placeholder?: string;

  /** Maximum number of rows before scrolling */
  maxRows?: number;

  /** Auto-focus on mount */
  autoFocus?: boolean;
}

/**
 * ChatInput - Message input with send button
 * 
 * @component
 * @example
 * ```tsx
 * <ChatInput
 *   value={message}
 *   onChange={setMessage}
 *   onSubmit={handleSend}
 *   disabled={sending}
 * />
 * ```
 */
export function ChatInput({
  value,
  onChange,
  onSubmit,
  disabled = false,
  placeholder = 'Send a message...',
  maxRows = 5,
  autoFocus = false,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea based on content
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Reset height to calculate new height
    textarea.style.height = 'auto';

    // Calculate line height and max height
    const lineHeight = parseInt(getComputedStyle(textarea).lineHeight);
    const maxHeight = lineHeight * maxRows;

    // Set new height (constrained by maxHeight)
    const newHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = `${newHeight}px`;
  }, [value, maxRows]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !disabled) {
        onSubmit();
      }
    }
  };

  const handleSubmit = () => {
    if (value.trim() && !disabled) {
      onSubmit();
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={placeholder}
        autoFocus={autoFocus}
        rows={1}
        className="
          w-full resize-none rounded-lg border border-border bg-background
          px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground
          focus:outline-none focus:ring-2 focus:ring-ring
          disabled:cursor-not-allowed disabled:opacity-50
        "
        aria-label="Message input"
        aria-describedby="input-help"
      />
      <div className="flex items-center justify-between">
        <span id="input-help" className="text-xs text-muted-foreground">
          Press Enter to send, Shift+Enter for new line
        </span>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={disabled || !value.trim()}
          className="
            rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground
            shadow-sm transition-colors hover:bg-primary/90
            focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2
            disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-primary
          "
          aria-label="Send message"
        >
          {disabled ? 'Sending...' : 'Send'}
        </button>
      </div>
    </div>
  );
}
