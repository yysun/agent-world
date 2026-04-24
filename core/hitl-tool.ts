/**
 * HITL Request Tool Module - Built-in tool for generic human-in-the-loop input
 *
 * Purpose:
 * - Expose a built-in `ask_user_input` / `human_intervention_request` tool that mirrors llm-runtime's structured HITL schema.
 *
 * Key Features:
 * - Accepts `type`, `allowSkip`, and structured `questions[]` arguments.
 * - Uses the shared world-scoped HITL runtime.
 * - Returns structured JSON payloads with compatibility summary fields.
 *
 * Implementation Notes:
 * - Legacy flat `question/options` callers are normalized locally for backwards compatibility.
 * - Tool execution requires world context; no external side effects beyond HITL events.
 *
 * Recent Changes:
 * - 2026-04-24: Migrated the built-in HITL tool contract to llm-runtime-compatible `ask_user_input` questions/answers while preserving compatibility summary fields.
 * - 2026-03-06: Removed `world.currentChatId` fallback from HITL approval routing; interactive requests now require explicit `context.chatId`.
 * - 2026-02-27: Removed built-in post-selection confirmation stage and removed deprecated confirmation parameters from the tool contract.
 * - 2026-02-20: Removed free-text mode from `human_intervention_request`; tool now enforces options-only interactions.
 * - 2026-02-20: Added initial built-in `human_intervention_request` tool implementation.
 */

import {
  requestWorldInput,
  type HitlAnswer,
  type HitlInputRequest,
  type HitlOption,
  type HitlPromptType,
  type HitlQuestion,
} from './hitl.js';
import { type World } from './types.js';

const DEFAULT_TIMEOUT_MESSAGE = 'HITL request timed out before user selection.';

type HitlRequestToolArgs = {
  type?: unknown;
  allowSkip?: unknown;
  questions?: unknown;
  question?: unknown;
  options?: unknown;
  metadata?: unknown;
};

type HitlRequestToolContext = {
  world?: World;
  chatId?: string | null;
  agentName?: string | null;
  toolCallId?: string;
};

type NormalizedHitlRequestArgs = {
  type: HitlPromptType;
  allowSkip: boolean;
  questions: HitlQuestion[];
  metadata: Record<string, unknown> | null;
};

type PrimaryResolution = {
  requestId: string;
  answers: HitlAnswer[];
  skipped: boolean;
  selectedOption: string | null;
  source: 'user' | 'timeout';
};

function stringifyResult(payload: Record<string, unknown>): string {
  return JSON.stringify(payload);
}

function normalizeQuestion(question: unknown): string {
  return String(question || '').trim();
}

function normalizePromptType(value: unknown): HitlPromptType {
  return value === 'multiple-select' ? 'multiple-select' : 'single-select';
}

function normalizeOptions(options: unknown): HitlOption[] {
  if (!Array.isArray(options)) {
    return [];
  }
  const normalized: HitlOption[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < options.length; index += 1) {
    const rawOption = options[index];
    if (rawOption && typeof rawOption === 'object' && !Array.isArray(rawOption)) {
      const optionRecord = rawOption as Record<string, unknown>;
      const id = String(optionRecord.id || '').trim();
      const label = String(optionRecord.label || '').trim();
      if (!id || !label || seen.has(id.toLowerCase())) {
        continue;
      }
      seen.add(id.toLowerCase());
      normalized.push({
        id,
        label,
        description: typeof optionRecord.description === 'string' ? optionRecord.description : undefined,
      });
      continue;
    }

    const label = String(rawOption || '').trim();
    if (!label || seen.has(label.toLowerCase())) {
      continue;
    }
    seen.add(label.toLowerCase());
    normalized.push({
      id: `opt_${normalized.length + 1}`,
      label,
    });
  }
  return normalized;
}

function normalizeQuestions(questions: unknown): HitlQuestion[] {
  if (!Array.isArray(questions)) {
    return [];
  }

  const normalized: HitlQuestion[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < questions.length; index += 1) {
    const rawQuestion = questions[index];
    if (!rawQuestion || typeof rawQuestion !== 'object' || Array.isArray(rawQuestion)) {
      continue;
    }
    const questionRecord = rawQuestion as Record<string, unknown>;
    const id = String(questionRecord.id || '').trim() || `question-${index + 1}`;
    if (seen.has(id)) {
      continue;
    }
    const header = String(questionRecord.header || 'Human input required').trim() || 'Human input required';
    const question = String(questionRecord.question || '').trim();
    const options = normalizeOptions(questionRecord.options);
    if (!question || options.length === 0) {
      continue;
    }
    seen.add(id);
    normalized.push({ id, header, question, options });
  }

  return normalized;
}

function normalizeLegacyQuestions(args: HitlRequestToolArgs): HitlQuestion[] {
  const question = normalizeQuestion(args.question);
  const options = normalizeOptions(args.options);
  if (!question || options.length === 0) {
    return [];
  }

  return [{
    id: 'question-1',
    header: 'Human input required',
    question,
    options,
  }];
}

function validateAndNormalizeArgs(args: HitlRequestToolArgs): {
  valid: true;
  args: NormalizedHitlRequestArgs;
} | {
  valid: false;
  error: string;
} {
  const questions = normalizeQuestions(args.questions);
  const normalizedQuestions = questions.length > 0 ? questions : normalizeLegacyQuestions(args);
  const metadata = args.metadata && typeof args.metadata === 'object'
    ? args.metadata as Record<string, unknown>
    : null;

  if (normalizedQuestions.length === 0) {
    return {
      valid: false,
      error: 'ask_user_input requires at least one valid question with options.',
    };
  }

  return {
    valid: true,
    args: {
      type: normalizePromptType(args.type),
      allowSkip: args.allowSkip === true,
      questions: normalizedQuestions,
      metadata,
    },
  };
}

async function requestPrimaryResolution(options: {
  world: World;
  chatId: string;
  args: NormalizedHitlRequestArgs;
  agentName?: string | null;
  toolCallId?: string;
}): Promise<PrimaryResolution> {
  const { world, chatId, args, agentName } = options;
  const resolution = await requestWorldInput(world, {
    type: args.type,
    allowSkip: args.allowSkip,
    questions: args.questions,
    chatId,
    metadata: {
      ...(args.metadata || {}),
      tool: 'ask_user_input',
      ...(typeof options.toolCallId === 'string' && options.toolCallId.trim()
        ? { toolCallId: options.toolCallId.trim() }
        : {}),
    },
    agentName: agentName || null,
  });

  const firstQuestion = args.questions[0];
  const selectedOption = firstQuestion
    ? firstQuestion.options.find((option) => option.id === resolution.answers[0]?.optionIds[0])?.label || null
    : null;
  return {
    requestId: resolution.requestId,
    answers: resolution.answers,
    skipped: resolution.skipped,
    selectedOption,
    source: resolution.source,
  };
}

function buildFinalResult(options: {
  requestId: string;
  answers: HitlAnswer[];
  skipped: boolean;
  selectedOption: string | null;
  status: 'confirmed' | 'canceled' | 'timeout' | 'error';
  source: 'user' | 'timeout' | 'system';
  message?: string;
}): string {
  const ok = options.status === 'confirmed';
  return stringifyResult({
    ok,
    status: options.status,
    confirmed: ok,
    skipped: options.skipped,
    answers: options.answers,
    selectedOption: options.selectedOption,
    source: options.source,
    requestId: options.requestId,
    message: options.message,
  });
}

export function createHitlToolDefinition() {
  return {
    description:
      'Ask a human structured questions with selectable options; mirrors the llm-runtime ask_user_input schema.',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['single-select', 'multiple-select'],
          description: 'Selection mode applied to every question in this request.',
        },
        allowSkip: {
          type: 'boolean',
          description: 'Whether the user may skip the prompt without selecting options.',
        },
        questions: {
          type: 'array',
          description: 'Structured questions presented to the user.',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              header: { type: 'string' },
              question: { type: 'string' },
              options: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    label: { type: 'string' },
                    description: { type: 'string' },
                  },
                  required: ['id', 'label'],
                  additionalProperties: false,
                },
              },
            },
            required: ['id', 'header', 'question', 'options'],
            additionalProperties: false,
          },
        },
        metadata: {
          type: 'object',
          description: 'Optional metadata attached to HITL system events.',
          additionalProperties: true,
        },
      },
      required: ['questions'],
      additionalProperties: false,
    },
    execute: async (rawArgs: HitlRequestToolArgs, _sequenceId?: string, _parentToolCall?: string, context?: HitlRequestToolContext) => {
      const normalized = validateAndNormalizeArgs(rawArgs || {});
      if (!normalized.valid) {
        return buildFinalResult({
          requestId: '',
          answers: [],
          skipped: false,
          selectedOption: null,
          status: 'error',
          source: 'system',
          message: normalized.error,
        });
      }

      const world = context?.world;
      const worldId = String(world?.id || '').trim();
      if (!world || !worldId) {
        return buildFinalResult({
          requestId: '',
          answers: [],
          skipped: false,
          selectedOption: null,
          status: 'error',
          source: 'system',
          message: 'ask_user_input requires a valid world context.',
        });
      }

      const chatId = typeof context?.chatId === 'string' && context.chatId.trim()
        ? context.chatId.trim()
        : null;
      const agentName = context?.agentName || null;

      if (!chatId) {
        return buildFinalResult({
          requestId: '',
          answers: [],
          skipped: false,
          selectedOption: null,
          status: 'error',
          source: 'system',
          message: 'ask_user_input requires an explicit chatId in the tool execution context.',
        });
      }

      try {
        const primaryResolution = await requestPrimaryResolution({
          world,
          chatId,
          args: normalized.args,
          agentName,
          toolCallId: context.toolCallId,
        });

        if (primaryResolution.source === 'timeout') {
          return buildFinalResult({
            requestId: primaryResolution.requestId,
            answers: primaryResolution.answers,
            skipped: primaryResolution.skipped,
            selectedOption: primaryResolution.selectedOption,
            status: 'timeout',
            source: 'timeout',
            message: DEFAULT_TIMEOUT_MESSAGE,
          });
        }

        return buildFinalResult({
          requestId: primaryResolution.requestId,
          answers: primaryResolution.answers,
          skipped: primaryResolution.skipped,
          selectedOption: primaryResolution.selectedOption,
          status: primaryResolution.skipped ? 'canceled' : 'confirmed',
          source: primaryResolution.source,
        });
      } catch (error) {
        return buildFinalResult({
          requestId: '',
          answers: [],
          skipped: false,
          selectedOption: null,
          status: 'error',
          source: 'system',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
  };
}
