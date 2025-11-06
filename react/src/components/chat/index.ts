/**
 * Chat Components - Main exports
 * 
 * Purpose: Central export point for all chat components
 * 
 * Changes:
 * - 2025-11-04: Created for Phase 3 - Centralized exports
 */

// Components
export { ChatMessageBubble } from './chat-message-bubble';
export { ChatTypingIndicator } from './chat-typing-indicator';
export { ChatMessageList } from './chat-message-list';
export { ChatInput } from './chat-input';
export { ChatThread } from './chat-thread';

// Utilities
export { messageToChatMessage, messagesToChatMessages } from './utils';

// Types
export type {
  ChatRole,
  ChatMessage,
  ToolCall,
} from './types';

export type { ChatMessageBubbleProps } from './chat-message-bubble';
export type { ChatTypingIndicatorProps } from './chat-typing-indicator';
export type { ChatMessageListProps } from './chat-message-list';
export type { ChatInputProps } from './chat-input';
export type { ChatThreadProps } from './chat-thread';

// Type guards
export {
  isUserMessage,
  isAssistantMessage,
  isSystemMessage,
  isToolMessage,
  hasToolCalls,
  isReplyMessage,
  isStreamingMessage,
} from './types';
