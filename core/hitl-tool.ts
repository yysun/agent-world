/**
 * HITL Request Tool Module - Built-in tool for generic human-in-the-loop input
 *
 * Purpose:
 * - Expose a built-in `human_intervention_request` tool that lets the model ask questions and offer options.
 *
 * Key Features:
 * - Supports option-only response mode for deterministic user selection.
 * - Uses existing world-scoped HITL option runtime.
 * - Returns structured JSON payloads for stable downstream model parsing.
 *
 * Implementation Notes:
 * - Option values are normalized and deduplicated as display labels.
 * - Free-text path is intentionally disabled to keep HITL interactions simple and auditable.
 * - Tool execution requires world context; no external side effects beyond HITL events.
 *
 * Recent Changes:
 * - 2026-03-06: Removed `world.currentChatId` fallback from HITL approval routing; interactive requests now require explicit `context.chatId`.
 * - 2026-02-28: Added shorthand default-option resolution so values like "No" can map to a single matching option label.
 * - 2026-02-27: Removed built-in post-selection confirmation stage and removed deprecated confirmation parameters from the tool contract.
 * - 2026-02-20: Removed free-text mode from `human_intervention_request`; tool now enforces options-only interactions.
 * - 2026-02-20: Added initial built-in `human_intervention_request` tool implementation.
 */

import { requestWorldOption, type HitlOption } from './hitl.js';
import { type World } from './types.js';

const MODE_OPTION = 'option';
const DEFAULT_TIMEOUT_MESSAGE = 'HITL request timed out before user selection.';

type HitlRequestToolArgs = {
  question?: unknown;
  options?: unknown;
  timeoutMs?: unknown;
  defaultOption?: unknown;
  metadata?: unknown;
};

type HitlRequestToolContext = {
  world?: World;
  chatId?: string | null;
  agentName?: string | null;
  toolCallId?: string;
};

type NormalizedHitlRequestArgs = {
  question: string;
  options: string[];
  timeoutMs: number | null;
  defaultOption: string | null;
  metadata: Record<string, unknown> | null;
};

type PrimaryResolution = {
  requestId: string;
  selectedOption: string | null;
  source: 'user' | 'timeout';
};

function stringifyResult(payload: Record<string, unknown>): string {
  return JSON.stringify(payload);
}

function normalizeQuestion(question: unknown): string {
  return String(question || '').trim();
}

function normalizeOptionList(options: unknown): string[] {
  if (!Array.isArray(options)) {
    return [];
  }
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const option of options) {
    const value = String(option || '').trim();
    if (!value) {
      continue;
    }
    const key = value.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push(value);
  }
  return normalized;
}

function normalizeTimeoutMs(value: unknown): number | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.floor(parsed);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function resolveDefaultOptionLabel(options: string[], defaultOption: string): {
  matchedOption: string | null;
  error: string | null;
} {
  const normalizedDefaultOption = defaultOption.trim().toLowerCase();
  if (!normalizedDefaultOption) {
    return { matchedOption: null, error: null };
  }

  const explicitMatch = options.find((option) => option.toLowerCase() === normalizedDefaultOption);
  if (explicitMatch) {
    return { matchedOption: explicitMatch, error: null };
  }

  const shorthandPattern = new RegExp(`^${escapeRegExp(normalizedDefaultOption)}(?:\\b|[\\s,;:()\\-])`, 'i');
  const shorthandMatches = options.filter((option) => shorthandPattern.test(option));
  if (shorthandMatches.length === 1) {
    return { matchedOption: shorthandMatches[0]!, error: null };
  }

  if (shorthandMatches.length > 1) {
    return {
      matchedOption: null,
      error: `defaultOption '${defaultOption}' is ambiguous across provided options.`,
    };
  }

  return {
    matchedOption: null,
    error: `defaultOption '${defaultOption}' does not match any provided option.`,
  };
}

function validateAndNormalizeArgs(args: HitlRequestToolArgs): {
  valid: true;
  args: NormalizedHitlRequestArgs;
} | {
  valid: false;
  error: string;
} {
  const question = normalizeQuestion(args.question);
  if (!question) {
    return { valid: false, error: 'Missing required parameter: question' };
  }

  const options = normalizeOptionList(args.options);
  const timeoutMs = normalizeTimeoutMs(args.timeoutMs);
  const rawDefaultOption = typeof args.defaultOption === 'string' && args.defaultOption.trim()
    ? args.defaultOption.trim()
    : null;
  const metadata = args.metadata && typeof args.metadata === 'object'
    ? args.metadata as Record<string, unknown>
    : null;

  if (options.length === 0) {
    return {
      valid: false,
      error: 'HITL request requires at least one option.',
    };
  }

  const resolvedDefaultOption = rawDefaultOption
    ? resolveDefaultOptionLabel(options, rawDefaultOption)
    : { matchedOption: null, error: null };
  if (resolvedDefaultOption.error) {
    return {
      valid: false,
      error: resolvedDefaultOption.error,
    };
  }

  return {
    valid: true,
    args: {
      question,
      options,
      timeoutMs,
      defaultOption: resolvedDefaultOption.matchedOption,
      metadata,
    },
  };
}

function resolveDefaultOptionId(options: HitlOption[], defaultOption: string | null): string | undefined {
  if (!defaultOption) {
    return undefined;
  }
  const match = options.find((option) => option.label.toLowerCase() === defaultOption.toLowerCase());
  return match?.id;
}

function buildOptionPromptOptions(optionLabels: string[]): HitlOption[] {
  return optionLabels.map((label, index) => ({
    id: `opt_${index + 1}`,
    label,
  }));
}

async function requestPrimaryResolution(options: {
  world: World;
  chatId: string;
  args: NormalizedHitlRequestArgs;
  agentName?: string | null;
  toolCallId?: string;
}): Promise<PrimaryResolution> {
  const { world, chatId, args, agentName } = options;
  const promptOptions = buildOptionPromptOptions(args.options);
  const optionResolution = await requestWorldOption(world, {
    title: 'Human input required',
    message: args.question,
    options: promptOptions,
    chatId,
    timeoutMs: args.timeoutMs ?? undefined,
    defaultOptionId: resolveDefaultOptionId(promptOptions, args.defaultOption),
    metadata: {
      ...(args.metadata || {}),
      tool: 'human_intervention_request',
      mode: MODE_OPTION,
      ...(typeof options.toolCallId === 'string' && options.toolCallId.trim()
        ? { toolCallId: options.toolCallId.trim() }
        : {}),
    },
    agentName: agentName || null,
  });

  const selectedOption = promptOptions.find((option) => option.id === optionResolution.optionId)?.label || null;
  return {
    requestId: optionResolution.requestId,
    selectedOption,
    source: optionResolution.source,
  };
}

function buildFinalResult(options: {
  requestId: string;
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
    selectedOption: options.selectedOption,
    source: options.source,
    requestId: options.requestId,
    message: options.message,
  });
}

export function createHitlToolDefinition() {
  return {
    description:
      'Ask a human a question and offer choices; returns after a single option selection.',
    parameters: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: 'Required question shown to the human.',
        },
        options: {
          type: 'array',
          items: { type: 'string' },
          description: 'Required list of selectable options.',
        },
        timeoutMs: {
          type: 'number',
          description: 'Optional timeout for HITL prompts in milliseconds.',
        },
        defaultOption: {
          type: 'string',
          description: 'Optional default option label for option mode.',
        },
        metadata: {
          type: 'object',
          description: 'Optional metadata attached to HITL system events.',
          additionalProperties: true,
        },
      },
      required: ['question', 'options'],
      additionalProperties: false,
    },
    execute: async (rawArgs: HitlRequestToolArgs, _sequenceId?: string, _parentToolCall?: string, context?: HitlRequestToolContext) => {
      const normalized = validateAndNormalizeArgs(rawArgs || {});
      if (!normalized.valid) {
        return buildFinalResult({
          requestId: '',
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
          selectedOption: null,
          status: 'error',
          source: 'system',
          message: 'human_intervention_request requires a valid world context.',
        });
      }

      const chatId = typeof context?.chatId === 'string' && context.chatId.trim()
        ? context.chatId.trim()
        : null;
      const agentName = context?.agentName || null;

      if (!chatId) {
        return buildFinalResult({
          requestId: '',
          selectedOption: null,
          status: 'error',
          source: 'system',
          message: 'human_intervention_request requires an explicit chatId in the tool execution context.',
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
            selectedOption: primaryResolution.selectedOption,
            status: 'timeout',
            source: 'timeout',
            message: DEFAULT_TIMEOUT_MESSAGE,
          });
        }

        return buildFinalResult({
          requestId: primaryResolution.requestId,
          selectedOption: primaryResolution.selectedOption,
          status: 'confirmed',
          source: primaryResolution.source,
        });
      } catch (error) {
        return buildFinalResult({
          requestId: '',
          selectedOption: null,
          status: 'error',
          source: 'system',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
  };
}
