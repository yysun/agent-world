/**
 * CLI HITL Helpers
 *
 * Purpose:
 * - Provide pure parsing/selection helpers for HITL requests used by the CLI.
 *
 * Key Features:
 * - Parse structured HITL prompt payloads from tool-progress metadata and pending prompt envelopes.
 * - Resolve user input into option IDs or explicit skip actions for interactive CLI prompts.
 * - Build the submitted HITL response payload for interactive CLI selections.
 * - Provide deterministic fallback option resolution.
 * - Guard duplicate replayed requests via requestId-tracking helper.
 *
 * Implementation Notes:
 * - Parser accepts generic event payloads and rejects incomplete requests.
 * - Option fallback defaults to explicit `no` when available, otherwise first option.
 * - Skip is interactive-only and must be explicitly allowed by the prompt payload.
 *
 * Recent Changes:
 * - 2026-04-24: Added `allowSkip` parsing and skip-aware selection helpers for interactive CLI HITL prompts.
 * - 2026-02-20: Enforced options-only HITL parsing in CLI helpers.
 * - 2026-02-14: Added initial helper module for CLI HITL response flow support.
 */

export interface HitlOptionPayload {
  id: string;
  label: string;
  description?: string;
}

export interface HitlOptionRequestPayload {
  requestId: string;
  title: string;
  message: string;
  chatId: string | null;
  mode: 'option';
  allowSkip: boolean;
  options: HitlOptionPayload[];
  defaultOptionId: string;
}

export type HitlPromptSelectionResult =
  | { kind: 'option'; optionId: string }
  | { kind: 'skip' };

export interface CliHitlSubmissionResult {
  accepted: boolean;
  reason?: string;
  metadata?: Record<string, unknown> | null;
  successMessage?: string;
}

export type HitlPromptRequestPayload = HitlOptionRequestPayload;

function normalizePromptPayload(promptData: Record<string, unknown>, fallbackChatId: string | null): HitlPromptRequestPayload | null {
  const requestId = String(promptData.requestId || '').trim();
  if (!requestId) {
    return null;
  }

  const primaryQuestion = Array.isArray(promptData.questions)
    ? promptData.questions.find((question) => {
      if (!question || typeof question !== 'object' || Array.isArray(question)) {
        return false;
      }
      const questionRecord = question as Record<string, unknown>;
      return Array.isArray(questionRecord.options) && questionRecord.options.length > 0;
    }) as Record<string, unknown> | undefined
    : undefined;

  const optionsSource = primaryQuestion?.options ?? promptData.options;
  const options: HitlOptionPayload[] = Array.isArray(optionsSource)
    ? optionsSource
      .map((option, index): HitlOptionPayload | null => {
        if (option && typeof option === 'object' && !Array.isArray(option)) {
          const optionRecord = option as Record<string, unknown>;
          const id = String(optionRecord.id || '').trim();
          const label = String(optionRecord.label || '').trim();
          if (!id || !label) {
            return null;
          }
          return {
            id,
            label,
            description: optionRecord.description ? String(optionRecord.description) : undefined,
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
      .filter((option): option is HitlOptionPayload => option !== null)
    : [];

  if (options.length === 0) {
    return null;
  }

  const preferredDefault = String(promptData.defaultOptionId || '').trim();
  const defaultOptionId = options.some((option) => option.id === preferredDefault)
    ? preferredDefault
    : (options.find((option) => option.id === 'no')?.id || options[0].id);

  return {
    requestId,
    title: String(primaryQuestion?.header || promptData.title || 'Approval required').trim() || 'Approval required',
    message: String(primaryQuestion?.question || promptData.message || promptData.question || '').trim(),
    chatId: fallbackChatId,
    mode: 'option',
    allowSkip: promptData.allowSkip === true,
    options,
    defaultOptionId
  };
}

export function parseHitlPromptRequest(eventData: unknown): HitlPromptRequestPayload | null {
  if (!eventData || typeof eventData !== 'object') {
    return null;
  }
  const payload = eventData as Record<string, unknown>;
  const prompt = payload.prompt && typeof payload.prompt === 'object'
    ? (payload.prompt as Record<string, unknown>)
    : null;
  if (!prompt) {
    return null;
  }

  const chatId = payload.chatId ? String(payload.chatId) : null;
  return normalizePromptPayload(prompt, chatId);
}

export function parseHitlPromptFromToolEvent(eventData: unknown): HitlPromptRequestPayload | null {
  if (!eventData || typeof eventData !== 'object') {
    return null;
  }

  const payload = eventData as Record<string, unknown>;
  const toolExecution = payload.toolExecution && typeof payload.toolExecution === 'object'
    ? (payload.toolExecution as Record<string, unknown>)
    : null;
  const metadata = toolExecution?.metadata && typeof toolExecution.metadata === 'object'
    ? (toolExecution.metadata as Record<string, unknown>)
    : null;
  const prompt = metadata?.hitlPrompt && typeof metadata.hitlPrompt === 'object'
    ? (metadata.hitlPrompt as Record<string, unknown>)
    : null;
  if (!toolExecution || !prompt) {
    return null;
  }

  const chatId = prompt.chatId ? String(prompt.chatId) : (payload.chatId ? String(payload.chatId) : null);
  return normalizePromptPayload(prompt, chatId);
}

export function parseHitlOptionRequest(eventData: unknown): HitlOptionRequestPayload | null {
  return parseHitlPromptRequest(eventData);
}

export function resolveHitlOptionSelectionInput(
  options: HitlOptionPayload[],
  rawInput: string,
  fallbackOptionId: string
): string | null {
  const normalizedInput = String(rawInput || '').trim();
  if (!normalizedInput) {
    return fallbackOptionId;
  }

  const asNumber = Number(normalizedInput);
  if (Number.isFinite(asNumber)) {
    const index = Math.floor(asNumber) - 1;
    if (index >= 0 && index < options.length) {
      return options[index].id;
    }
  }

  const byId = options.find((option) => option.id.toLowerCase() === normalizedInput.toLowerCase());
  if (byId) {
    return byId.id;
  }
  return null;
}

export function resolveHitlPromptSelectionInput(
  options: HitlOptionPayload[],
  rawInput: string,
  fallbackOptionId: string,
  allowSkip: boolean
): HitlPromptSelectionResult | null {
  const normalizedInput = String(rawInput || '').trim();
  if (allowSkip) {
    const normalizedKeyword = normalizedInput.toLowerCase();
    if (normalizedKeyword === 's' || normalizedKeyword === 'skip') {
      return { kind: 'skip' };
    }
  }

  const resolvedOptionId = resolveHitlOptionSelectionInput(options, normalizedInput, fallbackOptionId);
  if (!resolvedOptionId) {
    return null;
  }
  return {
    kind: 'option',
    optionId: resolvedOptionId,
  };
}

export function submitCliHitlSelection(
  submitResponse: (params: {
    worldId: string;
    requestId: string;
    optionId?: string;
    skipped?: boolean;
    chatId?: string | null;
  }) => { accepted: boolean; reason?: string; metadata?: Record<string, unknown> | null },
  params: {
    worldId: string;
    request: HitlOptionRequestPayload;
    selection: HitlPromptSelectionResult;
  }
): CliHitlSubmissionResult {
  const response = submitResponse({
    worldId: params.worldId,
    requestId: params.request.requestId,
    ...(params.selection.kind === 'skip'
      ? { skipped: true }
      : { optionId: params.selection.optionId }),
    chatId: params.request.chatId,
  });

  if (!response.accepted) {
    return response;
  }

  return {
    ...response,
    successMessage: params.selection.kind === 'skip'
      ? 'Submitted HITL skip response.'
      : 'Submitted HITL option response.',
  };
}

export function markHitlRequestHandled(
  handledRequestIds: Set<string>,
  requestId: string
): boolean {
  const normalizedRequestId = String(requestId || '').trim();
  if (!normalizedRequestId) {
    return false;
  }
  if (handledRequestIds.has(normalizedRequestId)) {
    return false;
  }
  handledRequestIds.add(normalizedRequestId);
  return true;
}
