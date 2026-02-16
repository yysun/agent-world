/**
 * Tool Utilities Module - Helper functions for tool/function call handling
 *
 * Features:
 * - Validates tool/function call names before execution
 * - Filters out calls with empty or missing names
 * - Creates error tool results for malformed calls
 * - Emits SSE events for tool errors
 * - Universal parameter validation for all tool types
 *
 * Implementation Details:
 * - Uses minimal fallback ID generator to avoid external dependencies
 * - Creates role='tool' messages for conversation history
 * - Publishes tool-error SSE events to surface problems
 * - Best-effort error reporting to avoid cascading failures
 * - Consistent parameter validation for both MCP and built-in tools
 *
 * Recent Changes:
 * - 2026-02-06: Removed legacy manual tool-intervention functionality
 * - Simplified wrapToolWithValidation to focus on parameter validation only
 * - Initial implementation for empty/missing name validation
 */

import { World, Agent, ChatMessage, WorldSSEEvent } from './types.js';
import { publishToolEvent } from './events/index.js';

function normalizeKnownParameterAliases(toolName: string, args: any): {
  normalizedArgs: any;
  corrections: string[];
} {
  if (!args || typeof args !== 'object') {
    return { normalizedArgs: args, corrections: [] };
  }

  const normalizedArgs = { ...args };
  const corrections: string[] = [];

  if (toolName === 'list_files' && normalizedArgs.path === undefined && normalizedArgs.directory !== undefined) {
    normalizedArgs.path = normalizedArgs.directory;
    delete normalizedArgs.directory;
    corrections.push("directory -> path");
  }

  if (
    (toolName === 'grep' || toolName === 'grep_search')
    && normalizedArgs.directoryPath === undefined
    && normalizedArgs.directory !== undefined
  ) {
    normalizedArgs.directoryPath = normalizedArgs.directory;
    delete normalizedArgs.directory;
    corrections.push("directory -> directoryPath");
  }

  return { normalizedArgs, corrections };
}

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

  const aliasNormalization = normalizeKnownParameterAliases(toolName, args);
  const normalizedArgs = aliasNormalization.normalizedArgs;

  const corrected: any = {};
  const corrections: string[] = [];
  corrections.push(...aliasNormalization.corrections);
  const requiredParams = toolSchema.required || [];
  const errors: string[] = [];

  // Check required parameters
  for (const requiredParam of requiredParams) {
    if (
      normalizedArgs[requiredParam] === undefined
      || normalizedArgs[requiredParam] === null
      || normalizedArgs[requiredParam] === ''
    ) {
      errors.push(`Required parameter '${requiredParam}' is missing or empty`);
    }
  }

  // Validate and correct parameter types
  for (const [key, value] of Object.entries(normalizedArgs)) {
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
 * Wrap tool execution with universal parameter validation
 * Provides a standardized validation layer for all tools
 * 
 * @param tool - Tool object with execute function and parameters schema
 * @param toolName - Name of the tool (for logging and error reporting)
 * @returns Wrapped tool with validation
 */
export function wrapToolWithValidation(tool: any, toolName: string): any {
  if (!tool || !tool.execute) {
    return tool;
  }

  const originalExecute = tool.execute;

  return {
    ...tool,
    execute: async (args: any, sequenceId?: string, parentToolCall?: string, context?: any) => {
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
