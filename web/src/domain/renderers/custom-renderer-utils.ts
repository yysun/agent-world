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
 * - 2026-02-20: Added to decouple registry core from concrete renderer modules.
 */

import type { Message } from '../../types';

export function isToolMessageFor(message: Message, toolName: string): boolean {
  return message.type === 'tool' && message.toolExecution?.toolName === toolName;
}

export function extractToolPayload(message: Message): unknown {
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
