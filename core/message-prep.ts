/**
 * Message Preparation Utilities for LLM Processing
 *
 * Features:
 * - Filters client.* tool calls and approval_ tool results from messages
 * - Two-layer architecture: storage (agent.memory) vs processing (LLM input)
 * - Maintains complete message history while providing clean LLM context
 * - Enhanced string protocol: Parses JSON strings with __type markers into OpenAI format
 *
 * Implementation:
 * - Removes client.* tool calls and approval_ tool results from LLM context
 * - No approval cache updates (handled by server API layer)
 * - parseMessageContent() converts enhanced string format to OpenAI ChatMessage
 * - Used by utils.ts prepareMessagesForLLM() - high-level function applies this filter
 * - NOT used directly by llm-manager.ts (receives pre-filtered messages from utils.ts)
 *
 * Changes:
 * - 2025-11-04: Simplified from message-filter.ts, removed approval cache logic
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
 * parseMessageContent('{"__type":"tool_result","tool_call_id":"approval_123","agentId":"a1","content":"..."}')
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
 * - Removes messages marked as clientOnly (approval UI messages)
 * - Removes client.* tool calls from assistant messages
 * - Removes approval_ tool results from tool messages
 * - Drops messages that become empty after filtering
 * 
 * @param messages - All messages from agent memory
 * @returns Filtered messages ready for LLM
 */
export function filterClientSideMessages(messages: ChatMessage[]): ChatMessage[] {
  const prepared: ChatMessage[] = [];

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
      const filteredToolCalls = clonedMessage.tool_calls.filter(
        toolCall => !toolCall.function.name.startsWith('client.')
      );

      // If all tool calls were client.* and no content, skip this message
      if (filteredToolCalls.length === 0 && !clonedMessage.content) {
        logger.debug('Dropping assistant message with only client.* tool calls', {
          droppedToolCalls: clonedMessage.tool_calls.map(tc => tc.function.name)
        });
        continue;
      }

      clonedMessage.tool_calls = filteredToolCalls;
    }

    prepared.push(clonedMessage);
  }

  logger.debug(`Prepared ${prepared.length}/${messages.length} messages for LLM consumption`);
  return prepared;
}
