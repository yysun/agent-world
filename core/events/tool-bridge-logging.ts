/**
 * Tool Bridge Logging Utilities
 *
 * Purpose:
 * Shared LLM↔tool debug logging helpers used by both orchestrator and
 * memory-manager to trace request/result/error handoff payloads.
 *
 * Key Features:
 * - Console-level bridge logs gated by `LOG_LLM_TOOL_BRIDGE` env var
 * - Simplified output showing only type, tool name, and truncated content (100-200 chars)
 * - Safe JSON serialization with fallback to `String()`
 *
 * Implementation Notes:
 * - Extracted from orchestrator.ts and memory-manager.ts to eliminate duplication
 * - Filters verbose metadata, keeps only essential debugging fields
 *
 * Changes:
 * - 2026-02-16: Extracted shared tool-bridge logging utilities from orchestrator
 *   and memory-manager into a dedicated module.
 * - 2026-02-17: Simplified logToolBridge to show only type, tool name, and truncated
 *   content/args/result (100-300 chars max) for better debugging ergonomics. Removed
 *   worldId, agentId, chatId, hopCount, retryCount and other verbose metadata.
 */

const TOOL_DEBUG_RESULT_PREVIEW_LIMIT = 200;

export function safeSerializeForConsole(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function isToolBridgeLoggingEnabled(): boolean {
  const rawValue = typeof process !== 'undefined' && process.env
    ? process.env.LOG_LLM_TOOL_BRIDGE
    : undefined;
  if (!rawValue) return false;

  const normalized = rawValue.toLowerCase().trim();
  return normalized === '1' || normalized === 'true' || normalized === 'debug' || normalized === 'on';
}

function truncateContent(value: unknown, maxLength = TOOL_DEBUG_RESULT_PREVIEW_LIMIT): string {
  const str = typeof value === 'string'
    ? value
    : JSON.stringify(value);

  if (str.length <= maxLength) {
    return str;
  }

  return `${str.slice(0, maxLength)}...[${str.length - maxLength} more]`;
}

export function logToolBridge(direction: string, payload: unknown): void {
  if (!isToolBridgeLoggingEnabled()) {
    return;
  }

  // Extract only essential fields: type and shortened content
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const obj = payload as Record<string, unknown>;
    const essential: Record<string, unknown> = {};

    // Keep type fields
    if ('type' in obj) essential.type = obj.type;
    if ('responseType' in obj) essential.type = obj.responseType;

    // Keep tool name/ID (essential for tracing)
    if ('toolName' in obj) essential.tool = obj.toolName;
    if ('toolCallId' in obj) essential.id = String(obj.toolCallId).slice(0, 8);

    // Truncate content/result fields
    if ('content' in obj) essential.content = truncateContent(obj.content, 100);
    if ('contentPreview' in obj) essential.content = truncateContent(obj.contentPreview, 100);
    if ('resultPreview' in obj) essential.result = truncateContent(obj.resultPreview, 150);
    if ('args' in obj) essential.args = truncateContent(obj.args, 100);

    console.log(`[LLM↔TOOLS] ${direction}`, essential);
  } else {
    // Raw responses (LLM RAW -> CONTINUE)
    console.log(`[LLM↔TOOLS] ${direction}`, truncateContent(payload, 300));
  }
}

export function getToolResultPreview(value: unknown): string {
  const serialized = typeof value === 'string'
    ? value
    : safeSerializeForConsole(value);

  if (serialized.length <= TOOL_DEBUG_RESULT_PREVIEW_LIMIT) {
    return serialized;
  }

  return `${serialized.slice(0, TOOL_DEBUG_RESULT_PREVIEW_LIMIT)}... [truncated ${serialized.length - TOOL_DEBUG_RESULT_PREVIEW_LIMIT} chars]`;
}
