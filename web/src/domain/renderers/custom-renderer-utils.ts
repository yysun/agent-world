/**
 * Custom Renderer Utilities
 *
 * Purpose:
 * - Provide shared, renderer-agnostic helper functions.
 * - Avoid circular dependencies between registry and concrete renderers.
 *
 * Key Features:
 * - Tool-name matching helper for tool-result messages
 * - Robust payload extraction from `toolExecution.result` and fallback text
 *
 * Recent Changes:
 * - 2026-03-06: Prefer persisted envelope preview payloads for adopted tool results before falling back to raw tool-result text.
 * - 2026-02-20: Added to decouple registry core from concrete renderer modules.
 */

import type { Message } from '../../types';
import {
  getToolExecutionEnvelope,
  normalizeToolPreviewItems,
} from '../tool-execution-envelope';

export function isToolMessageFor(message: Message, toolName: string): boolean {
  return message.type === 'tool' && message.toolExecution?.toolName === toolName;
}

export function extractToolPayload(message: Message): unknown {
  const envelope = getToolExecutionEnvelope(message);
  if (envelope) {
    const previews = normalizeToolPreviewItems(envelope.preview);
    if (previews.length === 1) {
      return previews[0];
    }
    if (previews.length > 1) {
      return previews;
    }
    return envelope.result;
  }

  const toolResult = message.toolExecution?.result;
  if (typeof toolResult === 'string') {
    try {
      return JSON.parse(toolResult);
    } catch {
      return toolResult;
    }
  }
  if (toolResult !== undefined) {
    return toolResult;
  }
  if (!message.text) {
    return null;
  }
  try {
    return JSON.parse(message.text);
  } catch {
    return message.text;
  }
}
