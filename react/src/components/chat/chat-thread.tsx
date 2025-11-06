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
 * - 2025-11-04: Created for Phase 3 - Input & Interaction
 */

import { useState } from 'react';
import { ChatMessageList } from './chat-message-list';
import { ChatTypingIndicator } from './chat-typing-indicator';
import { ChatInput } from './chat-input';
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
  selectedAgent,
  messages,
  streaming = false,
  onSendMessage,
  disabled = false,
  loading = false,
}: ChatThreadProps) {
  const [draft, setDraft] = useState('');

  const handleSend = () => {
    if (draft.trim()) {
      onSendMessage(draft);
      setDraft('');
    }
  };

  // Determine header title
  const headerTitle = selectedAgent ? selectedAgent.name : 'All Agents';
  const headerSubtitle = selectedAgent
    ? 'Chatting with this agent'
    : 'Messages from all agents in this world';

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-border bg-card px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              {headerTitle}
            </h2>
            <p className="text-xs text-muted-foreground">{headerSubtitle}</p>
          </div>
          {selectedAgent && (
            <span className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">
              Filtered
            </span>
          )}
        </div>
      </div>

      {/* Messages */}
      <ChatMessageList
        messages={messages}
        loading={loading}
        className="flex-1"
      />

      {/* Typing Indicator */}
      {streaming && (
        <div className="flex-shrink-0 border-t border-border bg-card px-4 py-2">
          <ChatTypingIndicator />
        </div>
      )}

      {/* Input */}
      <div className="flex-shrink-0 border-t border-border bg-card px-4 py-3">
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
  );
}
