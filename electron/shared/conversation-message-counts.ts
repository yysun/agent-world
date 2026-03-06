/**
 * User-Facing Conversation Message Count Helpers
 *
 * Purpose:
 * - Define shared Electron-only rules for counting end-user-visible conversation messages.
 *
 * Key Features:
 * - Identifies human-authored conversation messages.
 * - Identifies agent response messages that should count as user-visible replies.
 * - Computes per-session and per-agent display counts from normalized messages.
 *
 * Implementation Notes:
 * - Excludes tool/log/system/internal assistant rows from user-facing counts.
 * - Intended for shared use by Electron main-process serialization and renderer badges.
 *
 * Recent Changes:
 * - 2026-03-06: Added shared display-count rules so sidebar and header badges reflect end-user-visible conversation messages instead of raw agent-memory rows.
 */

type ConversationMessageLike = {
  role?: unknown;
  sender?: unknown;
  type?: unknown;
  content?: unknown;
  logEvent?: unknown;
  isToolStreaming?: unknown;
  tool_calls?: unknown;
  tool_call_id?: unknown;
  toolCallStatus?: unknown;
  fromAgentId?: unknown;
  chatId?: unknown;
};

const HUMAN_SENDER_VALUES = new Set(['human', 'user']);

export function isConversationHumanMessage(message: ConversationMessageLike | null | undefined): boolean {
  const role = String(message?.role || '').trim().toLowerCase();
  const sender = String(message?.sender || '').trim().toLowerCase();
  if (HUMAN_SENDER_VALUES.has(sender)) {
    return true;
  }
  return role === 'user' && !sender;
}

export function isNarratedAssistantToolCallMessage(message: ConversationMessageLike | null | undefined): boolean {
  const role = String(message?.role || '').trim().toLowerCase();
  if (role !== 'assistant') {
    return false;
  }

  const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
  if (toolCalls.length === 0) {
    return false;
  }

  const content = String(message?.content || '').trim();
  if (!content) {
    return false;
  }

  return !/^calling tool\s*:/i.test(content);
}

export function isAgentConversationResponseMessage(message: ConversationMessageLike | null | undefined): boolean {
  if (isNarratedAssistantToolCallMessage(message)) {
    return true;
  }

  const role = String(message?.role || '').trim().toLowerCase();
  if (role !== 'assistant') {
    return false;
  }

  const sender = String(message?.sender || '').trim().toLowerCase();
  if (sender === 'system' || sender === 'tool') {
    return false;
  }

  if (Boolean(message?.logEvent)) {
    return false;
  }

  if (Boolean(message?.isToolStreaming)) {
    return false;
  }

  const messageType = String(message?.type || '').trim().toLowerCase();
  if (messageType === 'tool' || messageType === 'log' || messageType === 'system' || messageType === 'error') {
    return false;
  }

  if (Array.isArray(message?.tool_calls) && message.tool_calls.length > 0) {
    return false;
  }

  if (String(message?.tool_call_id || '').trim()) {
    return false;
  }

  if (message?.toolCallStatus && typeof message.toolCallStatus === 'object') {
    return false;
  }

  const content = String(message?.content || '').trim().toLowerCase();
  if (content.startsWith('calling tool:') || content.startsWith('calling tool ')) {
    return false;
  }

  if (content.startsWith('[error]') || content.startsWith('error:')) {
    return false;
  }

  return true;
}

export function isConversationDisplayMessage(message: ConversationMessageLike | null | undefined): boolean {
  return isConversationHumanMessage(message) || isAgentConversationResponseMessage(message);
}

export function countConversationDisplayMessages(messages: ConversationMessageLike[] | null | undefined): number {
  if (!Array.isArray(messages)) {
    return 0;
  }

  return messages.reduce((count, message) => (
    isConversationDisplayMessage(message) ? count + 1 : count
  ), 0);
}

export function countAgentConversationResponses(
  messages: ConversationMessageLike[] | null | undefined,
  isOwnedByAgent: (message: ConversationMessageLike) => boolean,
): number {
  if (!Array.isArray(messages)) {
    return 0;
  }

  return messages.reduce((count, message) => {
    if (!isAgentConversationResponseMessage(message)) {
      return count;
    }
    return isOwnedByAgent(message) ? count + 1 : count;
  }, 0);
}