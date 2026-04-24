/**
 * Purpose:
 * - Provide pure visibility rules for web chat transcript message rendering.
 *
 * Key Features:
 * - Hides internal tool event rows and protocol-only tool_result payload rows.
 * - Suppresses assistant HITL tool-call placeholder rows (`ask_user_input` and `human_intervention_request`).
 *
 * Notes on Implementation:
 * - Kept framework-agnostic and side-effect free for direct unit testing.
 * - Accepts broad message-like input to support both persisted and streamed shapes.
 *
 * Summary of Recent Changes:
 * - 2026-04-24: Added suppression for assistant `Calling tool: ask_user_input` placeholder rows while keeping the legacy alias hidden.
 * - 2026-02-28: Added suppression for assistant `Calling tool: human_intervention_request` placeholder rows.
 */

import type { Message } from '../types';

function hasHitlToolCall(message: Message): boolean {
  const anyMessage = message as any;
  const toolCalls = Array.isArray(anyMessage?.tool_calls) ? anyMessage.tool_calls : [];
  return toolCalls.some((toolCall: any) => {
    const toolName = String(toolCall?.function?.name || toolCall?.name || '').trim().toLowerCase();
    return toolName === 'human_intervention_request' || toolName === 'ask_user_input';
  });
}

function isHitlToolCallPlaceholder(message: Message): boolean {
  const role = String(message?.role || '').trim().toLowerCase();
  if (role !== 'assistant') {
    return false;
  }

  const text = String((message as any)?.text || (message as any)?.content || '').trim();
  if (/^calling tool(?::|\s)\s*(?:human_intervention_request|ask_user_input)\b/i.test(text)) {
    return true;
  }

  return hasHitlToolCall(message);
}

function isInternalToolProtocolRow(message: Message): boolean {
  const text = String((message as any)?.text || '').trim();
  if (!text) {
    return false;
  }

  try {
    const jsonText = text.startsWith('@') ? text.substring(text.indexOf(',') + 1).trim() : text;
    if (!(jsonText.startsWith('{') && jsonText.endsWith('}'))) {
      return false;
    }
    const parsed = JSON.parse(jsonText);
    return parsed?.__type === 'tool_result' && Boolean(parsed?.tool_call_id);
  } catch {
    return false;
  }
}

export function shouldHideWorldChatMessage(message: Message): boolean {
  if (Boolean((message as any)?.logEvent)) return true;
  if (message?.isToolEvent && !message?.isToolStreaming) {
    return true;
  }
  if (isHitlToolCallPlaceholder(message)) {
    return true;
  }
  return isInternalToolProtocolRow(message);
}
