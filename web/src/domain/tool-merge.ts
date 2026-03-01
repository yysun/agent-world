/**
 * Tool Call Merge Domain Logic
 *
 * Purpose:
 * - Provide display-time merging of tool request + result message rows
 * - Match web chat tool card rendering parity with Electron renderer
 *
 * Key Features:
 * - Identifies tool request rows (assistant messages with tool_calls array)
 * - Merges matching tool result rows into the request row via tool_call_id
 * - Preserves actively-streaming tool rows in place (not merged until complete)
 * - Fully pure — no state mutation, returns new array
 *
 * Implementation Notes:
 * - Ported from electron/renderer/src/components/MessageListPanel.tsx buildCombinedRenderableMessages
 * - Uses Message type from web/src/types
 *
 * Recent Changes:
 * - 2026-03-01: Initial implementation for web app tool call merging
 */

import type { Message } from '../types';

function collectToolCallIds(message: Message): string[] {
  const anyMsg = message as any;
  if (!Array.isArray(anyMsg?.tool_calls)) {
    return [];
  }
  return anyMsg.tool_calls
    .map((toolCall: any) => String(toolCall?.id || '').trim())
    .filter(Boolean);
}

function isToolRequestMessage(message: Message): boolean {
  const anyMsg = message as any;
  if (Array.isArray(anyMsg?.tool_calls) && anyMsg.tool_calls.length > 0) {
    return true;
  }
  return /calling tool\s*:/i.test(String(anyMsg?.content || ''));
}

function isToolRelatedMessage(message: Message): boolean {
  const anyMsg = message as any;
  const role = String(anyMsg?.role || '').trim().toLowerCase();
  if (role === 'tool' || Boolean(anyMsg?.isToolStreaming)) {
    return true;
  }
  if (Array.isArray(anyMsg?.tool_calls) && anyMsg.tool_calls.length > 0) {
    return true;
  }
  if (role === 'assistant') {
    return false;
  }
  const content = String(anyMsg?.content || '').trim();
  return /^calling tool(?::|\s)/i.test(content);
}

export function buildCombinedRenderableMessages(messages: Message[]): Message[] {
  const toolResultsByKey = new Map<string, Message[]>();

  for (const message of messages) {
    const anyMsg = message as any;
    const role = String(anyMsg?.role || '').trim().toLowerCase();
    if (role !== 'tool') {
      continue;
    }
    // Do not index still-streaming tool rows — they remain standalone until complete
    if (Boolean(anyMsg?.isToolStreaming)) {
      continue;
    }
    const completionKey = String(anyMsg?.tool_call_id || anyMsg?.toolCallId || '').trim();
    if (!completionKey) {
      continue;
    }
    const existing = toolResultsByKey.get(completionKey) || [];
    existing.push(message);
    toolResultsByKey.set(completionKey, existing);
  }

  const consumedToolResultIds = new Set<string>();

  return messages
    .map((message) => {
      if (!isToolRelatedMessage(message) || !isToolRequestMessage(message)) {
        return message;
      }

      const requestedCallIds = collectToolCallIds(message);
      if (requestedCallIds.length === 0) {
        return message;
      }

      const combinedToolResults: Message[] = [];
      for (const callId of requestedCallIds) {
        const matches = toolResultsByKey.get(callId) || [];
        for (const match of matches) {
          const matchMessageId = String((match as any)?.messageId || '').trim();
          if (matchMessageId) {
            consumedToolResultIds.add(matchMessageId);
          }
          combinedToolResults.push(match);
        }
      }

      if (combinedToolResults.length === 0) {
        return message;
      }

      return { ...message, combinedToolResults } as Message;
    })
    .filter((message) => {
      const anyMsg = message as any;
      const role = String(anyMsg?.role || '').trim().toLowerCase();
      if (role !== 'tool') {
        return true;
      }
      const messageId = String(anyMsg?.messageId || '').trim();
      if (!messageId) {
        return true;
      }
      return !consumedToolResultIds.has(messageId);
    });
}
