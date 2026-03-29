/**
 * Tool Action Runtime
 *
 * Purpose:
 * - Centralize shared tool-action parsing, execution, persistence, and event publication.
 *
 * Key Features:
 * - Shared tool-argument parsing with optional JSON sanitization for malformed LLM payloads.
 * - Common persisted tool result and tool error message handling across direct, continuation, and restore flows.
 * - Shared tool-start/tool-result/tool-error event publication with preview/result metadata.
 * - Shared shell/load-skill error envelope formatting and synthetic assistant tool-result display rows.
 *
 * Implementation Notes:
 * - This module owns one persisted tool-action execution step, while callers keep flow-specific policy.
 * - Direct/continuation/restore callers still decide follow-up continuation, handoff terminality, and duplicate-suppression policy.
 *
 * Recent Changes:
 * - 2026-03-29: Initial shared runtime module extracted from orchestrator and memory-manager tool execution paths.
 */

import type { Agent, AgentMessage, World } from '../types.js';
import { generateId } from '../utils.js';
import { getMCPToolsForWorld } from '../mcp-server-registry.js';
import { formatShellToolErrorEnvelopeContent } from '../shell-cmd-tool.js';
import {
  createTextToolPreview,
  getToolEventPreviewPayload,
  parseToolExecutionEnvelopeContent,
  serializeToolExecutionEnvelope,
} from '../tool-execution-envelope.js';
import { createSyntheticAssistantToolResultMessage } from '../synthetic-assistant-tool-result.js';
import { createCategoryLogger } from '../logger.js';
import { publishToolEvent } from './publishers.js';
import { clearWaitingForToolResultMetadata } from '../agent-turn.js';

const loggerToolRuntime = createCategoryLogger('agent.tool.runtime');

type ExecutableToolCall = {
  id: string;
  function: {
    name: string;
    arguments: unknown;
  };
};

export type ExecuteToolActionStepResult =
  | {
    status: 'success';
    toolArgs: Record<string, any>;
    toolResult: unknown;
    serializedToolResult: string;
    toolResultMessage: AgentMessage;
  }
  | {
    status: 'missing_tool';
    toolArgs: Record<string, any>;
    serializedToolResult: string;
    toolResultMessage: AgentMessage;
  }
  | {
    status: 'error';
    toolArgs: Record<string, any>;
    error: unknown;
    serializedToolResult: string;
    toolResultMessage: AgentMessage;
  }
  | {
    status: 'skipped_success_persistence';
    toolArgs: Record<string, any>;
    toolResult: unknown;
    serializedToolResult: string;
  };

function sanitizeAndParseJSON(jsonString: string): Record<string, any> {
  if (!jsonString || jsonString.trim() === '') {
    return {};
  }

  try {
    return JSON.parse(jsonString);
  } catch (firstError) {
    loggerToolRuntime.debug('Initial tool-call argument parse failed, attempting sanitization', {
      error: firstError instanceof Error ? firstError.message : String(firstError),
    });
  }

  let sanitized = jsonString;
  sanitized = sanitized.replace(/,(\s*[}\]])/g, '$1');

  const unterminatedMatch = sanitized.match(/"[^"]*$/);
  if (unterminatedMatch) {
    sanitized = sanitized + '"';

    const openBraces = (sanitized.match(/{/g) || []).length;
    const closeBraces = (sanitized.match(/}/g) || []).length;
    const openBrackets = (sanitized.match(/\[/g) || []).length;
    const closeBrackets = (sanitized.match(/\]/g) || []).length;

    for (let index = 0; index < openBrackets - closeBrackets; index += 1) {
      sanitized += ']';
    }
    for (let index = 0; index < openBraces - closeBraces; index += 1) {
      sanitized += '}';
    }
  }

  try {
    return JSON.parse(sanitized);
  } catch {
    loggerToolRuntime.debug('Sanitized tool-call argument parse failed, attempting truncation');
  }

  let lastValidIndex = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < sanitized.length; index += 1) {
    const char = sanitized[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === '{' || char === '[') {
        depth += 1;
      } else if (char === '}' || char === ']') {
        depth -= 1;
        if (depth === 0) {
          lastValidIndex = index;
        }
      }
    }
  }

  if (lastValidIndex > 0) {
    const truncated = sanitized.substring(0, lastValidIndex + 1);
    return JSON.parse(truncated);
  }

  throw new Error(`Unable to parse or sanitize JSON. Original length: ${jsonString.length}, Sanitized length: ${sanitized.length}`);
}

export function parseToolCallArguments(
  rawArguments: unknown,
  options?: { sanitizeJsonString?: boolean }
): Record<string, any> {
  if (rawArguments == null) return {};

  if (typeof rawArguments === 'object' && !Array.isArray(rawArguments)) {
    return rawArguments as Record<string, any>;
  }

  if (typeof rawArguments !== 'string') {
    return {};
  }

  const trimmed = rawArguments.trim();
  if (!trimmed) return {};

  const parsed = options?.sanitizeJsonString
    ? sanitizeAndParseJSON(trimmed)
    : JSON.parse(trimmed);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return parsed as Record<string, any>;
  }

  return {};
}

export function getLoadSkillIdFromToolArgs(toolArgs: Record<string, any>): string | null {
  const skillId = typeof toolArgs?.skill_id === 'string' ? toolArgs.skill_id.trim() : '';
  return skillId || null;
}

export function getLoadSkillIdFromRawToolArguments(rawArguments: unknown): string | null {
  return getLoadSkillIdFromToolArgs(parseToolCallArguments(rawArguments));
}

export function isSuccessfulLoadSkillResult(toolResult: string): boolean {
  const envelope = parseToolExecutionEnvelopeContent(toolResult);
  const normalized = envelope
    ? String(envelope.result ?? '')
    : String(toolResult || '');
  return /<skill_context\b/i.test(normalized) && !/<error>/i.test(normalized);
}

export function resolveToolLlmResultMode(options: {
  toolName: string;
}): 'minimal' | 'verbose' {
  return options.toolName === 'shell_cmd' ? 'minimal' : 'verbose';
}

export function buildShellCommandSignature(toolArgs: Record<string, any>, trustedWorkingDirectory: string): string {
  const command = String(toolArgs?.command || '').trim();
  const parameters = Array.isArray(toolArgs?.parameters)
    ? toolArgs.parameters.map((parameter: unknown) => String(parameter))
    : [];
  const requestedDirectory = typeof toolArgs?.directory === 'string' && toolArgs.directory.trim()
    ? toolArgs.directory.trim()
    : trustedWorkingDirectory;

  return JSON.stringify({
    command,
    parameters,
    directory: requestedDirectory,
  });
}

export function sanitizeToolArgsForEventPayload(
  toolName: string,
  toolArgs: Record<string, any>
): Record<string, any> {
  if (toolName !== 'shell_cmd' || !toolArgs || typeof toolArgs !== 'object') {
    return toolArgs;
  }

  const sanitized = { ...toolArgs };
  delete sanitized.output_format;
  delete sanitized.output_detail;
  return sanitized;
}

export function formatToolErrorContent(options: {
  toolName: string;
  toolCallId: string;
  toolArgs?: Record<string, any>;
  error: unknown;
  failureReason?: 'validation_error' | 'execution_error';
}): string {
  if (options.toolName === 'shell_cmd') {
    return formatShellToolErrorEnvelopeContent({
      command: options.toolArgs?.command,
      parameters: options.toolArgs?.parameters,
      error: options.error,
      failureReason: options.failureReason,
      toolCallId: options.toolCallId,
    });
  }

  const message = `Error executing tool: ${options.error instanceof Error ? options.error.message : String(options.error)}`;
  if (options.toolName === 'load_skill') {
    return serializeToolExecutionEnvelope({
      __type: 'tool_execution_envelope',
      version: 1,
      tool: 'load_skill',
      tool_call_id: options.toolCallId,
      status: 'failed',
      preview: createTextToolPreview(message),
      result: message,
    });
  }

  return message;
}

export function appendSyntheticAssistantToolResult(options: {
  world: World;
  agent: Agent;
  serializedToolResult: string;
  sourceMessageId: string;
  replyToMessageId?: string;
  chatId: string;
}): void {
  const syntheticMessage = createSyntheticAssistantToolResultMessage({
    serializedToolResult: options.serializedToolResult,
    sourceMessageId: options.sourceMessageId,
    replyToMessageId: options.replyToMessageId,
    sender: options.agent.id,
    chatId: options.chatId,
    agentId: options.agent.id,
  });
  if (!syntheticMessage) {
    return;
  }

  options.agent.memory.push(syntheticMessage);
  options.world.eventEmitter.emit('message', {
    content: syntheticMessage.content,
    sender: syntheticMessage.sender || options.agent.id,
    timestamp: syntheticMessage.createdAt || new Date(),
    messageId: syntheticMessage.messageId!,
    chatId: syntheticMessage.chatId,
    replyToMessageId: syntheticMessage.replyToMessageId,
    role: 'assistant',
    syntheticDisplayOnly: true,
  });
}

function setCompletedToolCallStatus(
  assistantToolCallMessage: AgentMessage,
  toolCallId: string,
  result: unknown
): void {
  if (assistantToolCallMessage.toolCallStatus) {
    assistantToolCallMessage.toolCallStatus[toolCallId] = {
      complete: true,
      result,
    };
  }
  clearWaitingForToolResultMetadata(assistantToolCallMessage);
}

function appendToolMessage(options: {
  world: World;
  agent: Agent;
  assistantToolCallMessage: AgentMessage;
  toolCallId: string;
  content: string;
  chatId: string;
}): AgentMessage {
  const toolMessage: AgentMessage = {
    role: 'tool',
    content: options.content,
    tool_call_id: options.toolCallId,
    sender: options.agent.id,
    createdAt: new Date(),
    chatId: options.chatId,
    messageId: generateId(),
    replyToMessageId: options.assistantToolCallMessage.messageId,
    agentId: options.agent.id,
  };
  options.agent.memory.push(toolMessage);
  appendSyntheticAssistantToolResult({
    world: options.world,
    agent: options.agent,
    serializedToolResult: toolMessage.content,
    sourceMessageId: toolMessage.messageId!,
    replyToMessageId: toolMessage.replyToMessageId,
    chatId: options.chatId,
  });
  return toolMessage;
}

export async function executeToolActionStep(options: {
  world: World;
  agent: Agent;
  assistantToolCallMessage: AgentMessage;
  toolCall: ExecutableToolCall;
  chatId: string;
  toolArgs: Record<string, any>;
  trustedWorkingDirectory: string;
  abortSignal?: AbortSignal;
  toolEventInput?: Record<string, any>;
  toolStartMetadata?: Record<string, unknown>;
  toolResultMetadata?: Record<string, unknown>;
  llmResultMode: 'minimal' | 'verbose';
  persistToolEnvelope?: boolean;
  shouldPersistSuccessfulResult?: (params: {
    toolResult: unknown;
    serializedToolResult: string;
  }) => boolean;
  shouldPersistExecutionError?: (error: unknown) => boolean;
}): Promise<ExecuteToolActionStepResult> {
  const toolName = options.toolCall.function.name;
  const mcpTools = await getMCPToolsForWorld(options.world.id);
  const toolDef = mcpTools[toolName];

  if (!toolDef) {
    const serializedToolResult = formatToolErrorContent({
      toolName,
      toolCallId: options.toolCall.id,
      toolArgs: options.toolArgs,
      error: `Tool not found: ${toolName}`,
      failureReason: 'execution_error',
    });
    const toolResultMessage = appendToolMessage({
      world: options.world,
      agent: options.agent,
      assistantToolCallMessage: options.assistantToolCallMessage,
      toolCallId: options.toolCall.id,
      content: serializedToolResult,
      chatId: options.chatId,
    });
    setCompletedToolCallStatus(options.assistantToolCallMessage, options.toolCall.id, serializedToolResult);
    publishToolEvent(options.world, {
      agentName: options.agent.id,
      type: 'tool-error',
      messageId: options.toolCall.id,
      chatId: options.chatId,
      toolExecution: {
        toolName,
        toolCallId: options.toolCall.id,
        input: options.toolEventInput ?? options.toolArgs,
        error: `Tool not found: ${toolName}`,
      },
    });
    return {
      status: 'missing_tool',
      toolArgs: options.toolArgs,
      serializedToolResult,
      toolResultMessage,
    };
  }

  publishToolEvent(options.world, {
    agentName: options.agent.id,
    type: 'tool-start',
    messageId: options.toolCall.id,
    chatId: options.chatId,
    toolExecution: {
      toolName,
      toolCallId: options.toolCall.id,
      input: options.toolEventInput ?? options.toolArgs,
      ...(options.toolStartMetadata ? { metadata: options.toolStartMetadata } : {}),
    },
  });

  try {
    const toolContext = {
      world: options.world,
      messages: options.agent.memory,
      toolCallId: options.toolCall.id,
      chatId: options.chatId,
      abortSignal: options.abortSignal,
      workingDirectory: options.trustedWorkingDirectory,
      agentName: options.agent.id,
      llmResultMode: options.llmResultMode,
      persistToolEnvelope: options.persistToolEnvelope,
    };

    const toolResult = await toolDef.execute(options.toolArgs, undefined, undefined, toolContext);
    const serializedToolResult = typeof toolResult === 'string'
      ? toolResult
      : JSON.stringify(toolResult) ?? String(toolResult);

    if (options.shouldPersistSuccessfulResult && !options.shouldPersistSuccessfulResult({
      toolResult,
      serializedToolResult,
    })) {
      return {
        status: 'skipped_success_persistence',
        toolArgs: options.toolArgs,
        toolResult,
        serializedToolResult,
      };
    }

    const toolResultMessage = appendToolMessage({
      world: options.world,
      agent: options.agent,
      assistantToolCallMessage: options.assistantToolCallMessage,
      toolCallId: options.toolCall.id,
      content: serializedToolResult,
      chatId: options.chatId,
    });
    setCompletedToolCallStatus(options.assistantToolCallMessage, options.toolCall.id, serializedToolResult);

    const toolEnvelope = parseToolExecutionEnvelopeContent(serializedToolResult);
    const toolEventPreview = getToolEventPreviewPayload(serializedToolResult);
    const toolEventResult = toolEnvelope ? toolEnvelope.result : toolResult;
    publishToolEvent(options.world, {
      agentName: options.agent.id,
      type: 'tool-result',
      messageId: options.toolCall.id,
      chatId: options.chatId,
      toolExecution: {
        toolName,
        toolCallId: options.toolCall.id,
        input: options.toolEventInput ?? options.toolArgs,
        ...(toolEventPreview !== undefined ? { preview: toolEventPreview } : {}),
        result: toolEventResult,
        resultType: Array.isArray(toolEventResult)
          ? 'array'
          : toolEventResult === null
            ? 'null'
            : typeof toolEventResult === 'string'
              ? 'string'
              : 'object',
        resultSize: serializedToolResult.length,
        ...(options.toolResultMetadata ? { metadata: options.toolResultMetadata } : {}),
      },
    });

    return {
      status: 'success',
      toolArgs: options.toolArgs,
      toolResult,
      serializedToolResult,
      toolResultMessage,
    };
  } catch (error) {
    if (options.shouldPersistExecutionError && !options.shouldPersistExecutionError(error)) {
      throw error;
    }

    const serializedToolResult = formatToolErrorContent({
      toolName,
      toolCallId: options.toolCall.id,
      toolArgs: options.toolArgs,
      error,
    });
    const toolResultMessage = appendToolMessage({
      world: options.world,
      agent: options.agent,
      assistantToolCallMessage: options.assistantToolCallMessage,
      toolCallId: options.toolCall.id,
      content: serializedToolResult,
      chatId: options.chatId,
    });
    setCompletedToolCallStatus(options.assistantToolCallMessage, options.toolCall.id, serializedToolResult);
    publishToolEvent(options.world, {
      agentName: options.agent.id,
      type: 'tool-error',
      messageId: options.toolCall.id,
      chatId: options.chatId,
      toolExecution: {
        toolName,
        toolCallId: options.toolCall.id,
        input: options.toolEventInput ?? options.toolArgs,
        error: error instanceof Error ? error.message : String(error),
      },
    });

    return {
      status: 'error',
      toolArgs: options.toolArgs,
      error,
      serializedToolResult,
      toolResultMessage,
    };
  }
}
