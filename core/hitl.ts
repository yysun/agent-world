/**
 * Human-in-the-Loop (HITL) Runtime
 *
 * Purpose:
 * - Provide a world-scoped request/response flow for structured `ask_user_input` prompts.
 *
 * Key Features:
 * - Emits structured tool-progress events carrying `questions[]` HITL payloads.
 * - Resolves pending requests when renderer/API submits structured answers.
 * - Exposes unresolved prompts through a deterministic read model.
 * - Maintains a compatibility wrapper for older single-option approval callers.
 *
 * Implementation Notes:
 * - Requests are keyed by `(worldId, requestId)` to avoid cross-world collisions.
 * - Prompt read model is deterministic and scoped by `(worldId, chatId)`.
 * - Runtime is in-memory and process-local by design.
 *
 * Recent Changes:
 * - 2026-04-24: Migrated the runtime prompt model to llm-runtime-compatible `ask_user_input` questions/answers while keeping legacy single-option compatibility helpers.
 * - 2026-03-12: Relaxed the hard `requestId === toolCallId` invariant so durable approval prompts can keep distinct request and owning-tool identities.
 * - 2026-03-06: Removed `world.currentChatId` fallback from HITL option requests; interactive requests now require explicit `chatId`.
 * - 2026-02-26: Replaced direct `[hitl]` console traces with categorized structured logger events (`hitl`) for env-controlled filtering.
 * - 2026-02-25: Added HITL runtime trace logs for request emission, replay, and resolution lifecycle diagnostics.
 * - 2026-02-24: Removed HITL `system` event emission/replay and switched to tool-progress prompt payloads.
 * - 2026-02-24: Added `listPendingHitlPromptEvents` to expose scoped pending HITL prompt payloads for web chat-switch replay.
 * - 2026-02-24: Removed timeout auto-resolution and added deterministic replay helpers for unresolved HITL requests.
 * - 2026-02-20: Enforced global options-only HITL runtime by removing input-mode request/response paths.
 * - 2026-02-14: Added initial generic HITL option request/response runtime.
 */

import { type AgentMessage, type World } from './types.js';
import { isHitlToolName } from './hitl-tool-names.js';
import { createCategoryLogger } from './logger.js';
import { generateId } from './utils.js';

export interface HitlOption {
  id: string;
  label: string;
  description?: string;
}

export type HitlPromptType = 'single-select' | 'multiple-select';

export interface HitlQuestion {
  id: string;
  header: string;
  question: string;
  options: HitlOption[];
}

export interface HitlAnswer {
  questionId: string;
  optionIds: string[];
}

export interface HitlInputRequest {
  requestId?: string;
  type?: HitlPromptType;
  allowSkip?: boolean;
  questions: HitlQuestion[];
  chatId?: string | null;
  metadata?: Record<string, unknown>;
  agentName?: string | null;
}

export interface HitlOptionRequest {
  requestId?: string;
  title: string;
  message: string;
  options: HitlOption[];
  chatId?: string | null;
  timeoutMs?: number;
  defaultOptionId?: string;
  metadata?: Record<string, unknown>;
  agentName?: string | null;
}

export interface HitlOptionResolution {
  requestId: string;
  worldId: string;
  chatId: string | null;
  optionId: string;
  answers: HitlAnswer[];
  skipped: boolean;
  source: 'user' | 'timeout';
}

export type HitlResponseResolution = {
  requestId: string;
  worldId: string;
  chatId: string | null;
  answers: HitlAnswer[];
  optionId: string | null;
  skipped: boolean;
  source: 'user' | 'timeout';
};

interface PendingHitlOptionRequest {
  worldId: string;
  requestId: string;
  chatId: string | null;
  questionIds: Set<string>;
  optionIdsByQuestion: Map<string, Set<string>>;
  sequence: number;
  prompt: {
    requestId: string;
    type: HitlPromptType;
    allowSkip: boolean;
    questions: HitlQuestion[];
    metadata: Record<string, unknown> | null;
    agentName: string | null;
    toolName: string;
    toolCallId: string;
  };
  metadata: Record<string, unknown> | null;
  resolve: (resolution: HitlResponseResolution) => void;
}

const pendingHitlRequests = new Map<string, PendingHitlOptionRequest>();
let pendingRequestSequence = 0;
const loggerHitl = createCategoryLogger('hitl');

function getPendingKey(worldId: string, requestId: string): string {
  return `${worldId}::${requestId}`;
}

function normalizeOptions(options: HitlOption[]): HitlOption[] {
  const seen = new Set<string>();
  const normalized: HitlOption[] = [];
  for (const option of options) {
    const id = String(option?.id || '').trim();
    const label = String(option?.label || '').trim();
    if (!id || !label || seen.has(id)) {
      continue;
    }
    seen.add(id);
    normalized.push({
      id,
      label,
      description: option?.description ? String(option.description) : undefined,
    });
  }
  return normalized;
}

function normalizeExplicitChatId(chatId: string | null | undefined): string | null {
  if (chatId === undefined || chatId === null) {
    return null;
  }
  const normalized = String(chatId).trim();
  return normalized || null;
}

function resolvePendingRequest(params: {
  pendingKey: string;
  pending: PendingHitlOptionRequest;
  resolution: HitlResponseResolution;
}): void {
  const { pendingKey, pending, resolution } = params;
  pendingHitlRequests.delete(pendingKey);
  pending.resolve(resolution);
}

function normalizeChatId(chatId: string | null | undefined): string | null {
  if (chatId === undefined || chatId === null) {
    return null;
  }
  const normalized = String(chatId).trim();
  return normalized || null;
}

function resolveHitlAgentName(world: World, requestedAgentName: string | null | undefined): string | null {
  const explicit = String(requestedAgentName || '').trim();
  if (explicit) {
    return explicit;
  }

  const worldMainAgent = String(world?.mainAgent || '').trim();
  if (worldMainAgent) {
    return worldMainAgent;
  }

  return null;
}

function emitPendingRequest(world: World, pending: PendingHitlOptionRequest): void {
  const metadata = pending.prompt.metadata || null;
  const toolExecutionMetadata = {
    ...(metadata && typeof metadata === 'object' ? metadata : {}),
    hitlPrompt: {
      requestId: pending.prompt.requestId,
      type: pending.prompt.type,
      allowSkip: pending.prompt.allowSkip,
      questions: pending.prompt.questions,
      metadata,
      agentName: pending.prompt.agentName,
      chatId: pending.chatId,
      toolCallId: pending.prompt.toolCallId,
    },
  };

  world.eventEmitter.emit('world', {
    agentName: pending.prompt.agentName || 'system',
    type: 'tool-progress',
    messageId: pending.prompt.toolCallId,
    chatId: pending.chatId,
    toolExecution: {
      toolName: pending.prompt.toolName,
      toolCallId: pending.prompt.toolCallId,
      metadata: toolExecutionMetadata,
    },
  });

  loggerHitl.debug('HITL pending request emitted', {
    worldId: world.id,
    chatId: pending.chatId || null,
    requestId: pending.prompt.requestId,
    toolName: pending.prompt.toolName,
    toolCallId: pending.prompt.toolCallId,
  });
}

function getSortedPendingRequestsForScope(worldId: string, chatId?: string | null): PendingHitlOptionRequest[] {
  const normalizedChatId = normalizeChatId(chatId);
  const scoped = [...pendingHitlRequests.values()].filter((pending) => {
    if (pending.worldId !== worldId) {
      return false;
    }
    if (normalizedChatId === null) {
      return true;
    }
    return pending.chatId === normalizedChatId;
  });

  scoped.sort((left, right) => left.sequence - right.sequence);
  return scoped;
}

/**
 * Remove all pending HITL requests scoped to a specific chat.
 * Called during edit+resubmit so orphaned requests from aborted processing
 * do not block the activity tracker or leak into subscription replays.
 */
export function clearPendingHitlRequestsForChat(worldId: string, chatId: string | null): void {
  const normalizedChatId = normalizeChatId(chatId);
  for (const [key, pending] of pendingHitlRequests) {
    if (pending.worldId !== worldId) continue;
    if (normalizedChatId !== null && pending.chatId !== normalizedChatId) continue;
    pendingHitlRequests.delete(key);
  }
}

function validateResponseScope(
  pending: PendingHitlOptionRequest,
  chatId?: string | null,
): { valid: true } | { valid: false; reason: string } {
  if (chatId === undefined) {
    return { valid: true };
  }

  const normalizedIncoming = chatId === null ? null : String(chatId).trim() || null;
  if (pending.chatId && pending.chatId !== normalizedIncoming) {
    return {
      valid: false,
      reason: `Request '${pending.requestId}' belongs to chat '${pending.chatId}', not '${normalizedIncoming}'.`,
    };
  }

  return { valid: true };
}

function normalizePromptType(value: unknown): HitlPromptType {
  return value === 'multiple-select' ? 'multiple-select' : 'single-select';
}

function normalizeQuestions(
  questions: unknown,
  fallbackHeader = 'Human input required',
): HitlQuestion[] {
  const source = Array.isArray(questions) ? questions : [];
  const normalized: HitlQuestion[] = [];
  const seenQuestionIds = new Set<string>();

  for (let index = 0; index < source.length; index += 1) {
    const rawQuestion = source[index];
    if (!rawQuestion || typeof rawQuestion !== 'object' || Array.isArray(rawQuestion)) {
      continue;
    }

    const questionRecord = rawQuestion as Record<string, unknown>;
    const questionId = String(questionRecord.id || '').trim() || `question-${index + 1}`;
    if (seenQuestionIds.has(questionId)) {
      continue;
    }

    const header = String(questionRecord.header || fallbackHeader).trim() || fallbackHeader;
    const question = String(questionRecord.question || '').trim();
    const options = normalizeOptions(Array.isArray(questionRecord.options)
      ? questionRecord.options
        .map<HitlOption | null>((option) => {
          if (!option || typeof option !== 'object' || Array.isArray(option)) {
            return null;
          }
          const optionRecord = option as Record<string, unknown>;
          return {
            id: String(optionRecord.id || '').trim(),
            label: String(optionRecord.label || '').trim(),
            description: typeof optionRecord.description === 'string'
              ? optionRecord.description
              : undefined,
          } satisfies HitlOption;
        })
        .filter((option): option is HitlOption => option !== null)
      : []);

    if (!question || options.length === 0) {
      continue;
    }

    seenQuestionIds.add(questionId);
    normalized.push({
      id: questionId,
      header,
      question,
      options,
    });
  }

  return normalized;
}

function normalizeLegacyPromptIntoQuestions(request: HitlOptionRequest): HitlQuestion[] {
  const options = normalizeOptions(Array.isArray(request.options) ? request.options : []);
  if (options.length === 0) {
    return [];
  }

  return [{
    id: 'question-1',
    header: String(request.title || '').trim() || 'Human input required',
    question: String(request.message || '').trim(),
    options,
  }];
}

function buildHitlAnswer(questionId: string, optionIds: string[]): HitlAnswer {
  return {
    questionId,
    optionIds,
  };
}

function normalizeSubmittedAnswers(params: {
  pending: PendingHitlOptionRequest;
  answers?: HitlAnswer[];
  optionId?: string;
  skipped?: boolean;
}): { valid: true; answers: HitlAnswer[]; skipped: boolean } | { valid: false; reason: string } {
  const { pending } = params;
  const skipped = params.skipped === true;

  if (skipped) {
    if (!pending.prompt.allowSkip) {
      return { valid: false, reason: `Request '${pending.requestId}' does not allow skipping.` };
    }
    return { valid: true, answers: [], skipped: true };
  }

  let submittedAnswers = Array.isArray(params.answers) ? params.answers : [];
  if (submittedAnswers.length === 0) {
    const optionId = String(params.optionId || '').trim();
    const firstQuestion = pending.prompt.questions[0];
    if (!optionId || !firstQuestion) {
      return {
        valid: false,
        reason: 'answers are required when skipped is false.',
      };
    }
    submittedAnswers = [buildHitlAnswer(firstQuestion.id, [optionId])];
  }

  const answerByQuestion = new Map<string, string[]>();
  for (const answer of submittedAnswers) {
    const questionId = String(answer?.questionId || '').trim();
    if (!questionId) {
      return { valid: false, reason: 'Each HITL answer requires a questionId.' };
    }
    if (!pending.questionIds.has(questionId)) {
      return { valid: false, reason: `Invalid questionId '${questionId}' for requestId '${pending.requestId}'.` };
    }
    if (answerByQuestion.has(questionId)) {
      return { valid: false, reason: `Duplicate answer for questionId '${questionId}'.` };
    }

    const optionIds = Array.isArray(answer.optionIds)
      ? answer.optionIds.map((optionId) => String(optionId || '').trim()).filter(Boolean)
      : [];
    if (optionIds.length === 0) {
      return { valid: false, reason: `Answer for questionId '${questionId}' requires at least one optionId.` };
    }

    const dedupedOptionIds = [...new Set(optionIds)];
    const allowedOptionIds = pending.optionIdsByQuestion.get(questionId) || new Set<string>();
    for (const optionId of dedupedOptionIds) {
      if (!allowedOptionIds.has(optionId)) {
        return { valid: false, reason: `Invalid option '${optionId}' for questionId '${questionId}'.` };
      }
    }

    if (pending.prompt.type === 'single-select' && dedupedOptionIds.length !== 1) {
      return { valid: false, reason: `Question '${questionId}' accepts exactly one option.` };
    }

    answerByQuestion.set(questionId, dedupedOptionIds);
  }

  for (const question of pending.prompt.questions) {
    if (!answerByQuestion.has(question.id)) {
      return {
        valid: false,
        reason: `Missing answer for questionId '${question.id}'.`,
      };
    }
  }

  return {
    valid: true,
    skipped: false,
    answers: pending.prompt.questions.map((question) => buildHitlAnswer(question.id, answerByQuestion.get(question.id) || [])),
  };
}

function getPrimaryOptionId(answers: HitlAnswer[]): string | null {
  return answers[0]?.optionIds[0] || null;
}

export async function requestWorldInput(
  world: World,
  request: HitlInputRequest,
): Promise<HitlResponseResolution> {
  const normalizedQuestions = normalizeQuestions(request.questions);
  if (normalizedQuestions.length === 0) {
    throw new Error('HITL input request requires at least one valid question.');
  }

  const worldId = String(world.id || '').trim();
  if (!worldId) {
    throw new Error('Cannot request HITL input without a valid world ID.');
  }

  const requestMetadata = request.metadata && typeof request.metadata === 'object'
    ? request.metadata
    : null;
  const explicitRequestId = String(request.requestId || '').trim();
  const requestedToolCallId = requestMetadata && typeof requestMetadata.toolCallId === 'string'
    ? String(requestMetadata.toolCallId).trim()
    : '';
  const requestId = explicitRequestId || requestedToolCallId || generateId();
  const toolCallId = requestedToolCallId || requestId;
  const chatId = normalizeExplicitChatId(request.chatId);
  if (!chatId) {
    throw new Error('HITL input request requires an explicit chatId.');
  }

  const pendingKey = getPendingKey(worldId, requestId);
  const sequence = ++pendingRequestSequence;
  const requestedToolName = requestMetadata && typeof requestMetadata.tool === 'string'
    ? String(requestMetadata.tool).trim()
    : '';

  const prompt: PendingHitlOptionRequest['prompt'] = {
    requestId,
    type: normalizePromptType(request.type),
    allowSkip: request.allowSkip === true,
    questions: normalizedQuestions,
    metadata: requestMetadata,
    agentName: resolveHitlAgentName(world, request.agentName),
    toolName: requestedToolName || 'ask_user_input',
    toolCallId,
  };

  return await new Promise<HitlResponseResolution>((resolve) => {
    const pending: PendingHitlOptionRequest = {
      worldId,
      requestId,
      chatId,
      questionIds: new Set(normalizedQuestions.map((question) => question.id)),
      optionIdsByQuestion: new Map(
        normalizedQuestions.map((question) => [question.id, new Set(question.options.map((option) => option.id))]),
      ),
      sequence,
      prompt,
      metadata: requestMetadata,
      resolve: (resolution) => resolve(resolution),
    };

    pendingHitlRequests.set(pendingKey, pending);
    loggerHitl.debug('HITL request queued', {
      worldId,
      chatId: chatId || null,
      requestId,
      questionCount: normalizedQuestions.length,
      type: prompt.type,
    });
    emitPendingRequest(world, pending);
  });
}

export async function requestWorldOption(
  world: World,
  request: HitlOptionRequest,
): Promise<HitlOptionResolution> {
  const resolution = await requestWorldInput(world, {
    requestId: request.requestId,
    type: 'single-select',
    allowSkip: false,
    questions: normalizeLegacyPromptIntoQuestions(request),
    chatId: request.chatId,
    metadata: request.metadata,
    agentName: request.agentName,
  });

  const optionId = getPrimaryOptionId(resolution.answers);
  if (!optionId) {
    throw new Error(`HITL option request '${resolution.requestId}' resolved without a selected option.`);
  }

  return {
    requestId: resolution.requestId,
    worldId: resolution.worldId,
    chatId: resolution.chatId,
    optionId,
    answers: resolution.answers,
    skipped: resolution.skipped,
    source: resolution.source,
  };
}

function parseToolCallArguments(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== 'string' || !raw.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function normalizeLegacyOptionsFromToolArgs(args: Record<string, unknown>): HitlOption[] {
  const options = Array.isArray(args.options) ? args.options : [];
  const normalized: HitlOption[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < options.length; index += 1) {
    const rawOption = options[index];
    if (rawOption && typeof rawOption === 'object' && !Array.isArray(rawOption)) {
      const optionRecord = rawOption as Record<string, unknown>;
      const label = String(optionRecord.label || '').trim();
      const id = String(optionRecord.id || '').trim();
      if (!label || !id) {
        continue;
      }
      const dedupeKey = id.toLowerCase();
      if (seen.has(dedupeKey)) {
        continue;
      }
      seen.add(dedupeKey);
      normalized.push({
        id,
        label,
        description: typeof optionRecord.description === 'string' ? optionRecord.description : undefined,
      });
      continue;
    }

    const label = String(rawOption || '').trim();
    if (!label) {
      continue;
    }

    const dedupeKey = label.toLowerCase();
    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    normalized.push({
      id: `opt_${normalized.length + 1}`,
      label,
    });
  }

  return normalized;
}

function normalizeQuestionsFromToolArgs(args: Record<string, unknown>): HitlQuestion[] {
  const structuredQuestions = normalizeQuestions(args.questions, String(args.title || 'Human input required').trim() || 'Human input required');
  if (structuredQuestions.length > 0) {
    return structuredQuestions;
  }

  const legacyOptions = normalizeLegacyOptionsFromToolArgs(args);
  const question = String(args.question || args.prompt || '').trim();
  if (!question || legacyOptions.length === 0) {
    return [];
  }

  return [{
    id: 'question-1',
    header: String(args.title || 'Human input required').trim() || 'Human input required',
    question,
    options: legacyOptions,
  }];
}

export function listPendingHitlPromptEventsFromMessages(
  messages: AgentMessage[],
  chatId?: string | null,
): Array<{ chatId: string | null; prompt: { requestId: string; type: HitlPromptType; allowSkip: boolean; questions: HitlQuestion[]; metadata: Record<string, unknown> | null; agentName: string | null; toolName: string; toolCallId: string } }> {
  const allMessages = Array.isArray(messages) ? messages : [];
  const resolvedToolCallIds = new Set<string>();

  for (const message of allMessages) {
    if (message?.role !== 'tool') {
      continue;
    }
    const toolCallId = String(message?.tool_call_id || '').trim();
    if (!toolCallId) {
      continue;
    }
    resolvedToolCallIds.add(toolCallId);
  }

  const unresolvedById = new Map<string, { chatId: string | null; prompt: { requestId: string; type: HitlPromptType; allowSkip: boolean; questions: HitlQuestion[]; metadata: Record<string, unknown> | null; agentName: string | null; toolName: string; toolCallId: string } }>();

  for (const message of allMessages) {
    if (message?.role !== 'assistant' || !Array.isArray(message?.tool_calls)) {
      continue;
    }

    for (const toolCall of message.tool_calls) {
      const toolName = String(toolCall?.function?.name || '').trim();
      const toolCallId = String(toolCall?.id || '').trim();
      if (!toolCallId || !isHitlToolName(toolName)) {
        continue;
      }
      if (resolvedToolCallIds.has(toolCallId) || unresolvedById.has(toolCallId)) {
        continue;
      }

      const args = parseToolCallArguments(toolCall?.function?.arguments);
      if (!args) {
        continue;
      }

      const questions = normalizeQuestionsFromToolArgs(args);
      if (questions.length === 0) {
        continue;
      }

      const messageChatId = message?.chatId ? String(message.chatId) : null;
      const normalizedChatId = messageChatId || (chatId ? String(chatId) : null);
      const metadata = args.metadata && typeof args.metadata === 'object' && !Array.isArray(args.metadata)
        ? (args.metadata as Record<string, unknown>)
        : null;
      const metadataToolCallId = metadata && typeof metadata.toolCallId === 'string'
        ? String(metadata.toolCallId).trim()
        : '';
      const metadataToolName = metadata && typeof metadata.tool === 'string'
        ? String(metadata.tool).trim()
        : '';

      unresolvedById.set(toolCallId, {
        chatId: normalizedChatId,
        prompt: {
          requestId: toolCallId,
          type: normalizePromptType(args.type),
          allowSkip: args.allowSkip === true,
          questions,
          metadata,
          agentName: String(message?.sender || '').trim() || null,
          toolName: metadataToolName || toolName,
          toolCallId: metadataToolCallId || toolCallId,
        },
      });
    }
  }

  return [...unresolvedById.values()];
}

export function replayPendingHitlRequests(world: World, chatId?: string | null): number {
  const worldId = String(world?.id || '').trim();
  if (!worldId) {
    return 0;
  }

  const pendingForScope = getSortedPendingRequestsForScope(worldId, chatId);
  loggerHitl.debug('HITL pending requests replayed', {
    worldId,
    chatId: chatId || null,
    count: pendingForScope.length,
  });
  for (const pending of pendingForScope) {
    emitPendingRequest(world, pending);
  }
  return pendingForScope.length;
}

export function listPendingHitlPromptEvents(
  world: World,
  chatId?: string | null,
): Array<{ chatId: string | null; prompt: PendingHitlOptionRequest['prompt'] }> {
  const worldId = String(world?.id || '').trim();
  if (!worldId) {
    return [];
  }

  const pendingForScope = getSortedPendingRequestsForScope(worldId, chatId);
  return pendingForScope.map((pending) => ({
    chatId: pending.chatId,
    prompt: pending.prompt,
  }));
}

export function submitWorldOptionResponse(params: {
  worldId: string;
  requestId: string;
  optionId: string;
  chatId?: string | null;
}): { accepted: boolean; reason?: string; metadata?: Record<string, unknown> | null } {
  return submitWorldHitlResponse(params);
}

export function submitWorldHitlResponse(params: {
  worldId: string;
  requestId: string;
  optionId?: string;
  answers?: HitlAnswer[];
  skipped?: boolean;
  chatId?: string | null;
}): { accepted: boolean; reason?: string; metadata?: Record<string, unknown> | null } {
  const worldId = String(params.worldId || '').trim();
  const requestId = String(params.requestId || '').trim();
  const optionId = String(params.optionId || '').trim();

  if (!worldId || !requestId || (!optionId && !Array.isArray(params.answers) && params.skipped !== true)) {
    loggerHitl.warn('HITL response rejected: invalid payload', {
      worldId: worldId || null,
      requestId: requestId || null,
      optionId: optionId || null,
      answerCount: Array.isArray(params.answers) ? params.answers.length : 0,
      skipped: params.skipped === true,
    });
    return { accepted: false, reason: 'worldId, requestId, and either answers, skipped, or optionId are required.' };
  }

  const pendingKey = getPendingKey(worldId, requestId);
  const pending = pendingHitlRequests.get(pendingKey);
  if (!pending) {
    loggerHitl.warn('HITL response rejected: request missing', {
      worldId,
      requestId,
      optionId,
    });
    return { accepted: false, reason: `No pending HITL request found for requestId '${requestId}'.` };
  }

  const scopeValidation = validateResponseScope(pending, params.chatId);
  if (!scopeValidation.valid) {
    loggerHitl.warn('HITL response rejected: scope mismatch', {
      worldId,
      requestId,
      optionId,
      reason: scopeValidation.reason,
      expectedChatId: pending.chatId,
      providedChatId: params.chatId ?? null,
    });
    return { accepted: false, reason: scopeValidation.reason };
  }

  const normalizedAnswers = normalizeSubmittedAnswers({
    pending,
    answers: params.answers,
    optionId,
    skipped: params.skipped,
  });
  if (!normalizedAnswers.valid) {
    loggerHitl.warn('HITL response rejected: invalid option', {
      worldId,
      requestId,
      optionId: optionId || null,
      reason: normalizedAnswers.reason,
    });
    return { accepted: false, reason: normalizedAnswers.reason };
  }

  resolvePendingRequest({
    pendingKey,
    pending,
    resolution: {
      requestId,
      worldId,
      chatId: pending.chatId,
      answers: normalizedAnswers.answers,
      optionId: getPrimaryOptionId(normalizedAnswers.answers),
      skipped: normalizedAnswers.skipped,
      source: 'user',
    },
  });

  loggerHitl.debug('HITL response accepted', {
    worldId,
    chatId: pending.chatId || null,
    requestId,
    optionId: getPrimaryOptionId(normalizedAnswers.answers),
    skipped: normalizedAnswers.skipped,
  });

  return { accepted: true, metadata: pending.metadata };
}

export function clearHitlStateForTests(): void {
  pendingHitlRequests.clear();
  pendingRequestSequence = 0;
}
