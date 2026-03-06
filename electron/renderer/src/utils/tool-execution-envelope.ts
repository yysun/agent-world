/**
 * Tool Execution Envelope Helpers
 * Purpose:
 * - Parse persisted tool execution envelopes inside the Electron renderer.
 *
 * Key Features:
 * - Envelope parsing from message content and tool event payloads.
 * - Preview normalization with stable text fallbacks for renderer helpers.
 * - Result extraction for status/body rendering after reload.
 *
 * Implementation Notes:
 * - This module is Electron-local to preserve app-boundary separation.
 * - It mirrors the core envelope contract without importing shared UI code.
 *
 * Recent Changes:
 * - 2026-03-06: Read explicit live `toolExecution.preview` payloads for adopted tools instead of inferring preview data from `result`.
 * - 2026-03-06: Initial Electron-side tool envelope parsing and preview extraction.
 */

export function parseToolExecutionEnvelopeContent(content) {
  const normalized = String(content || '').trim();
  if (!normalized) {
    return null;
  }

  try {
    const parsed = JSON.parse(normalized);
    if (
      parsed
      && typeof parsed === 'object'
      && !Array.isArray(parsed)
      && parsed.__type === 'tool_execution_envelope'
      && parsed.version === 1
      && typeof parsed.tool === 'string'
    ) {
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
}

function isToolPreviewValue(value) {
  if (Array.isArray(value)) {
    return value.every((item) => isToolPreviewValue(item));
  }

  return Boolean(value) && typeof value === 'object' && typeof value.kind === 'string';
}

export function getToolExecutionEnvelope(message) {
  const eventPreview = message?.toolExecution?.preview;
  if (isToolPreviewValue(eventPreview)) {
    return {
      __type: 'tool_execution_envelope',
      version: 1,
      tool: String(message?.toolExecution?.toolName || 'unknown'),
      preview: eventPreview,
      result: message?.toolExecution?.result,
    };
  }

  const eventResult = message?.toolExecution?.result;
  if (typeof eventResult === 'string') {
    const parsed = parseToolExecutionEnvelopeContent(eventResult);
    if (parsed) {
      return parsed;
    }
  } else if (eventResult && typeof eventResult === 'object' && !Array.isArray(eventResult)) {
    if (eventResult.__type === 'tool_execution_envelope' && eventResult.version === 1 && typeof eventResult.tool === 'string') {
      return eventResult;
    }
  }

  return parseToolExecutionEnvelopeContent(String(message?.content || ''));
}

export function normalizeToolPreviewItems(preview) {
  if (!preview) {
    return [];
  }

  return Array.isArray(preview) ? preview : [preview];
}

export function stringifyToolEnvelopeResult(result) {
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

function summarizePreviewItem(item) {
  if (typeof item?.text === 'string' && item.text.trim()) {
    return item.text;
  }

  if (item?.kind === 'url' && typeof item?.url === 'string' && item.url.trim()) {
    return item.url.trim();
  }

  const displayName = String(item?.artifact?.display_name || item?.title || '').trim();
  const pathText = String(item?.artifact?.path || item?.artifact?.url || item?.url || '').trim();
  const mediaType = String(item?.media_type || item?.artifact?.media_type || '').trim();
  const parts = [displayName || pathText || 'artifact'];
  if (mediaType) {
    parts.push(`(${mediaType})`);
  }
  return parts.join(' ');
}

export function getToolPreviewDisplayText(message) {
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
