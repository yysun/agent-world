/**
 * Renderer Message Utilities
 * Purpose:
 * - Provide pure helpers for message role classification and display metadata.
 *
 * Key Features:
 * - Identifies human/tool/assistant response messages.
 * - Computes message card styling and sender labels.
 * - Resolves avatar metadata from agent maps.
 *
 * Implementation Notes:
 * - Utilities are side-effect free and operate on provided message/lookup data.
 * - Helper functions are intentionally colocated to preserve behavior parity.
 *
 * Recent Changes:
 * - 2026-02-16: Extracted from App.jsx into dedicated utility module.
 */

import { HUMAN_SENDER_VALUES } from '../constants/app-constants';

export function isHumanMessage(message) {
  const role = String(message?.role || '').toLowerCase();
  const sender = String(message?.sender || '').toLowerCase();
  if (HUMAN_SENDER_VALUES.has(sender)) {
    return true;
  }
  return role === 'user' && !sender;
}

export function isToolRelatedMessage(message) {
  const role = String(message?.role || '').trim().toLowerCase();
  if (role === 'tool' || Boolean(message?.isToolStreaming)) {
    return true;
  }

  const content = String(message?.content || '').trim();
  if (!content) {
    return false;
  }

  return /^calling tool(?::|\s)/i.test(content);
}

export function isTrueAgentResponseMessage(message) {
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

  if (isToolRelatedMessage(message)) {
    return false;
  }

  const messageType = String(message?.type || '').trim().toLowerCase();
  if (messageType === 'tool' || messageType === 'log' || messageType === 'system' || messageType === 'error') {
    return false;
  }

  if (Array.isArray(message?.tool_calls) && message.tool_calls.length > 0) {
    return false;
  }

  if (message?.tool_call_id) {
    return false;
  }

  if (message?.toolCallStatus && typeof message.toolCallStatus === 'object') {
    return false;
  }

  const content = String(message?.content || '').trim().toLowerCase();
  if (content.startsWith('[error]') || content.startsWith('error:')) {
    return false;
  }

  return true;
}

export function getMessageIdentity(message) {
  return String(message?.messageId || '').trim();
}

function isCrossAgentAssistantMessage(message, messagesById, messages, currentIndex) {
  const role = String(message?.role || '').toLowerCase();
  if (role !== 'assistant') return false;

  const sender = String(message?.sender || '').trim().toLowerCase();
  if (!sender) return false;

  const replyToMessageId = String(message?.replyToMessageId || '').trim();
  if (replyToMessageId) {
    const parentMessage = messagesById.get(replyToMessageId);
    if (!parentMessage || isHumanMessage(parentMessage)) return false;
    const parentSender = String(parentMessage?.sender || '').trim().toLowerCase();
    return Boolean(parentSender) && parentSender !== sender;
  }

  for (let index = currentIndex - 1; index >= 0; index -= 1) {
    const candidate = messages[index];
    if (!candidate || isHumanMessage(candidate)) continue;
    const candidateSender = String(candidate?.sender || '').trim().toLowerCase();
    if (!candidateSender) continue;
    return candidateSender !== sender;
  }

  return false;
}

export function getMessageCardClassName(message, messagesById, messages, currentIndex) {
  const role = String(message?.role || '').toLowerCase();
  const isUser = isHumanMessage(message);
  const isTool = isToolRelatedMessage(message);
  const isSystem = role === 'system' || message?.type === 'log' || Boolean(message?.logEvent);
  const isCrossAgent = isCrossAgentAssistantMessage(message, messagesById, messages, currentIndex);

  const roleClassName = isUser
    ? 'ml-auto w-[80%] border-l-sidebar-border bg-sidebar-accent'
    : isTool
      ? 'ml-auto w-[92%] border-l-amber-500/50'
      : isCrossAgent
        ? 'ml-auto w-[92%] border-l-violet-500/50'
        : isSystem
          ? 'mr-auto w-[90%] border-l-border bg-muted/40'
          : 'ml-auto w-[92%] border-l-sky-500/40';

  return `group relative rounded-lg border-l p-3 ${roleClassName}`;
}

function getReplyTarget(message, messagesById) {
  const replyToMessageId = String(message?.replyToMessageId || '').trim();
  if (!replyToMessageId) return null;

  const visited = new Set();
  let currentId = replyToMessageId;
  let closestReplyTarget = null;

  for (let depth = 0; depth < 25 && currentId; depth += 1) {
    if (visited.has(currentId)) break;
    visited.add(currentId);

    const parentMessage = messagesById.get(currentId);
    if (!parentMessage) break;

    const parentTarget = isHumanMessage(parentMessage) ? 'HUMAN' : (parentMessage.sender || 'unknown');
    if (!closestReplyTarget) {
      closestReplyTarget = parentTarget;
    }
    if (parentTarget === 'HUMAN') {
      return 'HUMAN';
    }

    currentId = String(parentMessage?.replyToMessageId || '').trim();
  }

  return closestReplyTarget;
}

function inferReplyTargetFromHistory(message, messages, currentIndex) {
  const role = String(message?.role || '').toLowerCase();
  if (role !== 'assistant') return null;
  if (message?.replyToMessageId) return null;

  for (let index = currentIndex - 1; index >= 0; index -= 1) {
    const candidate = messages[index];
    if (isHumanMessage(candidate)) {
      return 'HUMAN';
    }
  }

  return null;
}

function isSenderAutoReplyDisabled(message, agentsById, agentsByName) {
  const fromAgentId = String(message?.fromAgentId || '').trim();
  if (fromAgentId && agentsById?.has(fromAgentId)) {
    return agentsById.get(fromAgentId)?.autoReply === false;
  }

  const sender = String(message?.sender || '').trim().toLowerCase();
  if (sender && agentsByName?.has(sender)) {
    return agentsByName.get(sender)?.autoReply === false;
  }

  return false;
}

export function getMessageSenderLabel(message, messagesById, messages, currentIndex, agentsById, agentsByName) {
  if (isHumanMessage(message)) return 'HUMAN';
  const sender = message?.sender || 'unknown';
  if (isSenderAutoReplyDisabled(message, agentsById, agentsByName)) {
    return sender;
  }
  if (isCrossAgentAssistantMessage(message, messagesById, messages, currentIndex)) {
    const replyToMessageId = String(message?.replyToMessageId || '').trim();
    const parentMessage = replyToMessageId ? messagesById.get(replyToMessageId) : null;
    const parentSender = String(parentMessage?.sender || '').trim();
    const fromAgentId = String(message?.fromAgentId || '').trim();
    const source = parentSender || fromAgentId || 'Agent';
    return `${sender} (reply to ${source})`;
  }
  const replyTarget = getReplyTarget(message, messagesById) ||
    inferReplyTargetFromHistory(message, messages, currentIndex);
  if (!replyTarget) return sender;
  return `${sender} (reply to ${replyTarget})`;
}

function getAgentInitials(displayName) {
  const segments = String(displayName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (segments.length === 0) return '?';
  if (segments.length === 1) {
    return segments[0].slice(0, 2).toUpperCase();
  }
  return `${segments[0][0] || ''}${segments[1][0] || ''}`.toUpperCase();
}

export function resolveMessageAvatar(message, agentsById, agentsByName) {
  if (isHumanMessage(message)) return null;

  const role = String(message?.role || '').toLowerCase();
  const isSystem = role === 'system' || message?.type === 'log' || Boolean(message?.logEvent);
  const isTool = isToolRelatedMessage(message);

  const fromAgentId = String(message?.fromAgentId || '').trim();
  if (fromAgentId && agentsById.has(fromAgentId)) {
    const byIdAgent = agentsById.get(fromAgentId);
    return {
      name: byIdAgent.name,
      initials: byIdAgent.initials
    };
  }

  const sender = String(message?.sender || '').trim();
  const normalizedSender = sender.toLowerCase();
  if (normalizedSender && agentsByName.has(normalizedSender)) {
    const byNameAgent = agentsByName.get(normalizedSender);
    return {
      name: byNameAgent.name,
      initials: byNameAgent.initials
    };
  }

  const logCategory = String(message?.logEvent?.category || '').trim();
  const fallbackName = isSystem
    ? (logCategory || sender || 'System')
    : isTool
      ? (sender || 'Tool')
      : (sender || 'Assistant');

  return {
    name: fallbackName,
    initials: getAgentInitials(fallbackName)
  };
}
