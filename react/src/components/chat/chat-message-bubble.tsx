/**
 * ChatMessageBubble Component
 * 
 * Purpose: Display individual message with role-based styling
 * 
 * Features:
 * - Role-based visual styling (user, assistant, system, tool)
 * - Timestamp and sender display
 * - Threading indicator with "reply to" display (e.g., "Agent: a1 (reply to HUMAN)")
 * - Tool approval request display with action buttons
 * - Tool approval response display with status
 * - Detailed tool call formatting with arguments (e.g., "Calling tool: shell_cmd (command: x, directory: y)")
 * - Detailed tool result formatting with matching call details
 * - Optimized with React.memo
 * 
 * Implementation:
 * - User messages: right-aligned, primary color
 * - Assistant messages: left-aligned, secondary color
 * - System messages: centered, muted style
 * - Tool messages: left-aligned, accent color
 * - Tool approval requests: rendered with ToolCallRequestBox
 * - Tool approval responses: rendered with ToolCallResponseBox
 * - Tool call messages: formatted with formatToolCallMessage() to show arguments
 * - Reply messages: show reply target using getReplyTarget() helper
 * 
 * Changes:
 * - 2026-02-08: Updated message bubble colors to use theme tokens for dark mode
 * - 2026-02-08: Increased user bubble max width for better readability
 * - 2025-11-12: Added reply-to display showing parent message target
 * - 2025-11-12: Added detailed tool call/result formatting with arguments
 * - 2025-11-12: Added tool approval request/response rendering
 * - 2025-11-04: Created for Phase 2 - Core Components
 */

import React from 'react';
import type { ChatMessage } from './types';
import type { Message } from '@/types';
import {
  isUserMessage,
  isAssistantMessage,
  isSystemMessage,
  isToolMessage,
} from './types';
import { ToolCallRequestBox } from './tool-call-request-box';
import { ToolCallResponseBox } from './tool-call-response-box';
import { formatToolCallMessage, isToolCallMessage } from '@/lib/domain/tool-formatting';
import { getReplyTarget } from '@/lib/domain/message-display';

export interface ChatMessageBubbleProps {
  /** Message to display */
  message: ChatMessage;

  /** Show timestamp (default: true) */
  showTimestamp?: boolean;

  /** Show sender name (default: true) */
  showSender?: boolean;

  /** All messages for threading context */
  allMessages?: ChatMessage[];

  /** Callback when approval decision is made */
  onApprovalDecision?: (data: {
    toolCallId: string;
    decision: 'approve' | 'deny';
    scope: 'once' | 'session' | 'none';
  }) => void;
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
    allMessages,
    onApprovalDecision,
  }) {
    const isUser = isUserMessage(message);
    const isAssistant = isAssistantMessage(message);
    const isSystem = isSystemMessage(message);
    const isTool = isToolMessage(message);

    // Check if this message has tool approval data
    const extendedMessage = message as unknown as Message;
    const hasToolApprovalRequest = extendedMessage.isToolCallRequest && extendedMessage.toolCallData;
    const hasToolApprovalResponse = extendedMessage.isToolCallResponse && extendedMessage.toolCallData;

    // Format message content - upgrade tool call messages to detailed format
    const displayContent = isToolCallMessage(extendedMessage)
      ? formatToolCallMessage(extendedMessage, allMessages as Message[] | undefined)
      : message.content;

    // Format timestamp
    const timestamp = message.createdAt
      ? new Date(message.createdAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
      : '';

    // Determine sender display name
    const senderName = message.sender || (isUser ? 'You' : 'Assistant');

    // Check if this message is a reply and get the target
    const replyTarget = getReplyTarget(extendedMessage, (allMessages as unknown as Message[]) || []);
    const displayName = replyTarget ? `${senderName} (reply to ${replyTarget})` : senderName;

    // Container alignment
    const containerClass = isSystem
      ? 'flex justify-center'
      : 'flex justify-start';

    // Bubble styling based on role
    const bubbleClass = `
      rounded-[1rem] px-4 py-2 text-sm
      ${isUser ? 'bg-muted text-foreground max-w-[92%] border border-border/50 shadow-sm' : ''}
      ${isAssistant ? 'bg-card text-card-foreground max-w-[95%] border border-border/60 shadow-sm' : ''}
      ${isSystem ? 'bg-muted text-muted-foreground italic border border-dashed border-border/70 max-w-[80%] shadow-sm' : ''}
      ${isTool ? 'bg-accent text-accent-foreground text-xs border border-border/50 max-w-[80%] shadow-sm' : ''}
    `.trim();

    return (
      <div className={containerClass}>
        <div className={`flex flex-col gap-1 ${isAssistant ? 'max-w-[95%]' : isUser ? 'max-w-[92%]' : 'max-w-[80%]'}`}>
          {/* Sender and timestamp (if not system message) */}
          {!isSystem && (showSender || showTimestamp) && (
            <div
              className={`flex items-center gap-2 text-xs text-muted-foreground px-1`}
            >
              {showSender && <span className="font-medium">{displayName}</span>}
              {showTimestamp && timestamp && <span>{timestamp}</span>}
            </div>
          )}

          {/* Message bubble */}
          <div className={bubbleClass}>
            {hasToolApprovalRequest ? (
              <ToolCallRequestBox
                message={extendedMessage}
                onApprovalDecision={onApprovalDecision}
              />
            ) : hasToolApprovalResponse ? (
              <ToolCallResponseBox message={extendedMessage} />
            ) : (
              <p className="whitespace-pre-wrap break-words leading-relaxed">
                {displayContent}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }
);
