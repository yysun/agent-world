/**
 * Tool Call Formatting Helpers
 * 
 * Purpose: Format tool call messages with detailed argument display
 * Source: Adapted from web/src/components/world-chat.tsx formatMessageText()
 * 
 * Features:
 * - Formats tool call messages with tool name and arguments
 * - Formats tool result messages with matching details
 * - Handles both single and multiple tool calls
 * - Shows all arguments without truncation
 * - Upgrades old messages with simple "Calling tool: name" to detailed format
 * 
 * Implementation:
 * - 3-tier detection: tool_calls array → tool type → text content
 * - JSON parsing for tool_calls and arguments
 * - Backward compatible with legacy messages
 * 
 * Changes:
 * - 2025-11-12: Created from web frontend formatting logic
 */

import type { Message } from '@/types';

/**
 * Format tool call arguments as a readable string
 * @param argsJson - Tool arguments as JSON string or object
 * @returns Formatted argument string like "(command: x, directory: y)"
 */
const formatToolArgs = (argsJson: string | Record<string, any>): string => {
  try {
    const args = typeof argsJson === 'string' ? JSON.parse(argsJson) : argsJson;
    const argKeys = Object.keys(args);

    if (argKeys.length === 0) {
      return '';
    }

    // Show all arguments without truncation
    const argSummary = argKeys.map((key: string) => {
      const val = args[key];
      const strVal = typeof val === 'string' ? val : JSON.stringify(val);
      return `${key}: ${strVal}`;
    }).join(', ');

    return ` (${argSummary})`;
  } catch {
    return '';
  }
};

/**
 * Format tool call message text with detailed arguments
 * 
 * Uses 3-tier detection:
 * 1. Check tool_calls array FIRST (upgrades old messages to detailed format)
 * 2. Check if tool result message (formats with matching call details)
 * 3. Fallback to original text
 * 
 * @param message - Message to format
 * @param allMessages - All messages for looking up tool call details
 * @returns Formatted message text
 */
export const formatToolCallMessage = (message: Message, allMessages?: Message[]): string => {
  // Tier 1: Check for tool_calls array FIRST
  // This allows old messages with simple "Calling tool: name" to be upgraded to detailed format
  const toolCallsField = (message as any).tool_calls || (message as any).toolCalls;

  if (toolCallsField) {
    // Parse tool_calls if it's a JSON string (from database)
    let toolCalls = toolCallsField;
    if (typeof toolCallsField === 'string') {
      try {
        toolCalls = JSON.parse(toolCallsField);
      } catch {
        toolCalls = [];
      }
    }

    if (Array.isArray(toolCalls) && toolCalls.length > 0) {
      // Format tool calls with details
      const toolCallDetails = toolCalls.map((tc: any) => {
        const toolName = tc.function?.name || 'unknown';
        const toolArgs = formatToolArgs(tc.function?.arguments || '{}');
        return `${toolName}${toolArgs}`;
      });

      if (toolCalls.length === 1) {
        return `Calling tool: ${toolCallDetails[0]}`;
      } else {
        return `Calling tools:\n${toolCallDetails.map((td, i) => `${i + 1}. ${td}`).join('\n')}`;
      }
    }
  }

  const text = message.text || message.content || '';

  // Tier 2: Check if this is a tool result message
  if (message.type === 'tool' || message.role === 'tool') {
    const toolCallId = (message as any).tool_call_id || (message as any).toolCallId || 'unknown';

    // Find the tool call details from previous assistant messages
    let toolName = 'unknown';
    let toolArgs = '';

    if (allMessages && message.messageId) {
      const currentIndex = allMessages.findIndex(m => m.messageId === message.messageId);
      if (currentIndex >= 0) {
        // Look backwards through messages for matching tool call
        for (let i = currentIndex - 1; i >= 0; i--) {
          const prevMsg = allMessages[i];
          const prevType = prevMsg.type || prevMsg.role;

          if (prevType === 'assistant') {
            const prevToolCallsField = (prevMsg as any).tool_calls || (prevMsg as any).toolCalls;

            if (prevToolCallsField) {
              // Parse tool_calls if it's a JSON string (from database)
              let prevToolCalls = prevToolCallsField;
              if (typeof prevToolCallsField === 'string') {
                try {
                  prevToolCalls = JSON.parse(prevToolCallsField);
                } catch {
                  prevToolCalls = [];
                }
              }

              if (Array.isArray(prevToolCalls)) {
                const toolCall = prevToolCalls.find((tc: any) => tc.id === toolCallId);
                if (toolCall) {
                  toolName = toolCall.function?.name || 'unknown';
                  toolArgs = formatToolArgs(toolCall.function?.arguments || '{}');
                  break;
                }
              }
            }
          }
        }
      }
    }

    return `Tool result: ${toolName}${toolArgs}`;
  }

  // Tier 3: Return original text
  return text;
};

/**
 * Check if message is a tool call message (has tool_calls or is tool type)
 * @param message - Message to check
 * @returns True if message contains tool calls
 */
export const isToolCallMessage = (message: Message): boolean => {
  const hasToolCalls = !!(message as any).tool_calls || !!(message as any).toolCalls;
  const isToolType = message.type === 'tool' || message.role === 'tool';
  return hasToolCalls || isToolType;
};
