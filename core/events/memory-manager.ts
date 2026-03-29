/**
 * Memory Management Module
 * 
 * Handles agent memory operations, LLM call management, and chat title generation.
 * Provides functions for saving messages, continuing LLM after tool execution, and text response handling.
 * 
 * Features:
 * - Save incoming messages to agent memory with auto-save
 * - Continue LLM execution after tool results (auto-execution flow)
 * - Handle text responses with auto-mention logic
 * - Reset LLM call count for human/world messages
 * - Generate chat titles from message content using LLM
 * 
 * Dependencies (Layer 4):
 * - types.ts (Layer 1)
 * - mention-logic.ts (Layer 2)
 * - publishers.ts (Layer 3)
 * - utils.ts, logger.ts
 * - llm-manager.ts (runtime)
 * - storage (runtime)
 * 
 * Changes:
 * - 2026-03-29: Added shared HITL/handoff action classification plus terminal-turn no-op guards so restore/continuation avoids duplicate handoff follow-up and skips already-terminal turns.
 * - 2026-03-29: Routed continuation model call / retry / response classification through the explicit `runAgentTurnLoop(...)` helper while preserving existing single-tool execution semantics.
 * - 2026-03-29: Added explicit terminal assistant turn metadata support for direct and continuation loop completion.
 * - 2026-03-21: Excluded persisted display-only synthetic assistant tool-result rows from
 *   chat-title prompt assembly so title generation never re-ingests display payloads.
 * - 2026-03-13: Phase 1 — weak fallback no-commit: `pickFallbackTitle` returns '' instead of 'Chat Session' so low-signal LLM results keep the chat in 'New Chat' state.
 * - 2026-03-13: Phase 2 — bounded context window: `buildTitlePromptMessages` collects up to TITLE_CONTEXT_WINDOW_TURNS*2 recent user+assistant messages for richer prompt context.
 * - 2026-03-13: Improved title-gen prompt: explicit @mention semantics, no-verbatim-copy rule, noun-phrase Title Case format constraint.
 * - 2026-03-13: Title-generation LLM calls now strip world `reasoning_effort` so background title requests omit provider reasoning params by default.
 * - 2026-03-06: Required explicit chat scope in memory-save/continuation/assistant-response paths; removed `world.currentChatId` fallback from agent event routing.
 * - 2026-03-06: Normalized shell continuation parse/validation/policy failures through explicit canonical shell failure reasons and updated continuation comments to reflect bounded-preview tool persistence.
 * - 2026-03-06: Collapsed shell continuation result-mode selection to one bounded-preview mode and normalized persisted shell tool failures through the canonical shell-result formatter.
 * - 2026-02-28: Added canonical `message.publish` logs for assistant publish events in direct and continuation response paths.
 * - 2026-02-27: Passed explicit chat scope to continuation system events (`publishEvent`) to prevent fallback routing to `world.currentChatId` during chat switches.
 * - 2026-02-27: Suppress repeated identical `load_skill` tool calls within the same continuation run once a prior same-run load succeeded.
 * - 2026-02-27: Added per-chat/agent continuation run lock in `continueLLMAfterToolExecution` to skip concurrent duplicate continuation runs while tools are pending/executing (prevents duplicate HITL approval prompts).
 * - 2026-03-01: Expanded script-like shell command detection to treat path-based interpreter executables (for example `.venv/bin/python`) as script hosts so continuation prefers smart shell result mode after skill-driven script calls.
 * - 2026-03-01: Generalized script-host detection for smart shell continuation mode to include additional interpreter families (`bash`, `node`, `deno`, `bun`, `ruby`, `perl`, `php`, `pwsh`) and `env <interpreter> script` invocation patterns.
 * - 2026-03-01: Updated duplicate `shell_cmd` matching to ignore `output_format`/`output_detail` differences and redact those fields from continuation tool telemetry payloads.
 * - 2026-02-26: Replaced `resumePendingToolCallsForChat` console traces with categorized structured logger events (`chat.restore.resume.tools`) for env-controlled restore diagnostics.
 * - 2026-02-24: Commented out hardcoded Infinite-Etude handoff safeguard to respect separation of concerns (logic moved to agent prompt).
 * - 2026-02-25: Added detailed resume tracing in `resumePendingToolCallsForChat` (start/skip/execute/error/continue) for cross-layer restore diagnostics.
 * - 2026-02-25: Added duplicate messageId guard in `saveIncomingMessageToMemory` so chat-restore replay can re-emit pending user messages without duplicating persisted agent memory.
 * - 2026-02-25: Added `resumePendingToolCallsForChat` to restore unresolved persisted tool calls (e.g. `load_skill`) on chat load/switch and continue the LLM loop.
 * - 2026-02-21: Shell tool continuation context now requests minimal LLM result mode (`status`/`exit_code`) and passes agent name for assistant-stream shell SSE attribution.
 * - 2026-02-20: Added Infinite-Etude handoff safeguard to enforce Pedagogue -> Engraver final mention when missing.
 * - 2026-02-16: Added plain-text tool-intent fallback parser in continuation to synthesize executable `tool_calls` when providers return `Calling tool: ...` text.
 * - 2026-02-16: Max tool-hop guardrail now emits UI/tool errors and injects transient LLM context, then continues loop instead of returning.
 * - 2026-02-16: Removed plain-text tool-intent reminder/retry path; continuation now relies only on tool-call loop + hop guardrail.
 * - 2026-02-16: Empty/invalid continuation tool_calls now write a synthetic tool-error result back to memory before continuing the LLM loop.
 * - 2026-02-16: Added bounded retry when continuation returns empty/invalid `tool_calls` so agent loops do not stop silently.
 * - 2026-02-16: Added bounded retry when post-tool continuation returns empty text so tool loops (e.g., load_skill) do not stop silently.
 * - 2026-02-16: Added multi-hop tool continuation support when post-tool LLM responses contain additional tool_calls.
 * - 2026-02-15: Sanitized agent self-mentions in `handleTextResponse` before auto-mentioning to prevent `@self` prefixes.
 * - 2026-02-13: Added per-agent `autoReply` gate; disables sender auto-mention when set to false.
 * - 2026-02-13: Hardened title output normalization with markdown/prefix stripping and low-quality fallback hierarchy.
 * - 2026-02-13: Canceled title-generation calls now exit without fallback renaming.
 * - 2026-02-13: Added deterministic chat-title prompt shaping (role filtering, de-duplication, bounded window).
 * - 2026-02-13: Made chat-title generation explicitly chat-scoped by requiring target `chatId`.
 * - 2026-02-13: Title generation LLM calls now use chat-scoped queue context for cancellation alignment.
 * - 2026-02-13: Added abort-signal guards so stop requests prevent post-tool LLM continuation and suppress cancellation noise.
 * - 2026-02-13: Passed explicit `chatId` through LLM calls for chat-scoped stop cancellation support.
 * - 2026-02-08: Removed stale manual tool-intervention terminology from comments and transient types
 * - 2026-02-06: Renamed resumeLLMAfterManualDecision to continueLLMAfterToolExecution
 * - 2025-01-09: Extracted from events.ts for modular architecture
 */

import type {
  World,
  Agent,
  WorldMessageEvent,
  AgentMessage,
  StorageAPI
} from '../types.js';
import { SenderType } from '../types.js';
import {
  generateId,
  determineSenderType,
  prepareMessagesForLLM,
  getEnvValueFromText,
  getDefaultWorkingDirectory,
} from '../utils.js';
import { parseMessageContent } from '../message-prep.js';
import { createCategoryLogger } from '../logger.js';
import { beginWorldActivity } from '../activity-tracker.js';
import { createStorageWithWrappers } from '../storage/storage-factory.js';
import { generateAgentResponse } from '../llm-manager.js';
import {
  formatShellToolErrorEnvelopeContent,
} from '../shell-cmd-tool.js';
import {
  createTextToolPreview,
  getToolEventPreviewPayload,
  parseToolExecutionEnvelopeContent,
  serializeToolExecutionEnvelope,
  stringifyToolExecutionResult,
} from '../tool-execution-envelope.js';
import {
  createSyntheticAssistantToolResultMessage,
  parseSyntheticAssistantToolResultContent,
} from '../synthetic-assistant-tool-result.js';
import {
  isMessageProcessingCanceledError,
  throwIfMessageProcessingStopped
} from '../message-processing-control.js';
import {
  shouldAutoMention,
  addAutoMention,
  hasAnyMentionAtBeginning,
  removeSelfMentions
} from './mention-logic.js';
import { publishMessage, publishMessageWithId, publishSSE, publishEvent, publishToolEvent, isStreamingEnabled } from './publishers.js';
import { logToolBridge } from './tool-bridge-logging.js';
import {
  acquireAgentTurnResumeLease,
  buildAgentTurnResumeKey,
  clearWaitingForToolResultMetadata,
  isSuccessfulSendMessageDispatchResult,
  readAgentTurnLifecycleFromMessages,
  releaseAgentTurnResumeLease,
  resolveAgentTurnActionForToolName,
  setWaitingForHitlMetadata,
  setWaitingForToolResultMetadata,
  setTerminalTurnMetadata,
} from '../agent-turn.js';
import { runAgentTurnLoop } from './agent-turn-loop.js';

const loggerMemory = createCategoryLogger('memory');
const loggerAgent = createCategoryLogger('agent');
const loggerTurnLimit = createCategoryLogger('turnlimit');
const loggerChatTitle = createCategoryLogger('chattitle');
const loggerAutoMention = createCategoryLogger('automention');
const loggerRestoreResumeTools = createCategoryLogger('chat.restore.resume.tools');
const loggerMessagePublish = createCategoryLogger('message.publish');
const TITLE_PROMPT_MAX_CHARS_PER_TURN = 240;
const TITLE_CONTEXT_WINDOW_TURNS = 3;

// Storage wrapper instance - initialized lazily
let storageWrappers: StorageAPI | null = null;
async function getStorageWrappers(): Promise<StorageAPI> {
  if (!storageWrappers) {
    storageWrappers = await createStorageWithWrappers();
  }
  return storageWrappers!;
}

type ActiveContinuationRun = {
  runId: string;
  depth: number;
};

const activeContinuationRuns = new Map<string, ActiveContinuationRun>();
const continuationRunLoadedSkills = new Map<string, Set<string>>();
const continuationRunShellCommandResults = new Map<string, Map<string, string>>();

function normalizeContinuationChatId(chatId: string | null | undefined): string {
  if (chatId === undefined || chatId === null) {
    return '__null__';
  }
  const normalized = String(chatId).trim();
  return normalized || '__null__';
}

function getContinuationScopeKey(worldId: string, agentId: string, chatId: string | null | undefined): string {
  return `${worldId}::${agentId}::${normalizeContinuationChatId(chatId)}`;
}

function enterContinuationScope(scopeKey: string, runId: string): boolean {
  const activeRun = activeContinuationRuns.get(scopeKey);
  if (!activeRun) {
    activeContinuationRuns.set(scopeKey, { runId, depth: 1 });
    return true;
  }
  if (activeRun.runId !== runId) {
    return false;
  }
  activeRun.depth += 1;
  return true;
}

function leaveContinuationScope(scopeKey: string, runId: string): void {
  const activeRun = activeContinuationRuns.get(scopeKey);
  if (!activeRun || activeRun.runId !== runId) {
    return;
  }
  activeRun.depth -= 1;
  if (activeRun.depth <= 0) {
    activeContinuationRuns.delete(scopeKey);
  }
}

function isContinuationRunActive(runId: string): boolean {
  for (const activeRun of activeContinuationRuns.values()) {
    if (activeRun.runId === runId) {
      return true;
    }
  }
  return false;
}

function getLoadedSkillsForContinuationRun(runId: string): Set<string> {
  const existing = continuationRunLoadedSkills.get(runId);
  if (existing) {
    return existing;
  }
  const created = new Set<string>();
  continuationRunLoadedSkills.set(runId, created);
  return created;
}

function getShellCommandResultsForContinuationRun(runId: string): Map<string, string> {
  const existing = continuationRunShellCommandResults.get(runId);
  if (existing) {
    return existing;
  }
  const created = new Map<string, string>();
  continuationRunShellCommandResults.set(runId, created);
  return created;
}

function normalizeShellCommandParameterList(parameters: unknown): string[] {
  if (!Array.isArray(parameters)) {
    return [];
  }
  return parameters.map((parameter) => String(parameter));
}

function buildShellCommandSignature(toolArgs: Record<string, any>, trustedWorkingDirectory: string): string {
  const command = String(toolArgs?.command || '').trim();
  const parameters = normalizeShellCommandParameterList(toolArgs?.parameters);
  const requestedDirectory = typeof toolArgs?.directory === 'string' && toolArgs.directory.trim()
    ? toolArgs.directory.trim()
    : trustedWorkingDirectory;

  return JSON.stringify({
    command,
    parameters,
    directory: requestedDirectory,
  });
}

function sanitizeToolArgsForEventPayload(toolName: string, toolArgs: Record<string, any>): Record<string, any> {
  if (toolName !== 'shell_cmd' || !toolArgs || typeof toolArgs !== 'object') {
    return toolArgs;
  }
  const sanitized = { ...toolArgs };
  delete sanitized.output_format;
  delete sanitized.output_detail;
  return sanitized;
}

function cleanupContinuationRunState(runId: string): void {
  if (isContinuationRunActive(runId)) {
    return;
  }
  continuationRunLoadedSkills.delete(runId);
  continuationRunShellCommandResults.delete(runId);
}

type TitlePromptMessage = {
  role: 'user' | 'assistant';
  content: string;
};
// Fallback title candidates longer than this are likely full sentences/commands, not titles.
const FALLBACK_TITLE_MAX_CHARS = 60;

const GENERIC_TITLES = new Set([
  'chat',
  'new chat',
  'conversation',
  'untitled',
  'title',
  'assistant chat',
  'user chat',
  'chat title',
  'chat session',
  'session'
]);

function normalizeTitlePromptText(content: string): string {
  return content
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function clipTitlePromptText(content: string): string {
  if (content.length <= TITLE_PROMPT_MAX_CHARS_PER_TURN) {
    return content;
  }
  return `${content.substring(0, TITLE_PROMPT_MAX_CHARS_PER_TURN - 3)}...`;
}

function selectTitleSourceUserMessage(messages: AgentMessage[], content: string): string {
  const contentCandidate = normalizeTitlePromptText(content || '');
  if (contentCandidate) {
    return clipTitlePromptText(contentCandidate);
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.role !== 'user' || typeof message.content !== 'string') {
      continue;
    }
    const normalized = normalizeTitlePromptText(message.content);
    if (!normalized) {
      continue;
    }
    return clipTitlePromptText(normalized);
  }

  return '';
}

function buildTitlePromptMessages(messages: AgentMessage[], content: string): TitlePromptMessage[] {
  // Collect up to TITLE_CONTEXT_WINDOW_TURNS * 2 most recent eligible messages (user + assistant only).
  const maxMessages = TITLE_CONTEXT_WINDOW_TURNS * 2;
  const window: TitlePromptMessage[] = [];

  for (let i = messages.length - 1; i >= 0 && window.length < maxMessages; i -= 1) {
    const message = messages[i];
    if (!message) continue;
    const role = String(message.role || '').toLowerCase();
    if (role !== 'user' && role !== 'assistant') continue;
    if (typeof message.content !== 'string') continue;
    if (role === 'assistant' && parseSyntheticAssistantToolResultContent(message.content)) continue;
    const normalized = normalizeTitlePromptText(message.content);
    if (!normalized) continue;
    window.unshift({
      role: role as 'user' | 'assistant',
      content: clipTitlePromptText(normalized)
    });
  }

  // Apply explicit content override to the last user slot (or append if none found).
  const overrideText = normalizeTitlePromptText(content || '');
  if (overrideText) {
    const clipped = clipTitlePromptText(overrideText);
    let replaced = false;
    for (let i = window.length - 1; i >= 0; i -= 1) {
      if (window[i].role === 'user') {
        window[i] = { role: 'user', content: clipped };
        replaced = true;
        break;
      }
    }
    if (!replaced) {
      window.push({ role: 'user', content: clipped });
    }
  }

  return window;
}

function sanitizeGeneratedTitle(rawTitle: string): string {
  const firstLine = String(rawTitle || '').split(/\r?\n/).find((line) => line.trim()) || '';

  let title = firstLine
    .trim()
    .replace(/^#+\s*/, '')
    .replace(/^[-*]\s+/, '')
    .replace(/^\d+[.)]\s+/, '')
    .replace(/^title\s*[:\-]\s*/i, '')
    .replace(/\\"/g, '')        // strip \" sequences before quote removal
    .replace(/"/g, '')           // strip all remaining double quotes
    .replace(/^['`]+|['`]+$/g, '') // strip leading/trailing single quotes and backticks
    .replace(/[\r\n\*`_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  title = title.replace(/[.!?]+$/g, '').trim();
  return title;
}

function removeEnvVariableFromText(variablesText: unknown, key: string): string {
  const targetKey = String(key || '').trim();
  if (!targetKey) {
    return String(variablesText || '');
  }

  return String(variablesText || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith(`${targetKey}=`))
    .join('\n');
}

function isLowQualityTitle(title: string): boolean {
  if (!title) return true;
  const normalized = title.trim().toLowerCase();
  if (!normalized) return true;
  if (GENERIC_TITLES.has(normalized)) return true;
  if (normalized.length < 3) return true;
  return false;
}

function pickFallbackTitle(content: string, promptMessages: TitlePromptMessage[]): string {
  const contentCandidate = sanitizeGeneratedTitle(content);
  if (!isLowQualityTitle(contentCandidate) && contentCandidate.length <= FALLBACK_TITLE_MAX_CHARS) {
    return contentCandidate;
  }

  for (const message of promptMessages) {
    if (message.role !== 'user') continue;
    const candidate = sanitizeGeneratedTitle(message.content);
    if (!isLowQualityTitle(candidate) && candidate.length <= FALLBACK_TITLE_MAX_CHARS) {
      return candidate;
    }
  }

  // No quality title found — return empty string so the caller retains 'New Chat'
  // and the chat remains eligible for a future auto-title attempt.
  return '';
}

function isTitleGenerationCanceledError(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  if (error instanceof Error && error.name === 'AbortError') return true;
  if (error instanceof Error) {
    const message = error.message || '';
    if (message.includes('LLM call canceled for world')) return true;
    if (message.includes('LLM call canceled for agent')) return true;
    if (message.includes('Message processing canceled by user')) return true;
    return false;
  }
  return false;
}

function parseToolCallArguments(rawArguments: unknown): Record<string, any> {
  if (rawArguments == null) return {};

  if (typeof rawArguments === 'object' && !Array.isArray(rawArguments)) {
    return rawArguments as Record<string, any>;
  }

  if (typeof rawArguments !== 'string') {
    return {};
  }

  const trimmed = rawArguments.trim();
  if (!trimmed) return {};

  const parsed = JSON.parse(trimmed);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return parsed as Record<string, any>;
  }

  return {};
}

function getLoadSkillIdFromToolArgs(toolArgs: Record<string, any>): string | null {
  const skillId = typeof toolArgs?.skill_id === 'string' ? toolArgs.skill_id.trim() : '';
  return skillId || null;
}

function getLoadSkillIdFromRawToolArguments(rawArguments: unknown): string | null {
  const parsed = parseToolCallArguments(rawArguments);
  return getLoadSkillIdFromToolArgs(parsed);
}

function isSuccessfulLoadSkillResult(toolResult: string): boolean {
  const envelope = parseToolExecutionEnvelopeContent(toolResult);
  const normalized = envelope
    ? stringifyToolExecutionResult(envelope.result)
    : String(toolResult || '');
  return /<skill_context\b/i.test(normalized) && !/<error>/i.test(normalized);
}

function formatToolErrorContent(options: {
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

function appendSyntheticAssistantToolResult(options: {
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

function resolveShellContinuationLlmResultMode(options: {
  toolName: string;
}): 'minimal' | 'verbose' {
  if (options.toolName !== 'shell_cmd') {
    return 'verbose';
  }

  return 'minimal';
}

function getLatestUnresolvedToolCallForChat(
  agent: Agent,
  chatId: string
): { assistantMessage: AgentMessage; toolCall: { id: string; function: { name: string; arguments: unknown } } } | null {
  const chatMessages = agent.memory.filter((message) => message.chatId === chatId);
  if (!chatMessages.length) {
    return null;
  }

  const completedToolCallIds = new Set<string>();
  for (const message of chatMessages) {
    if (message.role === 'tool' && typeof message.tool_call_id === 'string' && message.tool_call_id.trim()) {
      completedToolCallIds.add(message.tool_call_id.trim());
    }
  }

  for (let index = chatMessages.length - 1; index >= 0; index--) {
    const message = chatMessages[index];
    if (message.role !== 'assistant' || !Array.isArray(message.tool_calls) || message.tool_calls.length === 0) {
      continue;
    }

    for (const toolCall of message.tool_calls) {
      const toolCallId = String((toolCall as any)?.id || '').trim();
      const toolName = String((toolCall as any)?.function?.name || '').trim();
      if (!toolCallId || !toolName) {
        continue;
      }
      if (completedToolCallIds.has(toolCallId)) {
        continue;
      }

      return {
        assistantMessage: message,
        toolCall: {
          id: toolCallId,
          function: {
            name: toolName,
            arguments: (toolCall as any)?.function?.arguments,
          },
        },
      };
    }
  }

  return null;
}

export async function resumePendingToolCallsForChat(
  world: World,
  chatId: string,
  targetAssistantMessageId?: string
): Promise<number> {
  if (!chatId) {
    return 0;
  }

  const resumeStartedAt = Date.now();
  loggerRestoreResumeTools.debug('Resume pending tool calls started', {
    worldId: world.id,
    chatId,
    targetAssistantMessageId: targetAssistantMessageId || null,
  });

  const { getMCPToolsForWorld } = await import('../mcp-server-registry.js');
  const mcpTools = await getMCPToolsForWorld(world.id);
  const storage = await getStorageWrappers();

  let resumedCount = 0;

  for (const agent of world.agents.values()) {
    const pending = getLatestUnresolvedToolCallForChat(agent, chatId);
    if (!pending) {
      loggerRestoreResumeTools.debug('Resume pending tool calls skipped agent with no pending tool call', {
        worldId: world.id,
        chatId,
        agentId: agent.id,
      });
      continue;
    }

    if (
      targetAssistantMessageId
      && pending.assistantMessage.messageId
      && pending.assistantMessage.messageId !== targetAssistantMessageId
    ) {
      loggerRestoreResumeTools.debug('Resume pending tool calls skipped assistant target mismatch', {
        worldId: world.id,
        chatId,
        agentId: agent.id,
        pendingAssistantMessageId: pending.assistantMessage.messageId || null,
        targetAssistantMessageId,
      });
      continue;
    }

    const { assistantMessage, toolCall } = pending;
    const turnId = String(
      assistantMessage.agentTurn?.turnId
      || assistantMessage.replyToMessageId
      || assistantMessage.messageId
      || ''
    ).trim() || 'unknown-turn';
    const turnLifecycle = readAgentTurnLifecycleFromMessages(agent.memory, {
      turnId,
      chatId,
    });
    if (turnLifecycle.status === 'terminal') {
      loggerRestoreResumeTools.debug('Resume pending tool calls skipped terminal turn', {
        worldId: world.id,
        chatId,
        agentId: agent.id,
        toolCallId: toolCall.id,
        turnId,
        outcome: turnLifecycle.outcome,
      });
      continue;
    }
    const resumeKey = buildAgentTurnResumeKey({
      worldId: world.id,
      agentId: agent.id,
      chatId,
      assistantMessageId: String(assistantMessage.messageId || '').trim() || 'unknown-assistant-message',
      toolCallId: toolCall.id,
    });
    if (!acquireAgentTurnResumeLease(resumeKey)) {
      loggerRestoreResumeTools.debug('Resume pending tool calls skipped active resume lease', {
        worldId: world.id,
        chatId,
        agentId: agent.id,
        toolCallId: toolCall.id,
        resumeKey,
      });
      continue;
    }

    try {
    loggerRestoreResumeTools.debug('Resume pending tool calls found pending tool call', {
      worldId: world.id,
      chatId,
      agentId: agent.id,
      toolName: toolCall.function.name,
      toolCallId: toolCall.id,
      assistantMessageId: assistantMessage.messageId || null,
      resumeKey,
    });
    let toolArgs: Record<string, any> = {};
    try {
      toolArgs = parseToolCallArguments(toolCall.function.arguments);
    } catch (parseError) {
      loggerRestoreResumeTools.warn('Resume pending tool calls failed to parse tool arguments', {
        worldId: world.id,
        chatId,
        agentId: agent.id,
        toolName: toolCall.function.name,
        toolCallId: toolCall.id,
        error: parseError instanceof Error ? parseError.message : String(parseError),
      });
      const errorContent = toolCall.function.name === 'shell_cmd' || toolCall.function.name === 'load_skill'
        ? formatToolErrorContent({
          toolName: toolCall.function.name,
          toolCallId: toolCall.id,
          toolArgs,
          error: `Invalid JSON in tool arguments: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
          failureReason: 'validation_error',
        })
        : `Error executing tool: Invalid JSON in tool arguments: ${parseError instanceof Error ? parseError.message : String(parseError)}`;
      const toolErrorMessage: AgentMessage = {
        role: 'tool',
        content: errorContent,
        tool_call_id: toolCall.id,
        sender: agent.id,
        createdAt: new Date(),
        chatId,
        messageId: generateId(),
        replyToMessageId: assistantMessage.messageId,
        agentId: agent.id,
      };
      agent.memory.push(toolErrorMessage);
      appendSyntheticAssistantToolResult({
        world,
        agent,
        serializedToolResult: toolErrorMessage.content,
        sourceMessageId: toolErrorMessage.messageId!,
        replyToMessageId: toolErrorMessage.replyToMessageId,
        chatId,
      });
      if (assistantMessage.toolCallStatus) {
        assistantMessage.toolCallStatus[toolCall.id] = { complete: true, result: errorContent };
      }
      clearWaitingForToolResultMetadata(assistantMessage);
      await storage.saveAgent(world.id, agent);
      await continueLLMAfterToolExecution(world, agent, chatId, {
        turnId,
      });
      loggerRestoreResumeTools.debug('Resume pending tool calls continued after parse error', {
        worldId: world.id,
        chatId,
        agentId: agent.id,
        toolCallId: toolCall.id,
      });
      resumedCount += 1;
      continue;
    }

    const toolDef = mcpTools[toolCall.function.name];
    if (!toolDef) {
      loggerRestoreResumeTools.warn('Resume pending tool calls tool definition missing', {
        worldId: world.id,
        chatId,
        agentId: agent.id,
        toolName: toolCall.function.name,
        toolCallId: toolCall.id,
      });
      const errorContent = toolCall.function.name === 'shell_cmd' || toolCall.function.name === 'load_skill'
        ? formatToolErrorContent({
          toolName: toolCall.function.name,
          toolCallId: toolCall.id,
          toolArgs,
          error: `Tool not found: ${toolCall.function.name}`,
          failureReason: 'execution_error',
        })
        : `Error executing tool: Tool not found: ${toolCall.function.name}`;
      const toolErrorMessage: AgentMessage = {
        role: 'tool',
        content: errorContent,
        tool_call_id: toolCall.id,
        sender: agent.id,
        createdAt: new Date(),
        chatId,
        messageId: generateId(),
        replyToMessageId: assistantMessage.messageId,
        agentId: agent.id,
      };
      agent.memory.push(toolErrorMessage);
      appendSyntheticAssistantToolResult({
        world,
        agent,
        serializedToolResult: toolErrorMessage.content,
        sourceMessageId: toolErrorMessage.messageId!,
        replyToMessageId: toolErrorMessage.replyToMessageId,
        chatId,
      });
      if (assistantMessage.toolCallStatus) {
        assistantMessage.toolCallStatus[toolCall.id] = { complete: true, result: errorContent };
      }
      clearWaitingForToolResultMetadata(assistantMessage);
      publishToolEvent(world, {
        agentName: agent.id,
        type: 'tool-error',
        messageId: toolCall.id,
        chatId,
        toolExecution: {
          toolName: toolCall.function.name,
          toolCallId: toolCall.id,
          input: toolArgs,
          error: `Tool not found: ${toolCall.function.name}`,
        },
      });
      await storage.saveAgent(world.id, agent);
      await continueLLMAfterToolExecution(world, agent, chatId, {
        turnId,
      });
      loggerRestoreResumeTools.debug('Resume pending tool calls continued after missing tool definition', {
        worldId: world.id,
        chatId,
        agentId: agent.id,
        toolCallId: toolCall.id,
      });
      resumedCount += 1;
      continue;
    }

    loggerRestoreResumeTools.debug('Resume pending tool calls executing tool', {
      worldId: world.id,
      chatId,
      agentId: agent.id,
      toolName: toolCall.function.name,
      toolCallId: toolCall.id,
    });
    let seededLoadSkillIdForContinuation: string | null = null;

    publishToolEvent(world, {
      agentName: agent.id,
      type: 'tool-start',
      messageId: toolCall.id,
      chatId,
      toolExecution: {
        toolName: toolCall.function.name,
        toolCallId: toolCall.id,
        input: toolArgs,
      },
    });

    try {
      const trustedWorkingDirectory = String(
        getEnvValueFromText(world.variables, 'working_directory') || getDefaultWorkingDirectory()
      ).trim() || getDefaultWorkingDirectory();

      const toolContext = {
        world,
        messages: agent.memory,
        toolCallId: toolCall.id,
        chatId,
        workingDirectory: trustedWorkingDirectory,
        agentName: agent.id,
        llmResultMode: resolveShellContinuationLlmResultMode({
          toolName: toolCall.function.name,
        }),
        persistToolEnvelope: toolCall.function.name === 'shell_cmd'
          || toolCall.function.name === 'load_skill'
          || toolCall.function.name === 'web_fetch',
      };

      const toolResult = await toolDef.execute(toolArgs, undefined, undefined, toolContext);
      const serializedToolResult = typeof toolResult === 'string'
        ? toolResult
        : JSON.stringify(toolResult) ?? String(toolResult);
      if (toolCall.function.name === 'load_skill') {
        const requestedSkillId = getLoadSkillIdFromToolArgs(toolArgs);
        if (requestedSkillId && isSuccessfulLoadSkillResult(serializedToolResult)) {
          seededLoadSkillIdForContinuation = requestedSkillId;
        }
      }

      const toolResultMessage: AgentMessage = {
        role: 'tool',
        content: serializedToolResult,
        tool_call_id: toolCall.id,
        sender: agent.id,
        createdAt: new Date(),
        chatId,
        messageId: generateId(),
        replyToMessageId: assistantMessage.messageId,
        agentId: agent.id,
      };
      agent.memory.push(toolResultMessage);
      appendSyntheticAssistantToolResult({
        world,
        agent,
        serializedToolResult,
        sourceMessageId: toolResultMessage.messageId!,
        replyToMessageId: toolResultMessage.replyToMessageId,
        chatId,
      });

      if (assistantMessage.toolCallStatus) {
        assistantMessage.toolCallStatus[toolCall.id] = {
          complete: true,
          result: serializedToolResult,
        };
      }
      clearWaitingForToolResultMetadata(assistantMessage);

      const toolEnvelope = parseToolExecutionEnvelopeContent(serializedToolResult);
      const toolEventPreview = getToolEventPreviewPayload(serializedToolResult);
      const toolEventResult = toolEnvelope ? toolEnvelope.result : toolResult;
      publishToolEvent(world, {
        agentName: agent.id,
        type: 'tool-result',
        messageId: toolCall.id,
        chatId,
        toolExecution: {
          toolName: toolCall.function.name,
          toolCallId: toolCall.id,
          input: toolArgs,
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
        },
      });
      loggerRestoreResumeTools.debug('Resume pending tool calls tool execution result persisted', {
        worldId: world.id,
        chatId,
        agentId: agent.id,
        toolName: toolCall.function.name,
        toolCallId: toolCall.id,
        resultSize: serializedToolResult.length,
      });

      if (toolCall.function.name === 'send_message' && isSuccessfulSendMessageDispatchResult(serializedToolResult)) {
        setTerminalTurnMetadata(assistantMessage, {
          turnId,
          source: 'restore',
          action: 'agent_handoff',
          outcome: 'handoff_dispatched',
        });
        await storage.saveAgent(world.id, agent);
        loggerRestoreResumeTools.debug('Resume pending tool calls completed terminal handoff without continuation', {
          worldId: world.id,
          chatId,
          agentId: agent.id,
          toolCallId: toolCall.id,
          turnId,
        });
        resumedCount += 1;
        continue;
      }
    } catch (toolError) {
      loggerRestoreResumeTools.warn('Resume pending tool calls tool execution failed', {
        worldId: world.id,
        chatId,
        agentId: agent.id,
        toolName: toolCall.function.name,
        toolCallId: toolCall.id,
        error: toolError instanceof Error ? toolError.message : String(toolError),
      });
      const errorContent = formatToolErrorContent({
        toolName: toolCall.function.name,
        toolCallId: toolCall.id,
        toolArgs,
        error: toolError,
      });
      const toolErrorMessage: AgentMessage = {
        role: 'tool',
        content: errorContent,
        tool_call_id: toolCall.id,
        sender: agent.id,
        createdAt: new Date(),
        chatId,
        messageId: generateId(),
        replyToMessageId: assistantMessage.messageId,
        agentId: agent.id,
      };
      agent.memory.push(toolErrorMessage);
      appendSyntheticAssistantToolResult({
        world,
        agent,
        serializedToolResult: toolErrorMessage.content,
        sourceMessageId: toolErrorMessage.messageId!,
        replyToMessageId: toolErrorMessage.replyToMessageId,
        chatId,
      });

      if (assistantMessage.toolCallStatus) {
        assistantMessage.toolCallStatus[toolCall.id] = {
          complete: true,
          result: errorContent,
        };
      }
      clearWaitingForToolResultMetadata(assistantMessage);

      publishToolEvent(world, {
        agentName: agent.id,
        type: 'tool-error',
        messageId: toolCall.id,
        chatId,
        toolExecution: {
          toolName: toolCall.function.name,
          toolCallId: toolCall.id,
          input: toolArgs,
          error: toolError instanceof Error ? toolError.message : String(toolError),
        },
      });
    }

    await storage.saveAgent(world.id, agent);
    loggerRestoreResumeTools.debug('Resume pending tool calls saved agent state', {
      worldId: world.id,
      chatId,
      agentId: agent.id,
      toolCallId: toolCall.id,
    });
    await continueLLMAfterToolExecution(world, agent, chatId, {
      turnId,
      ...(seededLoadSkillIdForContinuation ? { preloadedSkillIds: [seededLoadSkillIdForContinuation] } : {}),
    });
    loggerRestoreResumeTools.debug('Resume pending tool calls continued LLM after tool execution', {
      worldId: world.id,
      chatId,
      agentId: agent.id,
      toolCallId: toolCall.id,
      ...(seededLoadSkillIdForContinuation ? { seededLoadSkillIdForContinuation } : {}),
    });
    resumedCount += 1;
    } finally {
      releaseAgentTurnResumeLease(resumeKey);
    }
  }

  loggerRestoreResumeTools.debug('Resume pending tool calls completed', {
    worldId: world.id,
    chatId,
    resumedCount,
    elapsedMs: Date.now() - resumeStartedAt,
  });

  return resumedCount;
}

function decodeControlTokens(value: string): string {
  return value.replace(/<ctrl(\d+)>/gi, (_match, codeRaw) => {
    const code = Number(codeRaw);
    if (!Number.isFinite(code)) return '';
    try {
      return String.fromCharCode(code);
    } catch {
      return '';
    }
  });
}

function parseLooseScalar(rawValue: string): unknown {
  const decoded = decodeControlTokens(String(rawValue || '').trim());
  if (!decoded) return '';

  if (
    (decoded.startsWith('"') && decoded.endsWith('"'))
    || (decoded.startsWith("'") && decoded.endsWith("'"))
  ) {
    return decoded.slice(1, -1);
  }

  if (/^(true|false)$/i.test(decoded)) {
    return decoded.toLowerCase() === 'true';
  }

  if (/^null$/i.test(decoded)) {
    return null;
  }

  if (/^-?\d+(\.\d+)?$/.test(decoded)) {
    return Number(decoded);
  }

  return decoded;
}

function splitTopLevelCommaSeparated(body: string): string[] {
  const parts: string[] = [];
  let buffer = '';
  let quote: '"' | "'" | null = null;
  let escapeNext = false;

  for (let index = 0; index < body.length; index += 1) {
    const current = body[index];

    if (escapeNext) {
      buffer += current;
      escapeNext = false;
      continue;
    }

    if (current === '\\') {
      buffer += current;
      escapeNext = true;
      continue;
    }

    if ((current === '"' || current === "'")) {
      if (!quote) {
        quote = current;
      } else if (quote === current) {
        quote = null;
      }
      buffer += current;
      continue;
    }

    if (current === ',' && !quote) {
      if (buffer.trim()) {
        parts.push(buffer.trim());
      }
      buffer = '';
      continue;
    }

    buffer += current;
  }

  if (buffer.trim()) {
    parts.push(buffer.trim());
  }

  return parts;
}

function parseLooseObjectLiteral(rawObject: string): Record<string, unknown> | null {
  const decoded = decodeControlTokens(rawObject.trim());
  if (!decoded.startsWith('{') || !decoded.endsWith('}')) {
    return null;
  }

  const innerBody = decoded.slice(1, -1).trim();
  if (!innerBody) {
    return {};
  }

  const entries = splitTopLevelCommaSeparated(innerBody);
  const parsed: Record<string, unknown> = {};

  for (const entry of entries) {
    const separatorIndex = entry.indexOf(':');
    if (separatorIndex <= 0) {
      continue;
    }

    const keyRaw = entry.slice(0, separatorIndex).trim();
    const valueRaw = entry.slice(separatorIndex + 1).trim();
    if (!keyRaw) continue;

    const normalizedKey = keyRaw.replace(/^['"]|['"]$/g, '').trim();
    if (!normalizedKey) continue;

    parsed[normalizedKey] = parseLooseScalar(valueRaw);
  }

  return parsed;
}

function parsePlainTextToolIntent(content: string): {
  toolName: string;
  toolArgs: Record<string, unknown>;
} | null {
  const normalized = String(content || '').trim();
  if (!normalized) return null;

  const match = normalized.match(/^calling\s+tool\s*:\s*([a-zA-Z0-9_\-]+)\s*(\{[\s\S]*\})?\s*$/i);
  if (!match) {
    return null;
  }

  const toolName = String(match[1] || '').trim();
  if (!toolName) {
    return null;
  }

  const rawArgs = String(match[2] || '').trim();
  if (!rawArgs) {
    return { toolName, toolArgs: {} };
  }

  try {
    const strictParsed = parseToolCallArguments(rawArgs);
    return { toolName, toolArgs: strictParsed };
  } catch {
    const looseParsed = parseLooseObjectLiteral(rawArgs);
    if (looseParsed && typeof looseParsed === 'object' && !Array.isArray(looseParsed)) {
      return { toolName, toolArgs: looseParsed };
    }
  }

  return { toolName, toolArgs: {} };
}

/**
 * Save incoming message to agent memory with auto-save
 * Uses explicit chatId from the message event for concurrency-safe saving
 */
export async function saveIncomingMessageToMemory(
  world: World,
  agent: Agent,
  messageEvent: WorldMessageEvent
): Promise<void> {
  try {
    if (messageEvent.sender?.toLowerCase() === agent.id.toLowerCase()) return;

    if (!messageEvent.messageId) {
      loggerMemory.error('Message missing messageId', {
        agentId: agent.id,
        sender: messageEvent.sender,
        worldId: world.id
      });
    }

    // Derive chatId from the message event for concurrency-safe processing
    // This ensures messages stay bound to their originating session
    const targetChatId = typeof messageEvent.chatId === 'string' ? messageEvent.chatId.trim() : '';

    if (!targetChatId) {
      loggerMemory.error('Saving message without explicit chatId', {
        worldId: world.id,
        agentId: agent.id,
        messageId: messageEvent.messageId
      });
      return;
    }

    // Parse message content to detect enhanced format (e.g., tool results)
    const { message: parsedMessage } = parseMessageContent(messageEvent.content, 'user');

    if (messageEvent.messageId && targetChatId) {
      const duplicate = agent.memory.some((message) =>
        message.chatId === targetChatId && message.messageId === messageEvent.messageId
      );
      if (duplicate) {
        loggerMemory.debug('Skipping duplicate incoming message memory save', {
          worldId: world.id,
          agentId: agent.id,
          chatId: targetChatId,
          messageId: messageEvent.messageId,
        });
        return;
      }
    }

    const userMessage: AgentMessage = {
      ...parsedMessage,
      sender: messageEvent.sender,
      createdAt: messageEvent.timestamp,
      chatId: targetChatId,
      messageId: messageEvent.messageId,
      replyToMessageId: messageEvent.replyToMessageId,
      agentId: agent.id
    };

    agent.memory.push(userMessage);

    try {
      const storage = await getStorageWrappers();
      await storage.saveAgent(world.id, agent);
      loggerMemory.debug('Agent saved successfully', {
        agentId: agent.id,
        messageId: messageEvent.messageId
      });
    } catch (error) {
      loggerMemory.error('Failed to auto-save memory', { agentId: agent.id, error: error instanceof Error ? error.message : error });
    }
  } catch (error) {
    loggerMemory.error('Could not save incoming message to memory', { agentId: agent.id, error: error instanceof Error ? error.message : error });
  }
}

/**
 * Continue LLM execution after tool execution
 * Calls the LLM with the updated memory (including tool result) to continue the execution loop
 * Used for auto-execution flow where tools are executed automatically
 */
export async function continueLLMAfterToolExecution(
  world: World,
  agent: Agent,
  chatId?: string | null,
  options?: {
    abortSignal?: AbortSignal;
    hopCount?: number;
    emptyTextRetryCount?: number;
    emptyToolCallRetryCount?: number;
    continuationRunId?: string;
    transientContinuationInstruction?: string;
    preloadedSkillIds?: string[];
    turnId?: string;
  }
): Promise<void> {
  const continuationChatId = typeof chatId === 'string' ? chatId.trim() : '';
  if (!continuationChatId) {
    throw new Error(`continueLLMAfterToolExecution: explicit chatId is required for agent ${agent.id}`);
  }
  const targetChatId = continuationChatId;
  const turnId = String(options?.turnId || '').trim() || generateId();
  const existingTurnLifecycle = readAgentTurnLifecycleFromMessages(agent.memory, {
    turnId,
    chatId: targetChatId,
  });
  if (existingTurnLifecycle.status === 'terminal') {
    loggerAgent.debug('Skipping continuation because turn is already terminal', {
      worldId: world.id,
      agentId: agent.id,
      chatId: targetChatId,
      turnId,
      outcome: existingTurnLifecycle.outcome,
    });
    return;
  }
  const continuationRunId = String(options?.continuationRunId || '').trim() || generateId();
  const continuationScopeKey = getContinuationScopeKey(world.id, agent.id, continuationChatId);
  const enteredScope = enterContinuationScope(continuationScopeKey, continuationRunId);
  if (!enteredScope) {
    loggerAgent.debug('Skipping duplicate continuation run while another run is active', {
      worldId: world.id,
      agentId: agent.id,
      chatId: continuationChatId,
    });
    logToolBridge('CONTINUE SKIP_INFLIGHT', {
      worldId: world.id,
      agentId: agent.id,
      chatId: continuationChatId,
      responseType: 'skipped',
    });
    return;
  }

  const completeActivity = beginWorldActivity(world, `agent:${agent.id}`, targetChatId);
  const loadedSkillsForRun = getLoadedSkillsForContinuationRun(continuationRunId);
  const shellCommandResultsForRun = getShellCommandResultsForContinuationRun(continuationRunId);
  for (const preloadedSkillId of options?.preloadedSkillIds || []) {
    const normalizedSkillId = String(preloadedSkillId || '').trim();
    if (normalizedSkillId) {
      loadedSkillsForRun.add(normalizedSkillId);
    }
  }
  try {
    let hopCount = options?.hopCount ?? 0;
    const maxToolHops = 50;
    const emptyTextRetryCount = options?.emptyTextRetryCount ?? 0;
    const maxEmptyTextRetries = 2;
    const emptyToolCallRetryCount = options?.emptyToolCallRetryCount ?? 0;
    const maxEmptyToolCallRetries = 2;
    let transientGuardrailError: string | undefined = options?.transientContinuationInstruction;

    if (hopCount > maxToolHops) {
      const guardrailErrorMessage = `[Error] Tool continuation exceeded ${maxToolHops} hops. Guardrail triggered; reporting error and continuing.`;
      const guardrailToolCallId = generateId();

      loggerAgent.error('Tool continuation hop limit reached; reporting error and continuing loop', {
        agentId: agent.id,
        chatId: targetChatId,
        hopCount,
        maxToolHops,
      });

      publishEvent(world, 'system', {
        message: guardrailErrorMessage,
        type: 'error',
      }, targetChatId);

      publishToolEvent(world, {
        agentName: agent.id,
        type: 'tool-error',
        messageId: guardrailToolCallId,
        chatId: targetChatId,
        toolExecution: {
          toolName: '__tool_continuation_guardrail__',
          toolCallId: guardrailToolCallId,
          error: guardrailErrorMessage,
        },
      });

      logToolBridge('CONTINUE HOP_GUARDRAIL', {
        worldId: world.id,
        agentId: agent.id,
        chatId: targetChatId,
        hopCount,
        maxToolHops,
        guardrailToolCallId,
      });

      transientGuardrailError =
        `System error: tool continuation exceeded ${maxToolHops} hops and was guardrailed. Continue the task and avoid unnecessary additional tool calls.`;
      hopCount = 0;
    }

    throwIfMessageProcessingStopped(options?.abortSignal);

    // Filter memory to current chat only
    const currentChatMessages = agent.memory.filter(m => m.chatId === targetChatId);

    loggerAgent.debug('Continuing LLM execution with tool result in memory', {
      agentId: agent.id,
      targetChatId,
      totalMemoryLength: agent.memory.length,
      currentChatLength: currentChatMessages.length,
      lastFewMessages: currentChatMessages.slice(-5).map(m => ({
        role: m.role,
        hasContent: !!m.content,
        hasToolCalls: !!m.tool_calls,
        toolCallId: m.tool_call_id
      }))
    });

    // Increment LLM call count
    agent.llmCallCount++;
    agent.lastLLMCall = new Date();

    try {
      const storage = await getStorageWrappers();
      await storage.saveAgent(world.id, agent);
    } catch (error) {
      loggerAgent.error('Failed to save agent after LLM call increment', {
        worldId: world.id,
        chatId: targetChatId,
        agentId: agent.id,
        error: error instanceof Error ? error.message : error
      });
    }

    let messageId = '';
    let llmResponse: import('../types.js').LLMResponse | null = null;
    let continuationStoppedOnEmptyText = false;

    await runAgentTurnLoop({
      world,
      agent,
      chatId: targetChatId,
      abortSignal: options?.abortSignal,
      label: 'continuation',
      emptyTextRetryLimit: maxEmptyTextRetries,
      initialEmptyTextRetryCount: emptyTextRetryCount,
      buildMessages: async ({ transientInstruction }) => {
        // Tool execution already happened before this function was called.
        // Prepare the next LLM view from persisted chat memory on each hop.
        const messages = await prepareMessagesForLLM(
          world.id,
          agent,
          targetChatId ?? null
        );
        throwIfMessageProcessingStopped(options?.abortSignal);

        const effectiveInstruction = transientInstruction || transientGuardrailError;
        transientGuardrailError = undefined;
        const llmMessages = effectiveInstruction
          ? [
            ...messages,
            {
              role: 'user',
              content: effectiveInstruction,
            },
          ]
          : messages;

        loggerAgent.debug('Calling LLM with memory after tool execution', {
          agentId: agent.id,
          targetChatId,
          preparedMessageCount: llmMessages.length,
          systemMessagesInPrepared: llmMessages.filter(m => m.role === 'system').length,
          userMessages: llmMessages.filter(m => m.role === 'user').length,
          assistantMessages: llmMessages.filter(m => m.role === 'assistant').length,
          toolMessages: llmMessages.filter(m => m.role === 'tool').length,
          lastThreeMessages: llmMessages.slice(-3).map((m: any) => ({
            role: m.role,
            hasContent: !!m.content,
            contentPreview: m.content?.substring(0, 100),
            hasToolCalls: !!m.tool_calls,
            toolCallId: m.tool_call_id
          }))
        });

        return llmMessages as any;
      },
      parsePlainTextToolIntent,
      onTextResponse: async ({ responseText, messageId: loopMessageId }) => {
        messageId = loopMessageId;
        llmResponse = {
          type: 'text',
          content: responseText,
        } as import('../types.js').LLMResponse;
      },
      onToolCallsResponse: async ({ llmResponse: loopResponse, messageId: loopMessageId }) => {
        messageId = loopMessageId;
        llmResponse = loopResponse;
      },
      onEmptyTextStop: async ({ retryCount }) => {
        continuationStoppedOnEmptyText = true;
        loggerAgent.warn('Post-tool continuation returned empty text; stopping continuation loop', {
          agentId: agent.id,
          chatId: targetChatId,
          hopCount,
          emptyTextRetryCount: retryCount,
          maxEmptyTextRetries,
        });
        publishEvent(world, 'system', {
          message: '[Warning] Agent returned empty follow-up after tool execution. Please retry or refine the prompt.',
          type: 'warning'
        }, targetChatId);

        logToolBridge('CONTINUE EMPTY_TEXT_STOP', {
          worldId: world.id,
          agentId: agent.id,
          chatId: targetChatId,
          emptyTextRetryCount: retryCount,
          maxEmptyTextRetries,
        });
      },
    });
    throwIfMessageProcessingStopped(options?.abortSignal);

    if (continuationStoppedOnEmptyText || !llmResponse) {
      return;
    }

    loggerAgent.debug('LLM response received after tool execution', {
      agentId: agent.id,
      responseType: llmResponse.type,
      hasContent: !!llmResponse.content,
      toolCallCount: llmResponse.tool_calls?.length || 0
    });

    logToolBridge('LLM -> CONTINUE', {
      worldId: world.id,
      agentId: agent.id,
      chatId: targetChatId,
      responseType: llmResponse.type,
      hasContent: !!llmResponse.content,
      contentPreview: String(llmResponse.content || '').substring(0, 200),
      toolCallCount: Array.isArray(llmResponse.tool_calls) ? llmResponse.tool_calls.length : 0,
    });

    if (llmResponse.type === 'text' && typeof llmResponse.content === 'string' && llmResponse.content.trim()) {
      const parsedPlainTextToolIntent = parsePlainTextToolIntent(llmResponse.content);
      if (parsedPlainTextToolIntent) {
        const syntheticToolCallId = generateId();
        loggerAgent.warn('Continuation received plain-text tool intent; synthesizing tool_call fallback', {
          agentId: agent.id,
          chatId: targetChatId,
          toolName: parsedPlainTextToolIntent.toolName,
          syntheticToolCallId,
        });

        logToolBridge('CONTINUE PLAINTEXT_TOOL_INTENT_FALLBACK', {
          worldId: world.id,
          agentId: agent.id,
          chatId: targetChatId,
          toolName: parsedPlainTextToolIntent.toolName,
          toolArgs: parsedPlainTextToolIntent.toolArgs,
          syntheticToolCallId,
        });

        llmResponse = {
          type: 'tool_calls',
          content: llmResponse.content,
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
            content: llmResponse.content,
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

    if (llmResponse.type === 'tool_calls') {
      const returnedToolCalls = Array.isArray(llmResponse.tool_calls) ? llmResponse.tool_calls : [];
      const validReturnedToolCalls = returnedToolCalls.filter((tc: any) => {
        const name = String(tc?.function?.name || '').trim();
        return name.length > 0;
      });
      const executableToolCalls = validReturnedToolCalls.slice(0, 1);

      if (returnedToolCalls.length > validReturnedToolCalls.length) {
        loggerAgent.warn('Continuation LLM returned invalid tool calls; dropping calls with empty names', {
          agentId: agent.id,
          returnedToolCallCount: returnedToolCalls.length,
          validToolCallCount: validReturnedToolCalls.length,
          emptyToolCallRetryCount,
          maxEmptyToolCallRetries,
        });
      }

      if (validReturnedToolCalls.length > executableToolCalls.length) {
        loggerAgent.warn('Continuation LLM returned multiple tool calls; processing first call only', {
          agentId: agent.id,
          returnedToolCallCount: validReturnedToolCalls.length,
          processedToolCallIds: executableToolCalls.map(tc => tc.id),
          droppedToolCallIds: validReturnedToolCalls.slice(1).map(tc => tc.id)
        });
      }

      const toolCall = executableToolCalls[0];
      if (!toolCall) {
        const firstInvalidToolCall = returnedToolCalls[0] as any;
        const toolCallId = String(firstInvalidToolCall?.id || generateId());
        const rawToolName = String(firstInvalidToolCall?.function?.name || '').trim();
        const fallbackToolName = rawToolName || '__invalid_tool_call__';
        const fallbackToolArguments = typeof firstInvalidToolCall?.function?.arguments === 'string'
          ? firstInvalidToolCall.function.arguments
          : '{}';
        const malformedToolErrorContent = rawToolName
          ? rawToolName === 'shell_cmd' || rawToolName === 'load_skill'
            ? formatToolErrorContent({
              toolName: rawToolName,
              toolCallId,
              toolArgs: {},
              error: `Invalid tool call payload for '${rawToolName}'`,
              failureReason: 'validation_error',
            })
            : `Error executing tool: Invalid tool call payload for '${rawToolName}'`
          : 'Error executing tool: Invalid tool call payload - empty or missing tool name';

        loggerAgent.warn('Continuation returned tool_calls without executable tool; reporting tool error back to LLM context', {
          agentId: agent.id,
          messageId,
          targetChatId,
          emptyToolCallRetryCount,
          maxEmptyToolCallRetries,
          returnedToolCallCount: returnedToolCalls.length,
          toolCallId,
          fallbackToolName,
        });

        const assistantMalformedToolCallMessage: AgentMessage = {
          role: 'assistant',
          content: llmResponse.content || `Calling tool: ${fallbackToolName}`,
          sender: agent.id,
          createdAt: new Date(),
          chatId: targetChatId,
          messageId,
          tool_calls: [{
            id: toolCallId,
            type: 'function',
            function: {
              name: fallbackToolName,
              arguments: fallbackToolArguments,
            },
          }] as any,
          agentId: agent.id,
          toolCallStatus: {
            [toolCallId]: {
              complete: true,
              result: malformedToolErrorContent,
            },
          },
        };
        agent.memory.push(assistantMalformedToolCallMessage);

        const malformedToolCallEvent: WorldMessageEvent = {
          content: assistantMalformedToolCallMessage.content || '',
          sender: agent.id,
          timestamp: assistantMalformedToolCallMessage.createdAt || new Date(),
          messageId: assistantMalformedToolCallMessage.messageId!,
          chatId: assistantMalformedToolCallMessage.chatId,
        };
        (malformedToolCallEvent as any).role = 'assistant';
        (malformedToolCallEvent as any).tool_calls = assistantMalformedToolCallMessage.tool_calls;
        (malformedToolCallEvent as any).toolCallStatus = assistantMalformedToolCallMessage.toolCallStatus;
        world.eventEmitter.emit('message', malformedToolCallEvent);

        const malformedToolResultMessage: AgentMessage = {
          role: 'tool',
          content: malformedToolErrorContent,
          tool_call_id: toolCallId,
          sender: agent.id,
          createdAt: new Date(),
          chatId: targetChatId,
          messageId: generateId(),
          replyToMessageId: messageId,
          agentId: agent.id,
        };
        agent.memory.push(malformedToolResultMessage);
        appendSyntheticAssistantToolResult({
          world,
          agent,
          serializedToolResult: malformedToolResultMessage.content,
          sourceMessageId: malformedToolResultMessage.messageId!,
          replyToMessageId: malformedToolResultMessage.replyToMessageId,
          chatId: targetChatId,
        });

        publishToolEvent(world, {
          agentName: agent.id,
          type: 'tool-error',
          messageId: toolCallId,
          chatId: targetChatId,
          toolExecution: {
            toolName: fallbackToolName,
            toolCallId,
            input: fallbackToolArguments,
            error: malformedToolErrorContent,
          },
        });

        logToolBridge('CONTINUE TOOL_CALLS_INVALID', {
          worldId: world.id,
          agentId: agent.id,
          chatId: targetChatId,
          toolCallId,
          fallbackToolName,
          emptyToolCallRetryCount,
          maxEmptyToolCallRetries,
        });

        try {
          const storage = await getStorageWrappers();
          await storage.saveAgent(world.id, agent);
        } catch (error) {
          loggerMemory.error('Failed to save malformed continuation tool error context', {
            worldId: world.id,
            chatId: targetChatId,
            agentId: agent.id,
            toolCallId,
            error: error instanceof Error ? error.message : String(error),
          });
        }

        if (emptyToolCallRetryCount < maxEmptyToolCallRetries) {
          throwIfMessageProcessingStopped(options?.abortSignal);
          await continueLLMAfterToolExecution(world, agent, targetChatId, {
            ...options,
            hopCount: hopCount + 1,
            emptyToolCallRetryCount: emptyToolCallRetryCount + 1,
            continuationRunId,
          });
          return;
        }

        publishEvent(world, 'system', {
          message: '[Warning] Agent repeatedly returned invalid tool calls after tool execution. Please refine the prompt.',
          type: 'warning',
        }, targetChatId);
        return;
      }

      let requestedLoadSkillId: string | null = null;
      if (toolCall.function.name === 'load_skill') {
        try {
          requestedLoadSkillId = getLoadSkillIdFromRawToolArguments(toolCall.function.arguments);
        } catch {
          requestedLoadSkillId = null;
        }
      }

      if (requestedLoadSkillId && loadedSkillsForRun.has(requestedLoadSkillId)) {
        loggerAgent.debug('Suppressing duplicate load_skill call in continuation run', {
          worldId: world.id,
          agentId: agent.id,
          chatId: targetChatId,
          continuationRunId,
          skillId: requestedLoadSkillId,
          toolCallId: toolCall.id,
        });

        throwIfMessageProcessingStopped(options?.abortSignal);
        await continueLLMAfterToolExecution(world, agent, targetChatId, {
          ...options,
          hopCount: hopCount + 1,
          continuationRunId,
          transientContinuationInstruction:
            `System notice: Suppressed duplicate load_skill("${requestedLoadSkillId}") in this run because the skill was already loaded. Continue the task using the existing skill context without calling load_skill again for this skill.`,
        });
        return;
      }

      const assistantToolCallMessage: AgentMessage = {
        role: 'assistant',
        content: llmResponse.content || `Calling tool: ${toolCall.function.name}`,
        sender: agent.id,
        createdAt: new Date(),
        chatId: targetChatId,
        messageId,
        tool_calls: executableToolCalls as any,
        agentId: agent.id,
        toolCallStatus: executableToolCalls.reduce((acc, tc) => {
          acc[tc.id] = { complete: false, result: null };
          return acc;
        }, {} as Record<string, { complete: boolean; result: any }>),
      };
      const pendingAction = resolveAgentTurnActionForToolName(toolCall.function.name);
      const waitingMetadataParams = {
        turnId,
        source: 'continuation' as const,
        action: pendingAction,
        resumeKey: buildAgentTurnResumeKey({
          worldId: world.id,
          agentId: agent.id,
          chatId: targetChatId,
          assistantMessageId: messageId,
          toolCallId: toolCall.id,
        }),
      };
      if (pendingAction === 'hitl_request') {
        setWaitingForHitlMetadata(assistantToolCallMessage, waitingMetadataParams);
      } else {
        setWaitingForToolResultMetadata(assistantToolCallMessage, waitingMetadataParams);
      }

      agent.memory.push(assistantToolCallMessage);

      try {
        const storage = await getStorageWrappers();
        await storage.saveAgent(world.id, agent);
      } catch (error) {
        loggerMemory.error('Failed to save assistant tool_call message during continuation', {
          worldId: world.id,
          chatId: targetChatId,
          agentId: agent.id,
          toolCallId: toolCall.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      const toolCallEvent: WorldMessageEvent = {
        content: assistantToolCallMessage.content || '',
        sender: agent.id,
        timestamp: assistantToolCallMessage.createdAt || new Date(),
        messageId: assistantToolCallMessage.messageId!,
        chatId: assistantToolCallMessage.chatId,
      };
      (toolCallEvent as any).role = 'assistant';
      (toolCallEvent as any).tool_calls = assistantToolCallMessage.tool_calls;
      (toolCallEvent as any).toolCallStatus = assistantToolCallMessage.toolCallStatus;
      world.eventEmitter.emit('message', toolCallEvent);

      const { getMCPToolsForWorld } = await import('../mcp-server-registry.js');
      const mcpTools = await getMCPToolsForWorld(world.id);
      const toolDef = mcpTools[toolCall.function.name];
      const trustedWorkingDirectory = String(
        getEnvValueFromText(world.variables, 'working_directory') || getDefaultWorkingDirectory()
      ).trim() || getDefaultWorkingDirectory();

      if (!toolDef) {
        const missingToolResult: AgentMessage = {
          role: 'tool',
          content: toolCall.function.name === 'shell_cmd' || toolCall.function.name === 'load_skill'
            ? formatToolErrorContent({
              toolName: toolCall.function.name,
              toolCallId: toolCall.id,
              toolArgs: {},
              error: `Tool not found: ${toolCall.function.name}`,
              failureReason: 'execution_error',
            })
            : `Error executing tool: Tool not found: ${toolCall.function.name}`,
          tool_call_id: toolCall.id,
          sender: agent.id,
          createdAt: new Date(),
          chatId: targetChatId,
          messageId: generateId(),
          replyToMessageId: messageId,
          agentId: agent.id,
        };
        agent.memory.push(missingToolResult);
        appendSyntheticAssistantToolResult({
          world,
          agent,
          serializedToolResult: missingToolResult.content,
          sourceMessageId: missingToolResult.messageId!,
          replyToMessageId: missingToolResult.replyToMessageId,
          chatId: targetChatId,
        });

        if (assistantToolCallMessage.toolCallStatus) {
          assistantToolCallMessage.toolCallStatus[toolCall.id] = {
            complete: true,
            result: missingToolResult.content,
          };
        }
        clearWaitingForToolResultMetadata(assistantToolCallMessage);

        publishToolEvent(world, {
          agentName: agent.id,
          type: 'tool-error',
          messageId: toolCall.id,
          chatId: targetChatId,
          toolExecution: {
            toolName: toolCall.function.name,
            toolCallId: toolCall.id,
            error: `Tool not found: ${toolCall.function.name}`,
          },
        });

        const storage = await getStorageWrappers();
        await storage.saveAgent(world.id, agent);
        await continueLLMAfterToolExecution(world, agent, targetChatId, {
          ...options,
          hopCount: hopCount + 1,
          continuationRunId,
        });
        return;
      }

      let toolArgs: Record<string, any> = {};
      try {
        toolArgs = parseToolCallArguments(toolCall.function.arguments);
        requestedLoadSkillId = requestedLoadSkillId || getLoadSkillIdFromToolArgs(toolArgs);
      } catch (parseError) {
        const parseErrorResult: AgentMessage = {
          role: 'tool',
          content: toolCall.function.name === 'shell_cmd' || toolCall.function.name === 'load_skill'
            ? formatToolErrorContent({
              toolName: toolCall.function.name,
              toolCallId: toolCall.id,
              toolArgs,
              error: `Invalid JSON in tool arguments: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
              failureReason: 'validation_error',
            })
            : `Error executing tool: Invalid JSON in tool arguments: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
          tool_call_id: toolCall.id,
          sender: agent.id,
          createdAt: new Date(),
          chatId: targetChatId,
          messageId: generateId(),
          replyToMessageId: messageId,
          agentId: agent.id,
        };
        agent.memory.push(parseErrorResult);
        appendSyntheticAssistantToolResult({
          world,
          agent,
          serializedToolResult: parseErrorResult.content,
          sourceMessageId: parseErrorResult.messageId!,
          replyToMessageId: parseErrorResult.replyToMessageId,
          chatId: targetChatId,
        });

        if (assistantToolCallMessage.toolCallStatus) {
          assistantToolCallMessage.toolCallStatus[toolCall.id] = {
            complete: true,
            result: parseErrorResult.content,
          };
        }
        clearWaitingForToolResultMetadata(assistantToolCallMessage);

        publishToolEvent(world, {
          agentName: agent.id,
          type: 'tool-error',
          messageId: toolCall.id,
          chatId: targetChatId,
          toolExecution: {
            toolName: toolCall.function.name,
            toolCallId: toolCall.id,
            error: parseError instanceof Error ? parseError.message : String(parseError),
          },
        });

        const storage = await getStorageWrappers();
        await storage.saveAgent(world.id, agent);
        await continueLLMAfterToolExecution(world, agent, targetChatId, {
          ...options,
          hopCount: hopCount + 1,
          continuationRunId,
        });
        return;
      }

      let shellCommandSignature: string | null = null;
      const sanitizedToolArgsForEventPayload = sanitizeToolArgsForEventPayload(toolCall.function.name, toolArgs);
      if (toolCall.function.name === 'shell_cmd') {
        shellCommandSignature = buildShellCommandSignature(toolArgs, trustedWorkingDirectory);
        const reusedShellCommandResult = shellCommandResultsForRun.get(shellCommandSignature);
        if (reusedShellCommandResult !== undefined) {
          loggerAgent.debug('Suppressing duplicate shell_cmd call in continuation run', {
            worldId: world.id,
            agentId: agent.id,
            chatId: targetChatId,
            continuationRunId,
            toolCallId: toolCall.id,
          });

          const reusedToolResultMessage: AgentMessage = {
            role: 'tool',
            content: reusedShellCommandResult,
            tool_call_id: toolCall.id,
            sender: agent.id,
            createdAt: new Date(),
            chatId: targetChatId,
            messageId: generateId(),
            replyToMessageId: messageId,
            agentId: agent.id,
          };
          agent.memory.push(reusedToolResultMessage);
          appendSyntheticAssistantToolResult({
            world,
            agent,
            serializedToolResult: reusedShellCommandResult,
            sourceMessageId: reusedToolResultMessage.messageId!,
            replyToMessageId: reusedToolResultMessage.replyToMessageId,
            chatId: targetChatId,
          });

          if (assistantToolCallMessage.toolCallStatus) {
            assistantToolCallMessage.toolCallStatus[toolCall.id] = {
              complete: true,
              result: reusedShellCommandResult,
            };
          }
          clearWaitingForToolResultMetadata(assistantToolCallMessage);

          const reusedToolEnvelope = parseToolExecutionEnvelopeContent(reusedShellCommandResult);
          const reusedToolEventPreview = getToolEventPreviewPayload(reusedShellCommandResult);
          const reusedToolEventResult = reusedToolEnvelope ? reusedToolEnvelope.result : reusedShellCommandResult;
          publishToolEvent(world, {
            agentName: agent.id,
            type: 'tool-result',
            messageId: toolCall.id,
            chatId: targetChatId,
            toolExecution: {
              toolName: toolCall.function.name,
              toolCallId: toolCall.id,
              input: sanitizedToolArgsForEventPayload,
              ...(reusedToolEventPreview !== undefined ? { preview: reusedToolEventPreview } : {}),
              result: reusedToolEventResult,
              resultType: Array.isArray(reusedToolEventResult)
                ? 'array'
                : reusedToolEventResult === null
                  ? 'null'
                  : typeof reusedToolEventResult === 'string'
                    ? 'string'
                    : 'object',
              resultSize: reusedShellCommandResult.length,
              metadata: { reusedFromContinuationRun: true },
            },
          });

          const storage = await getStorageWrappers();
          await storage.saveAgent(world.id, agent);
          await continueLLMAfterToolExecution(world, agent, targetChatId, {
            ...options,
            hopCount: hopCount + 1,
            continuationRunId,
            transientContinuationInstruction:
              'System notice: Suppressed duplicate shell_cmd call in this continuation run and reused its previous result. Continue from the existing command output without rerunning the same command.',
          });
          return;
        }
      }

      publishToolEvent(world, {
        agentName: agent.id,
        type: 'tool-start',
        messageId: toolCall.id,
        chatId: targetChatId,
        toolExecution: {
          toolName: toolCall.function.name,
          toolCallId: toolCall.id,
          input: sanitizedToolArgsForEventPayload,
          metadata: {
            isStreaming: isStreamingEnabled(),
          },
        },
      });

      try {
        const toolContext = {
          world,
          messages: agent.memory,
          toolCallId: toolCall.id,
          chatId: targetChatId,
          abortSignal: options?.abortSignal,
          workingDirectory: trustedWorkingDirectory,
          agentName: agent.id,
          llmResultMode: resolveShellContinuationLlmResultMode({
            toolName: toolCall.function.name,
          }),
          persistToolEnvelope: toolCall.function.name === 'shell_cmd'
            || toolCall.function.name === 'load_skill'
            || toolCall.function.name === 'web_fetch',
        };

        const toolResult = await toolDef.execute(toolArgs, undefined, undefined, toolContext);
        const serializedToolResult = typeof toolResult === 'string'
          ? toolResult
          : JSON.stringify(toolResult) ?? String(toolResult);

        if (
          toolCall.function.name === 'load_skill'
          && requestedLoadSkillId
          && isSuccessfulLoadSkillResult(serializedToolResult)
        ) {
          loadedSkillsForRun.add(requestedLoadSkillId);
        }
        if (toolCall.function.name === 'shell_cmd' && shellCommandSignature) {
          shellCommandResultsForRun.set(shellCommandSignature, serializedToolResult);
        }

        const toolResultMessage: AgentMessage = {
          role: 'tool',
          content: serializedToolResult,
          tool_call_id: toolCall.id,
          sender: agent.id,
          createdAt: new Date(),
          chatId: targetChatId,
          messageId: generateId(),
          replyToMessageId: messageId,
          agentId: agent.id,
        };
        agent.memory.push(toolResultMessage);
        appendSyntheticAssistantToolResult({
          world,
          agent,
          serializedToolResult,
          sourceMessageId: toolResultMessage.messageId!,
          replyToMessageId: toolResultMessage.replyToMessageId,
          chatId: targetChatId,
        });

        if (assistantToolCallMessage.toolCallStatus) {
          assistantToolCallMessage.toolCallStatus[toolCall.id] = {
            complete: true,
            result: serializedToolResult,
          };
        }
        clearWaitingForToolResultMetadata(assistantToolCallMessage);

        const toolEnvelope = parseToolExecutionEnvelopeContent(serializedToolResult);
        const toolEventPreview = getToolEventPreviewPayload(serializedToolResult);
        const toolEventResult = toolEnvelope ? toolEnvelope.result : toolResult;
        publishToolEvent(world, {
          agentName: agent.id,
          type: 'tool-result',
          messageId: toolCall.id,
          chatId: targetChatId,
          toolExecution: {
            toolName: toolCall.function.name,
            toolCallId: toolCall.id,
            input: sanitizedToolArgsForEventPayload,
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
          },
        });
      } catch (toolError) {
        const errorContent = formatToolErrorContent({
          toolName: toolCall.function.name,
          toolCallId: toolCall.id,
          toolArgs,
          error: toolError,
        });
        const toolErrorMessage: AgentMessage = {
          role: 'tool',
          content: errorContent,
          tool_call_id: toolCall.id,
          sender: agent.id,
          createdAt: new Date(),
          chatId: targetChatId,
          messageId: generateId(),
          replyToMessageId: messageId,
          agentId: agent.id,
        };
        agent.memory.push(toolErrorMessage);
        appendSyntheticAssistantToolResult({
          world,
          agent,
          serializedToolResult: toolErrorMessage.content,
          sourceMessageId: toolErrorMessage.messageId!,
          replyToMessageId: toolErrorMessage.replyToMessageId,
          chatId: targetChatId,
        });

        if (assistantToolCallMessage.toolCallStatus) {
          assistantToolCallMessage.toolCallStatus[toolCall.id] = {
            complete: true,
            result: errorContent,
          };
        }
        clearWaitingForToolResultMetadata(assistantToolCallMessage);

        publishToolEvent(world, {
          agentName: agent.id,
          type: 'tool-error',
          messageId: toolCall.id,
          chatId: targetChatId,
          toolExecution: {
            toolName: toolCall.function.name,
            toolCallId: toolCall.id,
            input: sanitizedToolArgsForEventPayload,
            error: toolError instanceof Error ? toolError.message : String(toolError),
          },
        });
      }

      try {
        const storage = await getStorageWrappers();
        await storage.saveAgent(world.id, agent);
      } catch (error) {
        loggerMemory.error('Failed to save continuation tool result to memory', {
          worldId: world.id,
          chatId: targetChatId,
          agentId: agent.id,
          toolCallId: toolCall.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      if (toolCall.function.name === 'send_message' && isSuccessfulSendMessageDispatchResult(
        String(
          agent.memory[agent.memory.length - 1]?.role === 'tool'
            ? agent.memory[agent.memory.length - 1]?.content || ''
            : ''
        )
      )) {
        setTerminalTurnMetadata(assistantToolCallMessage, {
          turnId,
          source: 'continuation',
          action: 'agent_handoff',
          outcome: 'handoff_dispatched',
        });
        try {
          const storage = await getStorageWrappers();
          await storage.saveAgent(world.id, agent);
        } catch (error) {
          loggerMemory.error('Failed to save continuation handoff terminal metadata', {
            worldId: world.id,
            chatId: targetChatId,
            agentId: agent.id,
            toolCallId: toolCall.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      throwIfMessageProcessingStopped(options?.abortSignal);
      await continueLLMAfterToolExecution(world, agent, targetChatId, {
        ...options,
        hopCount: hopCount + 1,
        continuationRunId,
        turnId,
      });
      return;
    }

    if (llmResponse.type !== 'text' || !llmResponse.content) {
      if (llmResponse.type === 'text' && !llmResponse.content && emptyTextRetryCount < maxEmptyTextRetries) {
        loggerAgent.warn('Post-tool continuation returned empty text; retrying continuation call', {
          agentId: agent.id,
          chatId: targetChatId,
          hopCount,
          emptyTextRetryCount,
          maxEmptyTextRetries,
        });

        logToolBridge('CONTINUE EMPTY_TEXT_RETRY', {
          worldId: world.id,
          agentId: agent.id,
          chatId: targetChatId,
          emptyTextRetryCount,
          maxEmptyTextRetries,
        });

        throwIfMessageProcessingStopped(options?.abortSignal);
        await continueLLMAfterToolExecution(world, agent, targetChatId, {
          ...options,
          emptyTextRetryCount: emptyTextRetryCount + 1,
          continuationRunId,
        });
        return;
      }

      loggerAgent.warn('LLM response after tool execution is not text or empty - no message will be published', {
        agentId: agent.id,
        responseType: llmResponse.type,
        hasContent: !!llmResponse.content,
        contentLength: llmResponse.content?.length || 0,
        hasToolCalls: !!llmResponse.tool_calls,
        toolCallCount: llmResponse.tool_calls?.length || 0,
        emptyTextRetryCount,
        maxEmptyTextRetries,
      });

      if (llmResponse.type === 'text' && !llmResponse.content && emptyTextRetryCount >= maxEmptyTextRetries) {
        publishEvent(world, 'system', {
          message: '[Warning] Agent returned empty follow-up after tool execution. Please retry or refine the prompt.',
          type: 'warning'
        }, targetChatId);

        logToolBridge('CONTINUE EMPTY_TEXT_STOP', {
          worldId: world.id,
          agentId: agent.id,
          chatId: targetChatId,
          emptyTextRetryCount,
          maxEmptyTextRetries,
        });
      }

      return;
    }

    const responseText = llmResponse.content;
    const sanitizedResponse = removeSelfMentions(responseText, agent.id);

    const assistantMessage: AgentMessage = {
      role: 'assistant',
      content: sanitizedResponse,
      messageId,
      sender: agent.id,
      createdAt: new Date(),
      chatId: targetChatId,
      agentId: agent.id
    };
    setTerminalTurnMetadata(assistantMessage, {
      turnId,
      source: 'continuation',
      action: 'final_response',
      outcome: 'completed',
    });

    // Save response to agent memory with all required fields
    agent.memory.push(assistantMessage);

    try {
      const storage = await getStorageWrappers();
      await storage.saveAgent(world.id, agent);
      loggerMemory.debug('Agent response saved to memory after tool execution', {
        agentId: agent.id,
        messageId,
        memorySize: agent.memory.length
      });
    } catch (error) {
      loggerMemory.error('Failed to save agent response after tool execution', {
        worldId: world.id,
        chatId: targetChatId,
        agentId: agent.id,
        messageId,
        error: error instanceof Error ? error.message : String(error)
      });
    }

    // Publish the response message using the same messageId from streaming
    publishMessageWithId(world, sanitizedResponse, agent.id, messageId, targetChatId, undefined);

    loggerMessagePublish.debug('Published assistant response message', {
      worldId: world.id,
      chatId: targetChatId,
      agentId: agent.id,
      messageId,
      turnId: messageId,
      responseLength: sanitizedResponse.length,
      source: 'continuation',
    });

    loggerAgent.debug('Agent response published after tool execution', {
      agentId: agent.id,
      messageId,
      responseLength: sanitizedResponse.length
    });
  } catch (error) {
    if (isMessageProcessingCanceledError(error) || options?.abortSignal?.aborted) {
      loggerAgent.info('Skipped continuation after stop request', {
        agentId: agent.id,
        chatId: targetChatId,
        error: error instanceof Error ? error.message : String(error)
      });

      logToolBridge('CONTINUE CANCELED', {
        worldId: world.id,
        agentId: agent.id,
        chatId: targetChatId,
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    loggerAgent.error('Failed to continue LLM after tool execution', {
      worldId: world.id,
      chatId: targetChatId,
      agentId: agent.id,
      error: error instanceof Error ? error.message : error
    });
    publishEvent(world, 'system', {
      message: `[Error] ${(error as Error).message}`,
      type: 'error'
    }, targetChatId);

    logToolBridge('CONTINUE ERROR', {
      worldId: world.id,
      agentId: agent.id,
      chatId: targetChatId,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    leaveContinuationScope(continuationScopeKey, continuationRunId);
    cleanupContinuationRunState(continuationRunId);
    completeActivity();
  }
}

/**
 * Handle text response from LLM (extracted for clarity)
 * @param chatId - Explicit chat ID for concurrency-safe processing. When omitted, `messageEvent.chatId` is used.
 */
export async function handleTextResponse(
  world: World,
  agent: Agent,
  responseText: string,
  messageId: string,
  messageEvent: WorldMessageEvent,
  chatId?: string | null,
  options?: {
    turnId?: string;
    source?: 'direct' | 'continuation' | 'restore';
  }
): Promise<void> {
  const explicitChatId = typeof chatId === 'string' ? chatId.trim() : '';
  const messageChatId = typeof messageEvent.chatId === 'string' ? messageEvent.chatId.trim() : '';
  const targetChatId = explicitChatId || messageChatId;
  if (!targetChatId) {
    throw new Error(`handleTextResponse: explicit chatId is required for agent ${agent.id}`);
  }

  const sanitizedResponse = removeSelfMentions(responseText, agent.id);

  // const needsInfiniteEtudePedagogueHandoff =
  //   world.id === 'infinite-etude' &&
  //   agent.id === 'madame-pedagogue' &&
  //   !/^\s*@monsieur-engraver\b/im.test(sanitizedResponse);

  // const responseWithRequiredHandoff = needsInfiniteEtudePedagogueHandoff
  //   ? `${sanitizedResponse.trimEnd()}\n\n@monsieur-engraver please render this.`
  //   : sanitizedResponse;

  // Apply auto-mention logic if needed
  let finalResponse = sanitizedResponse; // responseWithRequiredHandoff;
  if (agent.autoReply !== false && shouldAutoMention(sanitizedResponse, messageEvent.sender, agent.id)) {
    finalResponse = addAutoMention(sanitizedResponse, messageEvent.sender);
    loggerAutoMention.debug('Auto-mention applied', {
      agentId: agent.id,
      originalSender: messageEvent.sender,
      responsePreview: finalResponse.substring(0, 100)
    });
  } else {
    loggerAutoMention.debug('Auto-mention not needed', {
      agentId: agent.id,
      autoReply: agent.autoReply !== false,
      hasAnyMention: hasAnyMentionAtBeginning(sanitizedResponse)
    });
  }

  const assistantMessage: AgentMessage = {
    role: 'assistant',
    content: finalResponse,
    messageId,
    sender: agent.id,
    createdAt: new Date(),
    chatId: targetChatId,
    replyToMessageId: messageEvent.messageId,
    agentId: agent.id
  };
  setTerminalTurnMetadata(assistantMessage, {
    turnId: String(options?.turnId || messageEvent.messageId || messageId).trim() || messageId,
    source: options?.source || 'direct',
    action: 'final_response',
    outcome: 'completed',
  });

  // Save response to agent memory with all required fields
  agent.memory.push(assistantMessage);

  try {
    const storage = await getStorageWrappers();
    await storage.saveAgent(world.id, agent);
    loggerMemory.debug('Agent response saved to memory', {
      agentId: agent.id,
      messageId,
      memorySize: agent.memory.length
    });
  } catch (error) {
    loggerMemory.error('Failed to save agent response', {
      worldId: world.id,
      chatId: targetChatId,
      agentId: agent.id,
      messageId,
      error: error instanceof Error ? error.message : String(error)
    });
  }

  // Publish the response message using the same messageId from streaming
  publishMessageWithId(world, finalResponse, agent.id, messageId, targetChatId, messageEvent.messageId);

  loggerMessagePublish.debug('Published assistant response message', {
    worldId: world.id,
    chatId: targetChatId,
    agentId: agent.id,
    messageId,
    turnId: messageId,
    replyToMessageId: messageEvent.messageId,
    responseLength: finalResponse.length,
    source: 'direct',
  });

  loggerAgent.debug('Agent response published', {
    agentId: agent.id,
    messageId,
    responseLength: finalResponse.length
  });
}

/**
 * Reset LLM call count for human/world messages with persistence
 */
export async function resetLLMCallCountIfNeeded(
  world: World,
  agent: Agent,
  messageEvent: WorldMessageEvent
): Promise<void> {
  const senderType = determineSenderType(messageEvent.sender);

  if ((senderType === SenderType.HUMAN || senderType === SenderType.WORLD) && agent.llmCallCount > 0) {
    loggerTurnLimit.debug('Resetting LLM call count', { agentId: agent.id, oldCount: agent.llmCallCount });
    agent.llmCallCount = 0;

    try {
      const storage = await getStorageWrappers();
      await storage.saveAgent(world.id, agent);
    } catch (error) {
      loggerTurnLimit.warn('Failed to auto-save agent after turn limit reset', { agentId: agent.id, error: error instanceof Error ? error.message : error });
    }
  }
}

/**
 * Generate chat title from message content with LLM support and fallback
 */
export async function generateChatTitleFromMessages(
  world: World,
  content: string,
  targetChatId: string | null
): Promise<string> {
  loggerChatTitle.debug('Generating chat title', {
    worldId: world.id,
    targetChatId,
    contentStart: content.substring(0, 50)
  });

  let title = '';
  let messages: AgentMessage[] = [];
  let promptMessages: TitlePromptMessage[] = [];
  let titleGenerationCanceled = false;

  const maxLength = 100; // Max title length

  try {
    const firstAgent = Array.from(world.agents.values())[0];

    const storage = await getStorageWrappers();
    // Load messages for the target chat only, not all messages.
    messages = targetChatId ? await storage.getMemory(world.id, targetChatId) : [];
    promptMessages = buildTitlePromptMessages(messages, content);

    loggerChatTitle.debug('Calling LLM for title generation', {
      messageCount: messages.length,
      promptMessageCount: promptMessages.length,
      targetChatId,
      provider: world.chatLLMProvider || firstAgent?.provider,
      model: world.chatLLMModel || firstAgent?.model
    });

    const tempAgent: any = {
      provider: world.chatLLMProvider || firstAgent?.provider || 'openai',
      model: world.chatLLMModel || firstAgent?.model || 'gpt-4',
      systemPrompt: 'You are a concise title generator. Given a conversation snippet, output a short noun-phrase title (3–6 words, Title Case). Rules: output the title only — no explanation, no punctuation at the end; never copy the user message verbatim; if the user message begins with @agentname, that is an agent mention — base the title on the topic or task after it, not on the mention itself.',
      maxTokens: 20,
    };

    const userPrompt = {
      role: 'user' as const,
      content: `Generate a short title (3–6 words, Title Case) for this conversation.\nRules:\n- Do NOT copy the user message word-for-word.\n- An @name prefix (e.g. "@gemini") is an agent mention — base the title on the topic or task, not the mention.\n- Output the title only.\n\n${promptMessages.map(msg => `-${msg.role}: ${msg.content}`).join('\n')}`
    };

    const titleGenerationWorld: World = {
      ...world,
      // Force reasoning_effort=none so thinking models (e.g. Gemini 2.5 Flash)
      // don't exhaust the maxOutputTokens budget on thinking before outputting text.
      variables: removeEnvVariableFromText(world.variables, 'reasoning_effort') + '\nreasoning_effort=none',
    };

    const { response: titleResponse } = await generateAgentResponse(
      titleGenerationWorld,
      tempAgent,
      [userPrompt],
      undefined,
      true,
      targetChatId
    ); // skipTools = true for title generation
    // LLMResponse is an object {type, content?} — extract the text content.
    title = (titleResponse as any)?.type === 'text' ? ((titleResponse as any)?.content ?? '') : '';
    loggerChatTitle.debug('LLM generated title', { rawTitle: title });

  } catch (error) {
    if (isTitleGenerationCanceledError(error)) {
      titleGenerationCanceled = true;
      loggerChatTitle.info('Title generation canceled', {
        worldId: world.id,
        targetChatId,
        error: error instanceof Error ? error.message : error
      });
    } else {
      loggerChatTitle.warn('Failed to generate LLM title, using fallback', {
        error: error instanceof Error ? error.message : error
      });
    }
  }

  if (titleGenerationCanceled) {
    return '';
  }

  title = sanitizeGeneratedTitle(title);

  if (isLowQualityTitle(title)) {
    title = pickFallbackTitle(content, promptMessages);
  }

  title = sanitizeGeneratedTitle(title);

  // Truncate if too long
  if (title.length > maxLength) {
    title = title.substring(0, maxLength - 3) + '...';
  }

  loggerChatTitle.debug('Final processed title', { title, originalLength: title.length });

  return title;
}
