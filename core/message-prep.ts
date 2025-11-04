/**
 * Message Preparation Utilities for LLM Processing
 *
 * Features:
 * - Prepares messages by filtering client.* tool calls and approval_ tool results
 * - Two-layer architecture: storage (agent.memory) vs processing (LLM input)
 * - Maintains complete message history while providing clean LLM context
 *
 * Implementation:
 * - Shared function used by all LLM providers (OpenAI, Anthropic, Google)
 * - Removes client.* tool calls and approval_ tool results from LLM context
 * - No approval cache updates (handled by server API layer)
 *
 * Changes:
 * - 2025-11-04: Simplified from message-filter.ts, removed approval cache logic
 */

import { createCategoryLogger } from './logger.js';
import type { ChatMessage } from './types.js';

const logger = createCategoryLogger('llm.message-prep');

/**
 * Prepare messages for LLM consumption by filtering client-side tool calls.
 * 
 * This function creates a clean copy of messages suitable for LLM processing:
 * - Removes client.* tool calls from assistant messages
 * - Removes approval_ tool results from tool messages
 * - Drops messages that become empty after filtering
 * 
 * @param messages - All messages from agent memory
 * @returns Filtered messages ready for LLM
 */
export function prepareMessagesForLLM(messages: ChatMessage[]): ChatMessage[] {
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

    // Filter tool result messages for approval_ calls
    if (clonedMessage.role === 'tool' && clonedMessage.tool_call_id?.startsWith('approval_')) {
      logger.debug('Dropping approval tool result from LLM context', {
        toolCallId: clonedMessage.tool_call_id
      });
      continue;
    }

    prepared.push(clonedMessage);
  }

  logger.debug(`Prepared ${prepared.length}/${messages.length} messages for LLM consumption`);
  return prepared;
}
