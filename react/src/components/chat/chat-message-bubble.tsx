/**
 * ChatMessageBubble Component
 * 
 * Purpose: Display individual message with role-based styling
 * 
 * Features:
 * - Role-based visual styling (user, assistant, system, tool)
 * - Sender avatars rendered on the left side of message bubbles
 * - Timestamp and sender display
 * - Threading indicator with "reply to" display (e.g., "Agent: a1 (reply to HUMAN)")
 * - Tool streaming output with stdout/stderr distinction
 * - Detailed tool call formatting with arguments (e.g., "Calling tool: shell_cmd (command: x, directory: y)")
 * - Detailed tool result formatting with matching call details
 * - Optimized with React.memo
 * 
 * Implementation:
 * - User messages: left-aligned with user avatar and muted bubble
 * - Assistant messages: left-aligned, secondary color
 * - System messages: centered, muted style
 * - Tool messages: left-aligned, accent color
 * - Non-system messages include deterministic avatar initials + color
 * - Tool streaming output: rendered with monospace pre block and color-coded by stream type
 * - Tool call messages: formatted with formatToolCallMessage() to show arguments
 * - Reply messages: show reply target using getReplyTarget() helper
 * 
 * Changes:
 * - 2026-02-08: Removed legacy manual tool-intervention request/response UI branches
 * - 2026-02-08: Adjusted avatar vertical offset to align with message box top
 * - 2026-02-08: Added sender avatars on the left side of non-system message bubbles
 * - 2026-02-08: Added tool streaming output rendering with stdout/stderr visual distinction
 * - 2026-02-08: Updated message bubble colors to use theme tokens for dark mode
 * - 2026-02-08: Increased user bubble max width for better readability
 * - 2025-11-12: Added reply-to display showing parent message target
 * - 2025-11-12: Added detailed tool call/result formatting with arguments
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

}

const AGENT_AVATAR_COLOR_CLASSES = [
  'bg-cyan-500/90 text-white border-cyan-300/60',
  'bg-emerald-500/90 text-white border-emerald-300/60',
  'bg-indigo-500/90 text-white border-indigo-300/60',
  'bg-fuchsia-500/90 text-white border-fuchsia-300/60',
  'bg-orange-500/90 text-white border-orange-300/60',
  'bg-teal-500/90 text-white border-teal-300/60',
] as const;

function getAvatarLabel(senderName: string, isUser: boolean, isTool: boolean): string {
  if (isUser) return 'ME';
  if (isTool) return 'TL';

  const parts = senderName
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return 'AI';
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function getAvatarColorClass(senderName: string, isUser: boolean, isTool: boolean): string {
  if (isUser) {
    return 'bg-primary text-primary-foreground border-primary/40';
  }

  if (isTool) {
    return 'bg-amber-500/90 text-white border-amber-300/60';
  }

  const hash = Array.from(senderName.toLowerCase()).reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return AGENT_AVATAR_COLOR_CLASSES[hash % AGENT_AVATAR_COLOR_CLASSES.length];
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
  }) {
    const isUser = isUserMessage(message);
    const isAssistant = isAssistantMessage(message);
    const isSystem = isSystemMessage(message);
    const isTool = isToolMessage(message);

    const extendedMessage = message as unknown as Message;
    const hasToolStreaming = extendedMessage.isToolStreaming;

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
    const avatarLabel = getAvatarLabel(senderName, isUser, isTool);
    const avatarColorClass = getAvatarColorClass(senderName, isUser, isTool);
    const hasMetaRow = !isSystem && (showSender || showTimestamp);
    const avatarOffsetClass = hasMetaRow ? 'mt-5' : 'mt-0';

    // Container alignment
    const containerClass = isSystem
      ? 'flex justify-center'
      : 'flex items-start gap-3';

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
        {!isSystem && (
          <div
            className={`${avatarOffsetClass} flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold tracking-wide ${avatarColorClass}`}
            aria-hidden="true"
          >
            {avatarLabel}
          </div>
        )}

        <div className={`min-w-0 flex flex-col gap-1 ${isAssistant ? 'max-w-[95%]' : isUser ? 'max-w-[92%]' : 'max-w-[80%]'}`}>
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
            {hasToolStreaming ? (
              /* Render streaming tool output with stdout/stderr distinction */
              <div className="flex flex-col gap-2">
                <div className="text-xs font-medium text-muted-foreground">
                  ⚙️ Executing...
                </div>
                <div className={`rounded-md overflow-hidden ${extendedMessage.streamType === 'stderr'
                    ? 'bg-red-950/30 border border-red-500/30'
                    : 'bg-slate-900 border border-slate-700'
                  }`}>
                  <pre className={`text-xs p-3 font-mono whitespace-pre-wrap break-all ${extendedMessage.streamType === 'stderr'
                      ? 'text-red-400'
                      : 'text-slate-300'
                    }`}>
                    {message.content || '(waiting for output...)'}
                  </pre>
                </div>
              </div>
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
