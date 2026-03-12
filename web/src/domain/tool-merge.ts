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
 * - Attaches actively-streaming tool rows to the request row so running tool output stays in one card
 * - Fully pure — no state mutation, returns new array
 *
 * Implementation Notes:
 * - Ported from electron/renderer/src/components/MessageListPanel.tsx buildCombinedRenderableMessages
 * - Uses Message type from web/src/types
 *
 * Recent Changes:
 * - 2026-03-11: Treat live assistant `text` rows that start with `Calling tool:` as tool-request rows so
 *   streaming web chats render the compact tool card even before structured `tool_calls` metadata arrives.
 * - 2026-03-01: Initial implementation for web app tool call merging
 * - 2026-03-01: Emit empty `combinedToolResults` for tool request rows so running cards render immediately before result rows arrive.
 */

import type { Message } from '../types';

function getToolRequestText(message: Message): string {
  return String((message as any)?.content || (message as any)?.text || '').trim();
}

function parseInlineToolName(message: Message): string {
  const match = getToolRequestText(message).match(/calling tool\s*:\s*([a-z0-9_.:-]+)/i);
  return String(match?.[1] || '').trim().toLowerCase();
}

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
  return /calling tool\s*:/i.test(getToolRequestText(message));
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
  return /^calling tool(?::|\s)/i.test(getToolRequestText(message));
}

export function buildCombinedRenderableMessages(messages: Message[]): Message[] {
  const toolResultsByKey = new Map<string, Message[]>();
  const toolStreamsByKey = new Map<string, Message[]>();

  for (const message of messages) {
    const anyMsg = message as any;
    const role = String(anyMsg?.role || '').trim().toLowerCase();
    const streamKey = String(anyMsg?.toolCallId || anyMsg?.tool_call_id || '').trim();
    if (Boolean(anyMsg?.isToolStreaming) && streamKey) {
      const existingStreamRows = toolStreamsByKey.get(streamKey) || [];
      existingStreamRows.push(message);
      toolStreamsByKey.set(streamKey, existingStreamRows);
    }
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
  const consumedToolStreamIds = new Set<string>();

  return messages
    .map((message) => {
      if (!isToolRelatedMessage(message) || !isToolRequestMessage(message)) {
        return message;
      }

      const combinedToolResults: Message[] = [];
      const combinedToolStreams: Message[] = [];
      const requestMessageId = String((message as any)?.messageId || '').trim();
      const inlineToolName = parseInlineToolName(message);
      const combinedMessageIds = new Set<string>();
      const requestedCallIds = collectToolCallIds(message);
      if (requestedCallIds.length > 0) {
        for (const callId of requestedCallIds) {
          const activeStreams = toolStreamsByKey.get(callId) || [];
          for (const streamRow of activeStreams) {
            const streamMessageId = String((streamRow as any)?.messageId || '').trim();
            if (streamMessageId) {
              consumedToolStreamIds.add(streamMessageId);
            }
            combinedToolStreams.push(streamRow);
          }

          const matches = toolResultsByKey.get(callId) || [];
          for (const match of matches) {
            const matchMessageId = String((match as any)?.messageId || '').trim();
            if (matchMessageId) {
              consumedToolResultIds.add(matchMessageId);
              combinedMessageIds.add(matchMessageId);
            }
            combinedToolResults.push(match);
          }
        }
      }

      if (requestMessageId) {
        for (const candidate of messages) {
          const candidateRole = String((candidate as any)?.role || '').trim().toLowerCase();
          if (candidateRole !== 'tool') {
            continue;
          }

          const replyToMessageId = String((candidate as any)?.replyToMessageId || '').trim();
          if (!replyToMessageId || replyToMessageId !== requestMessageId) {
            continue;
          }

          const candidateMessageId = String((candidate as any)?.messageId || '').trim();
          if (candidateMessageId && combinedMessageIds.has(candidateMessageId)) {
            continue;
          }

          if (requestedCallIds.length === 0 && inlineToolName) {
            const candidateToolName = String((candidate as any)?.toolName || (candidate as any)?.toolExecution?.toolName || '').trim().toLowerCase();
            if (candidateToolName && candidateToolName !== inlineToolName) {
              continue;
            }
          }

          if (candidateMessageId) {
            consumedToolResultIds.add(candidateMessageId);
            combinedMessageIds.add(candidateMessageId);
          }
          combinedToolResults.push(candidate);
        }
      }
      // Keep request rows in tool-card mode even before completion rows exist.
      // This matches Electron behavior where tool execution appears as `running`
      // immediately instead of waiting for final tool results.
      return { ...message, combinedToolResults, combinedToolStreams } as Message;
    })
    .filter((message) => {
      const anyMsg = message as any;
      if (Boolean(anyMsg?.isToolStreaming)) {
        const streamMessageId = String(anyMsg?.messageId || '').trim();
        if (!streamMessageId) {
          return true;
        }
        return !consumedToolStreamIds.has(streamMessageId);
      }
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
