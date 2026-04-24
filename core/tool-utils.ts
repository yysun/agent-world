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
 * - 2026-04-12: Added optional recoverable-validation suppression so LLM turn retries can correct invalid tool args once without surfacing an immediate UI system error.
 * - 2026-03-11: Strip workingDirectory/working_directory from shell_cmd args in normalizeKnownParameterAliases; these are context fields the LLM echoes from the system prompt, not tool parameters.
 * - 2026-03-11: Emit system error event in wrapToolWithValidation when tool parameter validation fails so errors surface in the UI.
 * - 2026-03-01: Added backward-compatible normalization for `.includePattern` -> `includePattern` in `list_files` and `grep`.
 * - 2026-02-20: Enforced JSON-schema `additionalProperties: false` by rejecting unknown tool arguments during validation.
 * - 2026-02-27: Added backward-compat cleanup for removed HITL confirmation args by stripping them before schema validation.
 * - 2026-02-27: Removed deprecated `human_intervention_request` confirmation argument alias normalization; kept `prompt` -> `question` and `default_option` -> `defaultOption`.
 * - 2026-02-20: Added `create_agent` alias normalization for `auto-reply`/`auto_reply` -> `autoReply` and `next agent` variants -> `nextAgent`.
 * - 2026-02-19: Added parameter alias normalization for `read_file`/`read_files` (`path` -> `filePath`) and `grep` path aliases (`path` -> `directoryPath`) to align with shell-style path handling.
 * - 2026-02-06: Removed legacy manual tool-intervention functionality
 * - Simplified wrapToolWithValidation to focus on parameter validation only
 * - Initial implementation for empty/missing name validation
 */

import { World, Agent, ChatMessage, WorldSSEEvent } from './types.js';
import { publishToolEvent } from './events/index.js';
import { publishEvent } from './events/publishers.js';
import { isHitlToolName } from './hitl-tool-names.js';

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

  if (toolName === 'list_files' && normalizedArgs.includePattern === undefined && normalizedArgs['.includePattern'] !== undefined) {
    normalizedArgs.includePattern = normalizedArgs['.includePattern'];
    delete normalizedArgs['.includePattern'];
    corrections.push('.includePattern -> includePattern');
  }

  if (
    (toolName === 'read_file' || toolName === 'read_files')
    && normalizedArgs.filePath === undefined
    && normalizedArgs.path !== undefined
  ) {
    normalizedArgs.filePath = normalizedArgs.path;
    delete normalizedArgs.path;
    corrections.push("path -> filePath");
  }

  if (
    toolName === 'grep'
    && normalizedArgs.directoryPath === undefined
    && normalizedArgs.directory !== undefined
  ) {
    normalizedArgs.directoryPath = normalizedArgs.directory;
    delete normalizedArgs.directory;
    corrections.push("directory -> directoryPath");
  }

  if (
    toolName === 'grep'
    && normalizedArgs.directoryPath === undefined
    && normalizedArgs.path !== undefined
  ) {
    normalizedArgs.directoryPath = normalizedArgs.path;
    delete normalizedArgs.path;
    corrections.push("path -> directoryPath");
  }

  if (
    toolName === 'grep'
    && normalizedArgs.includePattern === undefined
    && normalizedArgs['.includePattern'] !== undefined
  ) {
    normalizedArgs.includePattern = normalizedArgs['.includePattern'];
    delete normalizedArgs['.includePattern'];
    corrections.push('.includePattern -> includePattern');
  }

  if (toolName === 'create_agent') {
    if (normalizedArgs.autoReply === undefined && normalizedArgs['auto-reply'] !== undefined) {
      normalizedArgs.autoReply = normalizedArgs['auto-reply'];
      corrections.push("auto-reply -> autoReply");
    }
    if (normalizedArgs.autoReply === undefined && normalizedArgs.auto_reply !== undefined) {
      normalizedArgs.autoReply = normalizedArgs.auto_reply;
      corrections.push("auto_reply -> autoReply");
    }
    if (normalizedArgs.nextAgent === undefined && normalizedArgs['next agent'] !== undefined) {
      normalizedArgs.nextAgent = normalizedArgs['next agent'];
      corrections.push("next agent -> nextAgent");
    }
    if (normalizedArgs.nextAgent === undefined && normalizedArgs['next-agent'] !== undefined) {
      normalizedArgs.nextAgent = normalizedArgs['next-agent'];
      corrections.push("next-agent -> nextAgent");
    }
    if (normalizedArgs.nextAgent === undefined && normalizedArgs.next_agent !== undefined) {
      normalizedArgs.nextAgent = normalizedArgs.next_agent;
      corrections.push("next_agent -> nextAgent");
    }

    delete normalizedArgs['auto-reply'];
    delete normalizedArgs.auto_reply;
    delete normalizedArgs['next agent'];
    delete normalizedArgs['next-agent'];
    delete normalizedArgs.next_agent;
  }

  if (isHitlToolName(toolName)) {
    if (normalizedArgs.question === undefined && normalizedArgs.prompt !== undefined) {
      normalizedArgs.question = normalizedArgs.prompt;
      corrections.push("prompt -> question");
    }
    if (normalizedArgs.defaultOption === undefined && normalizedArgs.default_option !== undefined) {
      normalizedArgs.defaultOption = normalizedArgs.default_option;
      corrections.push("default_option -> defaultOption");
    }

    if (normalizedArgs.requireConfirmation !== undefined) {
      corrections.push("requireConfirmation removed (deprecated)");
    }
    if (normalizedArgs.require_confirmation !== undefined) {
      corrections.push("require_confirmation removed (deprecated)");
    }
    if (normalizedArgs['require-confirmation'] !== undefined) {
      corrections.push("require-confirmation removed (deprecated)");
    }
    if (normalizedArgs.confirmationMessage !== undefined) {
      corrections.push("confirmationMessage removed (deprecated)");
    }
    if (normalizedArgs.confirmation_message !== undefined) {
      corrections.push("confirmation_message removed (deprecated)");
    }

    if (
      normalizedArgs.questions === undefined
      && typeof normalizedArgs.question === 'string'
      && Array.isArray(normalizedArgs.options)
    ) {
      const normalizedOptions = normalizedArgs.options
        .map((option: unknown, index: number) => {
          if (option && typeof option === 'object' && !Array.isArray(option)) {
            const optionRecord = option as Record<string, unknown>;
            const label = typeof optionRecord.label === 'string' ? optionRecord.label.trim() : '';
            if (!label) {
              return null;
            }
            const id = typeof optionRecord.id === 'string' && optionRecord.id.trim()
              ? optionRecord.id.trim()
              : `opt_${index + 1}`;
            return {
              id,
              label,
              ...(typeof optionRecord.description === 'string' && optionRecord.description.trim()
                ? { description: optionRecord.description.trim() }
                : {}),
            };
          }

          const label = String(option || '').trim();
          if (!label) {
            return null;
          }
          return {
            id: `opt_${index + 1}`,
            label,
          };
        })
        .filter(Boolean);

      normalizedArgs.questions = [{
        id: 'question-1',
        header: typeof normalizedArgs.title === 'string' && normalizedArgs.title.trim()
          ? normalizedArgs.title.trim()
          : 'Human input required',
        question: normalizedArgs.question,
        options: normalizedOptions,
      }];
      corrections.push('question/options -> questions[0]');
    }

    delete normalizedArgs.prompt;
    delete normalizedArgs.question;
    delete normalizedArgs.options;
    delete normalizedArgs.defaultOption;
    delete normalizedArgs.default_option;
    delete normalizedArgs.requireConfirmation;
    delete normalizedArgs.require_confirmation;
    delete normalizedArgs['require-confirmation'];
    delete normalizedArgs.confirmationMessage;
    delete normalizedArgs.confirmation_message;
  }

  if (toolName === 'web_fetch') {
    if (normalizedArgs.url === undefined && normalizedArgs.uri !== undefined) {
      normalizedArgs.url = normalizedArgs.uri;
      delete normalizedArgs.uri;
      corrections.push("uri -> url");
    }

    if (normalizedArgs.url === undefined && normalizedArgs.href !== undefined) {
      normalizedArgs.url = normalizedArgs.href;
      delete normalizedArgs.href;
      corrections.push("href -> url");
    }
  }

  if (toolName === 'shell_cmd') {
    // Strip context-level working directory fields if the LLM echoes them as tool args.
    // The trusted working directory is always read from context.world.variables or
    // context.workingDirectory by resolveTrustedShellWorkingDirectory — never from LLM args.
    if (normalizedArgs.workingDirectory !== undefined) {
      corrections.push('workingDirectory stripped (system context field, not a tool parameter)');
      delete normalizedArgs.workingDirectory;
    }
    if (normalizedArgs.working_directory !== undefined) {
      corrections.push('working_directory stripped (system context field, not a tool parameter)');
      delete normalizedArgs.working_directory;
    }
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
 * @param chatId - Explicit chat scope for tool-error event publication
 * @returns Object with validCalls array and toolResults array for invalid calls
 */
export function filterAndHandleEmptyNamedFunctionCalls(
  functionCalls: FunctionCall[],
  world: World,
  agent: Agent,
  messageId: string,
  chatId?: string,
) {
  const validCalls: FunctionCall[] = [];
  const toolResults: ChatMessage[] = [];

  for (const call of functionCalls) {
    const toolName = call.function?.name || '';
    const toolCallId = call.id || generateFallbackId();

    if (!toolName || toolName.trim() === '') {
      toolResults.push({
        role: 'tool',
        content: `Error: Malformed tool call - empty or missing tool name. Tool call ID: ${toolCallId}`,
        tool_call_id: toolCallId,
      });

      try {
        if (typeof chatId === 'string' && chatId.trim()) {
          publishToolEvent(world, {
            agentName: agent.id || agent.name || 'unknown',
            type: 'tool-error',
            messageId,
            chatId,
            toolExecution: {
              toolName,
              toolCallId,
              error: 'empty tool name from LLM',
            },
          });
        }
      } catch (error) {
        console.error('Failed to publish tool-error event:', error);
      }
      continue;
    }

    validCalls.push(call);
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
  const allowsAdditionalProperties = toolSchema.additionalProperties !== false;

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
      if (!allowsAdditionalProperties) {
        errors.push(`Unknown parameter '${key}' is not allowed`);
        continue;
      }
      // Property not in schema - pass through as-is when allowed by schema.
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
          // Emit a system error event only when the caller has not marked this
          // validation failure as recoverable within the current LLM retry loop.
          const validationWorld = context?.world;
          const validationChatId = typeof context?.chatId === 'string' ? context.chatId.trim() : '';
          const suppressValidationErrorEvent = context?.suppressValidationErrorEvent === true;
          if (!suppressValidationErrorEvent && validationWorld && validationChatId) {
            try {
              publishEvent(validationWorld, 'system', {
                type: 'error',
                eventType: 'error',
                message: `Tool parameter validation errors for ${toolName}: ${validation.error}`,
              }, validationChatId);
            } catch {
              // best-effort: don't let event emission fail the tool call
            }
          }
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
