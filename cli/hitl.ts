/**
 * CLI HITL Helpers
 *
 * Purpose:
 * - Provide pure parsing/selection helpers for HITL option requests used by the CLI.
 *
 * Key Features:
 * - Parse HITL prompt payloads from tool-progress metadata and pending prompt envelopes.
 * - Resolve user input into option IDs (by number or option id).
 * - Provide deterministic fallback option resolution.
 * - Guard duplicate replayed requests via requestId-tracking helper.
 *
 * Implementation Notes:
 * - Parser accepts generic event payloads and rejects incomplete requests.
 * - Option fallback defaults to explicit `no` when available, otherwise first option.
 *
 * Recent Changes:
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
  options: HitlOptionPayload[];
  defaultOptionId: string;
}

export type HitlPromptRequestPayload = HitlOptionRequestPayload;

function normalizePromptPayload(promptData: Record<string, unknown>, fallbackChatId: string | null): HitlPromptRequestPayload | null {
  const requestId = String(promptData.requestId || '').trim();
  if (!requestId) {
    return null;
  }

  const options: HitlOptionPayload[] = Array.isArray(promptData.options)
    ? promptData.options
      .map((option): HitlOptionPayload => {
        const optionRecord = option && typeof option === 'object'
          ? (option as Record<string, unknown>)
          : null;
        return {
          id: String(optionRecord?.id || '').trim(),
          label: String(optionRecord?.label || '').trim(),
          description: optionRecord?.description ? String(optionRecord.description) : undefined
        };
      })
      .filter((option) => option.id.length > 0 && option.label.length > 0)
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
    title: String(promptData.title || 'Approval required').trim() || 'Approval required',
    message: String(promptData.message || '').trim(),
    chatId: fallbackChatId,
    mode: 'option',
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
