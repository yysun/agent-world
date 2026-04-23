/**
 * Orchestrator Module
 * 
 * Coordinates agent message processing, response generation, and turn management.
 * Provides high-level orchestration functions for agent behavior and LLM interaction.
 * 
 * Features:
 * - Process agent messages with LLM response generation
 * - Determine if agent should respond based on mentions and turn limits
 * - Reset LLM call count for new conversation turns
 * - Turn limit enforcement with automatic handoff to human
 * - Enhanced tool call message formatting with parameters display
 * - SSE tool call data for web clients (streaming mode)
 * - Robust JSON parsing with detailed error logging for malformed tool arguments
 * 
 * Implementation:
 * - Tool calls follow standard tool execution and LLM continuation flow
 * - Tool call messages show up to 3 parameters with truncation for readability
 *   * Single tool: "Calling tool: shell_cmd (command: "ls", directory: "./")"
 *   * Multiple tools: "Calling 2 tools: shell_cmd, read_file"
 * - In streaming mode, formatted tool call content with tool_calls data is sent via SSE
 *   * Ensures web/Electron clients display complete tool call info with parameters
 *   * Prevents incomplete display (e.g., "Calling tool: shell_cmd" without params)
 * - JSON parse errors include detailed logging (preview, length, error position)
 *   * Helps diagnose LLM-generated malformed JSON in tool arguments
 * - JSON sanitization attempts to fix common LLM JSON issues before parsing
 *   * Handles unterminated strings, trailing commas, truncation, unmatched braces
 *   * Tries progressive fixes: trailing commas → close strings → truncate to valid
 * 
 * Dependencies (Layer 5):
 * - types.ts (Layer 1)
 * - mention-logic.ts (Layer 2)
 * - publishers.ts (Layer 3)
 * - memory-manager.ts (Layer 4)
 * - utils.ts, logger.ts
 * - llm-manager.ts (runtime)
 * - storage (runtime)
 * 
 * Changes:
 * - 2026-04-12: Limited direct intent-only narration rejection to execution-oriented turns so planning replies can still complete normally.
 * - 2026-04-12: Added bounded direct-turn rejection of intent-only action narration so weak models cannot complete a turn by saying they will use a tool.
 * - 2026-03-29: Routed direct persisted tool execution through shared `tool-action-runtime` helpers so initial, continuation, and restore turns share one tool-step runtime owner.
 * - 2026-03-29: Normalized direct-turn tool actions through shared agent-turn helpers so `human_intervention_request` persists as `hitl_request` with `waiting_for_hitl`.
 * - 2026-03-29: Routed initial agent-turn model call / retry / response classification through the explicit `runAgentTurnLoop(...)` helper while preserving existing tool execution semantics.
 * - 2026-03-29: Added explicit assistant turn metadata for final responses, unresolved tool waits, terminal handoff completion, and in-process resume-safe behavior.
 * - 2026-03-24: Retried one empty initial LLM text response with an explicit non-empty/tool-call reminder and now emits a durable chat-scoped error instead of silently ending the turn.
 * - 2026-03-10: Publish one persisted chat-scoped `system` error event on terminal agent-turn failure so the transcript can retain a durable failure message across reloads.
 * - 2026-03-06: Required explicit `messageEvent.chatId` for agent-turn processing; removed `world.currentChatId` fallback from agent activity and turn-limit routing.
 * - 2026-03-06: Updated shell execution persistence to use explicit canonical failure reasons for shell validation/policy failures while keeping bounded-preview continuation output.
 * - 2026-03-06: Switched shell tool execution to one bounded-preview continuation mode and normalized persisted shell tool failures through the canonical shell-result formatter.
 * - 2026-02-28: Added canonical `turn.trace` diagnostics around per-message processing lifecycle.
 * - 2026-02-27: Passed explicit `chatId` when publishing `tool-execution` system events so event routing never falls back to `world.currentChatId`.
 * - 2026-02-27: Seeded continuation runs with already-loaded `load_skill` IDs from initial tool execution so immediate duplicate `load_skill` calls are suppressed in continuation.
 * - 2026-02-21: Passed `agentName` + minimal shell `llmResultMode` in initial tool-execution context so `shell_cmd` tool results stay status-only for LLM continuation and stdout assistant attribution remains consistent.
 * - 2026-02-16: Added `LOG_LLM_TOOL_BRIDGE` gate for LLM↔tool console bridge logs.
 * - 2026-02-16: Added explicit console debug logs for LLM↔tool request/result/error handoff payloads.
 * - 2026-02-14: Shell tool trusted cwd fallback now uses core default working directory (user home) when world `working_directory` is missing.
 * - 2026-02-13: Fixed shell_cmd mismatch handling by validating path targets in command parameters (e.g. `~/`) against world working_directory before execution.
 * - 2026-02-13: Added hard-stop guard for shell_cmd directory mismatches (LLM-requested `directory` must match world `working_directory`).
 * - 2026-02-13: Enriched displayed `shell_cmd` tool-call arguments with trusted world cwd so UI tool-call messages show the actual execution directory.
 * - 2026-02-13: Forced shell tool cwd to trusted world `working_directory`; mismatched LLM `directory` requests now stop execution with explicit error.
 * - 2026-02-13: Added chat-scoped `tool-start/tool-result/tool-error` event publishing so renderer session state stays accurate during tool execution.
 * - 2026-02-13: Added session processing-handle guards so stop requests abort active tool/continuation flow without spawning new LLM work.
 * - 2026-02-13: Propagated explicit `chatId` and stop abort-signal context through LLM/tool execution paths.
 * - 2026-02-11: Enhanced JSON parse error logging with rawArgs preview and suffix
 * - 2026-02-11: Fixed tool call display in Electron/web - send formatted content with tool_calls via SSE
 * - 2026-02-11: Fixed OpenAI tool-call protocol integrity.
 *   - Persist only the first executable tool_call when agent execution is single-call.
 *   - Route JSON parse/tool lookup failures through tool-error persistence so each persisted tool_call gets a matching tool message.
 * - 2026-02-10: Upgrade generic LLM tool-call text (e.g., "Calling tool: shell_cmd") to include parsed parameters
 * - 2026-02-10: Made tool-call argument parsing more robust for both JSON strings and object-like payloads
 * - 2026-02-08: Enhanced tool call message formatting to include parameters
 * - 2025-11-09: Extracted from events.ts for modular architecture
 */

import type {
  World,
  Agent,
  WorldMessageEvent,
  StorageAPI,
  AgentMessage
} from '../types.js';
import { SenderType } from '../types.js';
import {
  generateId,
  determineSenderType,
  prepareMessagesForLLM,
  getWorldTurnLimit,
  extractMentions,
  extractParagraphBeginningMentions,
  getDefaultWorkingDirectory,
  getEnvValueFromText
} from '../utils.js';
import { createCategoryLogger } from '../logger.js';
import { beginWorldActivity } from '../activity-tracker.js';
import { createStorageWithWrappers } from '../storage/storage-factory.js';
// Opik integration: safety checks and runtime gate consumption in agent response flow.
import { runGuardrails } from '../security/guardrails.js';
import { resolveOpikRuntimeConfig } from '../optional-tracers/opik-runtime.js';
import {
  shouldAutoMention,
  addAutoMention,
  hasAnyMentionAtBeginning
} from './mention-logic.js';
import { publishMessage, publishSSE, publishEvent, publishToolEvent, isStreamingEnabled } from './publishers.js';
import { handleTextResponse } from './memory-manager.js';
import { validateShellDirectoryRequest, validateShellCommandScope } from '../shell-cmd-tool.js';
import {
  parseToolExecutionEnvelopeContent,
  stringifyToolExecutionResult,
} from '../tool-execution-envelope.js';
import {
  beginChatMessageProcessing,
  isMessageProcessingCanceledError,
  throwIfMessageProcessingStopped
} from '../message-processing-control.js';

import { logToolBridge, getToolResultPreview } from './tool-bridge-logging.js';
import {
  buildAgentTurnResumeKey,
  clearWaitingForToolResultMetadata,
  isSuccessfulSendMessageDispatchResult,
  resolveAgentTurnActionForToolName,
  setTerminalTurnMetadata,
  setWaitingForHitlMetadata,
  setWaitingForToolResultMetadata,
} from '../agent-turn.js';
import { runAgentTurnLoop } from './agent-turn-loop.js';
import {
  INTENT_ONLY_RETRY_NOTICE,
  INTENT_ONLY_WARNING_MESSAGE,
  shouldRejectIntentOnlyActionNarration,
} from './assistant-response-guards.js';
import {
  appendSyntheticAssistantToolResult,
  executeToolActionStep,
  formatToolErrorContent,
  parseToolCallArguments,
} from './tool-action-runtime.js';

const loggerAgent = createCategoryLogger('agent');
const loggerResponse = createCategoryLogger('response');
const loggerTurnLimit = createCategoryLogger('turnlimit');
const loggerTurnTrace = createCategoryLogger('turn.trace');

type DisplayToolCall = {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
};

const EMPTY_INITIAL_RESPONSE_RETRY_LIMIT = 1;
const EMPTY_INITIAL_RESPONSE_RETRY_NOTICE =
  'System notice: Your previous reply was empty. Continue this turn with either non-empty assistant text or a tool call. Do not return an empty response.';
const INTENT_ONLY_DIRECT_RETRY_LIMIT = 1;

function parsePlainTextToolIntentValue(rawValue: string): unknown {
  const trimmed = String(rawValue || '').trim();
  if (!trimmed) {
    return '';
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === 'string') {
      const nested = parsed.trim();
      if (
        (nested.startsWith('[') && nested.endsWith(']'))
        || (nested.startsWith('{') && nested.endsWith('}'))
      ) {
        try {
          return JSON.parse(nested);
        } catch {
          return parsed;
        }
      }
    }
    return parsed;
  } catch {
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    if (trimmed === 'null') return null;
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric) && `${numeric}` === trimmed) {
      return numeric;
    }
    return trimmed;
  }
}

function parseParentheticalToolIntentArgs(rawArgs: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  const pattern = /([a-zA-Z0-9_]+):\s*("(?:\\.|[^"])*"|\[[^\]]*\]|\{[^}]*\}|[^,]+)(?:,|$)/g;
  let match: RegExpExecArray | null = null;

  while ((match = pattern.exec(rawArgs)) !== null) {
    const key = String(match[1] || '').trim();
    const value = String(match[2] || '').trim();
    if (!key) {
      continue;
    }
    args[key] = parsePlainTextToolIntentValue(value);
  }

  return args;
}

function parsePlainTextToolIntent(content: string): {
  toolName: string;
  toolArgs: Record<string, unknown>;
} | null {
  const normalized = String(content || '').trim();
  if (!normalized) return null;

  const match = normalized.match(
    /^calling\s+tool\s*:\s*([a-zA-Z0-9_\-]+)\s*(?:\(([\s\S]*)\)|(\{[\s\S]*\}))?\s*$/i,
  );
  if (!match) {
    return null;
  }

  const toolName = String(match[1] || '').trim();
  if (!toolName) {
    return null;
  }

  const rawParentheticalArgs = String(match[2] || '').trim();
  if (rawParentheticalArgs) {
    return {
      toolName,
      toolArgs: parseParentheticalToolIntentArgs(rawParentheticalArgs),
    };
  }

  const rawObjectArgs = String(match[3] || '').trim();
  if (!rawObjectArgs) {
    return { toolName, toolArgs: {} };
  }

  try {
    return {
      toolName,
      toolArgs: JSON.parse(rawObjectArgs),
    };
  } catch {
    return { toolName, toolArgs: {} };
  }
}

// Storage wrapper instance - initialized lazily
let storageWrappers: StorageAPI | null = null;
async function getStorageWrappers(): Promise<StorageAPI> {
  if (!storageWrappers) {
    storageWrappers = await createStorageWithWrappers();
  }
  return storageWrappers!;
}

function getSuccessfulLoadSkillIdForContinuationSeed(
  toolName: string,
  toolArgs: Record<string, any>,
  serializedToolResult: string,
): string | null {
  if (toolName !== 'load_skill') {
    return null;
  }

  const skillId = typeof toolArgs?.skill_id === 'string' ? toolArgs.skill_id.trim() : '';
  if (!skillId) {
    return null;
  }

  const envelope = parseToolExecutionEnvelopeContent(serializedToolResult);
  const normalizedResult = envelope
    ? stringifyToolExecutionResult(envelope.result)
    : String(serializedToolResult || '');
  const isSuccess = /<skill_context\b/i.test(normalizedResult) && !/<error>/i.test(normalizedResult);
  return isSuccess ? skillId : null;
}

/**
 * Format tool calls with their parameters for display
 * @param toolCalls - Array of tool calls from LLM response
 * @returns Formatted message string showing tool names and parameters
 */
function parseToolCallArgs(rawArguments: unknown): Record<string, unknown> | null {
  if (rawArguments == null) return {};
  if (typeof rawArguments === 'object' && !Array.isArray(rawArguments)) {
    return rawArguments as Record<string, unknown>;
  }
  if (typeof rawArguments !== 'string') return null;

  const trimmed = rawArguments.trim();
  if (!trimmed) return {};

  const parsed = JSON.parse(trimmed);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }
  return null;
}

function shouldUpgradeToolCallMessage(content: string, toolCalls: DisplayToolCall[]): boolean {
  if (!content.trim()) return true;
  if (!toolCalls || toolCalls.length === 0) return false;

  const normalizedContent = content.trim().toLowerCase().replace(/\s+/g, ' ');
  const genericCallingToolPattern = /^calling tool(?::|\s)/i;
  if (genericCallingToolPattern.test(content) && !content.includes('(')) {
    return true;
  }

  const firstToolName = String(toolCalls[0]?.function?.name || '').trim().toLowerCase();
  if (!firstToolName) return false;

  return normalizedContent === `calling tool: ${firstToolName}` ||
    normalizedContent === `calling tool ${firstToolName}` ||
    normalizedContent === `calling tool: ${firstToolName}.` ||
    normalizedContent === `calling tool ${firstToolName}.`;
}

function formatToolCallsMessage(toolCalls: DisplayToolCall[]): string {
  const toolCount = toolCalls.length;

  if (toolCount === 1) {
    const tc = toolCalls[0];
    const toolName = tc.function.name;

    try {
      const args = parseToolCallArgs(tc.function.arguments);
      if (!args) {
        return `Calling tool: ${toolName}`;
      }
      const paramParts: string[] = [];

      // Format parameters - show up to 3 key parameters
      const keys = Object.keys(args).slice(0, 3);
      for (const key of keys) {
        let value = args[key];

        // Truncate long values
        if (typeof value === 'string' && value.length > 50) {
          value = value.substring(0, 47) + '...';
        } else if (value !== null && typeof value === 'object') {
          const serialized = JSON.stringify(value);
          value = serialized ?? String(value);
          if (typeof value === 'string' && value.length > 50) {
            value = value.substring(0, 47) + '...';
          }
        }

        paramParts.push(`${key}: ${JSON.stringify(value)}`);
      }

      if (Object.keys(args).length > 3) {
        paramParts.push('...');
      }

      return paramParts.length > 0
        ? `Calling tool: ${toolName} (${paramParts.join(', ')})`
        : `Calling tool: ${toolName}`;
    } catch {
      // If arguments can't be parsed, just show the tool name
      return `Calling tool: ${toolName}`;
    }
  } else {
    // Multiple tools - just list the names
    const toolNames = toolCalls.map(tc => tc.function.name).join(', ');
    return `Calling ${toolCount} tools: ${toolNames}`;
  }
}

// Opik integration: classify tool risk level for trace span tagging.
function classifyToolRisk(toolName: string): { riskLevel: 'low' | 'medium' | 'high'; riskTags: string[] } {
  const normalized = String(toolName || '').trim().toLowerCase();
  if (!normalized) {
    return { riskLevel: 'low', riskTags: ['tool:unknown'] };
  }

  if (normalized === 'shell_cmd') {
    return { riskLevel: 'high', riskTags: ['tool:risky', 'tool:shell_cmd'] };
  }

  if (normalized.startsWith('fs_') || normalized.includes('delete') || normalized.includes('exec')) {
    return { riskLevel: 'high', riskTags: ['tool:risky', `tool:${normalized}`] };
  }

  return { riskLevel: 'low', riskTags: [`tool:${normalized}`] };
}

function withTrustedShellDirectory(
  toolCalls: DisplayToolCall[],
  trustedWorkingDirectory: string
): DisplayToolCall[] {
  return toolCalls.map((toolCall) => {
    if (toolCall.function?.name !== 'shell_cmd') {
      return toolCall;
    }

    try {
      const args = parseToolCallArgs(toolCall.function.arguments);
      if (!args) {
        return toolCall;
      }

      const orderedArgs: Record<string, unknown> = {};
      if (Object.prototype.hasOwnProperty.call(args, 'command')) {
        orderedArgs.command = args.command;
      }
      if (Object.prototype.hasOwnProperty.call(args, 'parameters')) {
        orderedArgs.parameters = args.parameters;
      }
      const requestedDirectory = typeof args.directory === 'string' ? args.directory.trim() : '';
      if (requestedDirectory) {
        // Preserve what the model requested; mismatch handling happens at execution guard.
        orderedArgs.directory = args.directory;
      }
      orderedArgs.workingDirectory = trustedWorkingDirectory;

      for (const [key, value] of Object.entries(args)) {
        if (key === 'command' || key === 'parameters' || key === 'directory' || key === 'workingDirectory') continue;
        orderedArgs[key] = value;
      }

      return {
        ...toolCall,
        function: {
          ...toolCall.function,
          arguments: JSON.stringify(orderedArgs)
        }
      };
    } catch {
      return toolCall;
    }
  });
}

/**
 * Agent message processing with LLM response generation and auto-mention logic
 */
export async function processAgentMessage(
  world: World,
  agent: Agent,
  messageEvent: WorldMessageEvent
): Promise<void> {
  // Derive target chatId before activity begins so it is captured in per-chat tracking
  const targetChatId = typeof messageEvent.chatId === 'string' ? messageEvent.chatId.trim() : '';
  if (!targetChatId) {
    throw new Error(`processAgentMessage: explicit chatId is required for agent ${agent.id}`);
  }
  const turnId = messageEvent.messageId || generateId();
  const turnStartMs = Date.now();
  let turnStatus: 'completed' | 'canceled' | 'failed' = 'completed';

  loggerTurnTrace.debug('Turn processing started', {
    worldId: world.id,
    chatId: targetChatId,
    agentId: agent.id,
    messageId: messageEvent.messageId,
    turnId,
    sender: messageEvent.sender,
  });

  const completeActivity = beginWorldActivity(world, `agent:${agent.id}`, targetChatId);
  let processingHandle: ReturnType<typeof beginChatMessageProcessing> | null = null;
  try {
    processingHandle = beginChatMessageProcessing(world.id, targetChatId);
    throwIfMessageProcessingStopped(processingHandle?.signal);

    // Prepare messages for LLM - loads fresh data from storage
    // The user message is already saved in subscribeAgentToMessages, so it's in storage
    const filteredMessages = await prepareMessagesForLLM(
      world.id,
      agent,
      targetChatId
    );
    throwIfMessageProcessingStopped(processingHandle?.signal);

    // Log prepared messages for debugging
    loggerAgent.debug('Prepared messages for LLM', {
      agentId: agent.id,
      chatId: targetChatId,
      totalMessages: filteredMessages.length,
      systemMessages: filteredMessages.filter(m => m.role === 'system').length,
      userMessages: filteredMessages.filter(m => m.role === 'user').length,
      assistantMessages: filteredMessages.filter(m => m.role === 'assistant').length,
      toolMessages: filteredMessages.filter(m => m.role === 'tool').length
    });

    // Increment LLM call count and save agent state
    agent.llmCallCount++;
    agent.lastLLMCall = new Date();

    try {
      const storage = await getStorageWrappers();
      await storage.saveAgent(world.id, agent);
    } catch (error) {
      loggerAgent.error('Failed to auto-save agent after LLM call increment', {
        worldId: world.id,
        chatId: targetChatId,
        agentId: agent.id,
        error: error instanceof Error ? error.message : error
      });
    }

    // Create a wrapped publishSSE that captures the targetChatId for concurrency-safe event routing
    // This ensures SSE events stay bound to the originating session even during concurrent processing
    const publishSSEWithChatId = (w: World, data: Partial<import('../types.js').WorldSSEEvent>) => {
      publishSSE(w, { ...data, chatId: targetChatId });
    };
    const discardStreamedAssistantReply = (discardMessageId: string) => {
      if (!isStreamingEnabled()) {
        return;
      }
      const normalizedMessageId = String(discardMessageId || '').trim();
      if (!normalizedMessageId) {
        return;
      }
      publishSSEWithChatId(world, {
        agentName: agent.id,
        type: 'end',
        messageId: normalizedMessageId,
        discard: true,
      });
    };

    let llmResponse: import('../types.js').LLMResponse | null = null;
    let messageId = '';
    let initialLoopStoppedOnEmptyText = false;
    let initialLoopStoppedOnIntentOnlyText = false;
    let directIntentOnlyRetryCount = 0;
    const latestDirectUserContent = String(messageEvent.content || '').trim();

    await runAgentTurnLoop({
      world,
      agent,
      chatId: targetChatId,
      abortSignal: processingHandle?.signal,
      label: 'direct',
      emptyTextRetryLimit: EMPTY_INITIAL_RESPONSE_RETRY_LIMIT,
      buildMessages: async ({ emptyTextRetryCount, transientInstruction }) => {
        const retryInstruction = emptyTextRetryCount > 0 ? EMPTY_INITIAL_RESPONSE_RETRY_NOTICE : undefined;
        const effectiveInstruction = transientInstruction || retryInstruction;
        if (!effectiveInstruction) {
          return filteredMessages;
        }

        return [
          ...filteredMessages,
          {
            role: 'system',
            content: effectiveInstruction,
          } as any,
        ];
      },
      parsePlainTextToolIntent,
      onTextResponse: async ({ responseText, messageId: loopMessageId }) => {
        if (shouldRejectIntentOnlyActionNarration({
          assistantContent: responseText,
          latestUserContent: latestDirectUserContent,
        })) {
          if (directIntentOnlyRetryCount < INTENT_ONLY_DIRECT_RETRY_LIMIT) {
            directIntentOnlyRetryCount += 1;
            discardStreamedAssistantReply(loopMessageId);
            loggerAgent.warn('Direct turn returned intent-only action narration; retrying with corrective instruction', {
              agentId: agent.id,
              worldId: world.id,
              chatId: targetChatId,
              messageId: loopMessageId,
              directIntentOnlyRetryCount,
              retryLimit: INTENT_ONLY_DIRECT_RETRY_LIMIT,
            });
            return {
              control: 'continue',
              transientInstruction: INTENT_ONLY_RETRY_NOTICE,
            };
          }

          messageId = loopMessageId;
          initialLoopStoppedOnIntentOnlyText = true;
          discardStreamedAssistantReply(loopMessageId);
          loggerAgent.warn('Direct turn returned repeated intent-only action narration; stopping without terminal completion', {
            agentId: agent.id,
            worldId: world.id,
            chatId: targetChatId,
            messageId: loopMessageId,
            directIntentOnlyRetryCount,
            retryLimit: INTENT_ONLY_DIRECT_RETRY_LIMIT,
          });
          publishEvent(world, 'system', {
            message: INTENT_ONLY_WARNING_MESSAGE,
            type: 'warning',
            eventType: 'warning',
            agentName: agent.id,
          }, targetChatId);
          return { control: 'stop' };
        }

        llmResponse = {
          type: 'text',
          content: responseText,
        } as import('../types.js').LLMResponse;
        messageId = loopMessageId;
        return undefined;
      },
      onToolCallsResponse: async ({ llmResponse: loopResponse, messageId: loopMessageId }) => {
        llmResponse = loopResponse;
        messageId = loopMessageId;
      },
      onEmptyTextStop: async ({ messageId: loopMessageId, retryCount }) => {
        messageId = loopMessageId;
        initialLoopStoppedOnEmptyText = true;
        loggerAgent.warn('LLM returned empty initial text response', {
          agentId: agent.id,
          worldId: world.id,
          chatId: targetChatId,
          messageId: loopMessageId,
          emptyInitialResponseRetryCount: retryCount,
          retryLimit: EMPTY_INITIAL_RESPONSE_RETRY_LIMIT,
        });
        const emptyResponseMessage = '[Error] Agent returned an empty response. Please retry the request.';
        publishEvent(world, 'system', {
          message: emptyResponseMessage,
          type: 'error',
          eventType: 'error',
          agentName: agent.id,
        }, targetChatId);
      },
    });
    throwIfMessageProcessingStopped(processingHandle?.signal);

    if (initialLoopStoppedOnEmptyText || initialLoopStoppedOnIntentOnlyText || !llmResponse) {
      return;
    }

    let resolvedResponse: import('../types.js').LLMResponse = llmResponse;

    loggerAgent.debug('LLM response received', {
      agentId: agent.id,
      responseType: resolvedResponse.type,
      hasContent: !!resolvedResponse.content,
      hasToolCalls: resolvedResponse.type === 'tool_calls',
      toolCallCount: resolvedResponse.tool_calls?.length || 0
    });

    if (resolvedResponse.type === 'text' && typeof resolvedResponse.content === 'string' && resolvedResponse.content.trim()) {
      const parsedPlainTextToolIntent = parsePlainTextToolIntent(resolvedResponse.content);
      if (parsedPlainTextToolIntent) {
        const syntheticToolCallId = generateId();
        loggerAgent.warn('Initial turn received plain-text tool intent; synthesizing tool_call fallback', {
          agentId: agent.id,
          chatId: targetChatId,
          toolName: parsedPlainTextToolIntent.toolName,
          syntheticToolCallId,
        });

        resolvedResponse = {
          type: 'tool_calls',
          content: resolvedResponse.content,
          tool_calls: [{
            id: syntheticToolCallId,
            type: 'function',
            function: {
              name: parsedPlainTextToolIntent.toolName,
              arguments: JSON.stringify(parsedPlainTextToolIntent.toolArgs || {}),
            },
          }],
          assistantMessage: {
            role: 'assistant',
            content: resolvedResponse.content,
            tool_calls: [{
              id: syntheticToolCallId,
              type: 'function',
              function: {
                name: parsedPlainTextToolIntent.toolName,
                arguments: JSON.stringify(parsedPlainTextToolIntent.toolArgs || {}),
              },
            }],
          },
        } as any;
      }
    }

    // Handle text responses
    if (resolvedResponse.type === 'text') {
      let responseText = resolvedResponse.content || '';
      if (!responseText.trim()) {
        const emptyResponseMessage = '[Error] Agent returned an empty response. Please retry the request.';
        publishEvent(world, 'system', {
          message: emptyResponseMessage,
          type: 'error',
          eventType: 'error',
          agentName: agent.id,
        }, targetChatId);
        return;
      }

      // Opik integration: run safety guardrails on LLM output when Opik safety is enabled.
      const opikRuntime = resolveOpikRuntimeConfig(world);
      if (opikRuntime.enabled && opikRuntime.safetyEnabled) {
        const guardrailResult = runGuardrails(responseText, messageEvent.content || '', {
          redact: opikRuntime.redact,
          blockOnHighSeverity: opikRuntime.blockOnHighSeverity,
        });

        if (guardrailResult.flagged) {
          world.eventEmitter.emit('world', {
            type: 'guardrail',
            agentName: agent.id,
            messageId,
            chatId: targetChatId,
            triggered: true,
            blocked: guardrailResult.blocked,
            severity: guardrailResult.severity,
            reasons: guardrailResult.reasons,
          } as any);

          loggerAgent.warn('Guardrail triggered for LLM output', {
            agentId: agent.id,
            severity: guardrailResult.severity,
            blocked: guardrailResult.blocked,
            reasons: guardrailResult.reasons,
          });

          if (guardrailResult.blocked) {
            const blockedMessage = '[Blocked by safety guardrail due to high-severity policy]';
            throwIfMessageProcessingStopped(processingHandle?.signal);
            await handleTextResponse(world, agent, blockedMessage, messageId, messageEvent, targetChatId, {
              turnId,
              source: 'direct',
            });
            return;
          }

          responseText = guardrailResult.redactedText;
        }
      }

      // Process text response (existing logic below)
      // Pass targetChatId explicitly for concurrency-safe processing
      throwIfMessageProcessingStopped(processingHandle?.signal);
      await handleTextResponse(world, agent, responseText, messageId, messageEvent, targetChatId, {
        turnId,
        source: 'direct',
      });
      return;
    }

    // Handle tool calls - Execute tools through unified execution path
    // This works for both streaming and non-streaming modes
    if (resolvedResponse.type === 'tool_calls') {
      const returnedToolCalls = resolvedResponse.tool_calls || [];
      const executableToolCalls = returnedToolCalls.slice(0, 1);
      const trustedWorkingDirectory = String(
        getEnvValueFromText(world.variables, 'working_directory') || getDefaultWorkingDirectory()
      ).trim() || getDefaultWorkingDirectory();
      const displayToolCalls = withTrustedShellDirectory(
        executableToolCalls as DisplayToolCall[],
        trustedWorkingDirectory
      );
      if (returnedToolCalls.length > executableToolCalls.length) {
        loggerAgent.warn('LLM returned multiple tool calls; processing first call only', {
          agentId: agent.id,
          returnedToolCallCount: returnedToolCalls.length,
          processedToolCallIds: executableToolCalls.map(tc => tc.id),
          droppedToolCallIds: returnedToolCalls.slice(1).map(tc => tc.id)
        });
      }

      loggerAgent.debug('LLM returned tool calls', {
        agentId: agent.id,
        toolCallCount: executableToolCalls.length,
        toolNames: executableToolCalls.map(tc => tc.function.name)
      });

      // Save assistant message with tool_calls to agent memory FIRST
      // This ensures the tool call is in memory before execution

      // Format meaningful content for tool calls if LLM didn't provide text
      let messageContent = resolvedResponse.content || '';
      if (displayToolCalls.length > 0 &&
        shouldUpgradeToolCallMessage(messageContent, displayToolCalls)) {
        messageContent = formatToolCallsMessage(displayToolCalls);
      }

      // For streaming mode, send the formatted tool call message via SSE
      // This ensures web clients receive the complete tool call info with parameters
      // Use publishSSEWithChatId to ensure concurrency-safe event routing
      if (isStreamingEnabled()) {
        publishSSEWithChatId(world, {
          agentName: agent.id,
          type: 'chunk',
          content: messageContent,
          messageId,
          tool_calls: displayToolCalls
        });
      }

      const pendingToolCallCandidate = executableToolCalls[0];

      const assistantMessage: AgentMessage = {
        role: 'assistant',
        content: messageContent,
        sender: agent.id,
        createdAt: new Date(),
        chatId: targetChatId,
        messageId,
        replyToMessageId: messageEvent.messageId,
        tool_calls: displayToolCalls,
        agentId: agent.id,
        // Mark tool calls as incomplete (waiting for execution)
        toolCallStatus: displayToolCalls.reduce((acc, tc) => {
          acc[tc.id] = { complete: false, result: null };
          return acc;
        }, {} as Record<string, { complete: boolean; result: any }>)
      };
      if (pendingToolCallCandidate) {
        const pendingAction = resolveAgentTurnActionForToolName(pendingToolCallCandidate.function.name);
        const waitingMetadataParams = {
          turnId,
          source: 'direct' as const,
          action: pendingAction,
          resumeKey: buildAgentTurnResumeKey({
            worldId: world.id,
            agentId: agent.id,
            chatId: targetChatId,
            assistantMessageId: messageId,
            toolCallId: pendingToolCallCandidate.id,
          }),
        };
        if (pendingAction === 'hitl_request') {
          setWaitingForHitlMetadata(assistantMessage, waitingMetadataParams);
        } else {
          setWaitingForToolResultMetadata(assistantMessage, waitingMetadataParams);
        }
      }

      agent.memory.push(assistantMessage);

      // Auto-save agent memory
      try {
        const storage = await getStorageWrappers();
        await storage.saveAgent(world.id, agent);
        loggerAgent.debug('Assistant message with tool_calls saved to memory', {
          agentId: agent.id,
          messageId,
          toolCallCount: executableToolCalls.length,
          toolCallIds: executableToolCalls.map(tc => tc.id)
        });
      } catch (error) {
        loggerAgent.error('Failed to save assistant message with tool_calls', {
          agentId: agent.id,
          error: error instanceof Error ? error.message : error
        });
      }

      // Publish original tool call message event (for display/logging)
      const toolCallEvent: WorldMessageEvent = {
        content: assistantMessage.content || '',
        sender: agent.id,
        timestamp: assistantMessage.createdAt || new Date(),
        messageId: assistantMessage.messageId!,
        chatId: assistantMessage.chatId,
        replyToMessageId: assistantMessage.replyToMessageId
      };
      (toolCallEvent as any).role = 'assistant';
      (toolCallEvent as any).tool_calls = assistantMessage.tool_calls;
      (toolCallEvent as any).toolCallStatus = assistantMessage.toolCallStatus;

      world.eventEmitter.emit('message', toolCallEvent);

      // Execute first tool call (only handle one at a time for now)
      // This is the UNIFIED tool execution path for both streaming and non-streaming
      const toolCall = executableToolCalls[0];
      if (toolCall) {
        throwIfMessageProcessingStopped(processingHandle?.signal);
        loggerAgent.debug('Executing tool call', {
          agentId: agent.id,
          toolCallId: toolCall.id,
          toolName: toolCall.function.name
        });

        let toolArgs: Record<string, any> = {};
        try {
          const rawArgs = toolCall.function.arguments;
          try {
            toolArgs = parseToolCallArguments(rawArgs, { sanitizeJsonString: true });
            if (typeof rawArgs === 'string') {
              try {
                JSON.parse(rawArgs);
              } catch {
                loggerAgent.warn('Tool arguments required JSON sanitization', {
                  agentId: agent.id,
                  toolCallId: toolCall.id,
                  toolName: toolCall.function.name,
                  rawArgsLength: rawArgs.length
                });
              }
            }
          } catch (parseError) {
            if (typeof rawArgs === 'string') {
              loggerAgent.error('Failed to parse tool call arguments as JSON (even after sanitization)', {
                agentId: agent.id,
                toolCallId: toolCall.id,
                toolName: toolCall.function.name,
                error: parseError instanceof Error ? parseError.message : String(parseError),
                rawArgsLength: rawArgs.length,
                rawArgsPreview: rawArgs.substring(0, 500),
                rawArgsSuffix: rawArgs.length > 500 ? rawArgs.substring(rawArgs.length - 200) : '',
              });
            }
            throw new Error(`Invalid JSON in tool arguments: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
          }

          const toolRisk = classifyToolRisk(toolCall.function.name);
          logToolBridge('LLM -> TOOL', {
            worldId: world.id,
            agentId: agent.id,
            chatId: targetChatId,
            toolCallId: toolCall.id,
            toolName: toolCall.function.name,
            args: toolArgs,
          });

          if (toolCall.function.name === 'shell_cmd') {
            const directoryValidation = validateShellDirectoryRequest(
              toolArgs.directory,
              trustedWorkingDirectory
            );
            if (!directoryValidation.valid) {
              throw new Error(directoryValidation.error);
            }
            const scopeValidation = validateShellCommandScope(
              toolArgs.command,
              toolArgs.parameters,
              trustedWorkingDirectory
            );
            if (!scopeValidation.valid) {
              throw new Error(scopeValidation.error);
            }
          }

          const executionResult = await executeToolActionStep({
            world,
            agent,
            assistantToolCallMessage: assistantMessage,
            toolCall,
            chatId: targetChatId,
            toolArgs,
            trustedWorkingDirectory,
            abortSignal: processingHandle?.signal,
            toolEventInput: toolArgs,
            toolStartMetadata: {
              isStreaming: isStreamingEnabled(),
              riskLevel: toolRisk.riskLevel,
              riskTags: toolRisk.riskTags,
            },
            llmResultMode: toolCall.function.name === 'shell_cmd' ? 'minimal' : 'verbose',
            persistToolEnvelope: toolCall.function.name === 'shell_cmd'
              || toolCall.function.name === 'load_skill'
              || toolCall.function.name === 'web_fetch',
            suppressValidationErrorEvent: true,
            shouldPersistSuccessfulResult: () => !processingHandle?.isStopped(),
            shouldPersistExecutionError: (error) => !isMessageProcessingCanceledError(error) && !processingHandle?.isStopped(),
          });

          if (executionResult.status === 'skipped_success_persistence') {
            const toolCallMsg = agent.memory.find(
              m => m.role === 'assistant' && (m as any).tool_calls?.some((tc: any) => tc.id === toolCall.id)
            );
            if (toolCallMsg && (toolCallMsg as any).toolCallStatus) {
              (toolCallMsg as any).toolCallStatus[toolCall.id] = { complete: true, result: 'canceled' };
              clearWaitingForToolResultMetadata(toolCallMsg as AgentMessage);
            }
            try {
              const storage = await getStorageWrappers();
              await storage.saveAgent(world.id, agent);
            } catch (error) {
              loggerAgent.error('Failed to save canceled tool state', {
                worldId: world.id,
                chatId: targetChatId,
                agentId: agent.id,
                toolCallId: toolCall.id,
                error: error instanceof Error ? error.message : error
              });
            }
            loggerAgent.info('Tool execution canceled by stop request before continuation', {
              agentId: agent.id,
              toolCallId: toolCall.id,
              targetChatId
            });
            publishToolEvent(world, {
              agentName: agent.id,
              type: 'tool-error',
              messageId: toolCall.id,
              chatId: targetChatId,
              toolExecution: {
                toolName: toolCall.function.name,
                toolCallId: toolCall.id,
                input: toolArgs,
                error: 'Tool execution canceled by user'
              }
            });
            return;
          }

          if (executionResult.status === 'success') {
            loggerAgent.debug('Tool executed successfully', {
              agentId: agent.id,
              toolCallId: toolCall.id,
              resultLength: executionResult.serializedToolResult.length
            });

            publishEvent(world, 'tool-execution', {
              agentId: agent.id,
              toolName: toolCall.function.name,
              toolCallId: toolCall.id,
              chatId: targetChatId,
              ...(toolArgs.command && { command: toolArgs.command }),
              ...(toolArgs.parameters && { parameters: toolArgs.parameters }),
              ...(toolCall.function.name === 'shell_cmd' && { directory: trustedWorkingDirectory }),
              ...(toolCall.function.name !== 'shell_cmd' && toolArgs.directory && { directory: toolArgs.directory })
            }, targetChatId);

            logToolBridge('TOOL -> LLM', {
              worldId: world.id,
              agentId: agent.id,
              chatId: targetChatId,
              toolCallId: toolCall.id,
              toolName: toolCall.function.name,
              resultPreview: getToolResultPreview(executionResult.toolResult),
            });
          } else if (executionResult.status === 'missing_tool') {
            loggerAgent.error('Tool execution error', {
              worldId: world.id,
              chatId: targetChatId,
              agentId: agent.id,
              toolCallId: toolCall.id,
              error: `Tool not found: ${toolCall.function.name}`,
            });
          } else {
            loggerAgent.error('Tool execution error', {
              worldId: world.id,
              chatId: targetChatId,
              agentId: agent.id,
              toolCallId: toolCall.id,
              error: executionResult.error instanceof Error ? executionResult.error.message : executionResult.error
            });
            logToolBridge('TOOL ERROR -> LLM', {
              worldId: world.id,
              agentId: agent.id,
              chatId: targetChatId,
              toolCallId: toolCall.id,
              toolName: toolCall.function.name,
              error: executionResult.error instanceof Error ? executionResult.error.message : String(executionResult.error),
            });
          }

          // Save agent with tool result
          try {
            const storage = await getStorageWrappers();
            await storage.saveAgent(world.id, agent);
            loggerAgent.debug('Tool result saved to memory', {
              agentId: agent.id,
              toolCallId: toolCall.id,
              messageId: executionResult.toolResultMessage.messageId
            });
          } catch (error) {
            loggerAgent.error('Failed to save tool result', {
              worldId: world.id,
              chatId: targetChatId,
              agentId: agent.id,
              toolCallId: toolCall.id,
              error: error instanceof Error ? error.message : error
            });
          }

          if (executionResult.status === 'success' && toolCall.function.name === 'send_message' && isSuccessfulSendMessageDispatchResult(executionResult.serializedToolResult)) {
            const toolCallMsg = agent.memory.find(
              m => m.role === 'assistant' && (m as any).tool_calls?.some((tc: any) => tc.id === toolCall.id)
            );
            if (toolCallMsg) {
              setTerminalTurnMetadata(toolCallMsg as AgentMessage, {
                turnId,
                source: 'direct',
                action: 'agent_handoff',
                outcome: 'handoff_dispatched',
              });
              try {
                const storage = await getStorageWrappers();
                await storage.saveAgent(world.id, agent);
              } catch (error) {
                loggerAgent.error('Failed to save terminal handoff metadata', {
                  worldId: world.id,
                  chatId: targetChatId,
                  agentId: agent.id,
                  toolCallId: toolCall.id,
                  error: error instanceof Error ? error.message : error,
                });
              }
            }
            return;
          }

          loggerAgent.debug('Continuing LLM loop with tool result', {
            agentId: agent.id,
            toolCallId: toolCall.id,
            targetChatId,
            executionStatus: executionResult.status,
          });

          // Continue the LLM execution loop with the tool result
          // Pass explicit chatId for concurrency-safe continuation
          throwIfMessageProcessingStopped(processingHandle?.signal);
          const { continueLLMAfterToolExecution } = await import('./memory-manager.js');
          const seededLoadSkillId = executionResult.status === 'success'
            ? getSuccessfulLoadSkillIdForContinuationSeed(
              toolCall.function.name,
              toolArgs,
              executionResult.serializedToolResult,
            )
            : null;
          await continueLLMAfterToolExecution(world, agent, targetChatId, {
            abortSignal: processingHandle?.signal,
            turnId,
            ...(seededLoadSkillId ? { preloadedSkillIds: [seededLoadSkillId] } : {}),
          });

        } catch (error) {
          if (isMessageProcessingCanceledError(error) || processingHandle?.isStopped()) {
            loggerAgent.info('Tool execution canceled', {
              agentId: agent.id,
              toolCallId: toolCall.id,
              error: error instanceof Error ? error.message : String(error)
            });
            const toolCallMsg = agent.memory.find(
              m => m.role === 'assistant' && (m as any).tool_calls?.some((tc: any) => tc.id === toolCall.id)
            );
            if (toolCallMsg && (toolCallMsg as any).toolCallStatus) {
              (toolCallMsg as any).toolCallStatus[toolCall.id] = { complete: true, result: 'canceled' };
              clearWaitingForToolResultMetadata(toolCallMsg as AgentMessage);
            }
            try {
              const storage = await getStorageWrappers();
              await storage.saveAgent(world.id, agent);
            } catch (saveError) {
              loggerAgent.error('Failed to save canceled tool state', {
                worldId: world.id,
                chatId: targetChatId,
                agentId: agent.id,
                toolCallId: toolCall.id,
                error: saveError instanceof Error ? saveError.message : saveError
              });
            }
            publishToolEvent(world, {
              agentName: agent.id,
              type: 'tool-error',
              messageId: toolCall.id,
              chatId: targetChatId,
              toolExecution: {
                toolName: toolCall.function.name,
                toolCallId: toolCall.id,
                error: 'Tool execution canceled by user'
              }
            });
            return;
          }

          loggerAgent.error('Tool execution error', {
            worldId: world.id,
            chatId: targetChatId,
            agentId: agent.id,
            toolCallId: toolCall.id,
            error: error instanceof Error ? error.message : error
          });
          publishToolEvent(world, {
            agentName: agent.id,
            type: 'tool-error',
            messageId: toolCall.id,
            chatId: targetChatId,
            toolExecution: {
              toolName: toolCall.function.name,
              toolCallId: toolCall.id,
              error: error instanceof Error ? error.message : String(error)
            }
          });
          logToolBridge('TOOL ERROR -> LLM', {
            worldId: world.id,
            agentId: agent.id,
            chatId: targetChatId,
            toolCallId: toolCall.id,
            toolName: toolCall.function.name,
            error: error instanceof Error ? error.message : String(error),
          });

          // Save error as tool result
          const errorMessage: AgentMessage = {
            role: 'tool',
            content: formatToolErrorContent({
              toolName: toolCall.function.name,
              toolCallId: toolCall.id,
              toolArgs,
              error,
            }),
            tool_call_id: toolCall.id,
            sender: agent.id,
            createdAt: new Date(),
            chatId: targetChatId,
            messageId: generateId(),
            replyToMessageId: messageId,
            agentId: agent.id
          };

          agent.memory.push(errorMessage);
          appendSyntheticAssistantToolResult({
            world,
            agent,
            serializedToolResult: errorMessage.content,
            sourceMessageId: errorMessage.messageId!,
            replyToMessageId: errorMessage.replyToMessageId,
            chatId: targetChatId,
          });

          const toolCallMsg = agent.memory.find(
            m => m.role === 'assistant' && (m as any).tool_calls?.some((tc: any) => tc.id === toolCall.id)
          );
          if (toolCallMsg && (toolCallMsg as any).toolCallStatus) {
            (toolCallMsg as any).toolCallStatus[toolCall.id] = {
              complete: true,
              result: errorMessage.content
            };
            clearWaitingForToolResultMetadata(toolCallMsg as AgentMessage);
          }

          try {
            const storage = await getStorageWrappers();
            await storage.saveAgent(world.id, agent);
          } catch (saveError) {
            loggerAgent.error('Failed to save error message', {
              worldId: world.id,
              chatId: targetChatId,
              agentId: agent.id,
              toolCallId: toolCall.id,
              error: saveError instanceof Error ? saveError.message : saveError
            });
          }

          loggerAgent.debug('Continuing LLM loop with tool error result', {
            agentId: agent.id,
            toolCallId: toolCall.id,
            targetChatId
          });

          throwIfMessageProcessingStopped(processingHandle?.signal);
          const { continueLLMAfterToolExecution } = await import('./memory-manager.js');
          await continueLLMAfterToolExecution(world, agent, targetChatId, {
            abortSignal: processingHandle?.signal,
            turnId,
          });
        }
      }

      return;
    }
  } catch (error) {
    if (isMessageProcessingCanceledError(error) || processingHandle?.isStopped()) {
      turnStatus = 'canceled';
      loggerAgent.info('Agent message processing canceled', {
        agentId: agent.id,
        chatId: targetChatId,
        error: error instanceof Error ? error.message : String(error)
      });
      return;
    }

    turnStatus = 'failed';
    loggerAgent.error('Error processing agent message', {
      worldId: world.id,
      chatId: targetChatId,
      agentId: agent.id,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    publishEvent(world, 'system', {
      type: 'error',
      eventType: 'error',
      agentName: agent.id,
      message: `Error processing agent message: ${error instanceof Error ? error.message : String(error)}. | agent=${agent.id}`,
    }, targetChatId);
    throw error;
  } finally {
    loggerTurnTrace.debug('Turn processing completed', {
      worldId: world.id,
      chatId: targetChatId,
      agentId: agent.id,
      messageId: messageEvent.messageId,
      turnId,
      status: turnStatus,
      durationMs: Date.now() - turnStartMs,
    });
    processingHandle?.complete();
    completeActivity();
  }
}

/**
 * Enhanced message filtering logic with turn limits and mention detection
 */
export async function shouldAgentRespond(world: World, agent: Agent, messageEvent: WorldMessageEvent): Promise<boolean> {
  // Never respond to own messages
  if (messageEvent.sender?.toLowerCase() === agent.id.toLowerCase()) {
    loggerResponse.debug('Skipping own message', { agentId: agent.id, sender: messageEvent.sender });
    return false;
  }

  const content = messageEvent.content || '';

  // Never respond to turn limit messages (prevents endless loops)
  if (content.includes('Turn limit reached')) {
    loggerTurnLimit.debug('Skipping turn limit message', { agentId: agent.id });
    return false;
  }

  // Check turn limit based on LLM call count
  const worldTurnLimit = getWorldTurnLimit(world);
  loggerTurnLimit.debug('Checking turn limit', { agentId: agent.id, llmCallCount: agent.llmCallCount, worldTurnLimit });

  if (agent.llmCallCount >= worldTurnLimit) {
    loggerTurnLimit.debug('Turn limit reached, sending turn limit message', { agentId: agent.id, llmCallCount: agent.llmCallCount, worldTurnLimit });
    const turnLimitMessage = `@human Turn limit reached (${worldTurnLimit} LLM calls). Please take control of the conversation.`;
    const turnLimitChatId = typeof messageEvent.chatId === 'string' ? messageEvent.chatId.trim() : '';
    if (turnLimitChatId) {
      publishMessage(world, turnLimitMessage, agent.id, turnLimitChatId);
    } else {
      loggerTurnLimit.warn('Skipping turn limit message publish without chat context', {
        agentId: agent.id,
        worldId: world.id,
        messageId: messageEvent.messageId,
      });
    }
    return false;
  }

  // Determine sender type for message handling logic
  const senderType = determineSenderType(messageEvent.sender);
  loggerResponse.debug('Determined sender type', { agentId: agent.id, sender: messageEvent.sender, senderType });

  // Never respond to system messages
  if (messageEvent.sender === 'system') {
    loggerResponse.debug('Skipping system message', { agentId: agent.id });
    return false;
  }

  const anyMentions = extractMentions(messageEvent.content);
  const mentions = extractParagraphBeginningMentions(messageEvent.content);
  loggerResponse.debug('Extracted mentions', { mentions, anyMentions });

  // Treat world messages like human ingress: public messages broadcast, leading mentions target.
  if (senderType === SenderType.HUMAN || senderType === SenderType.WORLD) {
    if (mentions.length === 0) {
      if (anyMentions.length > 0) {
        loggerResponse.debug('Mentions exist but not at paragraph beginning', { agentId: agent.id });
        return false;
      }
      loggerResponse.debug('No mentions - public message', { agentId: agent.id });
      return true;
    }
    const normalizedAgentId = agent.id.toLowerCase().replace(/\s+/g, '-');
    const shouldRespond = mentions.includes(normalizedAgentId);
    loggerResponse.debug('Human-like message mention check', {
      agentId: agent.id,
      normalizedAgentId,
      senderType,
      shouldRespond,
    });
    return shouldRespond;
  }

  // For agent messages, only respond if this agent has a paragraph-beginning mention
  const normalizedAgentId = agent.id.toLowerCase().replace(/\s+/g, '-');
  const shouldRespond = mentions.includes(normalizedAgentId);
  loggerResponse.debug('AGENT message mention check', { agentId: agent.id, normalizedAgentId, shouldRespond });
  return shouldRespond;
}
