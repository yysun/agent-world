/**
 * HITL Request Tool Module - Built-in tool for generic human-in-the-loop input
 *
 * Purpose:
 * - Expose a built-in `human_intervention_request` tool that lets the model ask questions, offer options, and require explicit confirmation.
 *
 * Key Features:
 * - Supports option-only response mode for deterministic user selection.
 * - Uses existing world-scoped HITL option runtime.
 * - Supports explicit confirmation/cancel flow with deterministic timeout behavior.
 * - Returns structured JSON payloads for stable downstream model parsing.
 *
 * Implementation Notes:
 * - Option values are normalized and deduplicated as display labels.
 * - Free-text path is intentionally disabled to keep HITL interactions simple and auditable.
 * - Tool execution requires world context; no external side effects beyond HITL events.
 *
 * Recent Changes:
 * - 2026-02-20: Removed free-text mode from `human_intervention_request`; tool now enforces options-only interactions.
 * - 2026-02-20: Added initial built-in `human_intervention_request` tool implementation.
 */

import { requestWorldOption, type HitlOption } from './hitl.js';
import { type World } from './types.js';

const MODE_OPTION = 'option';
const CONFIRM_OPTION_ID = 'confirm';
const CANCEL_OPTION_ID = 'cancel';
const DEFAULT_TIMEOUT_MESSAGE = 'HITL request timed out before user confirmation.';

type HitlRequestToolArgs = {
  question?: unknown;
  options?: unknown;
  requireConfirmation?: unknown;
  confirmationMessage?: unknown;
  timeoutMs?: unknown;
  defaultOption?: unknown;
  metadata?: unknown;
};

type HitlRequestToolContext = {
  world?: World;
  chatId?: string | null;
};

type NormalizedHitlRequestArgs = {
  question: string;
  options: string[];
  requireConfirmation: boolean;
  confirmationMessage: string | null;
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
  const requireConfirmation = args.requireConfirmation === true;
  const confirmationMessage = typeof args.confirmationMessage === 'string' && args.confirmationMessage.trim()
    ? args.confirmationMessage.trim()
    : null;
  const timeoutMs = normalizeTimeoutMs(args.timeoutMs);
  const defaultOption = typeof args.defaultOption === 'string' && args.defaultOption.trim()
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

  if (defaultOption && options.length > 0) {
    const hasDefaultOption = options.some((option) => option.toLowerCase() === defaultOption.toLowerCase());
    if (!hasDefaultOption) {
      return {
        valid: false,
        error: `defaultOption '${defaultOption}' does not match any provided option.`,
      };
    }
  }

  return {
    valid: true,
    args: {
      question,
      options,
      requireConfirmation,
      confirmationMessage,
      timeoutMs,
      defaultOption,
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
  chatId: string | null;
  args: NormalizedHitlRequestArgs;
}): Promise<PrimaryResolution> {
  const { world, chatId, args } = options;
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
    },
  });

  const selectedOption = promptOptions.find((option) => option.id === optionResolution.optionId)?.label || null;
  return {
    requestId: optionResolution.requestId,
    selectedOption,
    source: optionResolution.source,
  };
}

function buildConfirmationSummary(resolution: PrimaryResolution): string {
  return `Selected option: ${resolution.selectedOption ?? ''}`;
}

async function requestConfirmation(options: {
  world: World;
  chatId: string | null;
  question: string;
  resolution: PrimaryResolution;
  timeoutMs: number | null;
  confirmationMessage: string | null;
  metadata: Record<string, unknown> | null;
}): Promise<{ confirmed: boolean; source: 'user' | 'timeout' }> {
  const confirmation = await requestWorldOption(options.world, {
    title: 'Confirm response',
    message: [
      options.question,
      '',
      buildConfirmationSummary(options.resolution),
      '',
      options.confirmationMessage || 'Please confirm to continue.',
    ].join('\n'),
    chatId: options.chatId,
    timeoutMs: options.timeoutMs ?? undefined,
    defaultOptionId: CANCEL_OPTION_ID,
    options: [
      { id: CONFIRM_OPTION_ID, label: 'Confirm', description: 'Use this response and continue.' },
      { id: CANCEL_OPTION_ID, label: 'Cancel', description: 'Cancel this HITL request.' },
    ],
    metadata: {
      ...(options.metadata || {}),
      tool: 'human_intervention_request',
      mode: 'confirmation',
      requestId: options.resolution.requestId,
    },
  });

  if (confirmation.optionId === CONFIRM_OPTION_ID) {
    return { confirmed: true, source: confirmation.source };
  }
  return { confirmed: false, source: confirmation.source };
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
      'Ask a human a question, offer choices, and optionally require confirmation before returning the result.',
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
        requireConfirmation: {
          type: 'boolean',
          description: 'When true, human must explicitly confirm before completion.',
        },
        confirmationMessage: {
          type: 'string',
          description: 'Optional extra text shown in confirmation prompt.',
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

      const chatId = context?.chatId ?? world.currentChatId ?? null;

      try {
        const primaryResolution = await requestPrimaryResolution({
          world,
          chatId,
          args: normalized.args,
        });

        if (normalized.args.requireConfirmation) {
          const confirmation = await requestConfirmation({
            world,
            chatId,
            question: normalized.args.question,
            resolution: primaryResolution,
            timeoutMs: normalized.args.timeoutMs,
            confirmationMessage: normalized.args.confirmationMessage,
            metadata: normalized.args.metadata,
          });
          if (!confirmation.confirmed) {
            return buildFinalResult({
              requestId: primaryResolution.requestId,
              selectedOption: primaryResolution.selectedOption,
              status: confirmation.source === 'timeout' ? 'timeout' : 'canceled',
              source: confirmation.source,
              message: confirmation.source === 'timeout'
                ? DEFAULT_TIMEOUT_MESSAGE
                : 'HITL request was canceled.',
            });
          }
        } else if (primaryResolution.source === 'timeout') {
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
          source: 'user',
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
