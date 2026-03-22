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
 * - 2026-03-21: Re-consumed placeholder-linked tool result and stream rows so merged web tool cards do not duplicate standalone tool transcript entries.
 * - 2026-03-13: Attached linked tool result rows to narrated assistant tool-call messages so assistant-card styling can reflect final tool success or failure.
 * - 2026-03-13: Backfilled linked assistant tool requests and resolved tool names onto standalone web tool rows so restored/result-only rows match Electron labels.
 * - 2026-03-13: Aligned split/merge/display paths with Electron renderer:
 *   - Added isNarratedAssistantToolCallMessage exclusion so assistant prose with tool_calls renders as regular cards.
 *   - Added assistant-role early return in isToolRelatedMessage to match Electron guard.
 *   - Unified text access via getMessageText helper to handle both `content` (Electron) and `text` (web) field shapes.
 *   - Added messageId fallback to tool-result indexing key.
 *   - Removed inlineToolName filtering in replyToMessageId fallback.
 * - 2026-03-01: Initial implementation for web app tool call merging
 * - 2026-03-01: Emit empty `combinedToolResults` for tool request rows so running cards render immediately before result rows arrive.
 */

import type { Message } from '../types';

/** Read content from either `content` (Electron shape) or `text` (web shape). */
function getMessageText(message: Message): string {
  return String((message as any)?.content || (message as any)?.text || '').trim();
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

function messageIncludesToolCallId(message: Message | null | undefined, toolCallId: string): boolean {
  if (!message || !toolCallId) {
    return false;
  }

  return collectToolCallIds(message).includes(toolCallId);
}

function messageHasToolCalls(message: Message | null | undefined): boolean {
  return collectToolCallIds(message as Message).length > 0;
}

function extractToolNameFromToolCalls(message: Message | null | undefined, preferredToolCallId = ''): string {
  const anyMsg = message as any;
  const toolCalls = Array.isArray(anyMsg?.tool_calls) ? anyMsg.tool_calls : [];
  if (toolCalls.length === 0) {
    return '';
  }

  const normalizedPreferredToolCallId = String(preferredToolCallId || '').trim();
  if (normalizedPreferredToolCallId) {
    const exactMatch = toolCalls.find((toolCall: any) => String(toolCall?.id || '').trim() === normalizedPreferredToolCallId);
    const exactToolName = String(exactMatch?.function?.name || exactMatch?.name || '').trim();
    if (exactToolName) {
      return exactToolName;
    }
  }

  return String(toolCalls[0]?.function?.name || toolCalls[0]?.name || '').trim();
}

function findToolRequestMessageForToolResult(
  message: Message,
  messagesById: Map<string, Message>,
  messages: Message[],
  currentIndex: number,
): Message | null {
  const role = String((message as any)?.role || '').trim().toLowerCase();
  if (role !== 'tool' && !Boolean((message as any)?.isToolStreaming)) {
    return null;
  }

  const toolCallId = String((message as any)?.tool_call_id || (message as any)?.toolCallId || '').trim();

  const replyToMessageId = String((message as any)?.replyToMessageId || '').trim();
  if (replyToMessageId) {
    const parent = messagesById.get(replyToMessageId) || null;
    if (toolCallId && messageIncludesToolCallId(parent, toolCallId)) {
      return parent;
    }
    if (!toolCallId && messageHasToolCalls(parent)) {
      return parent;
    }
  }

  if (!toolCallId) {
    const resultToolName = String((message as any)?.toolName || (message as any)?.tool_name || '').trim().toLowerCase();
    if (resultToolName) {
      const nameMatches: Message[] = [];
      for (let index = currentIndex - 1; index >= 0; index -= 1) {
        const candidate = messages[index];
        const candidateRole = String((candidate as any)?.role || '').trim().toLowerCase();
        if (candidateRole !== 'assistant') {
          continue;
        }

        const toolCalls = Array.isArray((candidate as any)?.tool_calls) ? (candidate as any).tool_calls : [];
        const nameMatch = toolCalls.some((toolCall: any) => {
          const toolName = String(toolCall?.function?.name || toolCall?.name || '').trim().toLowerCase();
          return toolName === resultToolName;
        });

        if (nameMatch) {
          nameMatches.push(candidate);
        }
      }

      if (nameMatches.length === 1) {
        return nameMatches[0];
      }
    }

    return null;
  }

  const directByToolCallId = messagesById.get(toolCallId) || null;
  if (messageIncludesToolCallId(directByToolCallId, toolCallId)) {
    return directByToolCallId;
  }

  for (let index = currentIndex - 1; index >= 0; index -= 1) {
    const candidate = messages[index];
    const candidateRole = String((candidate as any)?.role || '').trim().toLowerCase();
    if (candidateRole !== 'assistant') {
      continue;
    }

    if (messageIncludesToolCallId(candidate, toolCallId)) {
      return candidate;
    }
  }

  return null;
}

function resolveToolNameForMessage(
  message: Message,
  messagesById: Map<string, Message>,
  messages: Message[],
  currentIndex: number,
): string {
  const directToolName = String((message as any)?.toolName || (message as any)?.tool_name || (message as any)?.toolExecution?.toolName || '').trim();
  if (directToolName && directToolName.toLowerCase() !== 'unknown') {
    return directToolName;
  }

  const toolCallId = String((message as any)?.tool_call_id || (message as any)?.toolCallId || '').trim();

  const ownToolName = extractToolNameFromToolCalls(message, toolCallId);
  if (ownToolName) {
    return ownToolName;
  }

  const replyToMessageId = String((message as any)?.replyToMessageId || '').trim();
  if (replyToMessageId) {
    const parent = messagesById.get(replyToMessageId) || null;
    const parentToolName = extractToolNameFromToolCalls(parent, toolCallId);
    if (parentToolName) {
      return parentToolName;
    }
  }

  if (toolCallId) {
    const directByToolCallId = messagesById.get(toolCallId) || null;
    const directMappedToolName = extractToolNameFromToolCalls(directByToolCallId, toolCallId);
    if (directMappedToolName) {
      return directMappedToolName;
    }

    for (let index = currentIndex - 1; index >= 0; index -= 1) {
      const candidate = messages[index];
      const role = String((candidate as any)?.role || '').trim().toLowerCase();
      if (role !== 'assistant') {
        continue;
      }

      const candidateToolName = extractToolNameFromToolCalls(candidate, toolCallId);
      if (candidateToolName) {
        return candidateToolName;
      }
    }
  }

  const callingToolMatch = getMessageText(message).match(/calling tool\s*:\s*([a-z0-9_.:-]+)/i);
  if (callingToolMatch?.[1]) {
    return callingToolMatch[1];
  }

  return directToolName;
}

/**
 * Detect assistant messages that carry tool_calls but also have meaningful
 * prose content (not just "Calling tool: ...").  These "narrated" rows should
 * render as normal assistant cards, not as compact tool cards.
 * Ported from electron/renderer MessageListPanel.isNarratedAssistantToolCallMessage.
 */
function isNarratedAssistantToolCallMessage(message: Message): boolean {
  const anyMsg = message as any;
  const role = String(anyMsg?.role || '').trim().toLowerCase();
  if (role !== 'assistant') {
    return false;
  }
  const toolCalls = Array.isArray(anyMsg?.tool_calls) ? anyMsg.tool_calls : [];
  if (toolCalls.length === 0) {
    return false;
  }
  const text = getMessageText(message);
  if (!text) {
    return false;
  }
  return !/^calling tool\s*:/i.test(text);
}

function isToolRequestMessage(message: Message): boolean {
  if (isNarratedAssistantToolCallMessage(message)) {
    return false;
  }
  const anyMsg = message as any;
  if (Array.isArray(anyMsg?.tool_calls) && anyMsg.tool_calls.length > 0) {
    return true;
  }
  return /calling tool\s*:/i.test(getMessageText(message));
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
  const text = getMessageText(message);
  if (!text) {
    return false;
  }
  return /^calling tool(?::|\s)/i.test(text);
}

function getSyntheticToolResultCallId(message: Message): string {
  return String((message as any)?.syntheticToolResult?.toolCallId || '').trim();
}

function getSyntheticToolResultSourceMessageId(message: Message): string {
  return String((message as any)?.syntheticToolResult?.sourceMessageId || '').trim();
}

function collectLinkedToolResults(
  message: Message,
  messages: Message[],
  toolResultsByKey: Map<string, Message[]>,
): Message[] {
  const combinedToolResults: Message[] = [];
  const combinedMessageIds = new Set<string>();
  const requestMessageId = String((message as any)?.messageId || '').trim();
  const requestedCallIds = collectToolCallIds(message);

  for (const callId of requestedCallIds) {
    const matches = toolResultsByKey.get(callId) || [];
    for (const match of matches) {
      const matchMessageId = String((match as any)?.messageId || '').trim();
      if (matchMessageId) {
        combinedMessageIds.add(matchMessageId);
      }
      combinedToolResults.push(match);
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

      if (candidateMessageId) {
        combinedMessageIds.add(candidateMessageId);
      }
      combinedToolResults.push(candidate);
    }
  }

  return combinedToolResults;
}

export function buildCombinedRenderableMessages(messages: Message[]): Message[] {
  const messagesById = new Map<string, Message>();
  for (const message of messages) {
    const messageId = String((message as any)?.messageId || '').trim();
    if (messageId) {
      messagesById.set(messageId, message);
    }

    const toolCallIds = collectToolCallIds(message);
    for (const toolCallId of toolCallIds) {
      messagesById.set(toolCallId, message);
    }
  }

  const toolResultsByKey = new Map<string, Message[]>();
  const toolStreamsByKey = new Map<string, Message[]>();
  const syntheticResultsByToolCallId = new Map<string, Message[]>();
  const syntheticResultsBySourceMessageId = new Map<string, Message[]>();

  for (const message of messages) {
    const anyMsg = message as any;
    const role = String(anyMsg?.role || '').trim().toLowerCase();
    const syntheticToolCallId = getSyntheticToolResultCallId(message);
    if (syntheticToolCallId) {
      const existingSyntheticRows = syntheticResultsByToolCallId.get(syntheticToolCallId) || [];
      existingSyntheticRows.push(message);
      syntheticResultsByToolCallId.set(syntheticToolCallId, existingSyntheticRows);
    }
    const syntheticSourceMessageId = getSyntheticToolResultSourceMessageId(message);
    if (syntheticSourceMessageId) {
      const existingSyntheticRows = syntheticResultsBySourceMessageId.get(syntheticSourceMessageId) || [];
      existingSyntheticRows.push(message);
      syntheticResultsBySourceMessageId.set(syntheticSourceMessageId, existingSyntheticRows);
    }
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
    const completionKey = String(anyMsg?.tool_call_id || anyMsg?.toolCallId || anyMsg?.messageId || '').trim();
    if (!completionKey) {
      continue;
    }
    const existing = toolResultsByKey.get(completionKey) || [];
    existing.push(message);
    toolResultsByKey.set(completionKey, existing);
  }

  const consumedToolRowIds = new Set<string>();

  return messages
    .map((message, currentIndex) => {
      if (!isToolRelatedMessage(message) || !isToolRequestMessage(message)) {
        const narratedToolCallResults = isNarratedAssistantToolCallMessage(message)
          ? collectLinkedToolResults(message, messages, toolResultsByKey)
          : [];
        const linkedToolRequest = findToolRequestMessageForToolResult(message, messagesById, messages, currentIndex);
        const resolvedToolName = resolveToolNameForMessage(message, messagesById, messages, currentIndex);

        if (!linkedToolRequest && !resolvedToolName && narratedToolCallResults.length === 0) {
          return message;
        }

        const toolLookupKey = String((message as any)?.tool_call_id || (message as any)?.toolCallId || (message as any)?.messageId || '').trim();
        const linkedSyntheticToolResultMessages = [
          ...(toolLookupKey ? (syntheticResultsByToolCallId.get(toolLookupKey) || []) : []),
          ...(String((message as any)?.messageId || '').trim()
            ? (syntheticResultsBySourceMessageId.get(String((message as any)?.messageId || '').trim()) || [])
            : []),
        ];

        let nextMessage = message as any;
        if (narratedToolCallResults.length > 0) {
          nextMessage = { ...nextMessage, narratedToolCallResults };
        }
        if (linkedToolRequest && !(Array.isArray((message as any)?.tool_calls) && (message as any).tool_calls.length > 0)) {
          nextMessage = { ...nextMessage, linkedToolRequest };
        }
        if (resolvedToolName && !String((message as any)?.toolName || '').trim()) {
          nextMessage = { ...nextMessage, toolName: resolvedToolName };
        }
        if (linkedSyntheticToolResultMessages.length > 0) {
          nextMessage = { ...nextMessage, syntheticToolResultMessages: linkedSyntheticToolResultMessages };
        }

        return nextMessage as Message;
      }

      const combinedToolResults: Message[] = [];
      const combinedToolStreams: Message[] = [];
      const syntheticToolResultMessages: Message[] = [];
      const requestMessageId = String((message as any)?.messageId || '').trim();
      const combinedMessageIds = new Set<string>();
      const requestedCallIds = collectToolCallIds(message);
      if (requestedCallIds.length > 0) {
        for (const callId of requestedCallIds) {
          const activeStreams = toolStreamsByKey.get(callId) || [];
          for (const streamRow of activeStreams) {
            const streamRowId = String((streamRow as any)?.messageId || streamRow.id || '').trim();
            if (streamRowId) {
              consumedToolRowIds.add(streamRowId);
            }
            combinedToolStreams.push(streamRow);
          }

          const matches = toolResultsByKey.get(callId) || [];
          for (const syntheticMessage of syntheticResultsByToolCallId.get(callId) || []) {
            syntheticToolResultMessages.push(syntheticMessage);
          }
          for (const match of matches) {
            const matchMessageId = String((match as any)?.messageId || match.id || '').trim();
            if (matchMessageId) {
              consumedToolRowIds.add(matchMessageId);
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

          const candidateMessageId = String((candidate as any)?.messageId || candidate.id || '').trim();
          if (candidateMessageId && combinedMessageIds.has(candidateMessageId)) {
            continue;
          }

          if (candidateMessageId) {
            consumedToolRowIds.add(candidateMessageId);
            combinedMessageIds.add(candidateMessageId);
            for (const syntheticMessage of syntheticResultsBySourceMessageId.get(candidateMessageId) || []) {
              syntheticToolResultMessages.push(syntheticMessage);
            }
          }
          combinedToolResults.push(candidate);
        }
      }
      // Keep request rows in tool-card mode even before completion rows exist.
      // This matches Electron behavior where tool execution appears as `running`
      // immediately instead of waiting for final tool results.
      const resolvedToolName = resolveToolNameForMessage(message, messagesById, messages, currentIndex);
      return {
        ...message,
        ...(resolvedToolName && !String((message as any)?.toolName || '').trim() ? { toolName: resolvedToolName } : {}),
        combinedToolResults,
        combinedToolStreams,
        ...(syntheticToolResultMessages.length > 0 ? { syntheticToolResultMessages } : {}),
      } as Message;
    })
    .filter((message) => {
      const role = String((message as any)?.role || '').trim().toLowerCase();
      if (role !== 'tool') {
        return true;
      }

      const toolRowId = String((message as any)?.messageId || message.id || '').trim();
      if (!toolRowId) {
        return true;
      }

      return !consumedToolRowIds.has(toolRowId);
    });
}
