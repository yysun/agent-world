/**
 * Tool Utilities Module - Helper functions for tool/function call handling
 *
 * Features:
 * - Validates tool/function call names before execution
 * - Filters out calls with empty or missing names
 * - Creates error tool results for malformed calls
 * - Emits SSE events for tool errors
 *
 * Implementation Details:
 * - Uses minimal fallback ID generator to avoid external dependencies
 * - Creates role='tool' messages for conversation history
 * - Publishes tool-error SSE events to surface problems
 * - Best-effort error reporting to avoid cascading failures
 *
 * Recent Changes:
 * - Initial implementation for empty/missing name validation
 */

import { World, Agent, ChatMessage, WorldSSEEvent } from './types.js';

/**
 * Minimal fallback ID generator
 * Generates a simple unique identifier without external dependencies
 */
function generateFallbackId(): string {
  return 'tc-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now().toString(36);
}

/**
 * Function call interface for validation
 */
interface FunctionCall {
  id?: string;
  type?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
}

/**
 * Filter and handle function calls with empty or missing names
 * 
 * @param functionCalls - Array of function calls to validate
 * @param world - World context for event publishing
 * @param agent - Agent making the calls
 * @param publishSSE - SSE event publisher function
 * @param messageId - Message ID for tracking
 * @returns Object with validCalls array and toolResults array for invalid calls
 */
export function filterAndHandleEmptyNamedFunctionCalls(
  functionCalls: FunctionCall[],
  world: World,
  agent: Agent,
  publishSSE: (world: World, data: Partial<WorldSSEEvent>) => void,
  messageId: string
): { validCalls: FunctionCall[]; toolResults: ChatMessage[] } {
  const validCalls: FunctionCall[] = [];
  const toolResults: ChatMessage[] = [];

  for (const call of functionCalls) {
    const toolName = call.function?.name || '';
    const toolCallId = call.id || generateFallbackId();

    // Check if name is missing or empty
    if (!toolName || toolName.trim() === '') {
      // Create tool result message for conversation history
      toolResults.push({
        role: 'tool',
        content: `Error: Malformed tool call - empty or missing tool name. Tool call ID: ${toolCallId}`,
        tool_call_id: toolCallId,
      });

      // Emit tool-error SSE event (best-effort)
      try {
        publishSSE(world, {
          agentName: agent.id || agent.name || 'unknown',
          type: 'tool-error',
          messageId,
          toolExecution: {
            toolName: '',
            toolCallId,
            phase: 'failed',
            error: 'empty tool name from LLM',
          },
        });
      } catch (error) {
        // Best-effort: don't throw if SSE publishing fails
        console.error('Failed to publish tool-error SSE event:', error);
      }
    } else {
      // Valid call with non-empty name
      validCalls.push(call);
    }
  }

  return { validCalls, toolResults };
}
