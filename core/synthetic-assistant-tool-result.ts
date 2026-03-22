/**
 * Synthetic Assistant Tool Result Helpers
 *
 * Purpose:
 * - Persist display-only assistant transcript rows derived from eligible tool results.
 *
 * Key Features:
 * - Stable JSON marker for persisted synthetic assistant tool-result messages.
 * - Tool-result envelope inspection and display-content extraction.
 * - Helper to build persisted assistant message rows without affecting tool lifecycle authority.
 *
 * Notes on Implementation:
 * - Synthetic rows remain ordinary persisted messages in storage, but their content is marked
 *   as display-only so LLM history preparation and agent-processing paths can filter them.
 * - Eligibility is explicit and currently limited to adopted tools with assistant-displayable
 *   content (`shell_cmd`, `web_fetch`).
 *
 * Summary of Recent Changes:
 * - 2026-03-21: Added persisted synthetic assistant tool-result marker and display-content helpers.
 */

import type { AgentMessage } from './types.js';
import { generateId } from './utils.js';
import { normalizeToolPreviewItems, parseToolExecutionEnvelopeContent } from './tool-execution-envelope.js';

export interface SyntheticAssistantToolResultContent {
  __type: 'synthetic_assistant_tool_result';
  version: 1;
  displayOnly: true;
  tool: string;
  tool_call_id?: string;
  source_message_id?: string;
  content: string;
}

function isTextualPreview(preview: unknown): preview is { kind: 'text' | 'markdown'; text: string } {
  if (!preview || typeof preview !== 'object' || Array.isArray(preview)) {
    return false;
  }

  const record = preview as Record<string, unknown>;
  return (record.kind === 'text' || record.kind === 'markdown') && typeof record.text === 'string';
}

function isAdoptedSyntheticTool(toolName: string): boolean {
  return toolName === 'shell_cmd' || toolName === 'web_fetch';
}

function extractPreviewDisplayContent(serializedToolResult: string): string | null {
  const envelope = parseToolExecutionEnvelopeContent(serializedToolResult);
  if (!envelope) {
    return null;
  }

  for (const preview of normalizeToolPreviewItems(envelope.preview)) {
    if (isTextualPreview(preview)) {
      const text = preview.text.trim();
      if (text) {
        return text;
      }
    }
  }

  return null;
}

export function serializeSyntheticAssistantToolResultContent(
  payload: SyntheticAssistantToolResultContent,
): string {
  return JSON.stringify(payload);
}

export function parseSyntheticAssistantToolResultContent(
  content: string,
): SyntheticAssistantToolResultContent | null {
  const normalized = String(content || '').trim();
  if (!normalized) {
    return null;
  }

  try {
    const parsed = JSON.parse(normalized);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }

    if (parsed.__type !== 'synthetic_assistant_tool_result' || parsed.version !== 1 || parsed.displayOnly !== true) {
      return null;
    }

    if (typeof parsed.tool !== 'string' || typeof parsed.content !== 'string') {
      return null;
    }

    return {
      __type: 'synthetic_assistant_tool_result',
      version: 1,
      displayOnly: true,
      tool: parsed.tool,
      ...(typeof parsed.tool_call_id === 'string' && parsed.tool_call_id.trim()
        ? { tool_call_id: parsed.tool_call_id.trim() }
        : {}),
      ...(typeof parsed.source_message_id === 'string' && parsed.source_message_id.trim()
        ? { source_message_id: parsed.source_message_id.trim() }
        : {}),
      content: parsed.content,
    };
  } catch {
    return null;
  }
}

export function extractSyntheticAssistantDisplayContentFromToolResult(
  serializedToolResult: string,
): { tool: string; toolCallId?: string; content: string } | null {
  const envelope = parseToolExecutionEnvelopeContent(serializedToolResult);
  if (!envelope) {
    return null;
  }

  const toolName = String(envelope.tool || '').trim();
  if (!isAdoptedSyntheticTool(toolName)) {
    return null;
  }

  const status = String(envelope.status || '').trim().toLowerCase();
  if (status === 'failed' || status === 'error') {
    return null;
  }

  const displayContent = typeof envelope.display_content === 'string'
    ? envelope.display_content.trim()
    : '';
  const fallbackPreviewContent = extractPreviewDisplayContent(serializedToolResult) || '';
  const resolvedContent = displayContent || fallbackPreviewContent;
  if (!resolvedContent) {
    return null;
  }

  const toolCallId = String(envelope.tool_call_id || '').trim();
  return {
    tool: toolName,
    ...(toolCallId ? { toolCallId } : {}),
    content: resolvedContent,
  };
}

export function createSyntheticAssistantToolResultMessage(options: {
  serializedToolResult: string;
  sourceMessageId?: string;
  replyToMessageId?: string;
  sender: string;
  chatId: string;
  agentId: string;
  createdAt?: Date;
}): AgentMessage | null {
  const displayContent = extractSyntheticAssistantDisplayContentFromToolResult(options.serializedToolResult);
  if (!displayContent) {
    return null;
  }

  return {
    role: 'assistant',
    content: serializeSyntheticAssistantToolResultContent({
      __type: 'synthetic_assistant_tool_result',
      version: 1,
      displayOnly: true,
      tool: displayContent.tool,
      ...(displayContent.toolCallId ? { tool_call_id: displayContent.toolCallId } : {}),
      ...(options.sourceMessageId ? { source_message_id: options.sourceMessageId } : {}),
      content: displayContent.content,
    }),
    sender: options.sender,
    createdAt: options.createdAt || new Date(),
    chatId: options.chatId,
    messageId: generateId(),
    replyToMessageId: options.replyToMessageId,
    agentId: options.agentId,
  };
}
