/**
 * Message Preparation Utilities for LLM Processing
 *
 * Features:
 * - Filters client.* tool calls from messages prepared for LLM input
 * - Two-layer architecture: storage (agent.memory) vs processing (LLM input)
 * - Maintains complete message history while providing clean LLM context
 * - Enhanced string protocol: Parses JSON strings with __type markers into OpenAI format
 *
 * Implementation:
 * - Removes client.* tool calls from LLM context
 * - No side-effect state updates while preparing messages
 * - parseMessageContent() converts enhanced string format to OpenAI ChatMessage
 * - Used by utils.ts prepareMessagesForLLM() - high-level function applies this filter
 * - NOT used directly by llm-manager.ts (receives pre-filtered messages from utils.ts)
 *
 * Changes:
 * - 2026-02-11: Added unresolved-tool-call cleanup.
 * - Assistant `tool_calls` are pruned to only IDs that have matching tool-result messages.
 * - Prevents OpenAI 400 errors from legacy/incomplete tool-call history.
 * - 2026-02-08: Removed stale manual tool-intervention terminology from message prep docs
 * - 2026-02-08: Fixed OpenAI API validation error - now filters orphaned tool messages
 * - Tool messages referencing removed client.* tool_call_ids are now properly filtered
 * - Tracks removed tool_call_ids to prevent "tool must follow tool_calls" errors
 * - 2025-11-04: Simplified from message-filter.ts, removed legacy tool decision cache logic
 * - 2025-11-06: Added parseMessageContent() for enhanced string protocol support
 * - 2025-11-06: Consolidated with utils.ts - renamed to filterClientSideMessages, added alias
 */

import { createCategoryLogger } from './logger.js';
import type { ChatMessage } from './types.js';

const logger = createCategoryLogger('llm.message-prep');

/**
 * Parse message content to detect enhanced string format and convert to OpenAI ChatMessage.
 * 
 * Enhanced String Protocol:
 * - Transport Layer: JSON strings with __type markers (e.g., {"__type": "tool_result", ...})
 * - Storage Layer: OpenAI ChatMessage format (e.g., {role: "tool", tool_call_id: "...", ...})
 * 
 * Supported __type values:
 * - "tool_result": Converts to OpenAI tool message with role: "tool"
 * 
 * AgentId Handling:
 * - If agentId is present in JSON, returns { message, targetAgentId }
 * - Caller should prepend @mention before publishing
 * 
 * Backward Compatibility:
 * - Regular text strings pass through unchanged
 * - Invalid JSON strings pass through unchanged
 * - Missing __type passes through unchanged
 * 
 * @param content - String content (may be plain text or JSON with __type marker)
 * @param defaultRole - Role to use if content is not enhanced format (default: "user")
 * @returns Object with ChatMessage and optional targetAgentId
 * 
 * @example
 * // Tool result with agentId (enhanced format)
 * parseMessageContent('{"__type":"tool_result","tool_call_id":"call_123","agentId":"a1","content":"..."}')
 * // → {message: {role: "tool", ...}, targetAgentId: "a1"}
 * 
 * // Regular text (backward compatible)
 * parseMessageContent("Hello world")
 * // → {message: {role: "user", content: "Hello world", ...}, targetAgentId: undefined}
 */
export function parseMessageContent(
  content: string,
  defaultRole: 'user' | 'assistant' = 'user'
): { message: ChatMessage; targetAgentId?: string } {
  try {
    const parsed = JSON.parse(content);

    // Enhanced format: tool_result
    if (parsed.__type === 'tool_result') {
      if (!parsed.tool_call_id) {
        logger.warn('Enhanced format missing tool_call_id, falling back to default role', {
          parsed
        });
        return {
          message: {
            role: defaultRole,
            content: content,
            createdAt: new Date()
          }
        };
      }

      logger.debug('Parsed enhanced tool_result format', {
        toolCallId: parsed.tool_call_id,
        agentId: parsed.agentId,
        contentLength: parsed.content?.length || 0
      });

      return {
        message: {
          role: 'tool',
          tool_call_id: parsed.tool_call_id,
          content: parsed.content || '',
          createdAt: new Date()
        },
        targetAgentId: parsed.agentId // Extract agentId for @mention routing
      };
    }

    // JSON without __type marker - treat as regular text
    logger.debug('JSON without __type marker, treating as regular content');
  } catch {
    // Not JSON - regular text
    logger.debug('Non-JSON content, using default role', { role: defaultRole });
  }

  // Default: regular text message
  return {
    message: {
      role: defaultRole,
      content: content,
      createdAt: new Date()
    }
  };
}

/**
 * Filter client-side messages and tool calls from message array.
 * 
 * This function creates a clean copy of messages suitable for LLM processing:
 * - Removes messages marked as clientOnly
 * - Removes client.* tool calls from assistant messages
 * - Removes orphaned tool messages (those referencing removed client.* tool calls)
 * - Removes orphaned tool messages with missing tool_call_ids (invalid data)
 * - Removes tool messages that don't have a preceding assistant message with matching tool_call
 * - Drops messages that become empty after filtering
 * 
 * @param messages - All messages from agent memory
 * @returns Filtered messages ready for LLM
 */
export function filterClientSideMessages(messages: ChatMessage[]): ChatMessage[] {
  const prepared: ChatMessage[] = [];
  const removedToolCallIds = new Set<string>();
  const validToolCallIds = new Set<string>();

  // First pass: Filter assistant messages and track tool_call_ids
  for (const message of messages) {
    // Deep clone to avoid mutating original
    const clonedMessage: ChatMessage = {
      ...message,
      tool_calls: message.tool_calls
        ? message.tool_calls.map(toolCall => ({
          ...toolCall,
          function: { ...toolCall.function }
        }))
        : undefined
    };

    // Filter assistant messages with tool calls
    if (clonedMessage.role === 'assistant' && clonedMessage.tool_calls?.length) {
      // Track which tool_call_ids we're removing
      const removedCalls = clonedMessage.tool_calls.filter(
        toolCall => toolCall.function.name.startsWith('client.')
      );
      removedCalls.forEach(tc => removedToolCallIds.add(tc.id));

      const filteredToolCalls = clonedMessage.tool_calls.filter(
        toolCall => !toolCall.function.name.startsWith('client.')
      );

      // Track valid tool_call_ids (non-client.*)
      filteredToolCalls.forEach(tc => validToolCallIds.add(tc.id));

      // If all tool calls were client.* and no content, skip this message
      if (filteredToolCalls.length === 0 && !clonedMessage.content) {
        logger.debug('Dropping assistant message with only client.* tool calls', {
          droppedToolCalls: clonedMessage.tool_calls.map(tc => tc.function.name),
          droppedToolCallIds: Array.from(removedToolCallIds)
        });
        continue;
      }

      clonedMessage.tool_calls = filteredToolCalls;
    }

    // Filter tool messages
    if (clonedMessage.role === 'tool') {
      // Drop tool messages without tool_call_id (invalid data)
      if (!clonedMessage.tool_call_id) {
        logger.debug('Dropping tool message without tool_call_id (invalid data)');
        continue;
      }

      // Drop tool messages referencing removed client.* tool calls
      if (removedToolCallIds.has(clonedMessage.tool_call_id)) {
        logger.debug('Dropping orphaned tool message for removed client.* tool call', {
          toolCallId: clonedMessage.tool_call_id
        });
        continue;
      }

      // Drop tool messages that don't have a valid preceding tool_call
      // This handles legacy data where tool_calls weren't properly saved
      if (!validToolCallIds.has(clonedMessage.tool_call_id)) {
        logger.debug('Dropping tool message with no matching tool_call (legacy data)', {
          toolCallId: clonedMessage.tool_call_id
        });
        continue;
      }
    }

    prepared.push(clonedMessage);
  }

  const answeredToolCallIds = new Set<string>();
  for (const message of prepared) {
    if (message.role === 'tool' && message.tool_call_id) {
      answeredToolCallIds.add(message.tool_call_id);
    }
  }

  const finalized: ChatMessage[] = [];
  for (const message of prepared) {
    if (message.role !== 'assistant' || !message.tool_calls?.length) {
      finalized.push(message);
      continue;
    }

    const resolvedToolCalls = message.tool_calls.filter((toolCall) =>
      answeredToolCallIds.has(toolCall.id)
    );

    if (resolvedToolCalls.length === message.tool_calls.length) {
      finalized.push(message);
      continue;
    }

    logger.debug('Pruning unresolved assistant tool_calls from message history', {
      removedCount: message.tool_calls.length - resolvedToolCalls.length,
      removedToolCallIds: message.tool_calls
        .filter((toolCall) => !answeredToolCallIds.has(toolCall.id))
        .map((toolCall) => toolCall.id)
    });

    if (resolvedToolCalls.length === 0 && !message.content) {
      logger.debug('Dropping assistant message with only unresolved tool_calls');
      continue;
    }

    finalized.push({
      ...message,
      tool_calls: resolvedToolCalls
    });
  }

  logger.debug(`Prepared ${finalized.length}/${messages.length} messages for LLM consumption`, {
    removedToolCallIds: Array.from(removedToolCallIds),
    validToolCallIds: Array.from(validToolCallIds),
    answeredToolCallIds: Array.from(answeredToolCallIds)
  });
  return finalized;
}
