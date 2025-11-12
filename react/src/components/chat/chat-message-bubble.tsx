/**
 * ChatMessageBubble Component
 * 
 * Purpose: Display individual message with role-based styling
 * 
 * Features:
 * - Role-based visual styling (user, assistant, system, tool)
 * - Timestamp and sender display
 * - Threading indicator for replies
 * - Optimized with React.memo
 * 
 * Implementation:
 * - User messages: right-aligned, primary color
 * - Assistant messages: left-aligned, secondary color
 * - System messages: centered, muted style
 * - Tool messages: left-aligned, accent color
 * 
 * Changes:
 * - 2025-11-04: Created for Phase 2 - Core Components
 */

import React from 'react';
import type { ChatMessage } from './types';
import {
  isUserMessage,
  isAssistantMessage,
  isSystemMessage,
  isToolMessage,
} from './types';

export interface ChatMessageBubbleProps {
  /** Message to display */
  message: ChatMessage;

  /** Show timestamp (default: true) */
  showTimestamp?: boolean;

  /** Show sender name (default: true) */
  showSender?: boolean;

  /** All messages for threading context */
  allMessages?: ChatMessage[];
}

/**
 * ChatMessageBubble - Displays a single message with role-based styling
 * 
 * @component
 * @example
 * ```tsx
 * <ChatMessageBubble
 *   message={{ id: '1', role: 'user', content: 'Hello', createdAt: new Date().toISOString() }}
 *   showTimestamp={true}
 *   showSender={true}
 * />
 * ```
 */
export const ChatMessageBubble = React.memo<ChatMessageBubbleProps>(
  function ChatMessageBubble({
    message,
    showTimestamp = true,
    showSender = true,
    allMessages: _allMessages,
  }) {
    const isUser = isUserMessage(message);
    const isAssistant = isAssistantMessage(message);
    const isSystem = isSystemMessage(message);
    const isTool = isToolMessage(message);

    // Format timestamp
    const timestamp = message.createdAt
      ? new Date(message.createdAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
      : '';

    // Determine sender display name
    const senderName = message.sender || (isUser ? 'You' : 'Assistant');

    // Container alignment
    const containerClass = isUser
      ? 'flex justify-end'
      : isSystem
        ? 'flex justify-center'
        : 'flex justify-start';

    // Bubble styling based on role
    const bubbleClass = `
      rounded-[1rem] px-4 py-2 shadow-sm text-sm
      ${isUser ? 'bg-primary text-primary-foreground max-w-[80%]' : ''}
      ${isAssistant ? 'bg-secondary text-secondary-foreground max-w-[95%]' : ''}
      ${isSystem ? 'bg-muted text-muted-foreground italic border border-dashed max-w-[80%]' : ''}
      ${isTool ? 'bg-accent text-accent-foreground text-xs max-w-[80%]' : ''}
    `.trim();

    return (
      <div className={containerClass}>
        <div className={`flex flex-col gap-1 ${isAssistant ? 'max-w-[95%]' : 'max-w-[80%]'}`}>
          {/* Sender and timestamp (if not system message) */}
          {!isSystem && (showSender || showTimestamp) && (
            <div
              className={`flex items-center gap-2 text-xs text-muted-foreground px-1`}
            >
              {showSender && <span className="font-medium">{senderName}</span>}
              {showTimestamp && timestamp && <span>{timestamp}</span>}
            </div>
          )}

          {/* Message bubble */}
          <div className={bubbleClass}>
            <p className="whitespace-pre-wrap break-words leading-relaxed">
              {message.content}
            </p>
          </div>
        </div>
      </div>
    );
  }
);
