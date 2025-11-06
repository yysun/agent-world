/**
 * Tool Call Handler Utility for TUI
 * 
 * Purpose: Parse and detect tool calls in message events (OpenAI protocol)
 * 
 * Features:
 * - Detect client.requestApproval tool calls
 * - Extract approval request data (tool name, args, message, options)
 * - Capture agentId for @mention support in approval responses
 * - Return structured approval request data for UI display
 * 
 * Implementation:
 * - Matches CLI's handleToolCallEvents function in stream.ts
 * - Follows OpenAI tool_calls protocol structure
 * - Handles JSON parsing errors gracefully
 * - Includes agentId in approval request for @mention responses
 * 
 * Created: 2025-11-05 - Tool approval system for TUI
 * Updated: 2025-11-05 - Added agentId parameter and tracking for @mention support
 */

import type { ApprovalRequest } from '../types/index.js';

/**
 * Handle tool call events in message data
 * Returns approval request if client.requestApproval is detected
 * 
 * @param messageData - Message event data that may contain tool_calls
 * @returns ApprovalRequest if approval detected, null otherwise
 */
export function handleToolCallEvents(messageData: any, agentId?: string): ApprovalRequest | null {
  if (!messageData) {
    return null;
  }

  // Extract tool_calls from message (OpenAI protocol format)
  const toolCalls = messageData.tool_calls;

  if (!toolCalls || !Array.isArray(toolCalls) || toolCalls.length === 0) {
    return null;
  }

  // Look for client.requestApproval calls
  for (const toolCall of toolCalls) {
    if (toolCall.function?.name === 'client.requestApproval') {
      try {
        const toolCallId = toolCall.id || `approval-${Date.now()}`;
        const requestId = toolCallId;
        const argsStr = toolCall.function?.arguments || '{}';
        const args = JSON.parse(argsStr);

        return {
          toolName: args?.originalToolCall?.name ?? 'Unknown tool',
          toolArgs: args?.originalToolCall?.args ?? {},
          message: args.message || 'This tool requires approval to execute.',
          options: Array.isArray(args?.options) && args.options.length > 0 ? args.options : ['Cancel', 'Once', 'Always'],
          requestId,
          toolCallId,
          agentId
        };
      } catch (err) {
        console.error('Failed to parse approval request:', err);
        return null;
      }
    }
  }

  return null;
}
