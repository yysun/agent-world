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
 * - 2026-03-13: Added `fullWidthMessage` card-style flag so non-chat Electron views can remove chat-era left offsets when avatars are hidden.
 * - 2026-03-13: Added assistant-card border overrides for narrated assistant tool-call rows so Electron can reflect linked tool success/failure without collapsing into tool-row chrome.
 * - 2026-03-10: Added a red left border for structured `system` error transcript rows so durable failed-turn diagnostics are visually distinct from neutral system notices.
 * - 2026-03-06: Restored error-level realtime log rows as renderable transcript entries while keeping non-error logs in the diagnostics panel only.
 * - 2026-03-06: Unwrap persisted tool execution envelopes when deriving tool success/failure card styling after reload.
 * - 2026-03-06: Recognize canonical shell `validation_error` and `approval_denied` tool-result reasons as failed outcomes for renderer card styling.
 * - 2026-03-04: Added optional `fullWidthUserMessage` card-style flag so non-chat user cards can span full width.
 * - 2026-03-04: Added optional `showLeftBorder` card-style flag so alternate world views can hide message left accents.
 * - 2026-02-28: Added tool-message status border helper so completed tool cards use green/red left borders while pending states keep amber.
 * - 2026-02-28: Added `resolveToolNameForMessage` helper and fixed assistant tool-request name resolution to prefer current message `tool_calls` before history fallback.
 * - 2026-02-28: Added tool-request lookup helper to map tool-result rows back to matching assistant `tool_calls` by `tool_call_id`.
 * - 2026-02-28: Hidden assistant `Calling tool: human_intervention_request` placeholder rows from transcript rendering so only HITL prompt cards remain visible.
 * - 2026-02-27: Stopped classifying assistant tool-call request messages as tool cards so assistant bubbles stay visible during tool phases.
 * - 2026-02-27: Excluded realtime log rows (`type='log'` / `logEvent`) from renderable chat entries so logs appear only in the logs panel.
 * - 2026-02-20: Added `isRenderableMessageEntry` so welcome-state and list rendering share identical message-presence logic.
 * - 2026-02-16: Extracted from App.jsx into dedicated utility module.
 */

import { HUMAN_SENDER_VALUES } from '../constants/app-constants';
import {
  parseToolExecutionEnvelopeContent,
  stringifyToolEnvelopeResult,
} from './tool-execution-envelope';

function isHitlToolCallPlaceholderMessage(message) {
  const role = String(message?.role || '').trim().toLowerCase();
  if (role !== 'assistant') {
    return false;
  }

  const content = String(message?.content || '').trim();
  if (/^calling tool(?::|\s)\s*human_intervention_request\b/i.test(content)) {
    return true;
  }

  const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
  return toolCalls.some((toolCall) => {
    const toolName = String(toolCall?.function?.name || toolCall?.name || '').trim().toLowerCase();
    return toolName === 'human_intervention_request';
  });
}

function isNarratedAssistantToolCallMessage(message) {
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
  if (Array.isArray(message?.tool_calls) && message.tool_calls.length > 0) {
    return true;
  }
  if (role === 'assistant') {
    return false;
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
  if (content.startsWith('calling tool:') || content.startsWith('calling tool ')) {
    return false;
  }
  if (content.startsWith('[error]') || content.startsWith('error:')) {
    return false;
  }

  return true;
}

export function getMessageIdentity(message) {
  return String(message?.messageId || '').trim();
}

export function isRenderableMessageEntry(message) {
  const messageType = String(message?.type || '').trim().toLowerCase();
  const logLevel = String(message?.logEvent?.level || '').trim().toLowerCase();
  if (messageType === 'log' || Boolean(message?.logEvent)) {
    return logLevel === 'error';
  }
  if (messageType === 'error') {
    return false;
  }
  if (isHitlToolCallPlaceholderMessage(message)) {
    return false;
  }
  return getMessageIdentity(message).length > 0;
}

function collectToolCallIds(message) {
  if (!Array.isArray(message?.tool_calls)) {
    return [];
  }

  return message.tool_calls
    .map((toolCall) => String(toolCall?.id || '').trim())
    .filter(Boolean);
}

function messageIncludesToolCallId(message, toolCallId) {
  if (!message || !toolCallId) {
    return false;
  }
  const toolCallIds = collectToolCallIds(message);
  return toolCallIds.includes(toolCallId);
}

function messageHasToolCalls(message) {
  return Array.isArray(message?.tool_calls) && message.tool_calls.length > 0;
}

function extractToolNameFromToolCalls(message, preferredToolCallId = '') {
  const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
  if (toolCalls.length === 0) {
    return '';
  }

  const normalizedPreferredToolCallId = String(preferredToolCallId || '').trim();
  if (normalizedPreferredToolCallId) {
    const exactMatch = toolCalls.find((toolCall) => String(toolCall?.id || '').trim() === normalizedPreferredToolCallId);
    const exactToolName = String(exactMatch?.function?.name || exactMatch?.name || '').trim();
    if (exactToolName) {
      return exactToolName;
    }
  }

  return String(toolCalls[0]?.function?.name || toolCalls[0]?.name || '').trim();
}

/**
 * Resolve display tool name for tool-related rows.
 * Priority:
 * 1) Direct tool metadata on the row.
 * 2) Current message tool_calls (critical for assistant tool-request rows).
 * 3) Linked parent assistant by reply/thread metadata.
 * 4) Prior assistant rows, only when a concrete toolCallId exists.
 * 5) "Calling tool: <name>" text fallback.
 */
export function resolveToolNameForMessage(message, messagesById, messages, currentIndex) {
  const directToolName = String(message?.toolName || message?.tool_name || message?.toolExecution?.toolName || '').trim();
  if (directToolName && directToolName.toLowerCase() !== 'unknown') {
    return directToolName;
  }

  const toolCallId = String(message?.tool_call_id || message?.toolCallId || '').trim();

  const ownToolName = extractToolNameFromToolCalls(message, toolCallId);
  if (ownToolName) {
    return ownToolName;
  }

  const replyToMessageId = String(message?.replyToMessageId || '').trim();
  if (replyToMessageId) {
    const parent = messagesById?.get?.(replyToMessageId);
    const parentToolName = extractToolNameFromToolCalls(parent, toolCallId);
    if (parentToolName) {
      return parentToolName;
    }
  }

  if (toolCallId) {
    const directByToolCallId = messagesById?.get?.(toolCallId);
    const directMappedToolName = extractToolNameFromToolCalls(directByToolCallId, toolCallId);
    if (directMappedToolName) {
      return directMappedToolName;
    }

    for (let index = currentIndex - 1; index >= 0; index -= 1) {
      const candidate = messages[index];
      const role = String(candidate?.role || '').trim().toLowerCase();
      if (role !== 'assistant') {
        continue;
      }
      const candidateToolName = extractToolNameFromToolCalls(candidate, toolCallId);
      if (candidateToolName) {
        return candidateToolName;
      }
    }
  }

  const content = String(message?.content || '');
  const callingToolMatch = content.match(/calling tool\s*:\s*([a-z0-9_.:-]+)/i);
  if (callingToolMatch?.[1]) {
    return callingToolMatch[1];
  }

  return directToolName;
}

/**
 * Resolve assistant tool-call request metadata for a tool-result row.
 * This lets tool result cards render both request args and result body.
 */
export function findToolRequestMessageForToolResult(message, messagesById, messages, currentIndex) {
  const role = String(message?.role || '').trim().toLowerCase();
  if (role !== 'tool') {
    return null;
  }

  const toolCallId = String(message?.tool_call_id || message?.toolCallId || '').trim();

  const replyToMessageId = String(message?.replyToMessageId || '').trim();
  if (replyToMessageId) {
    const parent = messagesById?.get(replyToMessageId);
    if (toolCallId && messageIncludesToolCallId(parent, toolCallId)) {
      return parent;
    }
    if (!toolCallId && messageHasToolCalls(parent)) {
      return parent;
    }
  }

  if (!toolCallId) {
    const resultToolName = String(message?.toolName || message?.tool_name || '').trim().toLowerCase();
    if (resultToolName) {
      const nameMatches: any[] = [];
      for (let index = currentIndex - 1; index >= 0; index -= 1) {
        const candidate = messages[index];
        const candidateRole = String(candidate?.role || '').trim().toLowerCase();
        if (candidateRole !== 'assistant') {
          continue;
        }
        const toolCalls = Array.isArray(candidate?.tool_calls) ? candidate.tool_calls : [];
        const nameMatch = toolCalls.some((toolCall) => {
          const toolName = String(toolCall?.function?.name || toolCall?.name || '').trim().toLowerCase();
          return toolName === resultToolName;
        });
        if (nameMatch) {
          nameMatches.push(candidate);
        }
      }

      // If we cannot uniquely determine the originating request, fail closed
      // instead of linking a potentially wrong args payload.
      if (nameMatches.length === 1) {
        return nameMatches[0];
      }
    }

    return null;
  }

  const directByToolCallId = messagesById?.get?.(toolCallId);
  if (messageIncludesToolCallId(directByToolCallId, toolCallId)) {
    return directByToolCallId;
  }

  for (let index = currentIndex - 1; index >= 0; index -= 1) {
    const candidate = messages[index];
    const candidateRole = String(candidate?.role || '').trim().toLowerCase();
    if (candidateRole !== 'assistant') {
      continue;
    }
    if (messageIncludesToolCallId(candidate, toolCallId)) {
      return candidate;
    }
  }

  return null;
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

function parseToolResultRecord(content) {
  const text = String(content || '').trim();
  if (!text) {
    return null;
  }

  const envelope = parseToolExecutionEnvelopeContent(text);
  if (envelope) {
    const resultText = stringifyToolEnvelopeResult(envelope.result);
    if (resultText && resultText !== text) {
      const parsedResult = parseToolResultRecord(resultText);
      return parsedResult || envelope;
    }
    return envelope;
  }

  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function hasNonZeroExitCode(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value !== 0;
  }
  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) && parsed !== 0;
  }
  return false;
}

function parseBoolean(value) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return null;
}

function isToolMessageFailure(message) {
  const streamType = String(message?.streamType || '').trim().toLowerCase();
  if (streamType === 'stderr') {
    return true;
  }

  const status = String(message?.status || '').trim().toLowerCase();
  if (status === 'failed' || status === 'error') {
    return true;
  }

  const combinedToolResults = Array.isArray(message?.combinedToolResults) ? message.combinedToolResults : [];
  if (combinedToolResults.some((result) => isToolMessageFailure(result))) {
    return true;
  }

  const content = String(message?.content || '').trim();
  if (!content) {
    return false;
  }

  const record = parseToolResultRecord(content);
  if (record) {
    const recordStatus = String(record.status || '').trim().toLowerCase();
    const reason = String(record.reason || '').trim().toLowerCase();
    if (recordStatus === 'failed' || recordStatus === 'error') {
      return true;
    }
    if (reason === 'non_zero_exit' || reason === 'execution_error' || reason === 'validation_error' || reason === 'approval_denied' || reason === 'timeout' || reason === 'timed_out' || reason === 'canceled' || reason === 'cancelled') {
      return true;
    }
    if (parseBoolean(record.timed_out ?? record.timedOut) === true || parseBoolean(record.canceled ?? record.cancelled) === true) {
      return true;
    }
    if (hasNonZeroExitCode(record.exit_code ?? record.exitCode)) {
      return true;
    }
  }

  if (/status\s*[:=]\s*failed/i.test(content)) return true;
  if (/timed[_\s-]?out\s*[:=]\s*true/i.test(content)) return true;
  if (/cancel(?:ed|led)\s*[:=]\s*true/i.test(content)) return true;
  if (/reason\s*[:=]\s*(non_zero_exit|execution_error|validation_error|approval_denied|timeout|timed_out|canceled|cancelled)/i.test(content)) return true;

  const exitCodeMatch = content.match(/exit[_\s-]?code\s*[:=]\s*(-?\d+)/i);
  if (exitCodeMatch?.[1]) {
    const exitCode = Number(exitCodeMatch[1]);
    if (Number.isFinite(exitCode) && exitCode !== 0) {
      return true;
    }
  }

  return false;
}

function isToolMessageSuccess(message) {
  const status = String(message?.status || '').trim().toLowerCase();
  if (status === 'success' || status === 'succeeded' || status === 'done' || status === 'completed' || status === 'ok') {
    return true;
  }

  const combinedToolResults = Array.isArray(message?.combinedToolResults) ? message.combinedToolResults : [];
  if (combinedToolResults.length > 0 && !combinedToolResults.some((result) => isToolMessageFailure(result))) {
    return true;
  }

  const content = String(message?.content || '').trim();
  if (!content) {
    return false;
  }

  const record = parseToolResultRecord(content);
  if (record) {
    const recordStatus = String(record.status || '').trim().toLowerCase();
    if (recordStatus === 'success' || recordStatus === 'succeeded' || recordStatus === 'done' || recordStatus === 'completed' || recordStatus === 'ok') {
      return true;
    }
    if (hasNonZeroExitCode(record.exit_code ?? record.exitCode)) {
      return false;
    }
  }

  return /status\s*[:=]\s*(success|succeeded|done|completed|ok)/i.test(content);
}

function getNarratedAssistantToolCallTone(message, messages) {
  if (!isNarratedAssistantToolCallMessage(message)) {
    return null;
  }

  const attachedLinkedResults = Array.isArray(message?.narratedToolCallResults)
    ? message.narratedToolCallResults
    : [];
  if (attachedLinkedResults.some((result) => isToolMessageFailure(result))) {
    return 'failed';
  }
  if (attachedLinkedResults.length > 0) {
    return 'done';
  }

  const requestedCallIds = collectToolCallIds(message);
  if (requestedCallIds.length === 0) {
    return null;
  }

  const requestMessageId = String(message?.messageId || '').trim();
  const linkedResults: any[] = [];
  const seenMessageIds = new Set();

  for (const candidate of Array.isArray(messages) ? messages : []) {
    const candidateRole = String(candidate?.role || '').trim().toLowerCase();
    if (candidateRole !== 'tool') {
      continue;
    }

    const completionKey = String(candidate?.tool_call_id || candidate?.messageId || '').trim();
    const replyToMessageId = String(candidate?.replyToMessageId || '').trim();
    const isLinkedByCallId = completionKey && requestedCallIds.includes(completionKey);
    const isLinkedByReply = requestMessageId && replyToMessageId === requestMessageId;
    if (!isLinkedByCallId && !isLinkedByReply) {
      continue;
    }

    const candidateMessageId = String(candidate?.messageId || '').trim();
    if (candidateMessageId) {
      if (seenMessageIds.has(candidateMessageId)) {
        continue;
      }
      seenMessageIds.add(candidateMessageId);
    }

    linkedResults.push(candidate);
  }

  if (linkedResults.some((result) => isToolMessageFailure(result))) {
    return 'failed';
  }

  if (linkedResults.length > 0 && linkedResults.every((result) => !isToolMessageFailure(result))) {
    return 'done';
  }

  return null;
}

export function getMessageCardClassName(message, messagesById, messages, currentIndex, options = {}) {
  const role = String(message?.role || '').toLowerCase();
  const isUser = isHumanMessage(message);
  const isNarratedToolCall = isNarratedAssistantToolCallMessage(message);
  const narratedToolCallTone = getNarratedAssistantToolCallTone(message, messages);
  const isTool = isToolRelatedMessage(message) && !isNarratedToolCall;
  const isSystem = role === 'system' || message?.type === 'log' || Boolean(message?.logEvent);
  const isSystemError = String(message?.systemEvent?.kind || '').trim().toLowerCase() === 'error';
  const isCrossAgent = isCrossAgentAssistantMessage(message, messagesById, messages, currentIndex);
  const normalizedOptions = (options || {}) as {
    isToolCallPending?: boolean;
    showLeftBorder?: boolean;
    fullWidthUserMessage?: boolean;
    fullWidthMessage?: boolean;
  };
  const isToolCallPending = typeof normalizedOptions.isToolCallPending === 'boolean'
    ? normalizedOptions.isToolCallPending
    : undefined;
  const showLeftBorder = normalizedOptions.showLeftBorder !== false;
  const fullWidthUserMessage = normalizedOptions.fullWidthUserMessage === true;
  const fullWidthMessage = normalizedOptions.fullWidthMessage === true;

  if (isTool) {
    return `group relative ${fullWidthMessage ? 'w-full' : 'ml-auto w-full'} rounded-none border-0 bg-transparent p-0 shadow-none`;
  }

  const roleClassName = fullWidthMessage
    ? isUser
      ? 'w-full border-l-sidebar-border bg-sidebar-accent'
      : isNarratedToolCall && narratedToolCallTone === 'failed'
        ? 'w-full border-l-red-500/70'
        : isNarratedToolCall && narratedToolCallTone === 'done'
          ? 'w-full border-l-emerald-500/60'
          : isCrossAgent
            ? 'w-full border-l-violet-500/50'
            : isSystem
              ? `w-full ${isSystemError ? 'border-l-red-500/70 bg-muted/40' : 'border-l-border bg-muted/40'}`
              : 'w-full border-l-sky-500/40'
    : isUser
      ? (fullWidthUserMessage
        ? 'w-full border-l-sidebar-border bg-sidebar-accent'
        : 'ml-auto w-[80%] border-l-sidebar-border bg-sidebar-accent')
      : isNarratedToolCall && narratedToolCallTone === 'failed'
        ? 'ml-auto w-[92%] border-l-red-500/70'
        : isNarratedToolCall && narratedToolCallTone === 'done'
          ? 'ml-auto w-[92%] border-l-emerald-500/60'
          : isCrossAgent
            ? 'ml-auto w-[92%] border-l-violet-500/50'
            : isSystem
              ? `mr-auto w-[90%] ${isSystemError ? 'border-l-red-500/70 bg-muted/40' : 'border-l-border bg-muted/40'}`
              : 'ml-auto w-[92%] border-l-sky-500/40';

  return `group relative rounded-lg p-3 ${showLeftBorder ? 'border-l' : ''} ${roleClassName}`;
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
