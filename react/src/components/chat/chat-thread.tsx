/**
 * ChatThread Component
 * 
 * Purpose: Complete chat interface combining all sub-components
 * 
 * Features:
 * - Message list with auto-scroll
 * - Typing indicator during streaming
 * - Input area with send functionality
 * - Thread header with context
 * 
 * Implementation:
 * - Manages local draft state
 * - Combines ChatMessageList, ChatTypingIndicator, ChatInput
 * - Provides unified chat experience
 * 
 * Changes:
 * - 2026-02-08: Added auto-scroll so new and streaming messages stay in view
 * - 2025-11-04: Created for Phase 3 - Input & Interaction
 */

import { useEffect, useRef, useState } from 'react';
import { ChatTypingIndicator } from './chat-typing-indicator';
import { ChatInput } from './chat-input';
import { ChatMessageBubble } from './chat-message-bubble';
import type { ChatMessage } from './types';

export interface ChatThreadProps {
  /** World ID for context */
  worldId: string;

  /** Currently selected agent (for filtering) */
  selectedAgent?: { id: string; name: string } | null;

  /** Array of messages to display */
  messages: ChatMessage[];

  /** Whether assistant is streaming */
  streaming?: boolean;

  /** Message send handler */
  onSendMessage: (content: string) => void;

  /** Disabled state (e.g., disconnected) */
  disabled?: boolean;

  /** Loading state */
  loading?: boolean;
}

/**
 * ChatThread - Complete chat interface
 * 
 * @component
 * @example
 * ```tsx
 * <ChatThread
 *   worldId={worldId}
 *   selectedAgent={selectedAgent}
 *   messages={messages}
 *   streaming={false}
 *   onSendMessage={handleSend}
 *   disabled={connectionState !== 'connected'}
 * />
 * ```
 */
export function ChatThread({
  worldId: _worldId,
  selectedAgent: _selectedAgent,
  messages,
  streaming = false,
  onSendMessage,
  disabled = false,
  loading: _loading = false,
}: ChatThreadProps) {
  const [draft, setDraft] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevMessagesLengthRef = useRef(messages.length);

  useEffect(() => {
    const hasNewMessage = messages.length > prevMessagesLengthRef.current;
    messagesEndRef.current?.scrollIntoView({
      behavior: hasNewMessage ? 'smooth' : 'auto',
      block: 'end',
    });
    prevMessagesLengthRef.current = messages.length;
  }, [messages, streaming]);

  const handleSend = () => {
    if (draft.trim()) {
      onSendMessage(draft);
      setDraft('');
    }
  };

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 py-4 space-y-6">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-center text-muted-foreground">No messages yet. Start a conversation!</p>
            </div>
          ) : (
            <>
              {messages.map((message) => (
                <ChatMessageBubble
                  key={message.id || message.messageId}
                  message={message}
                  allMessages={messages}
                />
              ))}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>
      </div>

      {/* Typing Indicator */}
      {streaming && (
        <div className="flex-shrink-0 border-t border-border bg-card">
          <div className="max-w-4xl mx-auto px-4 py-2">
            <ChatTypingIndicator />
          </div>
        </div>
      )}

      {/* Input */}
      <div className="flex-shrink-0 bg-card">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <ChatInput
            value={draft}
            onChange={setDraft}
            onSubmit={handleSend}
            disabled={disabled || streaming}
            placeholder={
              disabled
                ? 'Disconnected...'
                : streaming
                  ? 'Waiting for response...'
                  : 'Send a message...'
            }
          />
        </div>
      </div>
    </div>
  );
}
