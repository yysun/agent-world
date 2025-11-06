/**
 * ChatMessageList Component
 * 
 * Purpose: Scrollable container for message history
 * 
 * Features:
 * - Auto-scroll to latest message
 * - Empty state display
 * - Loading state handling
 * - Optimized for 100+ messages
 * 
 * Implementation:
 * - Uses ref-based auto-scroll on new messages
 * - Maintains scroll position when viewing history
 * - ARIA role="log" for accessibility
 * 
 * Changes:
 * - 2025-11-04: Created for Phase 2 - Core Components
 */

import { useEffect, useRef } from 'react';
import { ChatMessageBubble } from './chat-message-bubble';
import type { ChatMessage } from './types';

export interface ChatMessageListProps {
  /** Array of messages to display */
  messages: ChatMessage[];

  /** Loading state */
  loading?: boolean;

  /** Empty state message */
  emptyMessage?: string;

  /** Additional CSS classes */
  className?: string;
}

/**
 * ChatMessageList - Scrollable message history container
 * 
 * @component
 * @example
 * ```tsx
 * <ChatMessageList
 *   messages={messages}
 *   loading={false}
 *   emptyMessage="No messages yet"
 * />
 * ```
 */
export function ChatMessageList({
  messages,
  loading = false,
  emptyMessage = 'No messages yet. Start a conversation!',
  className = '',
}: ChatMessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevMessagesLengthRef = useRef(messages.length);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > prevMessagesLengthRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevMessagesLengthRef.current = messages.length;
  }, [messages.length]);

  if (loading) {
    return (
      <div
        className={`flex items-center justify-center p-6 ${className}`}
        role="status"
        aria-live="polite"
      >
        <div className="text-center text-muted-foreground">
          <div className="mb-2 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
          <p className="text-sm">Loading messages...</p>
        </div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div
        className={`flex items-center justify-center p-6 ${className}`}
        role="status"
      >
        <p className="text-center text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`flex-1 overflow-y-auto p-4 space-y-4 ${className}`}
      role="log"
      aria-live="polite"
      aria-label="Chat messages"
    >
      {messages.map((message) => (
        <ChatMessageBubble
          key={message.id || message.messageId}
          message={message}
          allMessages={messages}
        />
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
}
