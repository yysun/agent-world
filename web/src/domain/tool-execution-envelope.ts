/**
 * Tool Execution Envelope Helpers
 *
 * Purpose:
 * - Parse persisted tool execution envelopes inside the web UI boundary.
 *
 * Key Features:
 * - Envelope parsing from tool rows and realtime tool event payloads.
 * - Preview normalization for text, markdown, URL, and artifact displays.
 * - Fallback helpers so non-enveloped tool rows continue to render normally.
 *
 * Notes on Implementation:
 * - This module is web-local to preserve the web/Electron separation rule.
 * - It mirrors the core envelope shape without importing runtime code into the UI.
 *
 * Recent Changes:
 * - 2026-03-06: Read explicit live `toolExecution.preview` payloads for adopted tools instead of inferring preview data from `result`.
 * - 2026-03-06: Initial web-side tool envelope parsing and preview extraction.
 */

import type { Message } from '../types';

export type ToolPreviewKind = 'text' | 'markdown' | 'artifact' | 'media' | 'graphic' | 'url';
export type ToolPreviewRenderer = 'text' | 'markdown' | 'image' | 'svg' | 'audio' | 'video' | 'youtube' | 'file';

export interface ToolArtifactReference {
  path?: string;
  url?: string;
  media_type?: string;
  bytes?: number;
  display_name?: string;
}

export interface ToolPreview {
  kind: ToolPreviewKind;
  renderer?: ToolPreviewRenderer;
  media_type?: string;
  title?: string;
  text?: string;
  url?: string;
  artifact?: ToolArtifactReference;
}

export interface ToolExecutionEnvelope {
  __type: 'tool_execution_envelope';
  version: 1;
  tool: string;
  tool_call_id?: string;
  status?: string;
  preview: ToolPreview | ToolPreview[] | null;
  result: unknown;
}

function isToolPreviewValue(value: unknown): value is ToolPreview | ToolPreview[] {
  if (Array.isArray(value)) {
    return value.every((item) => isToolPreviewValue(item));
  }

  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Record<string, unknown>;
  return typeof record.kind === 'string';
}

function parseMaybeEnvelope(value: unknown): ToolExecutionEnvelope | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (record.__type !== 'tool_execution_envelope' || record.version !== 1 || typeof record.tool !== 'string') {
    return null;
  }

  return record as ToolExecutionEnvelope;
}

export function parseToolExecutionEnvelopeContent(content: string): ToolExecutionEnvelope | null {
  const normalized = String(content || '').trim();
  if (!normalized) {
    return null;
  }

  try {
    return parseMaybeEnvelope(JSON.parse(normalized));
  } catch {
    return null;
  }
}

export function getToolExecutionEnvelope(message: Message): ToolExecutionEnvelope | null {
  const eventPreview = message.toolExecution?.preview;
  if (isToolPreviewValue(eventPreview)) {
    return {
      __type: 'tool_execution_envelope',
      version: 1,
      tool: String(message.toolExecution?.toolName || 'unknown'),
      preview: eventPreview,
      result: message.toolExecution?.result,
    };
  }

  const eventResult = message.toolExecution?.result;
  if (typeof eventResult === 'string') {
    const parsed = parseToolExecutionEnvelopeContent(eventResult);
    if (parsed) {
      return parsed;
    }
  } else if (eventResult) {
    const parsed = parseMaybeEnvelope(eventResult);
    if (parsed) {
      return parsed;
    }
  }

  const messageContent = String((message as any)?.content || message.text || '');
  return parseToolExecutionEnvelopeContent(messageContent);
}

export function normalizeToolPreviewItems(preview: ToolExecutionEnvelope['preview']): ToolPreview[] {
  if (!preview) {
    return [];
  }

  return Array.isArray(preview) ? preview : [preview];
}

export function stringifyToolEnvelopeResult(result: unknown): string {
  if (typeof result === 'string') {
    return result;
  }

  if (result == null) {
    return '';
  }

  try {
    return JSON.stringify(result, null, 2);
  } catch {
    return String(result);
  }
}

function summarizePreviewItem(item: ToolPreview): string {
  if (typeof item.text === 'string' && item.text.trim()) {
    return item.text;
  }

  if (item.kind === 'url' && item.url) {
    return item.url;
  }

  const displayName = String(item.artifact?.display_name || item.title || '').trim();
  const pathText = String(item.artifact?.path || item.artifact?.url || item.url || '').trim();
  const mediaType = String(item.media_type || item.artifact?.media_type || '').trim();
  const parts = [displayName || pathText || 'artifact'];
  if (mediaType) {
    parts.push(`(${mediaType})`);
  }
  return parts.join(' ');
}

export function getToolPreviewDisplayText(message: Message): string | null {
  const envelope = getToolExecutionEnvelope(message);
  if (!envelope) {
    return null;
  }

  const items = normalizeToolPreviewItems(envelope.preview);
  if (items.length === 0) {
    return stringifyToolEnvelopeResult(envelope.result);
  }

  return items
    .map((item) => summarizePreviewItem(item))
    .filter(Boolean)
    .join('\n\n');
}
