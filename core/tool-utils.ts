/**
 * Tool Utilities Module - Helper functions for tool/function call handling
 *
 * Features:
 * - Validates tool/function call names before execution
 * - Filters out calls with empty or missing names
 * - Creates error tool results for malformed calls
 * - Emits SSE events for tool errors
 * - Universal parameter validation for all tool types
 * - Explicit approval checking using structured tool metadata
 * - Direct injection of client.requestApproval messages for natural approval flow
 *
 * Implementation Details:
 * - Uses minimal fallback ID generator to avoid external dependencies
 * - Creates role='tool' messages for conversation history
 * - Publishes tool-error SSE events to surface problems
 * - Best-effort error reporting to avoid cascading failures
 * - Consistent parameter validation for both MCP and built-in tools
 * - Approval checking using explicit tool.approval metadata instead of heuristics
 * - Dynamic imports to avoid circular dependencies with approval cache
 *
 * Recent Changes:
 * - 2025-11-08: Removed event emission from wrapToolWithValidation
 * - Tool wrapper only creates approval request structure, no event emission
 * - Upper layer (LLM providers → events.ts) handles storage and event emission
 * - 2025-11-05: wrapToolWithValidation creates client.requestApproval messages for approval
 * - Returns structured object with type='approval_request' and _stopProcessing marker
 * - Returns simple string error message when tool execution is denied
 * - Natural message flow without exceptions - CLI detects client.requestApproval tool call
 * - LLM providers check for _stopProcessing marker and return _approvalMessage
 * - Replaced heuristic-based approval detection with explicit tool.approval metadata
 * - Enhanced wrapToolWithValidation to handle approval flow before parameter validation
 * - Added universal parameter validation for consistent tool execution
 * - Initial implementation for empty/missing name validation
 */

import { World, Agent, ChatMessage, WorldSSEEvent } from './types.js';
import { publishToolEvent } from './events.js';

/**
 * Minimal fallback ID generator
 * Generates a simple unique identifier without external dependencies
 * Exported for use in non-streaming handlers
 */
export function generateFallbackId(): string {
  return 'tc-' + Math.random().toString(36).substring(2, 11) + '-' + Date.now().toString(36);
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
 * @param messageId - Message ID for tracking
 * @returns Object with validCalls array and toolResults array for invalid calls
 */
export function filterAndHandleEmptyNamedFunctionCalls(
  functionCalls: FunctionCall[],
  world: World,
  agent: Agent,
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

      // Emit tool-error event on world channel (best-effort)
      try {
        publishToolEvent(world, {
          agentName: agent.id || agent.name || 'unknown',
          type: 'tool-error',
          messageId,
          toolExecution: {
            toolName,
            toolCallId,
            error: 'empty tool name from LLM',
          },
        });
      } catch (error) {
        // Best-effort: don't throw if event publishing fails
        console.error('Failed to publish tool-error event:', error);
      }
    } else {
      // Valid call with non-empty name
      validCalls.push(call);
    }
  }

  return { validCalls, toolResults };
}

/**
 * Validate tool parameters against schema before execution
 * Provides consistent validation for both MCP and built-in tools
 * 
 * @param args - Tool arguments to validate
 * @param toolSchema - Tool parameter schema with type and required information
 * @param toolName - Name of the tool (for logging)
 * @returns Validation result with corrected args or error details
 */
export function validateToolParameters(args: any, toolSchema: any, toolName: string): {
  valid: boolean;
  correctedArgs?: any;
  error?: string;
} {
  if (!toolSchema || !toolSchema.properties) {
    console.debug(`No schema validation for tool: ${toolName}`);
    return { valid: true, correctedArgs: args };
  }

  if (!args || typeof args !== 'object') {
    return {
      valid: false,
      error: `Tool arguments must be an object, got: ${typeof args}`
    };
  }

  const corrected: any = {};
  const corrections: string[] = [];
  const requiredParams = toolSchema.required || [];
  const errors: string[] = [];

  // Check required parameters
  for (const requiredParam of requiredParams) {
    if (args[requiredParam] === undefined || args[requiredParam] === null || args[requiredParam] === '') {
      errors.push(`Required parameter '${requiredParam}' is missing or empty`);
    }
  }

  // Validate and correct parameter types
  for (const [key, value] of Object.entries(args)) {
    const propSchema = toolSchema.properties[key];
    if (!propSchema) {
      // Property not in schema - pass through as-is
      corrected[key] = value;
      continue;
    }

    // Skip null/undefined values for optional parameters
    if ((value === null || value === undefined) && !requiredParams.includes(key)) {
      corrections.push(`${key}: null/undefined omitted (optional parameter)`);
      continue;
    }

    // Type correction: string to array
    if (propSchema.type === 'array' && typeof value === 'string' && value !== '') {
      corrected[key] = [value];
      corrections.push(`${key}: string -> array`);
      continue;
    }

    // Type validation: array
    if (propSchema.type === 'array' && !Array.isArray(value)) {
      if (requiredParams.includes(key)) {
        errors.push(`Parameter '${key}' must be an array, got: ${typeof value}`);
        continue;
      }
    }

    // Type correction: string to number
    if (propSchema.type === 'number' && typeof value === 'string') {
      const numValue = parseFloat(value);
      if (!isNaN(numValue)) {
        corrected[key] = numValue;
        corrections.push(`${key}: "${value}" -> ${numValue}`);
        continue;
      }
    }

    // Type validation: string
    if (propSchema.type === 'string' && typeof value !== 'string') {
      if (requiredParams.includes(key)) {
        errors.push(`Parameter '${key}' must be a string, got: ${typeof value}`);
        continue;
      }
    }

    // Pass through valid values
    corrected[key] = value;
  }

  if (corrections.length > 0) {
    console.debug(`Tool parameter corrections for ${toolName}:`, corrections);
  }

  if (errors.length > 0) {
    console.debug(`Tool parameter validation errors for ${toolName}:`, errors);
    return {
      valid: false,
      error: errors.join('; ')
    };
  }

  return {
    valid: true,
    correctedArgs: corrected
  };
}

/**
 * Wrap tool execution with universal parameter validation and approval checking
 * Provides a standardized validation and approval layer for all tools
 * 
 * @param tool - Tool object with execute function, parameters schema, and optional approval metadata
 * @param toolName - Name of the tool (for logging and error reporting)
 * @returns Wrapped tool with validation and approval checking
 */
export function wrapToolWithValidation(tool: any, toolName: string): any {
  if (!tool || !tool.execute) {
    return tool;
  }

  const originalExecute = tool.execute;

  return {
    ...tool,
    execute: async (args: any, sequenceId?: string, parentToolCall?: string, context?: any) => {
      // Check if tool requires approval BEFORE parameter validation
      if (tool.approval?.required && context?.world && context?.messages) {
        const { checkToolApproval } = await import('./events.js');
        const approvalMessage = tool.approval.message || `The tool "${toolName}" requires approval to execute.`;

        const approvalCheck = await checkToolApproval(
          context.world,
          toolName,
          args,
          approvalMessage,
          context.messages,
          { workingDirectory: context?.workingDirectory || process.cwd() }
        );

        if (approvalCheck?.needsApproval) {
          // Create a client.requestApproval tool call for the approval request
          // Upper layer (events.ts via LLM provider) will handle storage and event emission
          const approvalToolCallId = `approval_${Date.now()}_${Math.random().toString(36).substring(7)}`;
          const approvalResult = {
            role: 'assistant' as const,
            content: '',
            tool_calls: [{
              id: approvalToolCallId,
              type: 'function' as const,
              function: {
                name: 'client.requestApproval',
                arguments: JSON.stringify({
                  originalToolCall: {
                    id: context?.toolCallId,
                    name: toolName,
                    args: args,
                    workingDirectory: context?.workingDirectory || process.cwd()
                  },
                  message: approvalMessage,
                  options: approvalCheck.approvalRequest?.options || ['deny', 'approve_once', 'approve_session']
                })
              }
            }],
            // Initialize toolCallStatus as incomplete
            toolCallStatus: {
              [approvalToolCallId]: {
                complete: false,
                result: null
              }
            }
          };

          // Return the approval request in a structured format
          // No event emission here - that's the upper layer's responsibility
          return {
            type: 'approval_request',
            approvalRequest: approvalCheck.approvalRequest,
            _stopProcessing: true,
            _approvalMessage: approvalResult
          };
        }

        if (!approvalCheck?.canExecute) {
          // Tool execution was denied
          return `Error: Tool execution denied - approval not granted`;
        }
      }

      // Apply validation if tool has parameters schema
      if (tool.parameters) {
        const validation = validateToolParameters(args, tool.parameters, toolName);
        if (!validation.valid) {
          // Return a standardized error result
          return `Error: Tool parameter validation failed for ${toolName}: ${validation.error}`;
        }
        // Use corrected args
        return originalExecute(validation.correctedArgs, sequenceId, parentToolCall, context);
      }

      // No schema available, proceed with original args
      return originalExecute(args, sequenceId, parentToolCall, context);
    }
  };
}
