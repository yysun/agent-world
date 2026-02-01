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
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3">
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
          w-full resize-none bg-transparent
          px-1 py-1 text-sm text-foreground placeholder:text-muted-foreground
          focus:outline-none
          disabled:cursor-not-allowed disabled:opacity-50
        "
        aria-label="Message input"
      />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="
              flex h-8 w-8 items-center justify-center rounded-lg
              text-muted-foreground transition-colors hover:bg-muted hover:text-foreground
              focus:outline-none focus:ring-2 focus:ring-ring
            "
            aria-label="Attach file"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
            >
              <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          </button>
          <button
            type="button"
            className="
              flex h-8 items-center gap-1.5 rounded-lg px-3
              text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground
              focus:outline-none focus:ring-2 focus:ring-ring
            "
            aria-label="Select folder"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
            </svg>
            <span>projects</span>
          </button>
        </div>
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
