/**
 * Message Detection Helpers
 * 
 * Purpose: Detect special message types (tool calls, approvals, etc.)
 * Source: Adapted from web/src/pages/World.update.ts detection functions
 * 
 * Features:
 * - Detect tool call approval requests in messages
 * - Detect tool call approval responses
 * - Parse tool_calls and tool_call_id from messages
 * - Handle both camelCase and snake_case field names
 * 
 * Implementation:
 * - Pure functions that analyze message data
 * - Support for JSON string parsing
 * - Backward compatible with multiple formats
 * 
 * Changes:
 * - 2025-11-12: Created from web frontend detection logic
 */

import type { Message } from '@/types';

/**
 * Detect if message contains tool call approval request
 * @param messageData - Message data (can be partial/any type)
 * @returns Tool call data if this is an approval request, null otherwise
 */
export const detectToolCallRequest = (messageData: any): Message['toolCallData'] | null => {
  // Handle both tool_calls (snake_case from DB) and toolCalls (camelCase from API)
  const toolCallsField = messageData?.tool_calls || messageData?.toolCalls;

  // If tool_calls/toolCalls is a string, parse it first
  let toolCalls = toolCallsField;
  if (typeof toolCallsField === 'string') {
    try {
      toolCalls = JSON.parse(toolCallsField);
    } catch (error) {
      console.warn('Failed to parse tool_calls JSON string:', error);
      return null;
    }
  }

  if (!toolCalls || !Array.isArray(toolCalls)) {
    return null;
  }

  // Find client.requestApproval tool call
  for (const toolCall of toolCalls) {
    const toolName = toolCall?.function?.name;
    if (toolName === 'client.requestApproval') {
      let parsedArgs: any = {};
      try {
        parsedArgs = toolCall.function?.arguments
          ? JSON.parse(toolCall.function.arguments)
          : {};
      } catch (error) {
        console.warn('Failed to parse approval request arguments:', error);
      }

      return {
        toolCallId: toolCall.id || `approval-${Date.now()}`,
        originalToolCall: parsedArgs?.originalToolCall, // Store complete original tool call (including id)
        toolName: parsedArgs?.originalToolCall?.name ?? 'Unknown tool',
        toolArgs: parsedArgs?.originalToolCall?.args ?? {},
        approvalMessage: parsedArgs?.message ?? 'This tool requires your approval to continue.',
        approvalOptions: Array.isArray(parsedArgs?.options) && parsedArgs.options.length > 0
          ? parsedArgs.options
          : ['deny', 'approve_once', 'approve_session'],
        agentId: messageData?.sender || messageData?.agentId // Capture agent that made the request
      } as Message['toolCallData'];
    }
  }

  return null;
};

/**
 * Detect if message is a tool call approval response
 * @param messageData - Message data (can be partial/any type)
 * @returns Tool call data if this is an approval response, null otherwise
 */
export const detectToolCallResponse = (messageData: any): Message['toolCallData'] | null => {
  // Check if this is a tool result message (has tool_call_id)
  if (messageData?.role === 'tool' || messageData?.type === 'tool') {
    const toolCallId = messageData.tool_call_id || 'unknown';

    // Try to parse the content as JSON to check for approval response
    let parsedContent: any = null;
    try {
      parsedContent = typeof messageData.content === 'string'
        ? JSON.parse(messageData.content)
        : messageData.content;
    } catch (error) {
      // Not JSON - not an approval response
      return null;
    }

    // Check if this is an approval response (has __type: 'tool_result' and decision field)
    if (parsedContent?.__type === 'tool_result' && parsedContent?.decision) {
      const decision = parsedContent.decision;
      const scope = parsedContent.scope || 'none';
      const toolName = parsedContent.toolName || parsedContent.tool_name || 'Unknown tool';

      return {
        toolCallId,
        toolName,
        toolArgs: {},
        approvalDecision: decision,
        approvalScope: scope
      } as Message['toolCallData'];
    }
  }

  return null;
};

/**
 * Enrich message with tool call detection
 * Adds isToolCallRequest, isToolCallResponse, and toolCallData fields
 * @param message - Message to enrich
 * @returns Enriched message with tool call fields populated
 */
export const enrichMessageWithToolCallDetection = (message: Message): Message => {
  const toolCallRequest = detectToolCallRequest(message);
  const toolCallResponse = detectToolCallResponse(message);

  // Set placeholder text for messages with empty content
  let messageText = message.text || message.content || '';
  if (!messageText && (toolCallRequest || toolCallResponse)) {
    if (toolCallRequest) {
      messageText = `[Tool approval request: ${toolCallRequest.toolName}]`;
    } else if (toolCallResponse) {
      messageText = `[Tool execution result]`;
    }
  }

  return {
    ...message,
    text: messageText,
    isToolCallRequest: !!toolCallRequest,
    isToolCallResponse: !!toolCallResponse,
    toolCallData: toolCallRequest || toolCallResponse || undefined
  };
};
